import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { redisConnection } from '@/lib/redis'
import { logAudit, getIpFromRequest } from '@/lib/audit'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { getOrganizationMembership } from '@/lib/access-control'
import { getOrganizationPlanContext } from '@/lib/plan-catalog'
import { SecretsManager } from '@/lib/encryption'
import { EvolutionWhatsAppProvider } from '@/providers/whatsapp/EvolutionWhatsAppProvider'

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Falha ao conectar'
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    const membership = await getOrganizationMembership(supabase, user.id)
    if (!membership) return NextResponse.json({ error: 'Organização não autorizada' }, { status: 403 })
    const planContext = await getOrganizationPlanContext(membership.organizationId)
    if (!planContext.active) return NextResponse.json({ error: 'Plano inativo', upgrade_required: true }, { status: 403 })

    // --- KILL SWITCH CHECK ---
    const isBanned = await redisConnection.sismember('global:banned_users', user.id)
    if (isBanned) {
      return NextResponse.json({ error: 'Sua conta foi suspensa temporariamente. Contate o suporte para recuperar o acesso.' }, { status: 403 })
    }

    const body = await request.json()
    const { mode = 'integrated', instanceName, baseUrl, apiKey } = body

    const adminEmail = process.env.ADMIN_EMAIL || ''
    const isAdmin = user.email === adminEmail

    let finalBaseUrl: string
    let finalApiKey: string
    let finalInstanceName: string
    let connectionMode: 'integrated' | 'external'

    if (mode === 'integrated') {
      // Integrated mode: use server environment variables
      finalBaseUrl = process.env.EVOLUTION_API_URL || ''
      finalApiKey = process.env.EVOLUTION_API_KEY || ''
      const suffix = Math.random().toString(36).substring(2, 7)
      finalInstanceName = `gestor_${user.id.substring(0, 8)}_${suffix}`
      connectionMode = 'integrated'

      if (!finalBaseUrl || !finalApiKey) {
        return NextResponse.json(
          { error: 'Evolution API não configurada no servidor. Contate o administrador.' },
          { status: 500 }
        )
      }
    } else {
      // External mode: use client-provided credentials
      if (!instanceName || !baseUrl || !apiKey) {
        return NextResponse.json({ error: 'Parâmetros ausentes (URL, API Key e Instância são obrigatórios)' }, { status: 400 })
      }
      finalBaseUrl = baseUrl
      finalApiKey = apiKey
      finalInstanceName = instanceName
      connectionMode = 'external'
    }

    const { count: currentInstances } = await supabase
      .from('evolution_instances')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', membership.organizationId)

    const { data: existingInstance } = await supabase
      .from('evolution_instances')
      .select('id')
      .eq('user_id', user.id)
      .eq('instance_name', finalInstanceName)
      .maybeSingle()

    if (!isAdmin && !existingInstance) {
      const instancesCount = currentInstances || 0
      const instanceLimit = planContext.limits.whatsappInstances

      if (instancesCount >= instanceLimit) {
        return NextResponse.json({ error: `Limite atingido! Você só pode conectar até ${instanceLimit} instâncias.` }, { status: 403 })
      }
    }
    // --------------------------

    // Initialize Evolution API client
    const client = new EvolutionWhatsAppProvider(finalBaseUrl, finalApiKey)

    // Criptografa a API Key antes de salvar no banco se for externa
    const apiKeyToSave = connectionMode === 'external' ? SecretsManager.encrypt(finalApiKey) : null;

    // 1. Save or update the connection settings in the database
    const { error: dbError } = await supabase
      .from('evolution_instances')
      .upsert({
        user_id: user.id,
        organization_id: membership.organizationId,
        instance_name: finalInstanceName,
        base_url: connectionMode === 'external' ? finalBaseUrl : null,
        api_key: apiKeyToSave,
        status: 'disconnected',
        connection_mode: connectionMode,
        updated_at: new Date().toISOString()
      }, { onConflict: 'instance_name' })

    if (dbError) throw dbError

    let qrCodeValue = null;

    try {
      // Monta a URL do Webhook usando o Host da requisição
      const host = request.headers.get('host');
      const protocol = host?.includes('localhost') || host?.match(/^[0-9.]+:[0-9]+$/) ? 'http' : 'https';
      const webhookUrl = `${protocol}://${host}/api/evolution/webhook`;
      const webhookToken = (process.env.WEBHOOK_SECRETS || process.env.WEBHOOK_SECRET || '')
        .split(',')
        .map((secret) => secret.trim())
        .find(Boolean);

      // Busca a chave HMAC atual do sistema para enviar no header do webhook
      const { data: secSettings } = await supabaseAdmin
        .from('security_settings')
        .select('hmac_secret, require_signature')
        .limit(1)
        .single();

      let hmacSecretToPass: string | undefined = undefined;
      if (secSettings?.require_signature && secSettings?.hmac_secret) {
        try {
          hmacSecretToPass = SecretsManager.decrypt(secSettings.hmac_secret);
        } catch {}
      }

      // 2. Create the instance in Evolution API
      // Evolution v2.2.1 retorna o QR Code AQUI na criação se passarmos qrcode: true
      const createData = await client.createInstance(finalInstanceName, webhookUrl, hmacSecretToPass, webhookToken)
      if (createData?.qrcode?.base64) {
         qrCodeValue = createData.qrcode.base64;
      } else if (createData?.hash?.qrcode) {
         // Fallback Evolution v1.x ou v2.0
         qrCodeValue = createData.hash.qrcode;
      }
    } catch (error: unknown) {
      console.log('Instance creation note (already exists?):', errorMessage(error))
    }

    // 3. Se não pegou no create, solicita via GET (connect endpoint)
    if (!qrCodeValue) {
      console.log('Aguardando geração do QR Code pela Evolution...');
      // Faz um polling de até 10 segundos (5 tentativas a cada 2s)
      for (let i = 0; i < 5; i++) {
        try {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Espera 2 segundos
          const qrData = await client.getQR(finalInstanceName);
          const nestedQrCode = typeof qrData.qrcode === 'object' ? qrData.qrcode?.base64 : qrData.qrcode
          qrCodeValue = qrData.base64 || nestedQrCode || qrData.code || null;

          if (qrCodeValue && qrCodeValue !== '[object Object]') {
            console.log('QR Code capturado com sucesso!');
            break;
          }
        } catch (error: unknown) {
          console.log(`Tentativa ${i+1} falhou:`, errorMessage(error));
        }
      }
    }

    // 4. Update the DB with the QR code
    if (qrCodeValue) {
      await supabase
        .from('evolution_instances')
        .update({ qr_code: qrCodeValue })
        .eq('user_id', user.id)
        .eq('instance_name', finalInstanceName)
    }

    await logAudit({
      user_id: user.id,
      action: 'whatsapp.connect',
      resource: 'evolution_instances',
      details: { instance_name: finalInstanceName, connection_mode: connectionMode },
      ip_address: getIpFromRequest(request)
    })

    return NextResponse.json({
      success: true,
      base64: qrCodeValue,
      instanceName: finalInstanceName
    })
  } catch (error: unknown) {
    console.error('API Connect Error:', error)
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 }
    )
  }
}

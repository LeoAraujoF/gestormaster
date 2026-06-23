import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { redisConnection } from '@/lib/redis'
import { logAudit, getIpFromRequest } from '@/lib/audit'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

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

    // --- PLAN LIMITS CHECK ---
    const { data: userData } = await supabase.from('users').select('plan_name').eq('id', user.id).single()
    const userPlan = userData?.plan_name || user.user_metadata?.plan_name || 'Lite'

    const { count: currentInstances } = await supabase
      .from('evolution_instances')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    const { data: existingInstance } = await supabase
      .from('evolution_instances')
      .select('id')
      .eq('user_id', user.id)
      .eq('instance_name', finalInstanceName)
      .maybeSingle()

    if (!isAdmin && !existingInstance) {
      const instancesCount = currentInstances || 0
      const plan = userPlan.toLowerCase()
      
      let instanceLimit = 1 // Lite
      if (plan.includes('pro')) instanceLimit = 3
      else if (plan.includes('plus') || plan.includes('max')) instanceLimit = 10

      if (instancesCount >= instanceLimit) {
        return NextResponse.json({ error: `Limite atingido! Seu plano atual permite até ${instanceLimit} instâncias. Faça upgrade para conectar mais.` }, { status: 403 })
      }
    }
    // --------------------------

    // Initialize Evolution API client
    const { EvolutionWhatsAppProvider } = require('@/providers/whatsapp/EvolutionWhatsAppProvider')
    const { SecretsManager } = require('@/lib/encryption')
    const client = new EvolutionWhatsAppProvider(finalBaseUrl, finalApiKey)

    // Criptografa a API Key antes de salvar no banco se for externa
    const apiKeyToSave = connectionMode === 'external' ? SecretsManager.encrypt(finalApiKey) : null;

    // 1. Save or update the connection settings in the database
    const { error: dbError } = await supabase
      .from('evolution_instances')
      .upsert({
        user_id: user.id,
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
      const webhookSecret = process.env.WEBHOOK_SECRET || '';
      const webhookUrl = `${protocol}://${host}/api/evolution/webhook${webhookSecret ? `?token=${webhookSecret}` : ''}`;

      // 2. Create the instance in Evolution API
      // Evolution v2.2.1 retorna o QR Code AQUI na criação se passarmos qrcode: true
      const createData = await client.createInstance(finalInstanceName, webhookUrl)
      if (createData?.qrcode?.base64) {
         qrCodeValue = createData.qrcode.base64;
      } else if (createData?.hash?.qrcode) {
         // Fallback Evolution v1.x ou v2.0
         qrCodeValue = createData.hash.qrcode;
      }
    } catch (e: any) {
      console.log('Instance creation note (already exists?):', e.message)
    }

    // 3. Se não pegou no create, solicita via GET (connect endpoint)
    if (!qrCodeValue) {
      console.log('Aguardando geração do QR Code pela Evolution...');
      // Faz um polling de até 10 segundos (5 tentativas a cada 2s)
      for (let i = 0; i < 5; i++) {
        try {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Espera 2 segundos
          const qrData = await client.getQR(finalInstanceName);
          qrCodeValue = qrData?.base64 || qrData?.qrcode?.base64 || qrData?.code || qrData?.qrcode || null;
          
          if (qrCodeValue && qrCodeValue !== '[object Object]') {
            console.log('QR Code capturado com sucesso!');
            break;
          }
        } catch (e: any) {
          console.log(`Tentativa ${i+1} falhou:`, e.message);
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
  } catch (error: any) {
    console.error('API Connect Error:', error)
    return NextResponse.json(
      { error: error.message || 'Falha ao conectar' },
      { status: 500 }
    )
  }
}

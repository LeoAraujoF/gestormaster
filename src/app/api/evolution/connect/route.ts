import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
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
      if (userPlan === 'Lite') {
        return NextResponse.json({ error: 'O plano Lite não permite automação. Faça upgrade para o Pro ou Plus.' }, { status: 403 })
      } else if (userPlan === 'Pro' && instancesCount >= 3) {
        return NextResponse.json({ error: 'Limite do plano Pro atingido (3 instâncias). Faça upgrade para o Plus.' }, { status: 403 })
      } else if (userPlan === 'Plus' && instancesCount >= 5) {
        return NextResponse.json({ error: 'Limite máximo de instâncias atingido (5 instâncias).' }, { status: 403 })
      }
    }
    // --------------------------

    // Initialize Evolution API client
    const { EvolutionWhatsAppProvider } = require('@/providers/whatsapp/EvolutionWhatsAppProvider')
    const client = new EvolutionWhatsAppProvider(finalBaseUrl, finalApiKey)

    // 1. Save or update the connection settings in the database
    const { error: dbError } = await supabase
      .from('evolution_instances')
      .upsert({
        user_id: user.id,
        instance_name: finalInstanceName,
        base_url: connectionMode === 'external' ? finalBaseUrl : null,
        api_key: connectionMode === 'external' ? finalApiKey : null,
        status: 'disconnected',
        connection_mode: connectionMode,
        updated_at: new Date().toISOString()
      }, { onConflict: 'instance_name' })

    if (dbError) throw dbError

    let qrCodeValue = null;

    try {
      // 2. Create the instance in Evolution API (if it doesn't exist)
      // Evolution v2.2.1 retorna o QR Code AQUI na criação se passarmos qrcode: true
      const createData = await client.createInstance(finalInstanceName)
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

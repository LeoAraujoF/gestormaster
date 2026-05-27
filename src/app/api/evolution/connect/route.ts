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
    const { EvolutionAPI } = require('@/lib/evolution')
    const client = new EvolutionAPI({ baseUrl: finalBaseUrl, apiKey: finalApiKey })

    // 1. Save or update the connection settings in the database
    const { error: dbError } = await supabase
      .from('evolution_instances')
      .upsert({
        user_id: user.id,
        instance_name: finalInstanceName,
        base_url: connectionMode === 'external' ? finalBaseUrl : null, // Don't store admin credentials in DB
        api_key: connectionMode === 'external' ? finalApiKey : null,
        status: 'disconnected',
        connection_mode: connectionMode,
        updated_at: new Date().toISOString()
      }, { onConflict: 'instance_name' })

    if (dbError) throw dbError

    try {
      // 2. Create the instance in Evolution API (if it doesn't exist)
      await client.createInstance(finalInstanceName)
    } catch (e: any) {
      // If it already exists, that's fine. We just try to connect.
      console.log('Instance creation note:', e.message)
    }

    // 3. Request the QR Code to connect
    const qrData = await client.connectInstance(finalInstanceName)
    const qrCodeValue = qrData?.base64 || qrData?.qrcode || qrData?.code || null

    // 4. Update the DB with the QR code
    if (qrCodeValue) {
      await supabase
        .from('evolution_instances')
        .update({ qr_code: qrCodeValue })
        .eq('user_id', user.id)
        .eq('instance_name', finalInstanceName)
    }

    return NextResponse.json(qrData)
  } catch (error: any) {
    console.error('API Connect Error:', error)
    return NextResponse.json(
      { error: error.message || 'Falha ao conectar' },
      { status: 500 }
    )
  }
}

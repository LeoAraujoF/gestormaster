import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    // Get all instances for this user
    const { data: instances, error: dbError } = await supabase
      .from('evolution_instances')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (dbError || !instances || instances.length === 0) {
      return NextResponse.json({ status: 'disconnected', instances: [] })
    }

    const { EvolutionAPI } = require('@/lib/evolution')
    const results = []

    for (const instance of instances) {
      let baseUrl = instance.connection_mode === 'integrated' ? process.env.EVOLUTION_API_URL || '' : instance.base_url || ''
      let apiKey = instance.connection_mode === 'integrated' ? process.env.EVOLUTION_API_KEY || '' : instance.api_key || ''

      if (!baseUrl || !apiKey) {
        results.push({ ...instance, status: 'error', message: 'Credenciais ausentes' })
        continue
      }

      const client = new EvolutionAPI({ baseUrl, apiKey })

      try {
        const stateData = await client.getInstanceStatus(instance.instance_name)
        const isConnected = stateData?.instance?.state === 'open'
        const newStatus = isConnected ? 'connected' : 'disconnected'

        // Update DB if status changed
        if (instance.status !== newStatus) {
          await supabase
            .from('evolution_instances')
            .update({ 
              status: newStatus,
              qr_code: isConnected ? null : instance.qr_code
            })
            .eq('id', instance.id)
        }

        results.push({
          ...instance,
          status: newStatus,
          qr_code: isConnected ? null : instance.qr_code,
          instanceData: stateData
        })
      } catch (e) {
        results.push({ ...instance, status: 'error', message: 'Falha na comunicação' })
      }
    }

    // Determine an overall status for legacy components
    const overallStatus = results.some(r => r.status === 'connected') ? 'connected' : 'disconnected'

    return NextResponse.json({ 
      status: overallStatus, 
      instances: results 
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

import { SecretsManager } from "@/lib/encryption";
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
      let apiKey = instance.connection_mode === 'integrated' ? process.env.EVOLUTION_API_KEY || '' : SecretsManager.decrypt(instance.api_key || '')

      if (!baseUrl || !apiKey) {
        results.push({ ...instance, status: 'error', message: 'Credenciais ausentes' })
        continue
      }

      const client = new EvolutionAPI({ baseUrl, apiKey })

      try {
        const stateData = await client.getInstanceStatus(instance.instance_name)
        const isConnected = stateData?.instance?.state === 'open'
        const newStatus = isConnected ? 'connected' : 'disconnected'

        let ownerPhone = instance.phone_number
        if (isConnected) {
          try {
            const instancesList = await client.fetchInstances(instance.instance_name)
            if (instancesList && instancesList.length > 0) {
              const fullInstanceData = instancesList[0]
              if (fullInstanceData.ownerJid) {
                ownerPhone = fullInstanceData.ownerJid.replace('@s.whatsapp.net', '')
              } else if (stateData?.instance?.owner) { // Fallback para versões antigas
                ownerPhone = stateData.instance.owner.replace('@s.whatsapp.net', '')
              }
            }
          } catch (fetchErr) {
            console.error('Falha ao buscar ownerJid detalhado:', fetchErr)
            if (stateData?.instance?.owner) {
              ownerPhone = stateData.instance.owner.replace('@s.whatsapp.net', '')
            }
          }
        }

        // Update DB if status changed or phone_number was discovered
        if (instance.status !== newStatus || (!instance.phone_number && ownerPhone)) {
          await supabase
            .from('evolution_instances')
            .update({ 
              status: newStatus,
              qr_code: isConnected ? null : instance.qr_code,
              ...(ownerPhone ? { phone_number: ownerPhone } : {})
            })
            .eq('id', instance.id)
        }

        results.push({
          ...instance,
          status: newStatus,
          qr_code: isConnected ? null : instance.qr_code,
          phone_number: ownerPhone || instance.phone_number,
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

import { SecretsManager } from "@/lib/encryption";
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit, getIpFromRequest } from '@/lib/audit'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { instanceName } = body

    let query = supabase.from('evolution_instances').select('*').eq('user_id', user.id)
    if (instanceName) {
      query = query.eq('instance_name', instanceName)
    }
    
    const { data: instance, error: dbError } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle()

    if (dbError || !instance) {
      return NextResponse.json({ error: 'Instância não encontrada' }, { status: 400 })
    }

    let baseUrl: string
    let apiKey: string

    if (instance.connection_mode === 'integrated' || !instance.connection_mode) {
      baseUrl = process.env.EVOLUTION_API_URL || ''
      apiKey = process.env.EVOLUTION_API_KEY || ''
    } else {
      baseUrl = instance.base_url || ''
      apiKey = SecretsManager.decrypt(instance.api_key || '')
    }

    if (!baseUrl || !apiKey) {
      return NextResponse.json({ error: 'Credenciais ausentes' }, { status: 400 })
    }

    const { EvolutionAPI } = require('@/lib/evolution')
    const client = new EvolutionAPI({ baseUrl, apiKey })

    try {
      // Logout from WhatsApp web
      await client.logout(instance.instance_name)
      
      // Update our database
      await supabase
        .from('evolution_instances')
        .update({ 
          status: 'disconnected',
          qr_code: null
        })
        .eq('id', instance.id)

      await logAudit({
        user_id: user.id,
        action: 'whatsapp.logout',
        resource: 'evolution_instances',
        resource_id: instance.id,
        details: { instance_name: instance.instance_name },
        ip_address: getIpFromRequest(request)
      })

      return NextResponse.json({ success: true })
    } catch (e: any) {
      // Even if the API call fails, we might want to force disconnect locally
      await supabase
        .from('evolution_instances')
        .update({ 
          status: 'disconnected',
          qr_code: null
        })
        .eq('id', instance.id)
        
      return NextResponse.json({ success: true, message: 'Desconectado localmente (falha na API: ' + e.message + ')' })
    }

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

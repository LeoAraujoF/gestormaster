import { SecretsManager } from "@/lib/encryption";
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { instanceName } = body

    if (!instanceName) {
      return NextResponse.json({ error: 'Nome da instância obrigatório' }, { status: 400 })
    }

    const { data: instance, error: dbError } = await supabase.from('evolution_instances')
      .select('*')
      .eq('user_id', user.id)
      .eq('instance_name', instanceName)
      .maybeSingle()

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
      // Sem credenciais, apagamos apenas localmente (fallback de segurança)
      await supabase.from('evolution_instances').delete().eq('id', instance.id)
      return NextResponse.json({ success: true, message: 'Removido apenas localmente (sem credenciais de API ativas)' })
    }

    const { EvolutionAPI } = require('@/lib/evolution')
    const client = new EvolutionAPI({ baseUrl, apiKey })

    try {
      // DELEÇÃO PROFUNDA NA EVOLUTION API
      await client.deleteInstance(instance.instance_name)
    } catch (e: any) {
      console.error("Aviso: Instância não encontrada ou erro na Evolution:", e.message)
    }

    // Limpa do Banco de Dados
    await supabase.from('evolution_instances').delete().eq('id', instance.id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit, getIpFromRequest } from '@/lib/audit'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { instanceName } = await req.json()
    if (!instanceName) {
      return NextResponse.json({ error: 'Nome da instância obrigatório' }, { status: 400 })
    }

    // Primeiro desmarca todos
    await supabase
      .from('evolution_instances')
      .update({ is_primary: false })
      .eq('user_id', user.id)

    // Marca o selecionado como primário
    const { error } = await supabase
      .from('evolution_instances')
      .update({ is_primary: true })
      .eq('user_id', user.id)
      .eq('instance_name', instanceName)

    if (error) {
      return NextResponse.json({ error: 'Erro ao definir instância primária' }, { status: 400 })
    }

    await logAudit({
      user_id: user.id,
      action: 'whatsapp.set_primary',
      resource: 'evolution_instances',
      details: { instance_name: instanceName },
      ip_address: getIpFromRequest(req)
    })

    return NextResponse.json({ success: true, message: `A instância ${instanceName} foi definida como Número Principal de Suporte.` })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

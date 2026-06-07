import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { instance_id, is_warming_up } = await req.json()

    if (!instance_id) {
      return NextResponse.json({ error: 'ID da instância é obrigatório' }, { status: 400 })
    }

    const { data: instance, error: instanceError } = await supabase
      .from('evolution_instances')
      .update({ is_warming_up })
      .eq('id', instance_id)
      .eq('user_id', session.user.id)
      .select()
      .single()

    if (instanceError) {
      console.error('Error toggling warmup:', instanceError)
      return NextResponse.json({ error: 'Falha ao atualizar o status de aquecimento.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, is_warming_up: instance.is_warming_up })

  } catch (error: any) {
    console.error('API Warmup Toggle Error:', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}

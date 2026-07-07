import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    // 1. Exige usuário autenticado (a rota é chamada pelo dashboard do próprio usuário)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    // Calcula a data de hoje no fuso horário do Brasil (-03:00)
    const now = new Date()
    const brazilDate = new Date(now.getTime() - (3 * 60 * 60 * 1000))
    const brTodayStr = brazilDate.toISOString().split('T')[0]

    // 2. Atualiza apenas os clientes DO PRÓPRIO usuário (isolamento de tenant).
    //    Usa o client autenticado — o RLS garante o escopo, sem service role.
    const { data, error } = await supabase
      .from('clients')
      .update({ status: 'vencido' })
      .eq('status', 'active')
      .eq('user_id', user.id)
      .lt('due_date', brTodayStr)
      .select('id')

    if (error) {
      console.error('Erro ao atualizar clientes vencidos:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      updated: data?.length || 0,
      cutoff_date: brTodayStr
    })
  } catch (err: any) {
    console.error('Erro na API update-overdue:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

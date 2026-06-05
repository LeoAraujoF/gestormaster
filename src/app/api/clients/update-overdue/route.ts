import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    if (!supabaseServiceKey) {
      return NextResponse.json({ error: 'Service key not configured' }, { status: 500 })
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Calcula a data de hoje no fuso horário do Brasil (-03:00)
    const now = new Date()
    const brazilDate = new Date(now.getTime() - (3 * 60 * 60 * 1000))
    const brTodayStr = brazilDate.toISOString().split('T')[0]

    // Atualiza TODOS os clientes ativos com due_date passado para "vencido"
    const { data, error } = await supabaseAdmin
      .from('clients')
      .update({ status: 'vencido' })
      .eq('status', 'active')
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

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || user.email !== process.env.ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const action = searchParams.get('action') || ''

    // Tenta buscar da tabela audit_logs (pode não existir no Supabase atual)
    let query = supabaseAdmin
      .from('audit_logs')
      .select('id, user_id, action, resource, resource_id, ip_address, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (action) {
      query = query.eq('action', action)
    }

    const { data: logs, error } = await query

    if (error) {
      // Se a tabela não existir, retornamos um array vazio mas passamos a mensagem de erro
      // para o frontend exibir a Dica de Configuração.
      if (error.code === '42P01') { // 42P01 = undefined_table in PostgreSQL
        return NextResponse.json({ 
          success: true, 
          logs: [], 
          missingTable: true 
        })
      }
      throw error
    }

    return NextResponse.json({ 
      success: true,
      logs: logs || [],
      missingTable: false
    })

  } catch (error: any) {
    console.error('Audit API Error:', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}

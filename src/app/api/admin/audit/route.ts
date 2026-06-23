import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || user.email !== process.env.ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '100')
    const action = searchParams.get('action') || ''
    const resource = searchParams.get('resource') || ''
    const search = searchParams.get('search') || ''

    // Tenta buscar da tabela audit_logs (pode não existir no Supabase atual)
    let query = supabaseAdmin
      .from('audit_logs')
      .select('id, user_id, action, resource, resource_id, details, ip_address, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (action) {
      query = query.eq('action', action)
    }

    if (resource) {
      query = query.eq('resource', resource)
    }

    if (search) {
      query = query.or(`action.ilike.%${search}%,resource.ilike.%${search}%,resource_id.ilike.%${search}%`)
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

    // Buscar emails dos user_ids únicos para exibir na interface
    const userIds = [...new Set((logs || []).map((l: any) => l.user_id).filter(Boolean))]
    let userMap: Record<string, string> = {}

    if (userIds.length > 0) {
      // Buscar emails via Supabase Auth Admin (listUsers não filtra por IDs, então faremos um RPC ou query alternativa)
      for (const uid of userIds.slice(0, 50)) { // Limitar a 50 para performance
        try {
          const { data } = await supabaseAdmin.auth.admin.getUserById(uid as string)
          if (data?.user?.email) {
            userMap[uid as string] = data.user.email
          }
        } catch (e) {
          // Silently skip
        }
      }
    }

    // Buscar todas as ações únicas para o filtro dropdown
    const { data: actionsData } = await supabaseAdmin
      .from('audit_logs')
      .select('action')
      .limit(500)

    const uniqueActions = [...new Set((actionsData || []).map((a: any) => a.action))].sort()

    return NextResponse.json({ 
      success: true,
      logs: (logs || []).map((log: any) => ({
        ...log,
        user_email: userMap[log.user_id] || null,
      })),
      uniqueActions,
      missingTable: false
    })

  } catch (error: any) {
    console.error('Audit API Error:', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}

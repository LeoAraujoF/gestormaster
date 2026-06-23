import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit, getIpFromRequest } from '@/lib/audit'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const { action, resource, resource_id, details } = body

    if (!action || !resource) {
      return NextResponse.json({ error: 'action e resource são obrigatórios' }, { status: 400 })
    }

    await logAudit({
      user_id: user.id,
      action,
      resource,
      resource_id: resource_id || null,
      details: details || null,
      ip_address: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Audit API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

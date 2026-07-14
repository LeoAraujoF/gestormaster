import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { getOrganizationMembership } from '@/lib/access-control'
import { logAudit, getIpFromRequest } from '@/lib/audit'
import { organizationHasCapability } from '@/lib/plan-catalog'

async function getManager() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const membership = await getOrganizationMembership(supabase, user.id)
  if (!membership || !['owner', 'admin'].includes(membership.role)) return null
  if (!(await organizationHasCapability(membership.organizationId, 'self_service'))) return null
  return { user, organizationId: membership.organizationId }
}

export async function GET() {
  const manager = await getManager()
  if (!manager) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('client_change_requests')
    .select('id, client_id, request_type, requested_due_date, status, requested_from_phone, created_at, clients(name, due_date)')
    .eq('organization_id', manager.organizationId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Falha ao buscar solicitações' }, { status: 500 })
  return NextResponse.json({ requests: data || [] })
}

export async function PATCH(request: Request) {
  const manager = await getManager()
  if (!manager) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const body = await request.json()
  const { requestId, decision } = body
  if (typeof requestId !== 'string' || !['approved', 'rejected'].includes(decision)) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const { data: change, error: findError } = await supabaseAdmin
    .from('client_change_requests')
    .select('*')
    .eq('id', requestId)
    .eq('organization_id', manager.organizationId)
    .eq('status', 'pending')
    .maybeSingle()
  if (findError || !change) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 })

  if (decision === 'approved' && change.request_type === 'due_date') {
    const { error } = await supabaseAdmin
      .from('clients')
      .update({ due_date: change.requested_due_date })
      .eq('id', change.client_id)
      .eq('organization_id', manager.organizationId)
    if (error) return NextResponse.json({ error: 'Falha ao alterar vencimento' }, { status: 500 })
  }

  const { error: updateError } = await supabaseAdmin
    .from('client_change_requests')
    .update({ status: decision, reviewed_by: manager.user.id, reviewed_at: new Date().toISOString() })
    .eq('id', change.id)
  if (updateError) return NextResponse.json({ error: 'Falha ao revisar solicitação' }, { status: 500 })

  await logAudit({
    user_id: manager.user.id,
    action: `autoatendimento.request_${decision}`,
    resource: 'client_change_requests',
    resource_id: change.id,
    details: { request_type: change.request_type, client_id: change.client_id },
    ip_address: getIpFromRequest(request),
  })
  return NextResponse.json({ success: true })
}

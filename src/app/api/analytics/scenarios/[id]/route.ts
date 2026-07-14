import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrganizationMembership } from '@/lib/access-control'
import { deleteAnalyticsScenario } from '@/lib/analytics-service'
import { getIpFromRequest, logAudit } from '@/lib/audit'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const membership = await getOrganizationMembership(supabase, user.id)
    if (!membership || !['owner', 'admin'].includes(membership.role)) return NextResponse.json({ error: 'Apenas owner ou admin pode excluir cenários' }, { status: 403 })
    const { id } = await params
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Cenário inválido' }, { status: 400 })
    const result = await deleteAnalyticsScenario(membership.organizationId, id)
    await logAudit({ organization_id: membership.organizationId, user_id: user.id, action: 'analytics.scenario.delete', resource: 'analytics_scenarios', resource_id: id, ip_address: getIpFromRequest(request) })
    return NextResponse.json(result)
  } catch (error: any) {
    if (error?.message === 'ANALYTICS_REQUIRED') return NextResponse.json({ error: 'Recurso disponível nos planos Pro e Master', upgrade_required: true }, { status: 403 })
    if (error?.message === 'SCENARIO_NOT_FOUND') return NextResponse.json({ error: 'Cenário não encontrado' }, { status: 404 })
    console.error('[analytics/scenarios:delete]', error)
    return NextResponse.json({ error: 'Falha ao excluir cenário' }, { status: 500 })
  }
}

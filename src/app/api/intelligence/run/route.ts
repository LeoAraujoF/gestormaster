import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrganizationMembership } from '@/lib/access-control'
import { createIntelligenceRun } from '@/lib/intelligence-service'
import { getIpFromRequest, logAudit } from '@/lib/audit'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const membership = await getOrganizationMembership(supabase, user.id)
    if (!membership || !['owner', 'admin'].includes(membership.role)) return NextResponse.json({ error: 'Apenas owner ou admin pode gerar relatórios' }, { status: 403 })
    const result = await createIntelligenceRun({ organizationId: membership.organizationId, trigger: 'manual', userId: user.id })
    await logAudit({ organization_id: membership.organizationId, user_id: user.id, action: 'intelligence.run', resource: 'intelligence_runs', resource_id: result.runId, details: { trigger: 'manual' }, ip_address: getIpFromRequest(request) })
    return NextResponse.json(result, { status: result.created ? 202 : 200 })
  } catch (error: any) {
    const code = error?.message
    if (code === 'MASTER_REQUIRED') return NextResponse.json({ error: 'Recurso exclusivo do plano Master', upgrade_required: true }, { status: 403 })
    if (code === 'INTELLIGENCE_DISABLED') return NextResponse.json({ error: 'Ative o Intelligence nas configurações antes de gerar.' }, { status: 409 })
    if (code === 'DAILY_LIMIT') return NextResponse.json({ error: 'Limite de três execuções manuais por dia atingido.' }, { status: 429 })
    if (code === 'HOURLY_LIMIT') return NextResponse.json({ error: 'Aguarde uma hora antes de gerar outro relatório.' }, { status: 429 })
    console.error('[intelligence/run]', error)
    return NextResponse.json({ error: 'Falha ao gerar relatório' }, { status: 500 })
  }
}

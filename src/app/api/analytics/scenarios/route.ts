import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOrganizationMembership } from '@/lib/access-control'
import { listAnalyticsScenarios, saveAnalyticsScenario } from '@/lib/analytics-service'
import { getIpFromRequest, logAudit } from '@/lib/audit'

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  current_price: z.number().positive().max(1_000_000),
  new_price: z.number().positive().max(1_000_000),
  assumed_churn_pct: z.number().min(0).max(100),
}).strict()

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const membership = await getOrganizationMembership(supabase, user.id)
    if (!membership) return NextResponse.json({ error: 'Organização não autorizada' }, { status: 403 })
    const url = new URL(request.url)
    const limit = Number(url.searchParams.get('limit') || 20)
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) return NextResponse.json({ error: 'Limite inválido' }, { status: 400 })
    return NextResponse.json(await listAnalyticsScenarios(membership.organizationId, url.searchParams.get('cursor'), limit))
  } catch (error: any) {
    if (error?.message === 'ANALYTICS_REQUIRED') return NextResponse.json({ error: 'Recurso disponível nos planos Pro e Master', upgrade_required: true }, { status: 403 })
    if (error?.message === 'INVALID_CURSOR') return NextResponse.json({ error: 'Cursor inválido' }, { status: 400 })
    console.error('[analytics/scenarios:get]', error)
    return NextResponse.json({ error: 'Falha ao carregar cenários' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const membership = await getOrganizationMembership(supabase, user.id)
    if (!membership || !['owner', 'admin'].includes(membership.role)) return NextResponse.json({ error: 'Apenas owner ou admin pode salvar cenários' }, { status: 403 })
    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'Cenário inválido' }, { status: 400 })
    const scenario = await saveAnalyticsScenario(membership.organizationId, user.id, {
      name: parsed.data.name,
      currentPrice: parsed.data.current_price,
      newPrice: parsed.data.new_price,
      assumedChurnPct: parsed.data.assumed_churn_pct,
    })
    await logAudit({
      organization_id: membership.organizationId,
      user_id: user.id,
      action: 'analytics.scenario.create',
      resource: 'analytics_scenarios',
      resource_id: scenario.id,
      details: { current_price: scenario.current_price, new_price: scenario.new_price, assumed_churn_pct: scenario.assumed_churn_pct },
      ip_address: getIpFromRequest(request),
    })
    return NextResponse.json(scenario, { status: 201 })
  } catch (error: any) {
    if (error?.message === 'ANALYTICS_REQUIRED') return NextResponse.json({ error: 'Recurso disponível nos planos Pro e Master', upgrade_required: true }, { status: 403 })
    console.error('[analytics/scenarios:post]', error)
    return NextResponse.json({ error: 'Falha ao salvar cenário' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrganizationMembership } from '@/lib/access-control'
import { getAnalyticsDashboard } from '@/lib/analytics-service'
import { ANALYTICS_HORIZONS, type AnalyticsHorizon } from '@/lib/analytics-types'

const allowedHorizons = new Set<AnalyticsHorizon>(ANALYTICS_HORIZONS)

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const membership = await getOrganizationMembership(supabase, user.id)
    if (!membership) return NextResponse.json({ error: 'Organização não autorizada' }, { status: 403 })
    const requested = new URL(request.url).searchParams.get('horizon') || 'month'
    if (!allowedHorizons.has(requested as AnalyticsHorizon)) return NextResponse.json({ error: 'Horizonte inválido' }, { status: 400 })
    const dashboard = await getAnalyticsDashboard(membership.organizationId, membership.role, requested as AnalyticsHorizon)
    if (!dashboard) return NextResponse.json({ error: 'Recurso disponível nos planos Pro e Master', upgrade_required: true }, { status: 403 })
    return NextResponse.json(dashboard, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[analytics]', error)
    return NextResponse.json({ error: 'Falha ao carregar Analytics' }, { status: 500 })
  }
}

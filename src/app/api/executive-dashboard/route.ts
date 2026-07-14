import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrganizationMembership } from '@/lib/access-control'
import { getExecutiveDashboard } from '@/lib/executive-dashboard'
import type { ExecutivePeriod } from '@/lib/executive-metrics'

const allowedPeriods = new Set<ExecutivePeriod>(['month', '30d', '90d', '12m'])

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const membership = await getOrganizationMembership(supabase, user.id)
    if (!membership) return NextResponse.json({ error: 'Organização não autorizada' }, { status: 403 })

    const requestedPeriod = new URL(request.url).searchParams.get('period') || 'month'
    if (!allowedPeriods.has(requestedPeriod as ExecutivePeriod)) return NextResponse.json({ error: 'Período inválido' }, { status: 400 })

    const dashboard = await getExecutiveDashboard(membership.organizationId, requestedPeriod as ExecutivePeriod)
    if (!dashboard) {
      return NextResponse.json({ error: 'Recurso disponível nos planos Pro e Master', upgrade_required: true }, { status: 403 })
    }
    return NextResponse.json(dashboard)
  } catch (error: any) {
    console.error('[executive-dashboard]', error)
    return NextResponse.json({ error: 'Falha ao carregar dashboard executivo' }, { status: 500 })
  }
}

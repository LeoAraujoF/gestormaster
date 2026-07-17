import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/service-role'
import { computeExecutiveMetrics, resolveExecutivePeriod, type ExecutiveDashboardDTO, type ExecutivePeriod } from '@/lib/executive-metrics'
import { getOrganizationEntitlement } from '@/lib/entitlements'
import { captureAnalyticsSnapshots } from '@/lib/analytics-service'

export async function getExecutiveDashboard(organizationId: string, period: ExecutivePeriod): Promise<ExecutiveDashboardDTO | null> {
  const entitlement = await getOrganizationEntitlement(organizationId)
  if (!entitlement.isActive || !['pro', 'master'].includes(entitlement.plan)) return null

  const range = resolveExecutivePeriod(period)
  const oldest = range.previousStart
  const [cyclesResult, paymentsResult, clientsResult, lifecycleResult, snapshotsResult, assignmentsResult] = await Promise.all([
    supabaseAdmin.from('billing_cycles').select('id, client_id, due_date, amount, status, paid_at, created_at').eq('organization_id', organizationId).gte('due_date', oldest).lte('due_date', range.end),
    supabaseAdmin
      .from('payments')
      .select('amount_paid, payment_method, paid_at, created_at')
      .eq('organization_id', organizationId)
      .or(`and(paid_at.gte.${oldest}T00:00:00Z,paid_at.lte.${range.end}T23:59:59Z),and(paid_at.is.null,created_at.gte.${oldest}T00:00:00Z,created_at.lte.${range.end}T23:59:59Z)`),
    supabaseAdmin.from('clients').select('id, status, plan_value, created_at').eq('organization_id', organizationId),
    supabaseAdmin.from('client_lifecycle_events').select('event_type, created_at').eq('organization_id', organizationId).gte('created_at', `${oldest}T00:00:00Z`).lte('created_at', `${range.end}T23:59:59Z`),
    supabaseAdmin.from('executive_daily_snapshots').select('snapshot_date, mrr, active_clients').eq('organization_id', organizationId).lte('snapshot_date', range.end).order('snapshot_date'),
    supabaseAdmin.from('client_services').select('client_id, services(name), clients!inner(organization_id)').eq('clients.organization_id', organizationId),
  ])
  const error = cyclesResult.error || paymentsResult.error || clientsResult.error || lifecycleResult.error || snapshotsResult.error || assignmentsResult.error
  if (error) throw new Error(`Falha ao calcular dashboard executivo: ${error.message}`)

  return computeExecutiveMetrics({
    period,
    cycles: cyclesResult.data || [],
    payments: paymentsResult.data || [],
    clients: clientsResult.data || [],
    lifecycleEvents: lifecycleResult.data || [],
    snapshots: snapshotsResult.data || [],
    serviceAssignments: (assignmentsResult.data || []).map((assignment: any) => ({ client_id: assignment.client_id, service_name: assignment.services?.name || 'Sem serviço' })),
    plan: entitlement.plan as 'pro' | 'master',
  })
}

export async function captureExecutiveSnapshots(now = new Date()) {
  const result = await captureAnalyticsSnapshots(now)
  return result.captured
}

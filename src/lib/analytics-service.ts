import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/service-role'
import { getOrganizationPlanContext } from '@/lib/plan-catalog'
import {
  ANALYTICS_MODEL_VERSION,
  buildAnalyticsDashboard,
  dateInTimezone,
  simulatePriceChange,
  timestampDateInTimezone,
  type AnalyticsEngineInput,
} from '@/lib/analytics-engine'
import type {
  AnalyticsDashboardDTO,
  AnalyticsHorizon,
  AnalyticsScenarioDTO,
  PriceSimulationResult,
} from '@/lib/analytics-types'

const DEFAULT_TIMEZONE = 'America/Sao_Paulo'
type MembershipRole = 'owner' | 'admin' | 'member'

function numeric(value: unknown) {
  return Number(value || 0)
}

function monthShift(month: string, offset: number) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber - 1 + offset, 1, 12)).toISOString().slice(0, 7)
}

async function analyticsPlan(organizationId: string) {
  const context = await getOrganizationPlanContext(organizationId)
  if (!context.active || !context.capabilities.includes('analytics')) return null
  return context.plan as 'pro' | 'master'
}

export async function getOrganizationTimezone(organizationId: string) {
  const [{ data: intelligence }, { data: collections }] = await Promise.all([
    supabaseAdmin.from('intelligence_settings').select('timezone').eq('organization_id', organizationId).maybeSingle(),
    supabaseAdmin.from('collection_settings').select('timezone').eq('organization_id', organizationId).maybeSingle(),
  ])
  return intelligence?.timezone || collections?.timezone || DEFAULT_TIMEZONE
}

async function readAnalyticsInput(
  organizationId: string,
  plan: 'pro' | 'master',
  role: MembershipRole,
  horizon: AnalyticsHorizon,
  timezone: string,
  now: Date,
): Promise<AnalyticsEngineInput> {
  const today = dateInTimezone(now, timezone)
  const startMonth = monthShift(today.slice(0, 7), -12)
  const startDate = `${startMonth}-01`
  const [clients, cycles, payments, snapshots] = await Promise.all([
    supabaseAdmin.from('clients').select('id, status, plan_value, created_at').eq('organization_id', organizationId),
    supabaseAdmin.from('billing_cycles').select('id, due_date, amount, status').eq('organization_id', organizationId).gte('due_date', startDate),
    supabaseAdmin.from('payments').select('amount_paid, paid_at, created_at').eq('organization_id', organizationId).gte('paid_at', `${startDate}T00:00:00Z`),
    supabaseAdmin.from('executive_daily_snapshots')
      .select('snapshot_date, mrr, active_clients, confirmed_month, due_cycles, paid_cycles, due_amount, paid_due_amount, new_clients, cancelled_clients, captured_at')
      .eq('organization_id', organizationId)
      .gte('snapshot_date', startDate)
      .order('snapshot_date'),
  ])
  const error = clients.error || cycles.error || payments.error || snapshots.error
  if (error) throw new Error(`Falha ao carregar Analytics: ${error.message}`)
  return {
    plan,
    role,
    horizon,
    timezone,
    now,
    clients: clients.data || [],
    cycles: cycles.data || [],
    payments: payments.data || [],
    snapshots: snapshots.data || [],
  }
}

export async function getAnalyticsDashboard(
  organizationId: string,
  role: MembershipRole,
  horizon: AnalyticsHorizon,
  now = new Date(),
): Promise<AnalyticsDashboardDTO | null> {
  const plan = await analyticsPlan(organizationId)
  if (!plan) return null
  const timezone = await getOrganizationTimezone(organizationId)
  return buildAnalyticsDashboard(await readAnalyticsInput(organizationId, plan, role, horizon, timezone, now))
}

export async function previewPriceSimulation(organizationId: string, input: {
  currentPrice: number
  newPrice: number
  assumedChurnPct: number
}): Promise<PriceSimulationResult> {
  if (!(await analyticsPlan(organizationId))) throw new Error('ANALYTICS_REQUIRED')
  const { data, error } = await supabaseAdmin.from('clients')
    .select('id, status, plan_value, created_at')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
  if (error) throw new Error(error.message)
  return simulatePriceChange({ clients: data || [], ...input })
}

function scenarioDTO(row: any): AnalyticsScenarioDTO {
  return {
    id: row.id,
    name: row.name,
    current_price: numeric(row.current_price),
    new_price: numeric(row.new_price),
    assumed_churn_pct: numeric(row.assumed_churn_pct),
    eligible_clients: Number(row.eligible_clients || 0),
    projected_clients: numeric(row.projected_clients),
    current_mrr: numeric(row.current_mrr),
    projected_mrr: numeric(row.projected_mrr),
    monthly_delta: numeric(row.monthly_delta),
    annual_delta: numeric(row.annual_delta),
    break_even_churn_pct: numeric(row.break_even_churn_pct),
    source_snapshot_date: row.source_snapshot_date,
    created_at: row.created_at,
    warning: numeric(row.new_price) <= numeric(row.current_price)
      ? 'O novo preço não cria margem positiva para absorver perda de clientes.'
      : Number(row.eligible_clients || 0) === 0 ? 'Nenhum cliente ativo pertence a esta faixa de preço.' : null,
  }
}

function encodeCursor(row: { created_at: string; id: string }) {
  return Buffer.from(JSON.stringify([row.created_at, row.id]), 'utf8').toString('base64url')
}

function decodeCursor(cursor: string | null) {
  if (!cursor) return null
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (!Array.isArray(parsed) || parsed.length !== 2 || Number.isNaN(new Date(parsed[0]).getTime()) || !/^[0-9a-f-]{36}$/i.test(parsed[1])) return null
    return { createdAt: String(parsed[0]), id: String(parsed[1]) }
  } catch {
    return null
  }
}

export async function listAnalyticsScenarios(organizationId: string, cursor: string | null, limit = 20) {
  if (!(await analyticsPlan(organizationId))) throw new Error('ANALYTICS_REQUIRED')
  const safeLimit = Math.max(1, Math.min(50, limit))
  const decoded = decodeCursor(cursor)
  if (cursor && !decoded) throw new Error('INVALID_CURSOR')
  let query = supabaseAdmin.from('analytics_scenarios').select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(safeLimit + 1)
  if (decoded) query = query.or(`created_at.lt.${decoded.createdAt},and(created_at.eq.${decoded.createdAt},id.lt.${decoded.id})`)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = data || []
  const hasMore = rows.length > safeLimit
  const page = rows.slice(0, safeLimit)
  return {
    scenarios: page.map(scenarioDTO),
    next_cursor: hasMore && page.length ? encodeCursor(page[page.length - 1]) : null,
  }
}

export async function saveAnalyticsScenario(organizationId: string, userId: string, input: {
  name: string
  currentPrice: number
  newPrice: number
  assumedChurnPct: number
}) {
  const simulation = await previewPriceSimulation(organizationId, input)
  const timezone = await getOrganizationTimezone(organizationId)
  const { data: latestSnapshot } = await supabaseAdmin.from('executive_daily_snapshots')
    .select('snapshot_date')
    .eq('organization_id', organizationId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { data, error } = await supabaseAdmin.from('analytics_scenarios').insert({
    organization_id: organizationId,
    name: input.name.trim(),
    current_price: simulation.current_price,
    new_price: simulation.new_price,
    assumed_churn_pct: simulation.assumed_churn_pct,
    eligible_clients: simulation.eligible_clients,
    projected_clients: simulation.projected_clients,
    current_mrr: simulation.current_mrr,
    projected_mrr: simulation.projected_mrr,
    monthly_delta: simulation.monthly_delta,
    annual_delta: simulation.annual_delta,
    break_even_churn_pct: simulation.break_even_churn_pct,
    source_snapshot_date: latestSnapshot?.snapshot_date || dateInTimezone(new Date(), timezone),
    created_by: userId,
  }).select('*').single()
  if (error) throw new Error(error.message)
  return scenarioDTO(data)
}

export async function deleteAnalyticsScenario(organizationId: string, scenarioId: string) {
  if (!(await analyticsPlan(organizationId))) throw new Error('ANALYTICS_REQUIRED')
  const { data, error } = await supabaseAdmin.from('analytics_scenarios').delete()
    .eq('organization_id', organizationId)
    .eq('id', scenarioId)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('SCENARIO_NOT_FOUND')
  return { deleted: true }
}

async function captureOrganizationSnapshot(organizationId: string, now: Date, force: boolean) {
  const timezone = await getOrganizationTimezone(organizationId)
  const snapshotDate = dateInTimezone(now, timezone)
  if (!force) {
    const { data: existing } = await supabaseAdmin.from('executive_daily_snapshots').select('id')
      .eq('organization_id', organizationId).eq('snapshot_date', snapshotDate).maybeSingle()
    if (existing) return false
  }
  const month = snapshotDate.slice(0, 7)
  const monthStart = `${month}-01`
  const nextMonthStart = `${monthShift(month, 1)}-01`
  const [clients, cycles, payments, lifecycle] = await Promise.all([
    supabaseAdmin.from('clients').select('status, plan_value, created_at').eq('organization_id', organizationId),
    supabaseAdmin.from('billing_cycles').select('status, amount, due_date').eq('organization_id', organizationId).gte('due_date', monthStart).lt('due_date', nextMonthStart),
    supabaseAdmin.from('payments').select('amount_paid, paid_at, created_at').eq('organization_id', organizationId).gte('paid_at', `${monthStart}T00:00:00Z`),
    supabaseAdmin.from('client_lifecycle_events').select('event_type, created_at').eq('organization_id', organizationId).gte('created_at', `${monthStart}T00:00:00Z`),
  ])
  const error = clients.error || cycles.error || payments.error || lifecycle.error
  if (error) throw new Error(error.message)
  const active = (clients.data || []).filter((client) => client.status === 'active')
  const currentCycles = (cycles.data || []).filter((cycle) => cycle.status !== 'cancelled')
  const dueCycles = currentCycles.filter((cycle) => cycle.due_date <= snapshotDate)
  const paidCycles = dueCycles.filter((cycle) => cycle.status === 'paid')
  const atRisk = dueCycles.filter((cycle) => cycle.status !== 'paid')
  const currentPayments = (payments.data || []).filter((payment) => timestampDateInTimezone(payment.paid_at || payment.created_at, timezone)?.slice(0, 7) === month)
  const newClients = (clients.data || []).filter((client) => timestampDateInTimezone(client.created_at, timezone)?.slice(0, 7) === month)
  const cancellations = (lifecycle.data || []).filter((event) => event.event_type === 'cancelled' && timestampDateInTimezone(event.created_at, timezone)?.slice(0, 7) === month)
  const payload = {
    organization_id: organizationId,
    snapshot_date: snapshotDate,
    timezone,
    mrr: active.reduce((total, client) => total + numeric(client.plan_value), 0),
    active_clients: active.length,
    forecast_month: currentCycles.reduce((total, cycle) => total + numeric(cycle.amount), 0),
    confirmed_month: currentPayments.reduce((total, payment) => total + numeric(payment.amount_paid), 0),
    at_risk: atRisk.reduce((total, cycle) => total + numeric(cycle.amount), 0),
    due_cycles: dueCycles.length,
    paid_cycles: paidCycles.length,
    due_amount: dueCycles.reduce((total, cycle) => total + numeric(cycle.amount), 0),
    paid_due_amount: paidCycles.reduce((total, cycle) => total + numeric(cycle.amount), 0),
    payments_count: currentPayments.length,
    new_clients: newClients.length,
    cancelled_clients: cancellations.length,
    captured_at: now.toISOString(),
    updated_at: now.toISOString(),
  }
  const { error: upsertError } = await supabaseAdmin.from('executive_daily_snapshots').upsert(payload, { onConflict: 'organization_id,snapshot_date' })
  if (upsertError) throw new Error(upsertError.message)
  return true
}

export async function persistAnalyticsForecasts(organizationId: string, now = new Date()) {
  const plan = await analyticsPlan(organizationId)
  if (!plan) return 0
  const timezone = await getOrganizationTimezone(organizationId)
  const forecastDate = dateInTimezone(now, timezone)
  const horizons: AnalyticsHorizon[] = ['month', '3m', '6m', '12m']
  let persisted = 0
  for (const horizon of horizons) {
    const dashboard = buildAnalyticsDashboard(await readAnalyticsInput(organizationId, plan, 'member', horizon, timezone, now))
    const { error } = await supabaseAdmin.from('analytics_forecasts').upsert({
      organization_id: organizationId,
      forecast_date: forecastDate,
      horizon,
      model_version: ANALYTICS_MODEL_VERSION,
      coverage: dashboard.coverage.level,
      coverage_days: dashboard.coverage.days,
      complete_months: dashboard.coverage.complete_months,
      contractual_total: dashboard.forecast.contractual_total,
      expected_cash: dashboard.forecast.expected_cash,
      projected_active_clients: dashboard.forecast.projected_active_clients,
      assumptions: {
        monthly_growth_rate: dashboard.forecast.monthly_growth_rate,
        realization_rate: dashboard.summary.realization_rate,
        conservative_cash: dashboard.forecast.conservative_cash,
        notes: dashboard.forecast.assumptions,
      },
      series: dashboard.forecast.series,
      updated_at: now.toISOString(),
    }, { onConflict: 'organization_id,forecast_date,horizon,model_version' })
    if (error) throw new Error(error.message)
    persisted++
  }
  return persisted
}

export async function captureAnalyticsSnapshots(now = new Date(), options: { force?: boolean } = {}) {
  const { data: entitlements, error } = await supabaseAdmin.from('organization_entitlements')
    .select('organization_id')
    .eq('is_active', true)
    .in('plan', ['pro', 'master'])
  if (error) throw new Error(error.message)
  let captured = 0
  let forecasts = 0
  for (const entitlement of entitlements || []) {
    try {
      const created = await captureOrganizationSnapshot(entitlement.organization_id, now, Boolean(options.force))
      if (!created) continue
      captured++
      forecasts += await persistAnalyticsForecasts(entitlement.organization_id, now)
    } catch (captureError) {
      console.error(`[analytics] Falha ao capturar organização ${entitlement.organization_id}:`, captureError)
    }
  }
  return { captured, forecasts }
}

import type {
  AnalyticsCoverageLevel,
  AnalyticsDashboardDTO,
  AnalyticsHorizon,
  PriceSimulationResult,
} from './analytics-types'

export const ANALYTICS_MODEL_VERSION = 1

type AnalyticsClient = { id: string; status: string; plan_value: number | string | null; created_at: string }
type AnalyticsCycle = { id: string; due_date: string; amount: number | string; status: string }
type AnalyticsPayment = { amount_paid: number | string; paid_at?: string | null; created_at: string }
type AnalyticsSnapshot = {
  snapshot_date: string
  mrr: number | string
  active_clients: number
  confirmed_month?: number | string
  due_cycles?: number
  paid_cycles?: number
  due_amount?: number | string
  paid_due_amount?: number | string
  new_clients?: number
  cancelled_clients?: number
  captured_at?: string | null
}

export type AnalyticsEngineInput = {
  plan: 'pro' | 'master'
  role: 'owner' | 'admin' | 'member'
  horizon: AnalyticsHorizon
  timezone: string
  now?: Date
  clients: AnalyticsClient[]
  cycles: AnalyticsCycle[]
  payments: AnalyticsPayment[]
  snapshots: AnalyticsSnapshot[]
}

const number = (value: number | string | null | undefined) => Number(value || 0)
const money = (value: number) => Number(value.toFixed(2))
const percent = (value: number) => Number(value.toFixed(2))
const sum = <T>(rows: T[], selector: (row: T) => number) => rows.reduce((total, row) => total + selector(row), 0)

export function dateInTimezone(value: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)
}

export function timestampDateInTimezone(value: string | null | undefined, timezone: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return dateInTimezone(date, timezone)
}

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1, 12))
  return date.toISOString().slice(0, 7)
}

function daysInMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber, 0, 12)).getUTCDate()
}

function dayDistance(start: string, end: string) {
  const startMs = new Date(`${start}T12:00:00Z`).getTime()
  const endMs = new Date(`${end}T12:00:00Z`).getTime()
  return Math.max(0, Math.floor((endMs - startMs) / 86_400_000) + 1)
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function completeMonthlySnapshots(snapshots: AnalyticsSnapshot[], currentMonth: string) {
  const groups = new Map<string, AnalyticsSnapshot[]>()
  for (const snapshot of snapshots) {
    const month = snapshot.snapshot_date.slice(0, 7)
    if (month >= currentMonth) continue
    groups.set(month, [...(groups.get(month) || []), snapshot])
  }

  return [...groups.entries()]
    .filter(([month, rows]) => new Set(rows.map((row) => row.snapshot_date)).size >= Math.ceil(daysInMonth(month) * 0.8))
    .map(([month, rows]) => ({
      month,
      snapshot: [...rows].sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0],
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

function resolveCoverage(input: AnalyticsEngineInput, today: string) {
  const currentMonth = today.slice(0, 7)
  const completed = completeMonthlySnapshots(input.snapshots, currentMonth)
  const candidates = [
    ...input.cycles.map((cycle) => cycle.due_date),
    ...input.snapshots.map((snapshot) => snapshot.snapshot_date),
  ].filter(Boolean).sort()
  const startsAt = candidates[0] || null
  const days = startsAt ? dayDistance(startsAt, today) : 0
  let level: AnalyticsCoverageLevel = 'insufficient'
  if (days >= 90 && completed.length >= 3) level = 'full'
  else if (days >= 30) level = 'partial'
  return { level, startsAt, days, completeMonths: completed }
}

function paymentDate(payment: AnalyticsPayment, timezone: string) {
  return timestampDateInTimezone(payment.paid_at || payment.created_at, timezone)
}

function changePercent(current: number, previous: number) {
  return previous > 0 ? percent(((current - previous) / previous) * 100) : null
}

export function simulatePriceChange(input: {
  clients: AnalyticsClient[]
  currentPrice: number
  newPrice: number
  assumedChurnPct: number
}): PriceSimulationResult {
  const eligible = input.clients.filter((client) => client.status === 'active' && Math.abs(number(client.plan_value) - input.currentPrice) < 0.005)
  const projectedClients = eligible.length * (1 - input.assumedChurnPct / 100)
  const currentMrr = eligible.length * input.currentPrice
  const projectedMrr = projectedClients * input.newPrice
  const monthlyDelta = projectedMrr - currentMrr
  const breakEven = input.newPrice > input.currentPrice ? (1 - input.currentPrice / input.newPrice) * 100 : 0

  return {
    current_price: money(input.currentPrice),
    new_price: money(input.newPrice),
    assumed_churn_pct: percent(input.assumedChurnPct),
    eligible_clients: eligible.length,
    projected_clients: Number(projectedClients.toFixed(2)),
    current_mrr: money(currentMrr),
    projected_mrr: money(projectedMrr),
    monthly_delta: money(monthlyDelta),
    annual_delta: money(monthlyDelta * 12),
    break_even_churn_pct: percent(Math.max(0, Math.min(100, breakEven))),
    warning: input.newPrice <= input.currentPrice
      ? 'O novo preço não cria margem positiva para absorver perda de clientes.'
      : eligible.length === 0 ? 'Nenhum cliente ativo pertence a esta faixa de preço.' : null,
  }
}

export function buildAnalyticsDashboard(input: AnalyticsEngineInput): AnalyticsDashboardDTO {
  const now = input.now || new Date()
  const today = dateInTimezone(now, input.timezone)
  const currentMonth = today.slice(0, 7)
  const previousMonth = shiftMonth(currentMonth, -1)
  const rollingStart = shiftMonth(currentMonth, -11)
  const coverage = resolveCoverage(input, today)
  const activeClients = input.clients.filter((client) => client.status === 'active')
  const mrr = sum(activeClients, (client) => number(client.plan_value))
  const currentCycles = input.cycles.filter((cycle) => cycle.status !== 'cancelled' && cycle.due_date.slice(0, 7) === currentMonth)
  const maturedCycles = input.cycles.filter((cycle) => cycle.status !== 'cancelled' && cycle.due_date <= today)
  const maturedAmount = sum(maturedCycles, (cycle) => number(cycle.amount))
  const paidMaturedAmount = sum(maturedCycles.filter((cycle) => cycle.status === 'paid'), (cycle) => number(cycle.amount))
  const realizationRate = maturedCycles.length >= 10 && maturedAmount > 0 ? Math.min(1, paidMaturedAmount / maturedAmount) : null
  const currentPayments = input.payments.filter((payment) => paymentDate(payment, input.timezone)?.slice(0, 7) === currentMonth)
  const previousPayments = input.payments.filter((payment) => paymentDate(payment, input.timezone)?.slice(0, 7) === previousMonth)
  const rollingPayments = input.payments.filter((payment) => {
    const month = paymentDate(payment, input.timezone)?.slice(0, 7)
    return Boolean(month && month >= rollingStart && month <= currentMonth)
  })
  const confirmed = sum(currentPayments, (payment) => number(payment.amount_paid))
  const previousConfirmed = sum(previousPayments, (payment) => number(payment.amount_paid))
  const contractual = sum(currentCycles, (cycle) => number(cycle.amount))
  const remaining = sum(currentCycles.filter((cycle) => cycle.status !== 'paid'), (cycle) => number(cycle.amount))
  const monthCloseEstimate = realizationRate === null ? null : money(confirmed + remaining * realizationRate)

  const completed = coverage.completeMonths
  const monthlyGrowth: number[] = []
  for (let index = 1; index < completed.length; index++) {
    const previous = completed[index - 1].snapshot.active_clients
    const current = completed[index].snapshot.active_clients
    if (previous > 0) monthlyGrowth.push((current - previous) / previous)
  }
  const historyReady = completed.length >= 3
  const growthRate = historyReady ? Math.max(-0.25, Math.min(0.25, median(monthlyGrowth))) : null
  const completedRealizationRates = completed
    .map(({ snapshot }) => number(snapshot.due_amount) > 0 ? number(snapshot.paid_due_amount) / number(snapshot.due_amount) : null)
    .filter((value): value is number => value !== null)
  const conservativeRate = historyReady && completedRealizationRates.length >= 3
    ? Math.max(0, Math.min(1, Math.min(...completedRealizationRates.slice(-3))))
    : null
  const months = input.horizon === 'month' ? 1 : input.horizon === '3m' ? 3 : input.horizon === '6m' ? 6 : 12
  const series = []
  let projectedMrr = mrr
  let projectedClients = activeClients.length

  for (let index = 0; index < months; index++) {
    const month = shiftMonth(currentMonth, index)
    if (index > 0 && growthRate !== null) {
      projectedMrr *= 1 + growthRate
      projectedClients *= 1 + growthRate
    }
    const pointContractual = index === 0 ? contractual : projectedMrr
    const expectedCash = index === 0
      ? monthCloseEstimate
      : historyReady && realizationRate !== null ? money(pointContractual * realizationRate) : null
    series.push({
      month,
      contractual: money(pointContractual),
      expected_cash: expectedCash,
      projected_active_clients: Number(projectedClients.toFixed(2)),
    })
  }

  const expectedValues = series.map((point) => point.expected_cash)
  const expectedCash = expectedValues.every((value) => value !== null)
    ? money(expectedValues.reduce<number>((total, value) => total + Number(value), 0))
    : null
  const conservativeCash = conservativeRate === null ? null : money(series.reduce((total, point, index) => {
    if (index === 0) return total + confirmed + remaining * conservativeRate
    return total + point.contractual * conservativeRate
  }, 0))
  const lastSnapshot = [...input.snapshots].sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0]
  const lastSnapshotAt = lastSnapshot?.captured_at || (lastSnapshot ? `${lastSnapshot.snapshot_date}T00:00:00Z` : null)
  const stale = !lastSnapshotAt || now.getTime() - new Date(lastSnapshotAt).getTime() > 36 * 60 * 60 * 1000
  const reasons: string[] = []
  if (coverage.days < 30) reasons.push('Menos de 30 dias de dados confiáveis.')
  if (completed.length < 3) reasons.push('Ainda não existem três meses completos de snapshots.')
  if (maturedCycles.length < 10) reasons.push('A taxa de realização exige ao menos dez ciclos vencidos.')
  if (stale) reasons.push('O snapshot diário está ausente ou atrasado.')

  const cohorts = new Map<number, number>()
  for (const client of activeClients) {
    const price = money(number(client.plan_value))
    if (price <= 0) continue
    cohorts.set(price, (cohorts.get(price) || 0) + 1)
  }

  return {
    entitlement: { plan: input.plan, active: true },
    permissions: { can_manage_scenarios: input.role === 'owner' || input.role === 'admin' },
    generated_at: now.toISOString(),
    timezone: input.timezone,
    horizon: input.horizon,
    coverage: {
      level: coverage.level,
      starts_at: coverage.startsAt,
      days: coverage.days,
      complete_months: completed.length,
      matured_cycles: maturedCycles.length,
      last_snapshot_at: lastSnapshotAt,
      stale,
      reasons,
    },
    summary: {
      active_clients: activeClients.length,
      mrr: money(mrr),
      month_contractual: money(contractual),
      month_confirmed: money(confirmed),
      month_close_estimate: monthCloseEstimate,
      realization_rate: realizationRate === null ? null : percent(realizationRate * 100),
    },
    comparisons: {
      previous_month_confirmed: money(previousConfirmed),
      confirmed_change_pct: changePercent(confirmed, previousConfirmed),
      rolling_12m_confirmed: money(sum(rollingPayments, (payment) => number(payment.amount_paid))),
      new_clients_month: input.clients.filter((client) => timestampDateInTimezone(client.created_at, input.timezone)?.slice(0, 7) === currentMonth).length,
    },
    forecast: {
      model_version: ANALYTICS_MODEL_VERSION,
      contractual_total: money(sum(series, (point) => point.contractual)),
      expected_cash: expectedCash,
      conservative_cash: conservativeCash,
      projected_active_clients: series.at(-1)?.projected_active_clients || activeClients.length,
      monthly_growth_rate: growthRate === null ? null : percent(growthRate * 100),
      assumptions: historyReady
        ? ['Crescimento líquido calculado pela mediana dos meses completos.', 'Realização limitada aos ciclos vencidos e efetivamente pagos.']
        : ['MRR contratual mantido constante por falta de três meses completos.', 'Nenhuma taxa de crescimento foi inventada.'],
      series,
    },
    price_cohorts: [...cohorts.entries()]
      .map(([current_price, count]) => ({ current_price, active_clients: count, current_mrr: money(current_price * count) }))
      .sort((a, b) => a.current_price - b.current_price),
  }
}

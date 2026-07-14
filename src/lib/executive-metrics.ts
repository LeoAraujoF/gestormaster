export type ExecutivePeriod = 'month' | '30d' | '90d' | '12m'

export type ExecutiveDashboardDTO = {
  period: ExecutivePeriod
  entitlement: { plan: 'pro' | 'master' }
  coverage: { starts_at: string | null; partial: boolean; cycle_count: number; snapshot_count: number }
  summary: { forecast: number; confirmed: number; at_risk: number; mrr: number; active_clients: number }
  previous: { forecast: number; confirmed: number; at_risk: number; mrr: number }
  rates: { renewal: number; default: number; cancellation: number; average_ticket: number }
  growth: { new_clients: number; previous_new_clients: number; cancellations: number }
  series: Array<{ date: string; forecast: number; confirmed: number; at_risk: number }>
  breakdowns: {
    payment_methods: Array<{ method: string; value: number; count: number }>
    services: Array<{ service: string; value: number; clients: number }>
  }
}

type Cycle = { id: string; client_id: string; due_date: string; amount: number; status: string; paid_at?: string | null; created_at?: string }
type Payment = { amount_paid: number; payment_method?: string | null; paid_at?: string | null; created_at: string }
type Client = { id: string; status: string; plan_value: number; created_at: string }
type LifecycleEvent = { event_type: string; created_at: string }
type Snapshot = { snapshot_date: string; mrr: number; active_clients: number }
type ServiceAssignment = { client_id: string; service_name: string }

export function resolveExecutivePeriod(period: ExecutivePeriod, now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12))
  let start: Date
  let previousStart: Date
  let previousEnd: Date

  if (period === 'month') {
    start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 12))
    today.setUTCMonth(today.getUTCMonth() + 1, 0)
    previousStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1, 12))
    previousEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0, 12))
  } else {
    const days = period === '30d' ? 30 : period === '90d' ? 90 : 365
    start = new Date(today)
    start.setUTCDate(start.getUTCDate() - days + 1)
    previousEnd = new Date(start)
    previousEnd.setUTCDate(previousEnd.getUTCDate() - 1)
    previousStart = new Date(previousEnd)
    previousStart.setUTCDate(previousStart.getUTCDate() - days + 1)
  }

  const toDate = (value: Date) => value.toISOString().slice(0, 10)
  return { start: toDate(start), end: toDate(today), previousStart: toDate(previousStart), previousEnd: toDate(previousEnd) }
}

const timestampDate = (value: string | null | undefined) => value ? new Date(value).toISOString().slice(0, 10) : null
const between = (value: string | null, start: string, end: string) => Boolean(value && value >= start && value <= end)
const sum = <T>(rows: T[], selector: (row: T) => number) => rows.reduce((total, row) => total + Number(selector(row) || 0), 0)
const percent = (value: number, total: number) => total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0

function bucketKey(date: string, period: ExecutivePeriod) {
  return period === '90d' || period === '12m' ? date.slice(0, 7) : date
}

export function computeExecutiveMetrics(input: {
  period: ExecutivePeriod
  now?: Date
  cycles: Cycle[]
  payments: Payment[]
  clients: Client[]
  lifecycleEvents: LifecycleEvent[]
  snapshots: Snapshot[]
  serviceAssignments: ServiceAssignment[]
  plan: 'pro' | 'master'
}): ExecutiveDashboardDTO {
  const now = input.now || new Date()
  const range = resolveExecutivePeriod(input.period, now)
  const today = now.toISOString().slice(0, 10)
  const dueCutoff = range.end < today ? range.end : today

  const currentCycles = input.cycles.filter((cycle) => cycle.status !== 'cancelled' && between(cycle.due_date, range.start, range.end))
  const previousCycles = input.cycles.filter((cycle) => cycle.status !== 'cancelled' && between(cycle.due_date, range.previousStart, range.previousEnd))
  const dueCycles = currentCycles.filter((cycle) => cycle.due_date <= dueCutoff)
  const overdueCycles = dueCycles.filter((cycle) => cycle.status === 'overdue' || (cycle.status === 'open' && cycle.due_date < today))
  const currentPayments = input.payments.filter((payment) => between(timestampDate(payment.paid_at || payment.created_at), range.start, range.end))
  const previousPayments = input.payments.filter((payment) => between(timestampDate(payment.paid_at || payment.created_at), range.previousStart, range.previousEnd))
  const currentEvents = input.lifecycleEvents.filter((event) => event.event_type === 'cancelled' && between(timestampDate(event.created_at), range.start, range.end))
  const currentActive = input.clients.filter((client) => client.status === 'active')
  const mrr = sum(currentActive, (client) => client.plan_value)
  const startSnapshot = [...input.snapshots].filter((snapshot) => snapshot.snapshot_date <= range.start).sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0]
  const previousSnapshot = [...input.snapshots].filter((snapshot) => snapshot.snapshot_date <= range.previousEnd).sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0]
  const activeAtStart = Number(startSnapshot?.active_clients || currentActive.length)

  const forecast = sum(currentCycles, (cycle) => cycle.amount)
  const confirmed = sum(currentPayments, (payment) => payment.amount_paid)
  const atRisk = sum(overdueCycles, (cycle) => cycle.amount)
  const dueAmount = sum(dueCycles, (cycle) => cycle.amount)
  const paidDueCycles = dueCycles.filter((cycle) => cycle.status === 'paid')
  const previousDueCutoff = range.previousEnd
  const previousRisk = previousCycles.filter((cycle) => cycle.due_date <= previousDueCutoff && cycle.status !== 'paid')
  const newClients = input.clients.filter((client) => between(timestampDate(client.created_at), range.start, range.end)).length
  const previousNewClients = input.clients.filter((client) => between(timestampDate(client.created_at), range.previousStart, range.previousEnd)).length

  const methods = new Map<string, { value: number; count: number }>()
  for (const payment of currentPayments) {
    const method = payment.payment_method && payment.payment_method !== 'legacy' ? payment.payment_method.toUpperCase() : 'Não identificado'
    const current = methods.get(method) || { value: 0, count: 0 }
    current.value += Number(payment.amount_paid || 0)
    current.count++
    methods.set(method, current)
  }

  const clientServices = new Map<string, string[]>()
  for (const assignment of input.serviceAssignments) clientServices.set(assignment.client_id, [...(clientServices.get(assignment.client_id) || []), assignment.service_name])
  const serviceTotals = new Map<string, { value: number; clients: Set<string> }>()
  for (const client of currentActive) {
    const services = clientServices.get(client.id) || ['Sem serviço']
    const share = Number(client.plan_value || 0) / services.length
    for (const service of services) {
      const current = serviceTotals.get(service) || { value: 0, clients: new Set<string>() }
      current.value += share
      current.clients.add(client.id)
      serviceTotals.set(service, current)
    }
  }

  const series = new Map<string, { date: string; forecast: number; confirmed: number; at_risk: number }>()
  const getBucket = (date: string) => {
    const key = bucketKey(date, input.period)
    if (!series.has(key)) series.set(key, { date: key, forecast: 0, confirmed: 0, at_risk: 0 })
    return series.get(key)!
  }
  for (const cycle of currentCycles) {
    getBucket(cycle.due_date).forecast += Number(cycle.amount || 0)
    if (overdueCycles.some((item) => item.id === cycle.id)) getBucket(cycle.due_date).at_risk += Number(cycle.amount || 0)
  }
  for (const payment of currentPayments) {
    const date = timestampDate(payment.paid_at || payment.created_at)
    if (date) getBucket(date).confirmed += Number(payment.amount_paid || 0)
  }

  const coverageCandidates = [
    ...input.cycles.map((cycle) => cycle.due_date),
    ...input.snapshots.map((snapshot) => snapshot.snapshot_date),
    ...input.lifecycleEvents.map((event) => timestampDate(event.created_at)).filter(Boolean) as string[],
  ].sort()
  const coverageStart = coverageCandidates[0] || null

  return {
    period: input.period,
    entitlement: { plan: input.plan },
    coverage: { starts_at: coverageStart, partial: !coverageStart || coverageStart > range.start || !startSnapshot, cycle_count: input.cycles.length, snapshot_count: input.snapshots.length },
    summary: { forecast, confirmed, at_risk: atRisk, mrr, active_clients: currentActive.length },
    previous: {
      forecast: sum(previousCycles, (cycle) => cycle.amount),
      confirmed: sum(previousPayments, (payment) => payment.amount_paid),
      at_risk: sum(previousRisk, (cycle) => cycle.amount),
      mrr: Number(previousSnapshot?.mrr || 0),
    },
    rates: {
      renewal: percent(paidDueCycles.length, dueCycles.length),
      default: percent(atRisk, dueAmount),
      cancellation: percent(currentEvents.length, activeAtStart),
      average_ticket: currentPayments.length ? confirmed / currentPayments.length : 0,
    },
    growth: { new_clients: newClients, previous_new_clients: previousNewClients, cancellations: currentEvents.length },
    series: [...series.values()].sort((a, b) => a.date.localeCompare(b.date)),
    breakdowns: {
      payment_methods: [...methods.entries()].map(([method, value]) => ({ method, ...value })).sort((a, b) => b.value - a.value),
      services: [...serviceTotals.entries()].map(([service, value]) => ({ service, value: value.value, clients: value.clients.size })).sort((a, b) => b.value - a.value),
    },
  }
}

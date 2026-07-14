import { INTELLIGENCE_AGENTS, type IntelligenceFinding, type IntelligenceSnapshot } from './intelligence-types'

type Client = { id: string; status: string; plan_value: number; created_at: string }
type Cycle = { id: string; client_id: string; due_date: string; amount: number; status: string; paid_at?: string | null }
type Payment = { amount_paid: number; paid_at?: string | null; created_at: string }
type Score = { client_id: string; score: number; confidence: string; calculated_at?: string }
type Dispatch = { id: string; cycle_id: string; status: string; sent_at?: string | null; scheduled_for: string; profile_code?: string | null; step_sequence?: number | null; message_key?: string | null }
type ServiceAssignment = { client_id: string; service_id: string }
type Service = { id: string; cost?: number | null; plans?: unknown }
type Heartbeat = { component: string; status: string; last_seen_at: string; metrics?: Record<string, unknown> }
type Instance = { status: string }

const round = (value: number, digits = 2) => Number(value.toFixed(digits))
const sum = <T>(rows: T[], selector: (row: T) => number) => rows.reduce((total, row) => total + Number(selector(row) || 0), 0)
const percentage = (value: number, total: number) => total > 0 ? round((value / total) * 100) : 0
const day = (value: string | null | undefined, timezone = 'UTC') => value
  ? new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
  : null

function possiblePlanValues(service: Service): number[] {
  if (!Array.isArray(service.plans)) return []
  return service.plans.flatMap((plan) => {
    if (!plan || typeof plan !== 'object') return []
    const row = plan as Record<string, unknown>
    const value = Number(row.price ?? row.value ?? row.cost ?? 0)
    return Number.isFinite(value) && value > 0 ? [value] : []
  })
}

export function buildIntelligenceSnapshot(input: {
  now?: Date
  clients: Client[]
  cycles: Cycle[]
  payments: Payment[]
  scores: Score[]
  dispatches: Dispatch[]
  assignments: ServiceAssignment[]
  services: Service[]
  instances: Instance[]
  heartbeats: Heartbeat[]
  pendingJobs?: number
  timezone?: string
}): IntelligenceSnapshot {
  const now = input.now || new Date()
  const today = now.toISOString().slice(0, 10)
  const monthStart = `${today.slice(0, 7)}-01`
  const next7 = new Date(`${today}T12:00:00Z`)
  next7.setUTCDate(next7.getUTCDate() + 7)
  const next7Day = next7.toISOString().slice(0, 10)

  const monthCycles = input.cycles.filter((cycle) => cycle.status !== 'cancelled' && cycle.due_date >= monthStart && cycle.due_date <= today)
  const dueCycles = monthCycles.filter((cycle) => cycle.due_date <= today)
  const overdue = dueCycles.filter((cycle) => cycle.status === 'overdue' || (cycle.status === 'open' && cycle.due_date < today))
  const monthPayments = input.payments.filter((payment) => {
    const paidDay = day(payment.paid_at || payment.created_at, input.timezone)
    return Boolean(paidDay && paidDay >= monthStart && paidDay <= today)
  })
  const confirmed = sum(monthPayments, (payment) => payment.amount_paid)
  const atRisk = sum(overdue, (cycle) => cycle.amount)
  const forecast = sum(monthCycles, (cycle) => cycle.amount)
  const dueAmount = sum(dueCycles, (cycle) => cycle.amount)
  const nextDue = input.cycles.filter((cycle) => cycle.status === 'open' && cycle.due_date > today && cycle.due_date <= next7Day)

  const scoreByClient = new Map(input.scores.map((score) => [score.client_id, score]))
  const cyclesByClient = new Map<string, Cycle[]>()
  for (const cycle of input.cycles) cyclesByClient.set(cycle.client_id, [...(cyclesByClient.get(cycle.client_id) || []), cycle])
  const servicesById = new Map(input.services.map((service) => [service.id, service]))
  const assignedByClient = new Map<string, Service[]>()
  for (const assignment of input.assignments) {
    const service = servicesById.get(assignment.service_id)
    if (service) assignedByClient.set(assignment.client_id, [...(assignedByClient.get(assignment.client_id) || []), service])
  }

  let eligibleClients = 0
  let upgradeCandidates = 0
  let atRiskClients = 0
  for (const client of input.clients.filter((row) => row.status === 'active' || row.status === 'vencido')) {
    const score = scoreByClient.get(client.id)
    const cycles = cyclesByClient.get(client.id) || []
    const paidCycles = cycles.filter((cycle) => cycle.status === 'paid').length
    const currentlyOverdue = cycles.some((cycle) => cycle.status === 'overdue' || (cycle.status === 'open' && cycle.due_date < today))
    if ((score?.score || 100) < 40 || currentlyOverdue) atRiskClients++
    if (score?.confidence !== 'high' || score.score < 80 || paidCycles < 3 || currentlyOverdue) continue
    eligibleClients++
    const higherPlanExists = (assignedByClient.get(client.id) || []).some((service) =>
      possiblePlanValues(service).some((value) => value > Number(client.plan_value || 0))
    )
    if (higherPlanExists) upgradeCandidates++
  }

  const cycleById = new Map(input.cycles.map((cycle) => [cycle.id, cycle]))
  const sent = input.dispatches.filter((dispatch) => dispatch.status === 'sent' && dispatch.sent_at)
  const converted = sent.filter((dispatch) => {
    const cycle = cycleById.get(dispatch.cycle_id)
    if (!cycle?.paid_at || !dispatch.sent_at) return false
    const elapsed = new Date(cycle.paid_at).getTime() - new Date(dispatch.sent_at).getTime()
    return elapsed >= 0 && elapsed <= 72 * 60 * 60 * 1000
  })
  const byHour = new Map<number, { sent: number; converted: number }>()
  const byProfile = new Map<string, { sent: number; converted: number }>()
  const byStep = new Map<number, { sent: number; converted: number }>()
  const byMessage = new Map<string, { sent: number; converted: number }>()
  const addGroup = <T extends string | number>(map: Map<T, { sent: number; converted: number }>, key: T | null | undefined, wasConverted: boolean) => {
    if (key === null || key === undefined) return
    const current = map.get(key) || { sent: 0, converted: 0 }
    current.sent++
    if (wasConverted) current.converted++
    map.set(key, current)
  }
  for (const dispatch of sent) {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: input.timezone || 'UTC', hour: '2-digit', hour12: false }).format(new Date(dispatch.sent_at!))) % 24
    const wasConverted = converted.some((row) => row.id === dispatch.id)
    addGroup(byHour, hour, wasConverted)
    addGroup(byProfile, dispatch.profile_code, wasConverted)
    addGroup(byStep, dispatch.step_sequence, wasConverted)
    addGroup(byMessage, dispatch.message_key, wasConverted)
  }
  const bestGroup = <T extends string | number>(map: Map<T, { sent: number; converted: number }>) =>
    [...map.entries()].filter(([, value]) => value.sent >= 20).sort((a, b) => percentage(b[1].converted, b[1].sent) - percentage(a[1].converted, a[1].sent))[0]
  const bestHour = bestGroup(byHour)
  const bestProfile = bestGroup(byProfile)
  const bestStep = bestGroup(byStep)
  const bestMessage = bestGroup(byMessage)

  const staleLimit = now.getTime() - 3 * 60 * 1000
  const expectedComponents = ['scheduler', 'ai_worker']
  const reportedComponents = new Set(input.heartbeats.map((heartbeat) => heartbeat.component))
  const missingComponents = expectedComponents.filter((component) => !reportedComponents.has(component)).length
  const staleComponents = missingComponents + input.heartbeats.filter((heartbeat) => heartbeat.status !== 'healthy' || new Date(heartbeat.last_seen_at).getTime() < staleLimit).length
  const disconnectedInstances = input.instances.filter((instance) => instance.status !== 'connected').length
  const failedDispatches = input.dispatches.filter((dispatch) => dispatch.status === 'failed').length
  const coverageStarts = [
    ...input.cycles.map((cycle) => cycle.due_date),
    ...input.dispatches.map((dispatch) => day(dispatch.sent_at || dispatch.scheduled_for, input.timezone)).filter(Boolean) as string[],
  ].sort()
  const coverage = {
    starts_at: coverageStarts[0] || null,
    partial: input.cycles.length < 3 || input.scores.length < Math.min(3, input.clients.length),
    cycles: input.cycles.length,
    dispatches: sent.length,
    scores: input.scores.length,
  }

  const finding = (value: Omit<IntelligenceFinding, 'source'>): IntelligenceFinding => ({ ...value, source: 'deterministic' })
  const findings: IntelligenceFinding[] = []
  findings.push(finding({
    agent_type: 'financial', severity: atRisk > 0 ? 'warning' : 'info', title: atRisk > 0 ? 'Receita em risco exige atenção' : 'Fluxo financeiro sem atraso relevante',
    summary: atRisk > 0 ? 'Existem ciclos vencidos e ainda não pagos no período atual.' : 'Não há valor vencido identificado nos ciclos com cobertura disponível.',
    evidence: [{ metric: 'receita_em_risco', value: atRisk, unit: 'BRL' }, { metric: 'inadimplencia', value: percentage(atRisk, dueAmount), unit: '%' }],
    recommendation: atRisk > 0 ? 'Revise os ciclos vencidos e a régua aplicada aos clientes em atraso.' : 'Mantenha o acompanhamento diário dos próximos vencimentos.',
    confidence: coverage.partial ? 0.65 : 0.95, coverage: coverage.partial ? 'partial' : 'full', action_url: '/financeiro', priority: atRisk > 0 ? 90 : 35,
  }))
  findings.push(finding({
    agent_type: 'commercial', severity: upgradeCandidates > 0 ? 'opportunity' : 'info', title: upgradeCandidates > 0 ? 'Clientes elegíveis para upgrade' : 'Sem upgrades comprovados no momento',
    summary: upgradeCandidates > 0 ? 'Há clientes com bom histórico financeiro e opção superior no catálogo.' : 'Nenhum cliente atende simultaneamente aos critérios financeiros e de catálogo.',
    evidence: [{ metric: 'candidatos_upgrade', value: upgradeCandidates }, { metric: 'clientes_elegiveis', value: eligibleClients }],
    recommendation: upgradeCandidates > 0 ? 'Avalie os candidatos na área de clientes antes de qualquer abordagem comercial.' : 'Complete o histórico financeiro e mantenha os planos dos serviços atualizados.',
    confidence: coverage.partial ? 0.6 : 0.9, coverage: coverage.partial ? 'partial' : 'full', action_url: '/clientes', priority: upgradeCandidates > 0 ? 65 : 25,
  }))
  findings.push(finding({
    agent_type: 'collections', severity: sent.length >= 20 ? 'opportunity' : 'info', title: sent.length >= 20 ? 'Conversão da régua disponível' : 'Amostra de cobrança ainda insuficiente',
    summary: sent.length >= 20 ? 'A conversão considera pagamentos do mesmo ciclo ocorridos até 72 horas após o envio.' : 'São necessários pelo menos 20 despachos para comparar desempenho com segurança.',
    evidence: [{ metric: 'despachos_enviados', value: sent.length }, { metric: 'taxa_conversao', value: percentage(converted.length, sent.length), unit: '%' }],
    recommendation: sent.length >= 20 ? 'Compare perfis e horários mantendo a atribuição ao ciclo.' : 'Continue coletando despachos sem alterar a régua por uma amostra pequena.',
    confidence: sent.length >= 20 ? 0.85 : 0.4, coverage: sent.length >= 20 ? 'full' : 'insufficient', action_url: '/cobranca-inteligente', priority: 55,
  }))
  findings.push(finding({
    agent_type: 'operational', severity: disconnectedInstances + failedDispatches + staleComponents > 0 ? 'critical' : 'info', title: disconnectedInstances + failedDispatches + staleComponents > 0 ? 'Falhas operacionais detectadas' : 'Operação estável',
    summary: 'A verificação usa somente estados sanitizados de instâncias, despachos, filas e heartbeats.',
    evidence: [{ metric: 'instancias_desconectadas', value: disconnectedInstances }, { metric: 'despachos_com_falha', value: failedDispatches }, { metric: 'componentes_sem_heartbeat', value: staleComponents }],
    recommendation: disconnectedInstances + failedDispatches + staleComponents > 0 ? 'Revise conexões e filas antes de novos disparos.' : 'Nenhuma intervenção operacional é necessária agora.',
    confidence: 0.95, coverage: input.heartbeats.length ? 'full' : 'partial', action_url: '/conexoes/paineis', priority: disconnectedInstances + failedDispatches + staleComponents > 0 ? 100 : 20,
  }))
  const top = [...findings].sort((a, b) => b.priority - a.priority).slice(0, 3)
  findings.push(finding({
    agent_type: 'executive', severity: top.some((row) => row.severity === 'critical') ? 'critical' : top.some((row) => row.severity === 'warning') ? 'warning' : 'info', title: 'Prioridades executivas do período',
    summary: 'As prioridades são ordenadas pelo impacto financeiro e operacional calculado, sem previsão probabilística.',
    evidence: top.map((row, index) => ({ metric: `prioridade_${index + 1}`, value: row.title })),
    recommendation: top.map((row) => row.recommendation).join(' '), confidence: coverage.partial ? 0.65 : 0.9,
    coverage: coverage.partial ? 'partial' : 'full', action_url: '/painel', priority: 95,
  }))

  return {
    generated_at: now.toISOString(), period: { start: monthStart, end: today, next_7_days_end: next7Day }, coverage,
    financial: { confirmed: round(confirmed), at_risk: round(atRisk), forecast: round(forecast), default_rate: percentage(atRisk, dueAmount), average_ticket: monthPayments.length ? round(confirmed / monthPayments.length) : 0, payments_count: monthPayments.length, due_next_7_days: round(sum(nextDue, (cycle) => cycle.amount)) },
    commercial: { upgrade_candidates: upgradeCandidates, at_risk_clients: atRiskClients, eligible_clients: eligibleClients },
    collections: { sent_dispatches: sent.length, converted_dispatches: converted.length, conversion_rate: percentage(converted.length, sent.length), comparison_ready: Boolean(bestHour || bestProfile || bestStep || bestMessage), best_hour: bestHour?.[0] ?? null, best_hour_rate: bestHour ? percentage(bestHour[1].converted, bestHour[1].sent) : null, best_profile: bestProfile?.[0] ?? null, best_step: bestStep?.[0] ?? null, best_message_key: bestMessage?.[0] ?? null },
    operational: { disconnected_instances: disconnectedInstances, failed_dispatches: failedDispatches, stale_components: staleComponents, pending_jobs: input.pendingJobs || 0 },
    deterministic_findings: findings.filter((row) => INTELLIGENCE_AGENTS.includes(row.agent_type)),
  }
}

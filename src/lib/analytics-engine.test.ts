import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAnalyticsDashboard, dateInTimezone, simulatePriceChange } from './analytics-engine'

const now = new Date('2026-04-15T15:00:00Z')

function base(overrides: Record<string, unknown> = {}) {
  return {
    plan: 'pro',
    role: 'owner',
    horizon: 'month',
    timezone: 'America/Sao_Paulo',
    now,
    clients: [],
    cycles: [],
    payments: [],
    snapshots: [],
    ...overrides,
  } as any
}

test('mantém cobertura insuficiente e não inventa fechamento sem dez ciclos vencidos', () => {
  const result = buildAnalyticsDashboard(base({
    clients: [{ id: 'a', status: 'active', plan_value: 30, created_at: '2026-04-01T10:00:00Z' }],
    cycles: [{ id: 'future', due_date: '2026-04-20', amount: 30, status: 'open' }],
  }))
  assert.equal(result.coverage.level, 'insufficient')
  assert.equal(result.summary.month_contractual, 30)
  assert.equal(result.summary.month_close_estimate, null)
  assert.equal(result.forecast.expected_cash, null)
  assert.equal(result.forecast.monthly_growth_rate, null)
})

test('estima fechamento somente com taxa de realização sustentada', () => {
  const matured = Array.from({ length: 10 }, (_, index) => ({
    id: `old-${index}`,
    due_date: `2026-04-${String(index + 1).padStart(2, '0')}`,
    amount: 10,
    status: index < 8 ? 'paid' : 'overdue',
  }))
  const result = buildAnalyticsDashboard(base({
    cycles: [...matured, { id: 'remaining', due_date: '2026-04-20', amount: 100, status: 'open' }],
    payments: [{ amount_paid: 80, paid_at: '2026-04-10T10:00:00Z', created_at: '2026-04-10T10:00:00Z' }],
  }))
  assert.equal(result.summary.realization_rate, 80)
  assert.equal(result.summary.month_close_estimate, 176)
})

function monthSnapshots(month: string, days: number, activeClients: number, paidRate: number) {
  return Array.from({ length: days }, (_, index) => ({
    snapshot_date: `${month}-${String(index + 1).padStart(2, '0')}`,
    mrr: activeClients * 30,
    active_clients: activeClients,
    due_amount: 100,
    paid_due_amount: 100 * paidRate,
    captured_at: `${month}-${String(index + 1).padStart(2, '0')}T03:15:00Z`,
  }))
}

test('libera projeção histórica e cenário conservador após três meses completos', () => {
  const snapshots = [
    ...monthSnapshots('2026-01', 25, 10, 0.9),
    ...monthSnapshots('2026-02', 23, 11, 0.8),
    ...monthSnapshots('2026-03', 25, 12, 0.85),
  ]
  const matured = Array.from({ length: 10 }, (_, index) => ({ id: `c-${index}`, due_date: `2026-03-${String(index + 1).padStart(2, '0')}`, amount: 10, status: index < 8 ? 'paid' : 'overdue' }))
  const result = buildAnalyticsDashboard(base({
    horizon: '3m',
    snapshots,
    cycles: [...matured, { id: 'april', due_date: '2026-04-25', amount: 360, status: 'open' }],
    clients: Array.from({ length: 12 }, (_, index) => ({ id: `u-${index}`, status: 'active', plan_value: 30, created_at: '2025-01-01T00:00:00Z' })),
  }))
  assert.equal(result.coverage.level, 'full')
  assert.equal(result.coverage.complete_months, 3)
  assert.ok(result.forecast.monthly_growth_rate !== null)
  assert.ok(result.forecast.expected_cash !== null)
  assert.ok(result.forecast.conservative_cash !== null)
  assert.equal(result.forecast.series.length, 3)
})

test('simulador calcula receita, perda e ponto de equilíbrio sem alterar a base', () => {
  const clients = Array.from({ length: 10 }, (_, index) => ({ id: String(index), status: 'active', plan_value: 30, created_at: '2026-01-01T00:00:00Z' }))
  const before = JSON.stringify(clients)
  const result = simulatePriceChange({ clients, currentPrice: 30, newPrice: 35, assumedChurnPct: 10 })
  assert.equal(result.eligible_clients, 10)
  assert.equal(result.projected_clients, 9)
  assert.equal(result.current_mrr, 300)
  assert.equal(result.projected_mrr, 315)
  assert.equal(result.annual_delta, 180)
  assert.equal(result.break_even_churn_pct, 14.29)
  assert.equal(JSON.stringify(clients), before)
})

test('respeita o fuso da organização na virada do mês', () => {
  const instant = new Date('2026-05-01T01:30:00Z')
  assert.equal(dateInTimezone(instant, 'America/Sao_Paulo'), '2026-04-30')
  assert.equal(dateInTimezone(instant, 'UTC'), '2026-05-01')
})

test('redução de preço informa ausência de margem para churn', () => {
  const result = simulatePriceChange({ clients: [], currentPrice: 50, newPrice: 40, assumedChurnPct: 0 })
  assert.equal(result.break_even_churn_pct, 0)
  assert.match(result.warning || '', /não cria margem/i)
})

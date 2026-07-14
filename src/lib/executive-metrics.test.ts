import assert from 'node:assert/strict'
import test from 'node:test'
import { computeExecutiveMetrics, resolveExecutivePeriod } from './executive-metrics'

const now = new Date('2026-07-11T15:00:00Z')

test('resolve mês atual e comparação com mês anterior', () => {
  assert.deepEqual(resolveExecutivePeriod('month', now), {
    start: '2026-07-01', end: '2026-07-31', previousStart: '2026-06-01', previousEnd: '2026-06-30',
  })
})

test('calcula previsão, confirmação, risco e taxas sem estimativas artificiais', () => {
  const result = computeExecutiveMetrics({
    period: 'month', now, plan: 'pro',
    cycles: [
      { id: 'c1', client_id: 'a', due_date: '2026-07-05', amount: 100, status: 'paid', paid_at: '2026-07-05T12:00:00Z' },
      { id: 'c2', client_id: 'b', due_date: '2026-07-07', amount: 80, status: 'overdue' },
      { id: 'c3', client_id: 'c', due_date: '2026-07-20', amount: 50, status: 'open' },
      { id: 'c4', client_id: 'd', due_date: '2026-07-08', amount: 40, status: 'cancelled' },
    ],
    payments: [
      { amount_paid: 100, payment_method: 'pix', paid_at: '2026-07-05T12:00:00Z', created_at: '2026-07-05T12:00:00Z' },
      { amount_paid: 20, payment_method: 'legacy', paid_at: '2026-07-06T12:00:00Z', created_at: '2026-07-06T12:00:00Z' },
    ],
    clients: [
      { id: 'a', status: 'active', plan_value: 100, created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', status: 'active', plan_value: 80, created_at: '2026-07-03T00:00:00Z' },
    ],
    lifecycleEvents: [{ event_type: 'cancelled', created_at: '2026-07-04T00:00:00Z' }],
    snapshots: [{ snapshot_date: '2026-07-01', mrr: 100, active_clients: 2 }],
    serviceAssignments: [{ client_id: 'a', service_name: 'TV' }, { client_id: 'b', service_name: 'TV' }],
  })

  assert.equal(result.summary.forecast, 230)
  assert.equal(result.summary.confirmed, 120)
  assert.equal(result.summary.at_risk, 80)
  assert.equal(result.rates.renewal, 50)
  assert.equal(result.rates.default, 44.44)
  assert.equal(result.rates.average_ticket, 60)
  assert.equal(result.breakdowns.payment_methods.find(item => item.method === 'Não identificado')?.value, 20)
})

test('marca cobertura parcial quando não há snapshots históricos', () => {
  const result = computeExecutiveMetrics({ period: '90d', now, plan: 'master', cycles: [], payments: [], clients: [], lifecycleEvents: [], snapshots: [], serviceAssignments: [] })
  assert.equal(result.coverage.partial, true)
  assert.equal(result.coverage.starts_at, null)
  assert.equal(result.rates.default, 0)
})

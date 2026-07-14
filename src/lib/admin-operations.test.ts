import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildOperationalComponentStates,
  buildOperationalIncidentSignals,
} from './admin-operations'

test('classifica heartbeat recente, atrasado e ausente', () => {
  const states = buildOperationalComponentStates([
    { component: 'scheduler', status: 'healthy', started_at: '2026-07-14T11:00:00Z', last_seen_at: '2026-07-14T11:59:00Z', version: '1.0.0' },
    { component: 'message_worker', status: 'healthy', started_at: '2026-07-14T11:00:00Z', last_seen_at: '2026-07-14T11:50:00Z', version: null },
  ], new Date('2026-07-14T12:00:00Z'))

  assert.equal(states.find((item) => item.id === 'scheduler')?.status, 'online')
  assert.equal(states.find((item) => item.id === 'message_worker')?.status, 'stale')
  assert.equal(states.find((item) => item.id === 'webhook_worker')?.status, 'missing')
})

test('gera incidentes determinísticos sem incluir serviços não configurados', () => {
  const components = buildOperationalComponentStates([], new Date('2026-07-14T12:00:00Z'))
  const signals = buildOperationalIncidentSignals(components, [
    { id: 'redis', status: 'offline' },
    { id: 'evolution', status: 'unconfigured' },
  ])

  assert.ok(signals.some((signal) => signal.fingerprint === 'heartbeat:scheduler' && signal.severity === 'critical'))
  assert.ok(signals.some((signal) => signal.fingerprint === 'service:redis' && signal.severity === 'critical'))
  assert.ok(!signals.some((signal) => signal.fingerprint === 'service:evolution'))
})

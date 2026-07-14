import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSecurityState } from './security-state'

const instances = [
  { instance_name: 'alpha', connection_mode: 'external', base_url: 'https://evolution.example', api_key: 'encrypted' },
  { instance_name: 'beta', connection_mode: 'managed', base_url: null, api_key: null },
]

test('usa somente a evidência de rotação vinculada ao secret vigente', () => {
  const state = buildSecurityState({
    hmacConfigured: true,
    requireSignature: true,
    rotatedAt: '2026-07-12T12:00:00.000Z',
    instances,
    managedProviderConfigured: true,
    now: new Date('2026-07-13T12:00:00.000Z'),
    latestRotation: {
      action: 'admin.security.rotate_hmac',
      created_at: '2026-07-12T12:00:01.000Z',
      details: {
        rotated_at: '2026-07-12T12:00:00.000Z',
        instance_results: [
          { instance: 'alpha', updated: true, failure_code: null },
          { instance: 'beta', updated: false, failure_code: 'provider_rejected' },
        ],
      },
    },
  })

  assert.equal(state.coverage.synced, 1)
  assert.equal(state.coverage.failed, 1)
  assert.equal(state.coverage.unverified, 0)
  assert.equal(state.posture, 'attention')
})

test('não transforma evento de outro secret em cobertura verificada', () => {
  const state = buildSecurityState({
    hmacConfigured: true,
    requireSignature: true,
    rotatedAt: '2026-07-13T12:00:00.000Z',
    instances,
    managedProviderConfigured: true,
    latestRotation: {
      action: 'admin.security.rotate_hmac',
      created_at: '2026-07-12T12:00:01.000Z',
      details: {
        rotated_at: '2026-07-12T12:00:00.000Z',
        instance_results: instances.map((instance) => ({ instance: instance.instance_name, updated: true })),
      },
    },
  })

  assert.equal(state.coverage.synced, 0)
  assert.equal(state.coverage.unverified, 2)
  assert.equal(state.posture, 'attention')
  assert.ok(state.alerts.some((alert) => alert.id === 'coverage-unverified'))
})

test('bloqueios de postura e recomendações derivam da configuração real', () => {
  const state = buildSecurityState({
    hmacConfigured: false,
    requireSignature: false,
    rotatedAt: null,
    instances: [],
    managedProviderConfigured: false,
    latestRotation: null,
  })

  assert.equal(state.posture, 'critical')
  assert.deepEqual(state.alerts.map((alert) => alert.id), ['hmac-not-configured', 'signature-disabled'])
  assert.ok(state.recommendations.some((item) => item.id === 'rotate-first-secret'))
})

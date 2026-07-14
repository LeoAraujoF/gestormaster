import assert from 'node:assert/strict'
import test from 'node:test'
import {
  adminQueueActionSchema,
  expectedQueueConfirmation,
  normalizeQueueOperationLimits,
} from './_contracts'

const base = {
  queue: 'messages-queue',
  reason: 'Recuperação operacional autorizada',
  confirmation: 'REPETIR FALHOS messages-queue',
  idempotencyKey: 'f0b2c909-3e32-420f-9559-29c061a5c0a4',
} as const

test('limita recuperação a cem jobs por execução', () => {
  const parsed = adminQueueActionSchema.parse({ ...base, action: 'retry_failed', limit: 999 })
  assert.equal(normalizeQueueOperationLimits(parsed).retryLimit, 100)
})

test('limpeza usa retenção mínima de uma hora e padrão de 24 horas', () => {
  const parsed = adminQueueActionSchema.parse({ ...base, action: 'clean_failed', confirmation: 'LIMPAR FALHOS messages-queue' })
  assert.equal(normalizeQueueOperationLimits(parsed).cleanGraceMs, 24 * 60 * 60 * 1000)
  assert.throws(() => adminQueueActionSchema.parse({ ...parsed, olderThanMinutes: 30 }))
})

test('confirmação inclui ação e nome exato da fila', () => {
  assert.equal(expectedQueueConfirmation('pause', 'webhook-queue'), 'PAUSAR webhook-queue')
})

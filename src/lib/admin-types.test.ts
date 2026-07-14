import assert from 'node:assert/strict'
import test from 'node:test'
import { adminCriticalActionSchema, adminFeaturePatchSchema, adminTicketMessageSchema, adminTicketStatusSchema } from './admin-types'

test('ação crítica exige motivo, confirmação e UUID idempotente', () => {
  assert.equal(adminCriticalActionSchema.safeParse({ reason: 'motivo operacional', confirmation: 'CONFIRMAR', idempotencyKey: '6d7b7fd1-e51f-4b1d-b921-e70760105bb2' }).success, true)
  assert.equal(adminCriticalActionSchema.safeParse({ reason: 'x', confirmation: 'CONFIRMAR', idempotencyKey: 'repetir' }).success, false)
})

test('flags aceitam somente chave limitada e estado booleano', () => {
  assert.equal(adminFeaturePatchSchema.safeParse({ key: 'page_clients', isEnabled: false, reason: 'manutenção preventiva', confirmation: 'ALTERAR page_clients', idempotencyKey: '6d7b7fd1-e51f-4b1d-b921-e70760105bb2' }).success, true)
})

test('mensagens e estados de chamados são limitados', () => {
  assert.equal(adminTicketMessageSchema.safeParse({ content: 'Resposta segura' }).success, true)
  assert.equal(adminTicketMessageSchema.safeParse({ content: 'x'.repeat(5001) }).success, false)
  assert.equal(adminTicketStatusSchema.safeParse('resolved').success, true)
  assert.equal(adminTicketStatusSchema.safeParse('deleted').success, false)
})

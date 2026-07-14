import assert from 'node:assert/strict'
import test from 'node:test'
import {
  adminTicketReplySchema,
  adminTicketsQuerySchema,
  escapePostgresLikePattern,
  isAdminTicketTransitionAllowed,
} from './_contracts'

test('a fila limita paginação e aceita somente filtros suportados', () => {
  const parsed = adminTicketsQuerySchema.parse({ page: '2', pageSize: '20', status: 'open', priority: 'high' })
  assert.deepEqual(parsed, { page: 2, pageSize: 20, status: 'open', priority: 'high' })
  assert.equal(adminTicketsQuerySchema.safeParse({ page: 0, pageSize: 100 }).success, false)
  assert.equal(adminTicketsQuerySchema.safeParse({ status: 'archived' }).success, false)
})

test('resposta exige texto limitado e chave idempotente', () => {
  assert.equal(adminTicketReplySchema.safeParse({ content: 'Resposta real', idempotencyKey: crypto.randomUUID() }).success, true)
  assert.equal(adminTicketReplySchema.safeParse({ content: 'x'.repeat(5001), idempotencyKey: crypto.randomUUID() }).success, false)
  assert.equal(adminTicketReplySchema.safeParse({ content: 'Resposta', idempotencyKey: 'repetir' }).success, false)
})

test('transições preservam reabertura sem inventar estado de arquivo', () => {
  assert.equal(isAdminTicketTransitionAllowed('open', 'resolved'), true)
  assert.equal(isAdminTicketTransitionAllowed('resolved', 'open'), true)
  assert.equal(isAdminTicketTransitionAllowed('closed', 'resolved'), false)
})

test('busca literal neutraliza curingas de LIKE', () => {
  assert.equal(escapePostgresLikePattern('100%_ok\\fim'), '100\\%\\_ok\\\\fim')
})

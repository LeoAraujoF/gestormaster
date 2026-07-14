import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'

import { verifyEvolutionWebhookSignature } from './evolution-webhook-signature'

const body = JSON.stringify({ event: 'MESSAGES_UPSERT' })

test('accepts the current static Evolution secret', () => {
  assert.equal(verifyEvolutionWebhookSignature('current-secret', body, ['current-secret']), true)
})

test('accepts the previous secret while the caller includes it in the grace set', () => {
  assert.equal(verifyEvolutionWebhookSignature('previous-secret', body, ['current-secret', 'previous-secret']), true)
})

test('accepts a SHA-256 HMAC with or without its prefix', () => {
  const signature = crypto.createHmac('sha256', 'current-secret').update(body).digest('hex')
  assert.equal(verifyEvolutionWebhookSignature(signature, body, ['current-secret']), true)
  assert.equal(verifyEvolutionWebhookSignature(`sha256=${signature}`, body, ['current-secret']), true)
})

test('rejects missing, unknown and body-mismatched signatures', () => {
  const signature = crypto.createHmac('sha256', 'current-secret').update(body).digest('hex')
  assert.equal(verifyEvolutionWebhookSignature(null, body, ['current-secret']), false)
  assert.equal(verifyEvolutionWebhookSignature('unknown', body, ['current-secret']), false)
  assert.equal(verifyEvolutionWebhookSignature(signature, '{}', ['current-secret']), false)
})

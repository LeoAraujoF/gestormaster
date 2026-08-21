import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildAlertDeliveryUpdate,
  buildReservationDeliveryUpdate,
  canApplyDeliveryStatus,
  DELIVERY_CONFIRMATION_TIMEOUT_REASON,
  staleReservationCutoff,
} from '../src/lib/contact-delivery'

test('aplica as transições de entrega em ordem e ignora regressões', () => {
  assert.equal(canApplyDeliveryStatus('accepted', 'sent'), true)
  assert.equal(canApplyDeliveryStatus('sent', 'delivered'), true)
  assert.equal(canApplyDeliveryStatus('delivered', 'read'), true)
  assert.equal(canApplyDeliveryStatus('delivered', 'sent'), false)
  assert.equal(canApplyDeliveryStatus('read', 'failed'), false)
})

test('permite que uma entrega tardia recupere um timeout de reconciliação', () => {
  assert.equal(canApplyDeliveryStatus('failed', 'sent', DELIVERY_CONFIRMATION_TIMEOUT_REASON), true)
  assert.equal(canApplyDeliveryStatus('failed', 'sent', 'PHONE_INVALID'), false)
})

test('atualiza histórico e reserva de forma coerente', () => {
  const now = '2026-08-20T15:00:00.000Z'
  assert.deepEqual(
    buildAlertDeliveryUpdate('accepted', 'ACCEPTED', now, { accepted_at: '2026-08-20T14:00:00.000Z' }),
    { status: 'accepted', provider_status: 'ACCEPTED', accepted_at: '2026-08-20T14:00:00.000Z' },
  )
  assert.deepEqual(
    buildReservationDeliveryUpdate('failed', now, 'DELIVERY_ERROR'),
    {
      status: 'failed',
      decision_reason: 'PROVIDER_DELIVERY_FAILED:DELIVERY_ERROR',
      updated_at: now,
    },
  )
  assert.deepEqual(
    buildReservationDeliveryUpdate('delivered', now),
    { status: 'sent', sent_at: now, decision_reason: 'CONTACT_SENT', updated_at: now },
  )
})

test('calcula um limite de reconciliação previsível', () => {
  const now = new Date('2026-08-20T15:00:00.000Z')
  assert.equal(staleReservationCutoff(now, 90), '2026-08-20T13:30:00.000Z')
  assert.equal(staleReservationCutoff(now, 0), '2026-08-20T13:30:00.000Z')
})

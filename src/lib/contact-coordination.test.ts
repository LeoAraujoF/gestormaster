import assert from 'node:assert/strict'
import test from 'node:test'

import { categoryForAlertType, dateInTimezone } from './contact-policy'

test('classifica cobrança acima de promoção e mensagens operacionais', () => {
  assert.equal(categoryForAlertType('before_due'), 'billing')
  assert.equal(categoryForAlertType('on_due'), 'billing')
  assert.equal(categoryForAlertType('after_due'), 'billing')
  assert.equal(categoryForAlertType('promotion'), 'promotion')
  assert.equal(categoryForAlertType('activation'), 'operational')
  assert.equal(categoryForAlertType('quick_message'), 'manual')
})

test('calcula a data de contato no fuso da organização', () => {
  const instant = new Date('2026-07-12T02:30:00.000Z')
  assert.equal(dateInTimezone(instant, 'America/Sao_Paulo'), '2026-07-11')
  assert.equal(dateInTimezone(instant, 'UTC'), '2026-07-12')
})

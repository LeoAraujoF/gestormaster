import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isStripeEntitlementActive,
  isStripeSubscriptionTerminal,
  planIdFromStripePrice,
  stripeSubscriptionExpiresAt,
} from './stripe-subscription'

test('libera entitlement somente para assinatura ativa ou em trial', () => {
  assert.equal(isStripeEntitlementActive('active'), true)
  assert.equal(isStripeEntitlementActive('trialing'), true)
  assert.equal(isStripeEntitlementActive('past_due'), false)
  assert.equal(isStripeEntitlementActive('canceled'), false)
})

test('permite novo checkout somente após estado terminal', () => {
  assert.equal(isStripeSubscriptionTerminal('canceled'), true)
  assert.equal(isStripeSubscriptionTerminal('incomplete_expired'), true)
  assert.equal(isStripeSubscriptionTerminal('past_due'), false)
  assert.equal(isStripeSubscriptionTerminal(null), false)
})

test('resolve o plano exclusivamente pelo Price ID configurado', () => {
  const prices = { starter: 'price_starter', pro: 'price_pro', master: 'price_master' } as const
  assert.equal(planIdFromStripePrice('price_pro', prices), 'pro')
  assert.equal(planIdFromStripePrice('price_desconhecido', prices), null)
})

test('usa o fim de período mais distante entre os itens da assinatura', () => {
  assert.equal(
    stripeSubscriptionExpiresAt([{ current_period_end: 1_800_000_000 }, { current_period_end: 1_900_000_000 }]),
    new Date(1_900_000_000 * 1000).toISOString(),
  )
  assert.equal(stripeSubscriptionExpiresAt([]), null)
})

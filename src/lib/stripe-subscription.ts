import type { PlanId } from '@/lib/plan-types'

export function isStripeEntitlementActive(status: string): boolean {
  return status === 'active' || status === 'trialing'
}

export function isStripeSubscriptionTerminal(status: string | null | undefined): boolean {
  return status === 'canceled' || status === 'incomplete_expired'
}

export function planIdFromStripePrice(
  priceId: string | null | undefined,
  configuredPrices: Partial<Record<PlanId, string | undefined>>,
): PlanId | null {
  if (!priceId) return null
  const match = (Object.entries(configuredPrices) as Array<[PlanId, string | undefined]>)
    .find(([, configuredPriceId]) => configuredPriceId === priceId)
  return match?.[0] || null
}

export function stripeSubscriptionExpiresAt(
  items: Array<{ current_period_end?: number | null }>,
): string | null {
  const latestPeriodEnd = Math.max(
    0,
    ...items.map((item) => Number(item.current_period_end || 0)).filter(Number.isFinite),
  )
  return latestPeriodEnd > 0 ? new Date(latestPeriodEnd * 1000).toISOString() : null
}

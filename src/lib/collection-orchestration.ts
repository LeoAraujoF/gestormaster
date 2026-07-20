import type { CollectionProfileCode } from './collection-score'

export type FixedBillingAlertType = 'before_due' | 'on_due' | 'after_due'

export type FixedBillingDecisionReason =
  | 'FIXED_RULES_ONLY'
  | 'INTELLIGENT_OWNS_PRE_DUE'
  | 'INTELLIGENT_OWNS_DUE_DATE'
  | 'CLIENT_PLAN_VALUE_NOT_POSITIVE'
  | 'PENDING_CYCLE_NOT_FOUND'
  | 'INTELLIGENT_STEP_COVERS_DAY'
  | 'FIXED_RECOVERY_ALLOWED'

export type FixedBillingDecision = {
  execute: boolean
  reason: FixedBillingDecisionReason
}

export type IntelligentRecoveryCoverage = {
  hasPendingCycle: boolean
  intelligentStepCoversDay: boolean
  profileCode: CollectionProfileCode
}

export type CollectionEligibility = {
  tracked: number
  billable: number
  readyForSend: number
  withoutPositiveValue: number
  withoutPhone: number
}

export type CollectionIneligibilityReason =
  | 'CLIENT_PLAN_VALUE_NOT_POSITIVE'
  | 'CLIENT_PHONE_NOT_FOUND'

export function getCollectionIneligibilityReasons(client: {
  plan_value: number | string | null
  phone: string | null
  phone_e164: string | null
}): CollectionIneligibilityReason[] {
  const reasons: CollectionIneligibilityReason[] = []
  const planValue = Number(client.plan_value || 0)
  if (!Number.isFinite(planValue) || planValue <= 0) reasons.push('CLIENT_PLAN_VALUE_NOT_POSITIVE')
  if (!(client.phone_e164?.trim() || client.phone?.trim())) reasons.push('CLIENT_PHONE_NOT_FOUND')
  return reasons
}

export function decideFixedBillingRule(input: {
  intelligentEnabled: boolean
  alertType: FixedBillingAlertType
  planValue: number
  hasPendingCycle: boolean
  intelligentStepCoversDay: boolean
}): FixedBillingDecision {
  if (!input.intelligentEnabled) return { execute: true, reason: 'FIXED_RULES_ONLY' }
  if (input.alertType === 'before_due') return { execute: false, reason: 'INTELLIGENT_OWNS_PRE_DUE' }
  if (input.alertType === 'on_due') return { execute: false, reason: 'INTELLIGENT_OWNS_DUE_DATE' }
  if (!Number.isFinite(input.planValue) || input.planValue <= 0) {
    return { execute: false, reason: 'CLIENT_PLAN_VALUE_NOT_POSITIVE' }
  }
  if (!input.hasPendingCycle) return { execute: false, reason: 'PENDING_CYCLE_NOT_FOUND' }
  if (input.intelligentStepCoversDay) return { execute: false, reason: 'INTELLIGENT_STEP_COVERS_DAY' }
  return { execute: true, reason: 'FIXED_RECOVERY_ALLOWED' }
}

export function summarizeCollectionEligibility(clients: Array<{
  plan_value: number | string | null
  phone: string | null
  phone_e164: string | null
}>): CollectionEligibility {
  return clients.reduce<CollectionEligibility>((summary, client) => {
    const reasons = getCollectionIneligibilityReasons(client)
    const hasPositiveValue = !reasons.includes('CLIENT_PLAN_VALUE_NOT_POSITIVE')
    const hasPhone = !reasons.includes('CLIENT_PHONE_NOT_FOUND')
    summary.tracked++
    if (hasPositiveValue) summary.billable++
    else summary.withoutPositiveValue++
    if (!hasPhone) summary.withoutPhone++
    if (hasPositiveValue && hasPhone) summary.readyForSend++
    return summary
  }, { tracked: 0, billable: 0, readyForSend: 0, withoutPositiveValue: 0, withoutPhone: 0 })
}

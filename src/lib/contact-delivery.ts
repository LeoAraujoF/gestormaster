export type ContactDeliveryStatus = 'accepted' | 'sent' | 'delivered' | 'read' | 'failed'

export const DELIVERY_CONFIRMATION_TIMEOUT_REASON = 'DELIVERY_CONFIRMATION_TIMEOUT'
export const DELIVERY_FAILED_REASON = 'PROVIDER_DELIVERY_FAILED'

const deliveryStatusRank: Record<string, number> = {
  queued: 0,
  pending: 0,
  accepted: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 5,
}

const successfulDeliveryStatuses = new Set<ContactDeliveryStatus>(['sent', 'delivered', 'read'])

export function canApplyDeliveryStatus(
  currentStatus: string,
  nextStatus: ContactDeliveryStatus,
  currentErrorMessage?: string | null,
) {
  // Uma entrega pode chegar depois do timeout de reconciliação. Nesse caso,
  // o estado failed é reversível apenas para uma confirmação real de entrega.
  if (currentStatus === 'failed') {
    return currentErrorMessage === DELIVERY_CONFIRMATION_TIMEOUT_REASON
      && successfulDeliveryStatuses.has(nextStatus)
  }

  if (nextStatus === 'failed' && (currentStatus === 'delivered' || currentStatus === 'read')) {
    return false
  }

  return (deliveryStatusRank[nextStatus] ?? 0) > (deliveryStatusRank[currentStatus] ?? 0)
}

export function buildAlertDeliveryUpdate(
  status: ContactDeliveryStatus,
  providerStatus: string,
  now: string,
  current: {
    accepted_at?: string | null
    sent_at?: string | null
    delivered_at?: string | null
    read_at?: string | null
    failed_at?: string | null
  } = {},
) {
  return {
    status,
    provider_status: providerStatus,
    ...(status === 'accepted' ? { accepted_at: current.accepted_at || now } : {}),
    ...(status === 'sent' ? { sent_at: current.sent_at || now } : {}),
    ...(status === 'delivered' ? { delivered_at: current.delivered_at || now } : {}),
    ...(status === 'read' ? { read_at: current.read_at || now } : {}),
    ...(status === 'failed' ? { failed_at: current.failed_at || now } : {}),
  }
}

export function buildReservationDeliveryUpdate(status: ContactDeliveryStatus, now: string, providerStatus?: string) {
  if (status === 'accepted') {
    return {
      status: 'processing',
      decision_reason: 'PROVIDER_ACCEPTED_AWAITING_DELIVERY',
      updated_at: now,
    }
  }

  if (successfulDeliveryStatuses.has(status)) {
    return {
      status: 'sent',
      sent_at: now,
      decision_reason: 'CONTACT_SENT',
      updated_at: now,
    }
  }

  return {
    status: 'failed',
    decision_reason: providerStatus
      ? `${DELIVERY_FAILED_REASON}:${providerStatus}`.slice(0, 500)
      : DELIVERY_FAILED_REASON,
    updated_at: now,
  }
}

export function staleReservationCutoff(now = new Date(), staleMinutes = Number(process.env.CONTACT_RESERVATION_STALE_MINUTES || 90)) {
  const safeMinutes = Number.isFinite(staleMinutes) && staleMinutes > 0 ? staleMinutes : 90
  return new Date(now.getTime() - safeMinutes * 60_000).toISOString()
}

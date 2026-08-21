import 'server-only'

import { messageQueue } from '@/lib/queue'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { dateInTimezone, type ContactCategory, type ContactSource } from '@/lib/contact-policy'
import {
  buildReservationDeliveryUpdate,
  DELIVERY_CONFIRMATION_TIMEOUT_REASON,
  DELIVERY_FAILED_REASON,
  staleReservationCutoff,
} from '@/lib/contact-delivery'

export { categoryForAlertType, dateInTimezone } from '@/lib/contact-policy'

export type ContactReservationResult = {
  reservationId: string | null
  decision: 'reserved' | 'deferred' | 'blocked' | 'confirmation_required' | 'idempotent'
  reason: string
  existingCategory: ContactCategory | null
  nextAttemptDate: string | null
}

export async function organizationTimezone(organizationId: string) {
  const { data } = await supabaseAdmin
    .from('collection_settings')
    .select('timezone')
    .eq('organization_id', organizationId)
    .maybeSingle()
  return data?.timezone || 'America/Sao_Paulo'
}

export async function reserveContact(input: {
  organizationId: string
  clientId: string
  contactDate: string
  timezone: string
  category: ContactCategory
  source: ContactSource
  sourceId?: string | null
  requestedBy?: string | null
  automationId?: string | null
  messageContent?: string | null
  mediaUrl?: string | null
  allowManualOverride?: boolean
}): Promise<ContactReservationResult> {
  const { data, error } = await supabaseAdmin.rpc('reserve_contact', {
    p_organization_id: input.organizationId,
    p_client_id: input.clientId,
    p_contact_date: input.contactDate,
    p_timezone: input.timezone,
    p_category: input.category,
    p_source: input.source,
    p_source_id: input.sourceId || null,
    p_requested_by: input.requestedBy || null,
    p_automation_id: input.automationId || null,
    p_message_content: input.messageContent || null,
    p_media_url: input.mediaUrl || null,
    p_allow_manual_override: Boolean(input.allowManualOverride),
  })
  if (error) throw new Error(`Falha ao reservar contato: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('A reserva de contato não retornou uma decisão')
  return {
    reservationId: row.reservation_id || null,
    decision: row.decision,
    reason: row.reason,
    existingCategory: row.existing_category || null,
    nextAttemptDate: row.next_attempt_date || null,
  }
}

export async function createCoordinatedAlert(input: {
  reservationId: string
  organizationId: string
  userId: string
  clientId: string
  automationId?: string | null
  collectionDispatchId?: string | null
  messageContent: string
  origin: ContactSource
  category: ContactCategory
  decision: string
  reason: string
  scheduledAt: string
}) {
  const { data, error } = await supabaseAdmin.from('alert_history').insert({
    organization_id: input.organizationId,
    user_id: input.userId,
    client_id: input.clientId,
    automation_id: input.automationId || null,
    collection_dispatch_id: input.collectionDispatchId || null,
    contact_reservation_id: input.reservationId,
    contact_origin: input.origin,
    contact_category: input.category,
    contact_decision: input.decision,
    contact_decision_reason: input.reason,
    status: 'pending',
    message_content: input.messageContent,
    scheduled_at: input.scheduledAt,
  }).select('id').single()
  if (error) throw new Error(`Falha ao registrar contato: ${error.message}`)
  const { error: linkError } = await supabaseAdmin.from('contact_reservations')
    .update({ alert_history_id: data.id, updated_at: new Date().toISOString() })
    .eq('id', input.reservationId)
  if (linkError) throw new Error(`Falha ao vincular histórico: ${linkError.message}`)
  return data.id as string
}

export async function enqueueContactReservation(reservationId: string, delay = 0, runKey = 'initial') {
  await messageQueue.add('send-coordinated-contact', { contactReservationId: reservationId }, {
    jobId: `contact-${reservationId}-${runKey}`,
    delay: Math.max(0, delay),
  })
}

export async function reconcileStaleContactReservations(now = new Date()) {
  const cutoff = staleReservationCutoff(now)
  const { data: reservations, error: reservationsError } = await supabaseAdmin
    .from('contact_reservations')
    .select('id, alert_history_id, updated_at')
    .eq('status', 'processing')
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: true })
    .limit(500)
  if (reservationsError) throw new Error(`Falha ao buscar reservas presas: ${reservationsError.message}`)
  if (!reservations?.length) return 0

  const historyIds = reservations
    .map((reservation) => reservation.alert_history_id)
    .filter((id): id is string => Boolean(id))
  const { data: histories, error: historiesError } = historyIds.length
    ? await supabaseAdmin
      .from('alert_history')
      .select('id, status, error_message, provider_status, collection_dispatch_id, sent_at, delivered_at, read_at')
      .in('id', historyIds)
    : { data: [], error: null }
  if (historiesError) throw new Error(`Falha ao buscar histórico das reservas presas: ${historiesError.message}`)

  const historyById = new Map((histories || []).map((history) => [history.id, history]))
  let reconciled = 0

  for (const reservation of reservations) {
    const history = reservation.alert_history_id ? historyById.get(reservation.alert_history_id) : null
    const successful = history && ['sent', 'delivered', 'read'].includes(history.status)
    const sentAt = history?.sent_at || history?.delivered_at || history?.read_at || now.toISOString()

    if (successful) {
      const { error } = await supabaseAdmin.from('contact_reservations').update({
        status: 'sent',
        sent_at: sentAt,
        decision_reason: 'CONTACT_SENT',
        updated_at: now.toISOString(),
      }).eq('id', reservation.id).eq('status', 'processing')
      if (error) throw new Error(`Falha ao concluir reserva ${reservation.id}: ${error.message}`)
      reconciled++
      continue
    }

    if (history?.status === 'failed') {
      const { error } = await supabaseAdmin.from('contact_reservations').update({
        status: 'failed',
        decision_reason: history.error_message?.startsWith(DELIVERY_FAILED_REASON)
          ? history.error_message
          : DELIVERY_FAILED_REASON,
        updated_at: now.toISOString(),
      }).eq('id', reservation.id).eq('status', 'processing')
      if (error) throw new Error(`Falha ao encerrar reserva com falha ${reservation.id}: ${error.message}`)
      if (history.collection_dispatch_id) {
        const { error: dispatchError } = await supabaseAdmin.from('collection_dispatches').update({
          status: 'failed',
          error_message: history.error_message || DELIVERY_FAILED_REASON,
          updated_at: now.toISOString(),
        }).eq('id', history.collection_dispatch_id)
        if (dispatchError) throw new Error(`Falha ao encerrar despacho ${history.collection_dispatch_id}: ${dispatchError.message}`)
      }
      reconciled++
      continue
    }

    // Sem confirmação após o limite, libera uma nova tentativa. O histórico
    // recebe um erro específico, mas o webhook ainda pode recuperar a entrega
    // caso a Evolution envie uma confirmação atrasada.
    if (history) {
      const { error: historyError } = await supabaseAdmin.from('alert_history').update({
        status: 'failed',
        error_message: DELIVERY_CONFIRMATION_TIMEOUT_REASON,
        failed_at: now.toISOString(),
        provider_status: history.provider_status || DELIVERY_CONFIRMATION_TIMEOUT_REASON,
      }).eq('id', history.id).eq('status', history.status)
      if (historyError) throw new Error(`Falha ao marcar histórico expirado ${history.id}: ${historyError.message}`)
      if (history.collection_dispatch_id) {
        const { error: dispatchError } = await supabaseAdmin.from('collection_dispatches').update({
          status: 'failed',
          error_message: DELIVERY_CONFIRMATION_TIMEOUT_REASON,
          updated_at: now.toISOString(),
        }).eq('id', history.collection_dispatch_id)
        if (dispatchError) throw new Error(`Falha ao liberar despacho expirado ${history.collection_dispatch_id}: ${dispatchError.message}`)
      }
    }

    const { error: reservationError } = await supabaseAdmin.from('contact_reservations').update({
      ...buildReservationDeliveryUpdate('failed', now.toISOString(), DELIVERY_CONFIRMATION_TIMEOUT_REASON),
      decision_reason: DELIVERY_CONFIRMATION_TIMEOUT_REASON,
    }).eq('id', reservation.id).eq('status', 'processing')
    if (reservationError) throw new Error(`Falha ao liberar reserva expirada ${reservation.id}: ${reservationError.message}`)
    reconciled++
  }

  return reconciled
}

export async function releaseDeferredContacts(now = new Date()) {
  const { data, error } = await supabaseAdmin.from('contact_reservations')
    .select('id, timezone, deferred_until')
    .eq('status', 'deferred')
    .limit(500)
  if (error) throw new Error(`Falha ao consultar contatos adiados: ${error.message}`)
  let queued = 0
  for (const item of data || []) {
    if (!item.deferred_until || dateInTimezone(now, item.timezone) < item.deferred_until) continue
    const { data: activation, error: activationError } = await supabaseAdmin.rpc('activate_deferred_contact', {
      p_reservation_id: item.id,
    })
    if (activationError) throw new Error(`Falha ao reavaliar contato adiado: ${activationError.message}`)
    const result = Array.isArray(activation) ? activation[0] : activation
    if (result?.decision === 'reserved') {
      await enqueueContactReservation(item.id, 0, `release-${dateInTimezone(now, item.timezone)}`)
      queued++
    }
  }
  return queued
}

import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { logAudit, getIpFromRequest } from '@/lib/audit'
import { MESSAGE_JOB_ATTEMPTS, MESSAGE_JOB_BACKOFF, messageQueue } from '@/lib/queue'
import { MESSAGE_PRIORITY } from '@/lib/message-priority'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'

const retryRequestSchema = z.object({
  alertHistoryId: z.string().uuid().optional(),
  alertHistoryIds: z.array(z.string().uuid()).min(1).max(500).optional(),
  force: z.boolean().default(true),
}).superRefine((value, context) => {
  if (!value.alertHistoryId && !value.alertHistoryIds?.length) {
    context.addIssue({ code: 'custom', message: 'Informe ao menos um histórico para reprocessar.' })
  }
})

type StoredHistory = {
  id: string
  user_id: string
  organization_id: string | null
  client_id: string | null
  lead_id: string | null
  automation_id: string | null
  collection_dispatch_id: string | null
  contact_reservation_id: string | null
  phone: string | null
  instance_name: string | null
  message_content: string | null
  source_job_id: string | null
  status: string
}

type RetryResult = {
  id: string
  status: 'queued' | 'already_queued' | 'already_sent' | 'not_retryable' | 'not_found' | 'queue_error'
  message: string
  job_id?: string
}

const ACTIVE_QUEUE_STATES = new Set(['waiting', 'delayed', 'active', 'paused', 'prioritized', 'waiting-children'])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function pickString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = asString(record[key])
    if (value) return value
  }
  return null
}

async function getOriginalJob(sourceJobId: string | null) {
  if (!sourceJobId) return { job: null, state: null as string | null }
  const job = await messageQueue.getJob(sourceJobId)
  if (!job) return { job: null, state: null as string | null }
  return { job, state: await job.getState() }
}

function buildRetryPayload(history: StoredHistory, originalData: Record<string, unknown>, retryId: string) {
  const payload: Record<string, unknown> = {
    userId: history.user_id,
    alertHistoryId: history.id,
    finalMessage: history.message_content || pickString(originalData, 'finalMessage', 'message') || '',
    source: pickString(originalData, 'source') || 'manual_retry',
    manualRetry: true,
    correlationId: `manual-retry:${retryId}`,
  }

  const organizationId = history.organization_id || pickString(originalData, 'organizationId', 'organization_id')
  const instanceId = pickString(originalData, 'instanceId', 'instance_id')
  const instanceName = history.instance_name || pickString(originalData, 'instanceName', 'instance_name')
  const phone = history.phone || pickString(originalData, 'phone')
  const clientId = history.client_id || pickString(originalData, 'clientId', 'client_id')
  const leadId = history.lead_id || pickString(originalData, 'leadId', 'lead_id')
  const collectionDispatchId = history.collection_dispatch_id || pickString(originalData, 'collectionDispatchId', 'collection_dispatch_id')
  const contactReservationId = history.contact_reservation_id || pickString(originalData, 'contactReservationId', 'contact_reservation_id')

  if (organizationId) payload.organizationId = organizationId
  if (instanceId) payload.instanceId = instanceId
  if (instanceName) payload.instanceName = instanceName
  if (phone) payload.phone = phone
  if (clientId) payload.clientId = clientId
  if (leadId) payload.leadId = leadId
  if (collectionDispatchId) payload.collectionDispatchId = collectionDispatchId
  if (contactReservationId) payload.contactReservationId = contactReservationId

  const mediaUrl = pickString(originalData, 'mediaUrl', 'media_url')
  const mediaBase64 = pickString(originalData, 'mediaBase64', 'media_base64')
  const mediaMimeType = pickString(originalData, 'mediaMimeType', 'media_mime_type')
  if (mediaUrl) payload.mediaUrl = mediaUrl
  if (mediaBase64) payload.mediaBase64 = mediaBase64
  if (mediaMimeType) payload.mediaMimeType = mediaMimeType

  for (const key of ['ruleId', 'renewalReminderClientId', 'renewalReminderDueDate']) {
    const value = asString(originalData[key])
    if (value) payload[key] = value
  }
  if (originalData.interactiveMessage !== undefined) payload.interactiveMessage = originalData.interactiveMessage

  return payload
}

async function restoreAfterQueueFailure(history: StoredHistory, retryJobId: string, errorMessage: string) {
  const now = new Date().toISOString()
  await Promise.all([
    supabaseAdmin.from('alert_history')
      .update({ status: 'failed', error_message: errorMessage, failed_at: now })
      .eq('id', history.id)
      .eq('status', 'pending')
      .eq('source_job_id', retryJobId),
    history.contact_reservation_id
      ? supabaseAdmin.from('contact_reservations')
        .update({ status: 'failed', decision_reason: 'RETRY_QUEUE_UNAVAILABLE', updated_at: now })
        .eq('id', history.contact_reservation_id)
        .eq('status', 'reserved')
      : Promise.resolve({ error: null }),
    history.collection_dispatch_id
      ? supabaseAdmin.from('collection_dispatches')
        .update({ status: 'failed', error_message: errorMessage, updated_at: now })
        .eq('id', history.collection_dispatch_id)
        .eq('status', 'pending')
      : Promise.resolve({ error: null }),
  ])
}

function singleResponse(result: RetryResult) {
  if (result.status === 'queued') {
    return NextResponse.json({ success: true, queued: true, ...result }, { status: 202 })
  }
  const status = result.status === 'not_found' ? 404 : result.status === 'queue_error' ? 503 : 409
  return NextResponse.json({ success: false, ...result }, { status })
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const parsed = retryRequestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Payload de reenvio inválido.', details: parsed.error.flatten() }, { status: 400 })

    const ids = [...new Set([
      ...(parsed.data.alertHistoryId ? [parsed.data.alertHistoryId] : []),
      ...(parsed.data.alertHistoryIds || []),
    ])]
    const single = Boolean(parsed.data.alertHistoryId) && ids.length === 1
    const { data: histories, error: historiesError } = await supabaseAdmin
      .from('alert_history')
      .select('id, user_id, organization_id, client_id, lead_id, automation_id, collection_dispatch_id, contact_reservation_id, phone, instance_name, message_content, source_job_id, status')
      .eq('user_id', user.id)
      .in('id', ids)
    if (historiesError) throw historiesError

    const historiesById = new Map((histories || []).map((history) => [history.id, history as StoredHistory]))
    const results: RetryResult[] = []

    for (const id of ids) {
      const history = historiesById.get(id)
      if (!history) {
        results.push({ id, status: 'not_found', message: 'Histórico não encontrado ou sem permissão.' })
        continue
      }

      let originalJob: Awaited<ReturnType<typeof getOriginalJob>>
      try {
        originalJob = await getOriginalJob(history.source_job_id)
      } catch {
        if (parsed.data.force) {
          results.push({ id, status: 'queue_error', message: 'Não foi possível verificar o estado atual da fila. Tente novamente em instantes.' })
          continue
        }
        originalJob = { job: null, state: null }
      }

      if (parsed.data.force && originalJob.state && ACTIVE_QUEUE_STATES.has(originalJob.state)) {
        results.push({ id, status: 'already_queued', message: 'Esta mensagem já está em processamento ou aguardando na fila.' })
        continue
      }

      const retryJobId = `manual-retry:${id}:${randomUUID()}`
      const { data: decision, error: decisionError } = await supabaseAdmin.rpc('prepare_alert_history_retry', {
        p_alert_history_id: id,
        p_user_id: user.id,
        p_allow_pending: parsed.data.force,
        p_retry_job_id: retryJobId,
      })
      if (decisionError) throw decisionError

      const normalizedDecision = String(decision || '') as RetryResult['status']
      if (normalizedDecision !== 'queued') {
        const messages: Record<string, string> = {
          already_queued: 'Esta mensagem já está na fila.',
          already_sent: 'Esta mensagem já foi aceita ou enviada e não será duplicada.',
          not_retryable: 'Este histórico não pode ser reenviado porque a operação foi cancelada ou encerrada.',
          not_found: 'Histórico não encontrado ou sem permissão.',
        }
        results.push({
          id,
          status: messages[normalizedDecision] ? normalizedDecision : 'not_retryable',
          message: messages[normalizedDecision] || 'Este histórico não pode ser reenviado.',
        })
        continue
      }

      const payload = buildRetryPayload(history, asRecord(originalJob.job?.data), retryJobId)
      try {
        const job = await messageQueue.add('send-message', payload, {
          jobId: retryJobId,
          priority: MESSAGE_PRIORITY.interactive,
          attempts: MESSAGE_JOB_ATTEMPTS,
          backoff: MESSAGE_JOB_BACKOFF,
        })
        await supabaseAdmin.from('alert_history')
          .update({ source_job_id: String(job.id), queued_at: new Date().toISOString() })
          .eq('id', id)
          .eq('status', 'pending')
        await logAudit({
          user_id: user.id,
          organization_id: history.organization_id,
          action: 'alert.retry',
          resource: 'alert_history',
          resource_id: id,
          details: { queue_job_id: String(job.id), forced: parsed.data.force, previous_status: history.status },
          ip_address: getIpFromRequest(request),
        })
        results.push({ id, status: 'queued', message: 'Mensagem colocada novamente na fila.', job_id: String(job.id) })
      } catch (error) {
        const jobStillExists = await messageQueue.getJob(retryJobId).catch(() => null)
        if (jobStillExists) {
          results.push({ id, status: 'queued', message: 'Mensagem colocada novamente na fila.', job_id: retryJobId })
          continue
        }
        const detail = error instanceof Error ? error.message : 'Falha desconhecida ao acessar a fila.'
        await restoreAfterQueueFailure(history, retryJobId, `RETRY_QUEUE_ERROR: ${detail}`)
        await logAudit({
          user_id: user.id,
          organization_id: history.organization_id,
          action: 'alert.retry',
          resource: 'alert_history',
          resource_id: id,
          details: { forced: parsed.data.force },
          ip_address: getIpFromRequest(request),
          outcome: 'failure',
          reason: detail,
        })
        results.push({ id, status: 'queue_error', message: 'Não foi possível colocar a mensagem na fila. O registro foi mantido como falha para nova tentativa.' })
      }
    }

    if (single) return singleResponse(results[0])

    const summary = {
      queued: results.filter((result) => result.status === 'queued').length,
      alreadyQueued: results.filter((result) => result.status === 'already_queued').length,
      alreadySent: results.filter((result) => result.status === 'already_sent').length,
      skipped: results.filter((result) => ['not_retryable', 'not_found'].includes(result.status)).length,
      errors: results.filter((result) => result.status === 'queue_error').length,
    }
    return NextResponse.json({ success: summary.queued > 0, summary, results })
  } catch (error: unknown) {
    console.error('evolution retry error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao reprocessar mensagens' }, { status: 500 })
  }
}

import { z } from 'zod'

/**
 * Canonical payload for BullMQ message jobs.
 *
 * The queue still accepts legacy jobs while producers migrate. The worker
 * normalizes those aliases before validating the payload.
 */
export const sendMessageJobSchema = z.object({
  organizationId: z.string().uuid().optional(),
  userId: z.string().uuid().nullable().optional(),
  instanceId: z.string().uuid().nullable().optional(),
  instanceName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  finalMessage: z.string().default(''),
  mediaUrl: z.string().url().nullable().optional(),
  mediaBase64: z.string().nullable().optional(),
  mediaMimeType: z.string().min(1).nullable().optional(),
  alertHistoryId: z.string().uuid().nullable().optional(),
  leadId: z.string().uuid().nullable().optional(),
  collectionDispatchId: z.string().uuid().nullable().optional(),
  contactReservationId: z.string().uuid().nullable().optional(),
  correlationId: z.string().min(1).nullable().optional(),
  source: z.string().min(1).nullable().optional(),
  interactiveMessage: z.unknown().optional(),
}).passthrough()

export type SendMessageJob = z.infer<typeof sendMessageJobSchema>

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Payload do job de mensagem inválido')
  }
  return value as Record<string, unknown>
}

/** Converts all legacy snake_case/camelCase producers to the canonical shape. */
export function normalizeSendMessageJob(value: unknown): SendMessageJob {
  const data = asRecord(value)

  return sendMessageJobSchema.parse({
    ...data,
    organizationId: data.organizationId ?? data.organization_id,
    userId: data.userId ?? data.user_id,
    instanceId: data.instanceId ?? data.instance_id,
    instanceName: data.instanceName ?? data.instance_name,
    finalMessage: data.finalMessage ?? data.message ?? '',
    mediaUrl: data.mediaUrl ?? data.media_url,
    mediaBase64: data.mediaBase64 ?? data.media_base64,
    mediaMimeType: data.mediaMimeType ?? data.media_mime_type,
    alertHistoryId: data.alertHistoryId ?? data.alert_history_id,
    leadId: data.leadId ?? data.lead_id,
    collectionDispatchId: data.collectionDispatchId ?? data.collection_dispatch_id,
    contactReservationId: data.contactReservationId ?? data.contact_reservation_id,
    correlationId: data.correlationId ?? data.correlation_id,
    sourceJobId: data.sourceJobId ?? data.source_job_id,
})
}

import { z } from 'zod'
import { adminCriticalActionSchema } from '@/lib/admin-types'

export const adminQueueNameSchema = z.enum([
  'messages-queue',
  'webhook-queue',
  'ai-queue',
  'intelligence-queue',
  'health-queue',
  'warmup-queue',
])

export const adminQueueActionSchema = adminCriticalActionSchema.extend({
  queue: adminQueueNameSchema,
  action: z.enum(['pause', 'resume', 'retry_failed', 'clean_failed']),
  limit: z.number().int().min(1).max(1000).optional(),
  olderThanMinutes: z.number().int().min(60).max(43_200).optional(),
})

export type AdminQueueName = z.infer<typeof adminQueueNameSchema>
export type AdminQueueAction = z.infer<typeof adminQueueActionSchema>['action']

const ACTION_CONFIRMATION: Record<AdminQueueAction, string> = {
  pause: 'PAUSAR',
  resume: 'RETOMAR',
  retry_failed: 'REPETIR FALHOS',
  clean_failed: 'LIMPAR FALHOS',
}

export function expectedQueueConfirmation(action: AdminQueueAction, queue: AdminQueueName) {
  return `${ACTION_CONFIRMATION[action]} ${queue}`
}

export function normalizeQueueOperationLimits(input: z.infer<typeof adminQueueActionSchema>) {
  return {
    retryLimit: input.action === 'retry_failed' ? Math.min(input.limit ?? 100, 100) : 0,
    cleanLimit: input.action === 'clean_failed' ? Math.min(input.limit ?? 1000, 1000) : 0,
    cleanGraceMs: input.action === 'clean_failed' ? (input.olderThanMinutes ?? 1_440) * 60_000 : 0,
  }
}

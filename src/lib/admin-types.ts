import { z } from 'zod'

export const adminCriticalActionSchema = z.object({
  reason: z.string().trim().min(5).max(300),
  confirmation: z.string().trim().min(2).max(120),
  idempotencyKey: z.string().uuid(),
})

export const adminTicketStatusSchema = z.enum(['open', 'in_progress', 'resolved', 'closed'])
export const adminTicketMessageSchema = z.object({
  content: z.string().trim().min(1).max(5000),
})

export const adminFeaturePatchSchema = adminCriticalActionSchema.extend({
  key: z.string().trim().min(1).max(120),
  isEnabled: z.boolean(),
})

export type AdminCriticalAction = z.infer<typeof adminCriticalActionSchema>

export type AdminApiError = { error: { code: string; message: string } }
export type AdminApiSuccess<T, M = Record<string, never>> = { data: T; meta: M }

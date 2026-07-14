import { z } from 'zod'
import { adminTicketMessageSchema, adminTicketStatusSchema } from '@/lib/admin-types'

export { adminTicketStatusSchema }

export const adminTicketPrioritySchema = z.enum(['low', 'medium', 'high', 'critical'])

export const adminTicketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(10).max(50).default(20),
  search: z.string().trim().max(120).optional(),
  status: adminTicketStatusSchema.optional(),
  priority: adminTicketPrioritySchema.optional(),
  organizationId: z.string().uuid().optional(),
})

export const adminTicketIdSchema = z.string().uuid()

export const adminTicketStatusPatchSchema = z.object({
  status: adminTicketStatusSchema,
  idempotencyKey: z.string().uuid(),
})

export const adminTicketReplySchema = adminTicketMessageSchema.extend({
  idempotencyKey: z.string().uuid(),
})

const allowedTransitions = {
  open: ['in_progress', 'resolved', 'closed'],
  in_progress: ['open', 'resolved', 'closed'],
  resolved: ['open', 'in_progress', 'closed'],
  closed: ['open', 'in_progress'],
} as const satisfies Record<z.infer<typeof adminTicketStatusSchema>, readonly z.infer<typeof adminTicketStatusSchema>[]>

export function isAdminTicketTransitionAllowed(
  current: z.infer<typeof adminTicketStatusSchema>,
  next: z.infer<typeof adminTicketStatusSchema>,
) {
  return current === next || (allowedTransitions[current] as readonly string[]).includes(next)
}

export function escapePostgresLikePattern(value: string) {
  return value.replace(/[\\%_]/g, '\\$&')
}

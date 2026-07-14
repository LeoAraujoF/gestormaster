import { NextResponse } from 'next/server'
import type { Queue } from 'bullmq'
import { getIpFromRequest, logAudit } from '@/lib/audit'
import {
  adminErrorResponse,
  claimAdminAction,
  finishAdminAction,
  protectAdminMutation,
} from '@/lib/admin-security'
import {
  aiQueue,
  healthQueue,
  intelligenceQueue,
  messageQueue,
  warmupQueue,
  webhookQueue,
} from '@/lib/queue'
import {
  adminQueueActionSchema,
  expectedQueueConfirmation,
  normalizeQueueOperationLimits,
  type AdminQueueName,
} from './_contracts'

export const runtime = 'nodejs'

const OPERATION_TIMEOUT_MS = 20_000
const queues: Record<AdminQueueName, Queue> = {
  'messages-queue': messageQueue,
  'webhook-queue': webhookQueue,
  'ai-queue': aiQueue,
  'intelligence-queue': intelligenceQueue,
  'health-queue': healthQueue,
  'warmup-queue': warmupQueue,
}

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('QUEUE_OPERATION_TIMEOUT')), OPERATION_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function retryFailedJobs(queue: Queue, limit: number) {
  const jobs = await queue.getJobs('failed', 0, Math.max(0, limit - 1), true)
  const results = await Promise.allSettled(jobs.map((job) => job.retry('failed')))
  return {
    selected: jobs.length,
    affected: results.filter((result) => result.status === 'fulfilled').length,
    failed: results.filter((result) => result.status === 'rejected').length,
  }
}

export async function POST(request: Request) {
  let claimId: string | null = null
  try {
    const admin = await protectAdminMutation(request, { recentAuth: true, limit: 10 })
    const parsed = adminQueueActionSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'ADMIN_QUEUE_ACTION_INVALID', message: 'Ação de fila inválida' } },
        { status: 400 },
      )
    }

    const input = parsed.data
    if (input.confirmation !== expectedQueueConfirmation(input.action, input.queue)) {
      return NextResponse.json(
        { error: { code: 'ADMIN_CONFIRMATION_MISMATCH', message: 'Confirmação inválida' } },
        { status: 400 },
      )
    }

    claimId = await claimAdminAction(admin, input, `admin.queue.${input.action}`)
    const queue = queues[input.queue]
    const limits = normalizeQueueOperationLimits(input)
    const before = await withTimeout(queue.getJobCounts('waiting', 'active', 'delayed', 'paused', 'failed'))
    let result: { selected: number; affected: number; failed: number }

    if (input.action === 'pause') {
      await withTimeout(queue.pause())
      result = { selected: 1, affected: 1, failed: 0 }
    } else if (input.action === 'resume') {
      await withTimeout(queue.resume())
      result = { selected: 1, affected: 1, failed: 0 }
    } else if (input.action === 'retry_failed') {
      result = await withTimeout(retryFailedJobs(queue, limits.retryLimit))
    } else {
      const removed = await withTimeout(queue.clean(limits.cleanGraceMs, limits.cleanLimit, 'failed'))
      result = { selected: removed.length, affected: removed.length, failed: 0 }
    }

    const after = await withTimeout(queue.getJobCounts('waiting', 'active', 'delayed', 'paused', 'failed'))
    await finishAdminAction(claimId, 'completed')
    await logAudit({
      user_id: admin.userId,
      action: `admin.queue.${input.action}`,
      resource: 'bullmq_queue',
      resource_id: input.queue,
      reason: input.reason,
      correlation_id: input.idempotencyKey,
      outcome: 'success',
      ip_address: getIpFromRequest(request),
      details: {
        queue: input.queue,
        operation: input.action,
        selected_count: result.selected,
        affected_count: result.affected,
        failure_count: result.failed,
        before_counts: before,
        after_counts: after,
        clean_grace_minutes: input.action === 'clean_failed' ? limits.cleanGraceMs / 60_000 : null,
      },
    })

    return NextResponse.json({
      data: {
        queue: input.queue,
        action: input.action,
        ...result,
        paused: await withTimeout(queue.isPaused()),
      },
      meta: {},
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  } catch (error) {
    if (claimId) await finishAdminAction(claimId, 'failed')
    if (error instanceof Error && (error.message === 'QUEUE_OPERATION_TIMEOUT' || 'code' in error && error.code === 'ECONNREFUSED')) {
      return NextResponse.json(
        { error: { code: 'ADMIN_QUEUE_UNAVAILABLE', message: 'Redis indisponível para executar a ação' } },
        { status: 503 },
      )
    }
    return adminErrorResponse(error)
  }
}

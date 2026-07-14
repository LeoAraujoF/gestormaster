import { NextResponse } from 'next/server'
import { adminCriticalActionSchema, type AdminCriticalAction } from '@/lib/admin-types'
import {
  adminErrorResponse,
  claimAdminAction,
  finishAdminAction,
  protectAdminMutation,
  type MasterAdminSession,
} from '@/lib/admin-security'
import { executeAdminOperationalRoutines } from '@/lib/admin-routines'
import type { AdminOperationalRoutineResult } from '@/lib/admin-routine-contracts'
import { getIpFromRequest, logAudit } from '@/lib/audit'

function auditDetails(results: AdminOperationalRoutineResult[]) {
  return {
    routines: results,
    succeededCount: results.filter((result) => result.ok).length,
    failedCount: results.filter((result) => !result.ok).length,
  }
}

export async function POST(request: Request) {
  let admin: MasterAdminSession | null = null
  let input: AdminCriticalAction | null = null
  let claimId: string | null = null
  let results: AdminOperationalRoutineResult[] = []

  try {
    admin = await protectAdminMutation(request, { recentAuth: true, limit: 3 })
    input = adminCriticalActionSchema.parse(await request.json())
    if (input.confirmation !== 'EXECUTAR ROTINAS') {
      return NextResponse.json(
        { error: { code: 'ADMIN_CONFIRMATION_MISMATCH', message: 'Confirmação inválida' } },
        { status: 400 },
      )
    }

    claimId = await claimAdminAction(admin, input, 'admin.force_cron')
    results = await executeAdminOperationalRoutines()
    const failed = results.some((result) => !result.ok)

    await finishAdminAction(claimId, failed ? 'failed' : 'completed')
    await logAudit({
      user_id: admin.userId,
      action: 'admin.force_cron',
      resource: 'system',
      details: auditDetails(results),
      reason: input.reason,
      correlation_id: input.idempotencyKey,
      outcome: failed ? 'failure' : 'success',
      ip_address: getIpFromRequest(request),
    })

    if (failed) {
      return NextResponse.json({
        error: { code: 'ADMIN_ROUTINE_EXECUTION_FAILED', message: 'Uma ou mais rotinas operacionais falharam' },
        data: { results },
      }, { status: 502 })
    }

    return NextResponse.json({ data: { executed: true, results }, meta: {} })
  } catch (error) {
    if (claimId) await finishAdminAction(claimId, 'failed')
    if (claimId && admin && input) {
      await logAudit({
        user_id: admin.userId,
        action: 'admin.force_cron',
        resource: 'system',
        details: auditDetails(results),
        reason: input.reason,
        correlation_id: input.idempotencyKey,
        outcome: 'failure',
        ip_address: getIpFromRequest(request),
      })
    }
    return adminErrorResponse(error)
  }
}

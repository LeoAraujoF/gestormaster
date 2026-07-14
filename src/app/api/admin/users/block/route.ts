import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { redisConnection } from '@/lib/redis'
import { getIpFromRequest, logAudit } from '@/lib/audit'
import { adminCriticalActionSchema } from '@/lib/admin-types'
import { AdminAccessError, adminErrorResponse, claimAdminAction, finishAdminAction, protectAdminMutation } from '@/lib/admin-security'

const schema = adminCriticalActionSchema.extend({ userId: z.string().uuid(), isBlocked: z.boolean() })

export async function POST(request: Request) {
  let claimId: string | null = null
  try {
    const admin = await protectAdminMutation(request, { recentAuth: true, limit: 10 })
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: { code: 'ADMIN_USER_BLOCK_INVALID', message: 'Dados de bloqueio inválidos' } }, { status: 400 })
    const input = parsed.data
    if (input.userId === admin.userId) throw new AdminAccessError(403, 'ADMIN_SELF_BLOCK_FORBIDDEN', 'A conta administrativa atual não pode ser bloqueada')
    const expected = `${input.isBlocked ? 'BLOQUEAR' : 'DESBLOQUEAR'} ${input.userId}`
    if (input.confirmation !== expected) return NextResponse.json({ error: { code: 'ADMIN_CONFIRMATION_MISMATCH', message: 'Confirmação inválida' } }, { status: 400 })
    claimId = await claimAdminAction(admin, input, 'admin.user.block')
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(input.userId, { ban_duration: input.isBlocked ? '87600h' : 'none' })
    if (error) throw error
    if (input.isBlocked) await supabaseAdmin.rpc('admin_revoke_user_sessions', { p_user_id: input.userId })
    if (input.isBlocked) await redisConnection.sadd('global:banned_users', input.userId)
    else await redisConnection.srem('global:banned_users', input.userId)
    await finishAdminAction(claimId, 'completed')
    await logAudit({ user_id: admin.userId, action: input.isBlocked ? 'admin.block_user' : 'admin.unblock_user', resource: 'users', resource_id: input.userId, details: { target_email: data.user?.email }, reason: input.reason, correlation_id: input.idempotencyKey, outcome: 'success', ip_address: getIpFromRequest(request) })
    return NextResponse.json({ data: { blocked: input.isBlocked }, meta: {} })
  } catch (error) {
    if (claimId) await finishAdminAction(claimId, 'failed')
    return adminErrorResponse(error)
  }
}

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { accountDeletionBlockReason } from '@/lib/account-deletion-policy'
import { adminCriticalActionSchema } from '@/lib/admin-types'
import {
  AdminAccessError,
  adminErrorResponse,
  claimAdminAction,
  finishAdminAction,
  protectAdminMutation,
} from '@/lib/admin-security'
import { getIpFromRequest, logAudit } from '@/lib/audit'
import { redisConnection } from '@/lib/redis'
import { supabaseAdmin } from '@/lib/supabase/service-role'

const schema = adminCriticalActionSchema.extend({ userId: z.string().uuid() })

async function targetMemberships(userId: string) {
  const { data, error } = await supabaseAdmin.from('organization_members')
    .select('organization_id,role')
    .eq('user_id', userId)
  if (error) throw new Error('Falha ao consultar vínculos da conta')
  return (data || []).map((membership) => ({
    organizationId: membership.organization_id,
    role: membership.role as 'owner' | 'admin' | 'member',
  }))
}

export async function POST(request: Request) {
  let claimId: string | null = null
  let deletionRequestId: string | null = null
  try {
    const admin = await protectAdminMutation(request, { recentAuth: true, limit: 5 })
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: { code: 'ADMIN_USER_DELETE_INVALID', message: 'Dados de exclusão inválidos' } }, { status: 400 })
    }
    const input = parsed.data
    if (input.userId === admin.userId) throw new AdminAccessError(403, 'ADMIN_SELF_DELETE_FORBIDDEN', 'A conta administrativa atual não pode ser excluída')
    if (input.confirmation !== `EXCLUIR ${input.userId}`) {
      return NextResponse.json({ error: { code: 'ADMIN_CONFIRMATION_MISMATCH', message: 'Confirmação inválida' } }, { status: 400 })
    }

    const { data: target, error: targetError } = await supabaseAdmin.auth.admin.getUserById(input.userId)
    if (targetError || !target.user) throw new AdminAccessError(409, 'ADMIN_USER_NOT_FOUND', 'Conta não encontrada')
    const memberships = await targetMemberships(input.userId)
    if (accountDeletionBlockReason(memberships)) {
      throw new AdminAccessError(
        409,
        'ADMIN_OWNER_TRANSFER_REQUIRED',
        'Transfira a propriedade das organizações antes de agendar a exclusão desta conta',
      )
    }

    claimId = await claimAdminAction(admin, input, 'admin.user.schedule_deletion')
    const organizationId = memberships.length === 1 ? memberships[0].organizationId : null
    const { data: deletion, error: deletionError } = await supabaseAdmin.from('account_deletion_requests').insert({
      user_id: input.userId,
      target_user_id: input.userId,
      organization_id: organizationId,
      requested_by: admin.userId,
      reason: input.reason,
      previous_entitlement_active: null,
    }).select('id,purge_after').single()
    if (deletionError?.code === '23505') throw new AdminAccessError(409, 'ADMIN_DELETION_ALREADY_PENDING', 'Esta conta já possui uma exclusão pendente')
    if (deletionError || !deletion) throw deletionError || new Error('Falha ao registrar retenção')
    deletionRequestId = deletion.id

    const { error: revokeError } = await supabaseAdmin.rpc('admin_revoke_user_sessions', { p_user_id: input.userId })
    if (revokeError) throw revokeError
    const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(input.userId, { ban_duration: '87600h' })
    if (banError) throw banError
    try { await redisConnection.sadd('global:banned_users', input.userId) } catch {}

    deletionRequestId = null
    await finishAdminAction(claimId, 'completed')
    await logAudit({
      user_id: admin.userId,
      organization_id: organizationId,
      action: 'admin.user.schedule_deletion',
      resource: 'users',
      resource_id: input.userId,
      details: { deletion_request_id: deletion.id, purge_after: deletion.purge_after },
      reason: input.reason,
      correlation_id: input.idempotencyKey,
      outcome: 'success',
      ip_address: getIpFromRequest(request),
    })
    return NextResponse.json({ data: { purgeAfter: deletion.purge_after }, meta: {} })
  } catch (error) {
    if (deletionRequestId) await supabaseAdmin.from('account_deletion_requests').delete().eq('id', deletionRequestId)
    if (claimId) await finishAdminAction(claimId, 'failed')
    return adminErrorResponse(error)
  }
}

export async function DELETE(request: Request) {
  let claimId: string | null = null
  try {
    const admin = await protectAdminMutation(request, { recentAuth: true, limit: 5 })
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: { code: 'ADMIN_USER_RESTORE_INVALID', message: 'Dados de restauração inválidos' } }, { status: 400 })
    }
    const input = parsed.data
    if (input.confirmation !== `RESTAURAR ${input.userId}`) {
      return NextResponse.json({ error: { code: 'ADMIN_CONFIRMATION_MISMATCH', message: 'Confirmação inválida' } }, { status: 400 })
    }

    claimId = await claimAdminAction(admin, input, 'admin.user.restore')
    const { data: deletion, error: readError } = await supabaseAdmin.from('account_deletion_requests')
      .select('id,organization_id,previous_entitlement_active')
      .eq('user_id', input.userId)
      .eq('status', 'pending')
      .single()
    if (readError || !deletion) throw new AdminAccessError(409, 'ADMIN_DELETION_NOT_PENDING', 'Não existe exclusão pendente para esta conta')

    const { error: unbanError } = await supabaseAdmin.auth.admin.updateUserById(input.userId, { ban_duration: 'none' })
    if (unbanError) throw unbanError
    const { error: restoreError } = await supabaseAdmin.from('account_deletion_requests').update({
      status: 'restored',
      restored_at: new Date().toISOString(),
      blocked_reason: null,
    }).eq('id', deletion.id)
    if (restoreError) throw restoreError
    try { await redisConnection.srem('global:banned_users', input.userId) } catch {}

    // Compatibilidade para solicitações antigas que desativavam o entitlement da organização.
    if (deletion.organization_id && deletion.previous_entitlement_active != null) {
      await supabaseAdmin.from('organization_entitlements').update({
        is_active: deletion.previous_entitlement_active,
        updated_at: new Date().toISOString(),
        updated_by: admin.userId,
      }).eq('organization_id', deletion.organization_id)
    }

    await finishAdminAction(claimId, 'completed')
    await logAudit({
      user_id: admin.userId,
      organization_id: deletion.organization_id,
      action: 'admin.user.restore',
      resource: 'users',
      resource_id: input.userId,
      details: { deletion_request_id: deletion.id },
      reason: input.reason,
      correlation_id: input.idempotencyKey,
      outcome: 'success',
      ip_address: getIpFromRequest(request),
    })
    return NextResponse.json({ data: { restored: true }, meta: {} })
  } catch (error) {
    if (claimId) await finishAdminAction(claimId, 'failed')
    return adminErrorResponse(error)
  }
}

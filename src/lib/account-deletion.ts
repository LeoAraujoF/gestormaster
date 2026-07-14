import 'server-only'

import { logAudit } from '@/lib/audit'
import { accountDeletionBlockReason, normalizeAccountDeletionLimit } from '@/lib/account-deletion-policy'
import { redisConnection } from '@/lib/redis'
import { supabaseAdmin } from '@/lib/supabase/service-role'

type PendingDeletion = {
  id: string
  user_id: string | null
  target_user_id: string | null
  requested_by: string
  organization_id: string | null
  attempt_count: number
}

export async function purgeDueAccountDeletions(limit = 25) {
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('account_deletion_requests')
    .select('id,user_id,target_user_id,requested_by,organization_id,attempt_count')
    .eq('status', 'pending')
    .is('blocked_reason', null)
    .lte('purge_after', now)
    .order('purge_after')
    .limit(normalizeAccountDeletionLimit(limit))
  if (error) throw new Error('Falha ao consultar exclusões vencidas')

  let purged = 0
  let blocked = 0
  let failed = 0

  for (const deletion of (data || []) as PendingDeletion[]) {
    const targetUserId = deletion.target_user_id || deletion.user_id
    await supabaseAdmin.from('account_deletion_requests').update({
      last_attempt_at: now,
      attempt_count: Number(deletion.attempt_count || 0) + 1,
    }).eq('id', deletion.id)

    if (!targetUserId) {
      await supabaseAdmin.from('account_deletion_requests').update({ blocked_reason: 'TARGET_USER_MISSING' }).eq('id', deletion.id)
      blocked++
      continue
    }

    const { data: memberships, error: membershipError } = await supabaseAdmin
      .from('organization_members')
      .select('organization_id,role')
      .eq('user_id', targetUserId)
    if (membershipError) {
      failed++
      continue
    }

    const blockReason = accountDeletionBlockReason((memberships || []).map((membership) => ({
      organizationId: membership.organization_id,
      role: membership.role as 'owner' | 'admin' | 'member',
    })))
    if (blockReason) {
      await supabaseAdmin.from('account_deletion_requests').update({ blocked_reason: blockReason }).eq('id', deletion.id)
      blocked++
      continue
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId)
    if (deleteError) {
      await supabaseAdmin.from('account_deletion_requests').update({ blocked_reason: 'PURGE_REQUIRES_REVIEW' }).eq('id', deletion.id)
      failed++
      continue
    }

    const { error: finalizeError } = await supabaseAdmin.from('account_deletion_requests').update({
      status: 'purged',
      purged_at: now,
      blocked_reason: null,
    }).eq('id', deletion.id)
    if (finalizeError) throw new Error('Conta removida, mas a retenção não pôde ser finalizada')

    try { await redisConnection.srem('global:banned_users', targetUserId) } catch {}
    await logAudit({
      user_id: deletion.requested_by,
      organization_id: deletion.organization_id,
      action: 'system.user.purged',
      resource: 'users',
      resource_id: targetUserId,
      details: { deletion_request_id: deletion.id, retention_days: 30 },
      reason: 'Prazo de retenção concluído',
      outcome: 'success',
      ip_address: 'system',
    })
    purged++
  }

  return { checked: data?.length || 0, purged, blocked, failed }
}

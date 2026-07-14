import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { adminCriticalActionSchema } from '@/lib/admin-types'
import { AdminAccessError, adminErrorResponse, claimAdminAction, finishAdminAction, protectAdminMutation } from '@/lib/admin-security'
import { getIpFromRequest, logAudit } from '@/lib/audit'

const schema = adminCriticalActionSchema.extend({
  userId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30),
  organization: z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(2).max(120),
    planId: z.enum(['starter', 'pro', 'master']),
    entitlementActive: z.boolean(),
    expiresAt: z.string().datetime().nullable(),
  }).nullable(),
})

function sameInstant(left: string | null | undefined, right: string | null | undefined) {
  if (!left && !right) return true
  if (!left || !right) return false
  return new Date(left).getTime() === new Date(right).getTime()
}
export async function POST(request: Request) {
  let claimId: string | null = null
  try {
    const admin = await protectAdminMutation(request, { recentAuth: true, limit: 10 })
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'ADMIN_USER_UPDATE_INVALID', message: 'Revise os dados da conta' } },
        { status: 400 },
      )
    }
    const input = parsed.data
    if (input.confirmation !== `ALTERAR ${input.userId}`) {
      return NextResponse.json(
        { error: { code: 'ADMIN_CONFIRMATION_MISMATCH', message: 'Confirmação inválida' } },
        { status: 400 },
      )
    }

    claimId = await claimAdminAction(admin, input, 'admin.user.update')
    const { data: target, error: targetError } = await supabaseAdmin.auth.admin.getUserById(input.userId)
    if (targetError || !target.user) {
      await finishAdminAction(claimId, 'failed')
      claimId = null
      return NextResponse.json(
        { error: { code: 'ADMIN_USER_NOT_FOUND', message: 'Usuário não encontrado' } },
        { status: 404 },
      )
    }

    let organizationId: string | null = null
    let entitlementChanged = false
    let currentEntitlementSource: string | null = null
    if (input.organization) {
      organizationId = input.organization.id
      const [{ data: membership, error: membershipError }, { data: plan, error: planError }, { data: currentEntitlement, error: entitlementReadError }] = await Promise.all([
        supabaseAdmin.from('organization_members').select('organization_id').eq('organization_id', input.organization.id).eq('user_id', input.userId).maybeSingle(),
        supabaseAdmin.from('saas_plan_catalog').select('plan').eq('plan', input.organization.planId).maybeSingle(),
        supabaseAdmin.from('organization_entitlements').select('plan,is_active,expires_at,source').eq('organization_id', input.organization.id).maybeSingle(),
      ])
      if (membershipError || !membership) {
        throw new AdminAccessError(409, 'ADMIN_ORGANIZATION_MISMATCH', 'A conta não pertence à organização informada')
      }
      if (planError || !plan) {
        throw new AdminAccessError(409, 'ADMIN_PLAN_NOT_FOUND', 'Plano oficial não encontrado')
      }
      if (entitlementReadError) throw entitlementReadError
      currentEntitlementSource = currentEntitlement?.source || null

      entitlementChanged = !currentEntitlement
        || currentEntitlement.plan !== input.organization.planId
        || currentEntitlement.is_active !== input.organization.entitlementActive
        || !sameInstant(currentEntitlement.expires_at, input.organization.expiresAt)

      if (currentEntitlement?.source === 'stripe' && entitlementChanged) {
        throw new AdminAccessError(
          409,
          'ADMIN_STRIPE_MANAGED_ENTITLEMENT',
          'Este entitlement é gerenciado pela Stripe e deve ser alterado no fluxo de assinatura',
        )
      }

    }

    const currentMetadata = target.user.user_metadata && typeof target.user.user_metadata === 'object'
      ? target.user.user_metadata
      : {}
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(input.userId, {
      user_metadata: { ...currentMetadata, full_name: input.name, phone: input.phone },
    })
    if (authError) throw authError

    if (input.organization) {
      const { error: organizationError } = await supabaseAdmin.from('organizations').update({
        name: input.organization.name,
        updated_at: new Date().toISOString(),
      }).eq('id', input.organization.id)
      if (organizationError) throw organizationError

      if (currentEntitlementSource !== 'stripe') {
        const { error: entitlementError } = await supabaseAdmin.from('organization_entitlements').upsert({
          organization_id: input.organization.id,
          plan: input.organization.planId,
          is_active: input.organization.entitlementActive,
          source: 'admin',
          expires_at: input.organization.expiresAt,
          updated_by: admin.userId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id' })
        if (entitlementError) throw entitlementError
      }
    }

    await finishAdminAction(claimId, 'completed')
    await logAudit({
      organization_id: organizationId,
      user_id: admin.userId,
      action: 'admin.update_user',
      resource: 'users',
      resource_id: input.userId,
      details: {
        display_name_changed: input.name !== target.user.user_metadata?.full_name,
        phone_changed: input.phone !== (target.user.user_metadata?.phone || target.user.phone || ''),
        organization_name: input.organization?.name || null,
        plan: input.organization?.planId || null,
        entitlement_active: input.organization?.entitlementActive ?? null,
        entitlement_changed: entitlementChanged,
        expires_at: input.organization?.expiresAt || null,
      },
      reason: input.reason,
      correlation_id: input.idempotencyKey,
      outcome: 'success',
      ip_address: getIpFromRequest(request),
    })
    return NextResponse.json({ data: { updated: true }, meta: {} })
  } catch (error) {
    if (claimId) await finishAdminAction(claimId, 'failed')
    return adminErrorResponse(error)
  }
}

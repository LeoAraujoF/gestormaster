import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getIpFromRequest, logAudit } from '@/lib/audit'
import { adminCriticalActionSchema } from '@/lib/admin-types'
import { adminErrorResponse, claimAdminAction, finishAdminAction, protectAdminMutation } from '@/lib/admin-security'
import { supabaseAdmin } from '@/lib/supabase/service-role'

const schema = adminCriticalActionSchema.extend({
  email: z.string().trim().email().max(254).toLowerCase(),
  password: z.string().min(8).max(72),
  name: z.string().trim().min(2).max(120),
  organizationName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).default(''),
  planId: z.enum(['starter', 'pro', 'master']),
  entitlementActive: z.boolean(),
  expiresAt: z.string().datetime().nullable(),
})

export async function POST(request: Request) {
  let claimId: string | null = null
  let createdUserId: string | null = null
  let createdOrganizationId: string | null = null

  try {
    const admin = await protectAdminMutation(request, { recentAuth: true, limit: 5 })
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'ADMIN_USER_CREATE_INVALID', message: 'Revise os dados da nova conta' } },
        { status: 400 },
      )
    }

    const input = parsed.data
    if (input.confirmation !== `CRIAR ${input.email}`) {
      return NextResponse.json(
        { error: { code: 'ADMIN_CONFIRMATION_MISMATCH', message: 'Confirmação inválida' } },
        { status: 400 },
      )
    }

    claimId = await claimAdminAction(admin, input, 'admin.user.create')

    const { data: plan, error: planError } = await supabaseAdmin
      .from('saas_plan_catalog')
      .select('plan')
      .eq('plan', input.planId)
      .maybeSingle()
    if (planError || !plan) {
      await finishAdminAction(claimId, 'failed')
      claimId = null
      return NextResponse.json(
        { error: { code: 'ADMIN_PLAN_NOT_FOUND', message: 'Plano oficial não encontrado' } },
        { status: 400 },
      )
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        full_name: input.name,
        phone: input.phone,
      },
    })
    if (error || !data.user) {
      await finishAdminAction(claimId, 'failed')
      claimId = null
      return NextResponse.json(
        { error: { code: 'ADMIN_USER_CREATE_FAILED', message: error?.message || 'Não foi possível criar a conta' } },
        { status: 400 },
      )
    }
    createdUserId = data.user.id

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', data.user.id)
      .eq('role', 'owner')
      .order('created_at')
      .limit(1)
      .maybeSingle()
    if (membershipError || !membership?.organization_id) throw new Error('Organização da nova conta não foi provisionada')
    createdOrganizationId = membership.organization_id

    const [{ error: organizationError }, { error: entitlementError }] = await Promise.all([
      supabaseAdmin.from('organizations').update({
        name: input.organizationName,
        updated_at: new Date().toISOString(),
      }).eq('id', membership.organization_id),
      supabaseAdmin.from('organization_entitlements').upsert({
        organization_id: membership.organization_id,
        plan: input.planId,
        is_active: input.entitlementActive,
        source: 'admin',
        expires_at: input.expiresAt,
        updated_by: admin.userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id' }),
    ])
    if (organizationError) throw new Error(`Falha ao nomear organização: ${organizationError.message}`)
    if (entitlementError) throw new Error(`Falha ao criar entitlement oficial: ${entitlementError.message}`)

    await finishAdminAction(claimId, 'completed')
    await logAudit({
      organization_id: membership.organization_id,
      user_id: admin.userId,
      action: 'admin.create_user',
      resource: 'users',
      resource_id: data.user.id,
      details: {
        target_email: input.email,
        organization_name: input.organizationName,
        plan: input.planId,
        entitlement_active: input.entitlementActive,
        expires_at: input.expiresAt,
      },
      reason: input.reason,
      correlation_id: input.idempotencyKey,
      outcome: 'success',
      ip_address: getIpFromRequest(request),
    })

    return NextResponse.json({ data: { id: data.user.id }, meta: {} }, { status: 201 })
  } catch (error) {
    if (createdOrganizationId) await supabaseAdmin.from('organizations').delete().eq('id', createdOrganizationId)
    if (createdUserId) await supabaseAdmin.auth.admin.deleteUser(createdUserId)
    if (claimId) await finishAdminAction(claimId, 'failed')
    return adminErrorResponse(error)
  }
}

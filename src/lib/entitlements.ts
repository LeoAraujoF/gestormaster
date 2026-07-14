import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/service-role'

export type OrganizationPlan = 'starter' | 'pro' | 'master'

export function normalizeOrganizationPlan(planName: string | null | undefined): OrganizationPlan {
  const normalized = (planName || '').toLowerCase()
  if (normalized.includes('master') || normalized.includes('premium')) return 'master'
  if (normalized.includes('pro')) return 'pro'
  return 'starter'
}

export async function getOrganizationEntitlement(organizationId: string) {
  const { data, error } = await supabaseAdmin.from('organization_entitlements')
    .select('plan, is_active, expires_at')
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(`Falha ao consultar entitlement: ${error.message}`)
  const activeByDate = !data?.expires_at || new Date(data.expires_at) > new Date()
  return {
    plan: (data?.plan || 'starter') as OrganizationPlan,
    isActive: Boolean(data?.is_active && activeByDate),
  }
}

export async function upsertOrganizationEntitlementForUser(input: {
  userId: string
  planName: string
  active: boolean
  source: 'stripe' | 'pixgo' | 'affiliate' | 'admin'
  providerCustomerId?: string | null
  providerSubscriptionId?: string | null
  expiresAt?: string | null
}) {
  const { data: membership } = await supabaseAdmin.from('organization_members')
    .select('organization_id')
    .eq('user_id', input.userId)
    .limit(1)
    .maybeSingle()
  if (!membership?.organization_id) throw new Error('Usuário sem organização para entitlement')

  const { error } = await supabaseAdmin.from('organization_entitlements').upsert({
    organization_id: membership.organization_id,
    plan: normalizeOrganizationPlan(input.planName),
    is_active: input.active,
    source: input.source,
    provider_customer_id: input.providerCustomerId || null,
    provider_subscription_id: input.providerSubscriptionId || null,
    expires_at: input.expiresAt || null,
    updated_by: input.userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id' })
  if (error) throw new Error(`Falha ao atualizar entitlement: ${error.message}`)
  return membership.organization_id
}

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireMasterAdmin, adminErrorResponse } from '@/lib/admin-security'
import { supabaseAdmin } from '@/lib/supabase/service-role'

const filtersSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(10).max(50).default(20),
  q: z.string().trim().max(120).default(''),
  plan: z.enum(['all', 'starter', 'pro', 'master']).default('all'),
  billing: z.enum(['all', 'active', 'expired', 'inactive', 'missing']).default('all'),
  account: z.enum(['all', 'active', 'blocked', 'pending_deletion', 'unconfirmed']).default('all'),
  role: z.enum(['all', 'owner', 'admin', 'member']).default('all'),
  sort: z.enum(['created_desc', 'last_sign_in_desc', 'email_asc']).default('created_desc'),
})

type BillingState = 'active' | 'expired' | 'inactive' | 'missing'
type AccountState = 'active' | 'blocked' | 'pending_deletion' | 'unconfirmed'

function asMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}
function displayValue(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function billingState(entitlement: { is_active: boolean; expires_at: string | null } | undefined, now: number): BillingState {
  if (!entitlement) return 'missing'
  if (!entitlement.is_active) return 'inactive'
  if (entitlement.expires_at && new Date(entitlement.expires_at).getTime() <= now) return 'expired'
  return 'active'
}

function isBanned(bannedUntil: string | null | undefined, now: number) {
  if (!bannedUntil) return false
  const parsed = new Date(bannedUntil).getTime()
  return Number.isNaN(parsed) || parsed > now
}

async function listAllAuthUsers() {
  const users = []
  const perPage = 1000

  for (let page = 1; page <= 250; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < perPage) return users
  }

  throw new Error('A listagem administrativa excedeu o limite operacional seguro')
}

export async function GET(request: Request) {
  try {
    await requireMasterAdmin()

    const searchParams = new URL(request.url).searchParams
    const parsed = filtersSchema.safeParse({
      page: searchParams.get('page') || undefined,
      pageSize: searchParams.get('pageSize') || undefined,
      q: searchParams.get('q') || undefined,
      plan: searchParams.get('plan') || undefined,
      billing: searchParams.get('billing') || undefined,
      account: searchParams.get('account') || undefined,
      role: searchParams.get('role') || undefined,
      sort: searchParams.get('sort') || undefined,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'ADMIN_USERS_FILTER_INVALID', message: 'Filtros de consulta inválidos' } },
        { status: 400 },
      )
    }

    const [authUsers, members, organizations, entitlements, catalog, deletions] = await Promise.all([
      listAllAuthUsers(),
      supabaseAdmin.from('organization_members').select('organization_id,user_id,role,created_at'),
      supabaseAdmin.from('organizations').select('id,name,created_at,updated_at'),
      supabaseAdmin.from('organization_entitlements').select('organization_id,plan,is_active,expires_at,source,provider_customer_id,provider_subscription_id,updated_at'),
      supabaseAdmin.from('saas_plan_catalog').select('plan,display_name,description,monthly_price_cents,client_limit,whatsapp_instance_limit,capabilities,is_public,is_purchasable,sort_order').order('sort_order'),
      supabaseAdmin.from('account_deletion_requests').select('user_id,requested_at,purge_after,blocked_reason').eq('status', 'pending'),
    ])

    const queryErrors = [members.error, organizations.error, entitlements.error, catalog.error, deletions.error].filter(Boolean)
    if (queryErrors.length) throw new Error('Falha ao consultar contas e organizações oficiais')
    if (!catalog.data?.length) throw new Error('Catálogo oficial de planos indisponível')

    const now = Date.now()
    const authById = new Map(authUsers.map((user) => [user.id, user]))
    const organizationById = new Map((organizations.data || []).map((organization) => [organization.id, organization]))
    const entitlementByOrganization = new Map((entitlements.data || []).map((entitlement) => [entitlement.organization_id, entitlement]))
    const deletionByUser = new Map((deletions.data || []).map((deletion) => [deletion.user_id, deletion]))
    const catalogById = new Map(catalog.data.map((plan) => [plan.plan, plan]))
    const membershipsByUser = new Map<string, typeof members.data>()
    const membershipsByOrganization = new Map<string, typeof members.data>()

    for (const membership of members.data || []) {
      membershipsByUser.set(membership.user_id, [...(membershipsByUser.get(membership.user_id) || []), membership])
      membershipsByOrganization.set(membership.organization_id, [...(membershipsByOrganization.get(membership.organization_id) || []), membership])
    }

    const roleRank: Record<string, number> = { owner: 0, admin: 1, member: 2 }
    const accounts = authUsers.map((user) => {
      const metadata = asMetadata(user.user_metadata)
      const memberships = [...(membershipsByUser.get(user.id) || [])]
        .sort((a, b) => (roleRank[a.role] ?? 9) - (roleRank[b.role] ?? 9) || String(a.created_at).localeCompare(String(b.created_at)))
      const pendingDeletion = deletionByUser.get(user.id)
      const blocked = isBanned(user.banned_until, now)
      const accountState: AccountState = pendingDeletion
        ? 'pending_deletion'
        : blocked
          ? 'blocked'
          : !user.email_confirmed_at
            ? 'unconfirmed'
            : 'active'

      const accountOrganizations = memberships.map((membership) => {
        const organization = organizationById.get(membership.organization_id)
        const entitlement = entitlementByOrganization.get(membership.organization_id)
        const plan = entitlement ? catalogById.get(entitlement.plan) : undefined
        const organizationMembers = [...(membershipsByOrganization.get(membership.organization_id) || [])]
          .sort((a, b) => (roleRank[a.role] ?? 9) - (roleRank[b.role] ?? 9) || String(a.created_at).localeCompare(String(b.created_at)))
          .map((member) => {
            const memberUser = authById.get(member.user_id)
            const memberMetadata = asMetadata(memberUser?.user_metadata)
            return {
              userId: member.user_id,
              email: memberUser?.email || null,
              name: displayValue(memberMetadata.full_name, memberUser?.email || 'Sem nome'),
              role: member.role as 'owner' | 'admin' | 'member',
              blocked: isBanned(memberUser?.banned_until, now),
              joinedAt: member.created_at,
            }
          })

        return {
          id: membership.organization_id,
          name: organization?.name || 'Organização sem nome',
          role: membership.role as 'owner' | 'admin' | 'member',
          createdAt: organization?.created_at || null,
          updatedAt: organization?.updated_at || null,
          memberCount: organizationMembers.length,
          members: organizationMembers,
          entitlement: entitlement ? {
            planId: entitlement.plan as 'starter' | 'pro' | 'master',
            planName: plan?.display_name || entitlement.plan,
            isActive: entitlement.is_active,
            state: billingState(entitlement, now),
            expiresAt: entitlement.expires_at,
            source: entitlement.source,
            updatedAt: entitlement.updated_at,
            providerCustomerConfigured: Boolean(entitlement.provider_customer_id),
            providerSubscriptionConfigured: Boolean(entitlement.provider_subscription_id),
            limits: plan ? {
              clients: plan.client_limit == null ? null : Number(plan.client_limit),
              whatsappInstances: Number(plan.whatsapp_instance_limit),
            } : null,
            capabilities: (plan?.capabilities || []) as string[],
          } : null,
        }
      })

      return {
        id: user.id,
        email: user.email || null,
        name: displayValue(metadata.full_name, user.email || 'Sem nome'),
        phone: displayValue(metadata.phone, user.phone || ''),
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at || null,
        emailConfirmedAt: user.email_confirmed_at || null,
        accountState,
        blocked,
        deletion: pendingDeletion ? {
          requestedAt: pendingDeletion.requested_at,
          purgeAfter: pendingDeletion.purge_after,
          blockedReason: pendingDeletion.blocked_reason,
        } : null,
        organizations: accountOrganizations,
      }
    })

    const { q, plan, billing, account, role, sort, page, pageSize } = parsed.data
    const normalizedQuery = q.toLocaleLowerCase('pt-BR')
    const filtered = accounts.filter((item) => {
      const matchesQuery = !normalizedQuery || [
        item.name,
        item.email || '',
        item.phone,
        ...item.organizations.map((organization) => organization.name),
      ].some((value) => value.toLocaleLowerCase('pt-BR').includes(normalizedQuery))
      const matchesPlan = plan === 'all' || item.organizations.some((organization) => organization.entitlement?.planId === plan)
      const matchesBilling = billing === 'all' || (
        billing === 'missing'
          ? item.organizations.length === 0 || item.organizations.some((organization) => !organization.entitlement)
          : item.organizations.some((organization) => organization.entitlement?.state === billing)
      )
      const matchesAccount = account === 'all' || item.accountState === account
      const matchesRole = role === 'all' || item.organizations.some((organization) => organization.role === role)
      return matchesQuery && matchesPlan && matchesBilling && matchesAccount && matchesRole
    })

    filtered.sort((a, b) => {
      if (sort === 'email_asc') return (a.email || '').localeCompare(b.email || '', 'pt-BR')
      if (sort === 'last_sign_in_desc') return (b.lastSignInAt ? new Date(b.lastSignInAt).getTime() : 0) - (a.lastSignInAt ? new Date(a.lastSignInAt).getTime() : 0)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    const total = filtered.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const effectivePage = Math.min(page, totalPages)
    const start = (effectivePage - 1) * pageSize

    return NextResponse.json({
      data: {
        accounts: filtered.slice(start, start + pageSize),
        catalog: catalog.data.map((planItem) => ({
          id: planItem.plan,
          name: planItem.display_name,
          description: planItem.description,
          monthlyPriceCents: planItem.monthly_price_cents == null ? null : Number(planItem.monthly_price_cents),
          clientLimit: planItem.client_limit == null ? null : Number(planItem.client_limit),
          whatsappInstanceLimit: Number(planItem.whatsapp_instance_limit),
          capabilities: (planItem.capabilities || []) as string[],
          isPublic: planItem.is_public,
          isPurchasable: planItem.is_purchasable,
        })),
      },
      meta: { page: effectivePage, pageSize, total, totalPages },
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

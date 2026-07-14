import { NextResponse } from 'next/server'
import { requireMasterAdmin } from '@/lib/admin-security'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { adminTicketIdSchema, adminTicketsQuerySchema, escapePostgresLikePattern } from './_contracts'
import { adminTicketErrorResponse } from './_errors'

type RelatedOrganization = { id: string; name: string } | { id: string; name: string }[] | null

function firstOrganization(value: RelatedOrganization) {
  return Array.isArray(value) ? value[0] || null : value
}

export async function GET(request: Request) {
  try {
    await requireMasterAdmin()
    const url = new URL(request.url)
    const query = adminTicketsQuerySchema.parse({
      page: url.searchParams.get('page') || undefined,
      pageSize: url.searchParams.get('pageSize') || undefined,
      search: url.searchParams.get('search') || undefined,
      status: url.searchParams.get('status') || undefined,
      priority: url.searchParams.get('priority') || undefined,
      organizationId: url.searchParams.get('organizationId') || undefined,
    })

    const offset = (query.page - 1) * query.pageSize
    let builder = supabaseAdmin
      .from('tickets')
      .select(
        'id,user_id,organization_id,subject,description,page_url,status,priority,created_at,updated_at,organizations(id,name)',
        { count: 'exact' },
      )
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .range(offset, offset + query.pageSize - 1)

    if (query.status) builder = builder.eq('status', query.status)
    if (query.priority) builder = builder.eq('priority', query.priority)
    if (query.organizationId) builder = builder.eq('organization_id', query.organizationId)
    if (query.search) {
      const exactId = adminTicketIdSchema.safeParse(query.search)
      builder = exactId.success
        ? builder.eq('id', exactId.data)
        : builder.ilike('subject', `%${escapePostgresLikePattern(query.search)}%`)
    }

    const [ticketsResult, organizationsResult] = await Promise.all([
      builder,
      supabaseAdmin.from('organizations').select('id,name').order('name').limit(500),
    ])
    if (ticketsResult.error) throw ticketsResult.error
    if (organizationsResult.error) throw organizationsResult.error

    const rows = ticketsResult.data || []
    const userIds = [...new Set(rows.map((ticket) => ticket.user_id).filter(Boolean))]
    const organizationIds = [...new Set(rows.map((ticket) => ticket.organization_id).filter(Boolean))]

    const [membershipsResult, entitlementsResult, authUsers] = await Promise.all([
      userIds.length
        ? supabaseAdmin.from('organization_members').select('user_id,organization_id,role').in('user_id', userIds)
        : Promise.resolve({ data: [], error: null }),
      organizationIds.length
        ? supabaseAdmin.from('organization_entitlements').select('organization_id,plan,is_active,expires_at,source').in('organization_id', organizationIds)
        : Promise.resolve({ data: [], error: null }),
      Promise.all(userIds.map(async (userId) => {
        const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)
        return error || !data.user ? [userId, null] as const : [userId, data.user] as const
      })),
    ])
    if (membershipsResult.error) throw membershipsResult.error
    if (entitlementsResult.error) throw entitlementsResult.error

    const memberships = new Map(
      (membershipsResult.data || []).map((membership) => [
        `${membership.user_id}:${membership.organization_id}`,
        membership,
      ]),
    )
    const entitlements = new Map(
      (entitlementsResult.data || []).map((entitlement) => [entitlement.organization_id, entitlement]),
    )
    const users = new Map(authUsers)

    const tickets = rows.map((ticket) => {
      const organization = firstOrganization(ticket.organizations as RelatedOrganization)
      const user = users.get(ticket.user_id) || null
      const metadata = user?.user_metadata as Record<string, unknown> | undefined
      const membership = ticket.organization_id
        ? memberships.get(`${ticket.user_id}:${ticket.organization_id}`)
        : null
      const entitlement = ticket.organization_id ? entitlements.get(ticket.organization_id) : null

      return {
        id: ticket.id,
        userId: ticket.user_id,
        organizationId: ticket.organization_id,
        subject: ticket.subject,
        description: ticket.description,
        pageUrl: ticket.page_url,
        status: ticket.status,
        priority: ticket.priority,
        createdAt: ticket.created_at,
        updatedAt: ticket.updated_at,
        organization: organization ? { id: organization.id, name: organization.name } : null,
        requester: user ? {
          id: user.id,
          email: user.email || null,
          name: typeof metadata?.full_name === 'string' ? metadata.full_name : null,
          phone: user.phone || (typeof metadata?.phone === 'string' ? metadata.phone : null),
          createdAt: user.created_at,
          lastSignInAt: user.last_sign_in_at || null,
          role: membership?.role || null,
        } : null,
        entitlement: entitlement ? {
          plan: entitlement.plan,
          isActive: entitlement.is_active,
          expiresAt: entitlement.expires_at,
          source: entitlement.source,
        } : null,
      }
    })

    const total = ticketsResult.count || 0
    return NextResponse.json({
      data: { tickets, organizations: organizationsResult.data || [] },
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
      },
    })
  } catch (error) {
    return adminTicketErrorResponse(error)
  }
}

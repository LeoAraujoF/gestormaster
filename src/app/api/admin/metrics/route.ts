import { NextResponse } from 'next/server'

import { adminErrorResponse, requireMasterAdmin } from '@/lib/admin-security'
import { supabaseAdmin } from '@/lib/supabase/service-role'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 1_000
const MAX_PAGES = 100
const TREND_MONTHS = 6

type PageResult<T> = {
  data: T[] | null
  error: { message: string } | null
}
type PaginatedResult<T> = {
  rows: T[]
  truncated: boolean
}

type OrganizationRow = { id: string; created_at: string }
type AuthUserRow = { id: string; created_at: string }
type ClientRow = { id: string; status: string | null; plan_value: number | string | null; created_at: string }
type InstanceRow = { instance_name: string; status: string | null }
type MessageRow = { id: string; status: string | null; created_at: string }
type EntitlementRow = {
  organization_id: string
  plan: string
  is_active: boolean
  expires_at: string | null
}
type CatalogRow = {
  plan: string
  display_name: string
  monthly_price_cents: number | null
  sort_order: number
}
type TicketRow = { id: string; status: string | null; priority: string | null }

type SourceName =
  | 'authUsers'
  | 'organizations'
  | 'clients'
  | 'instances'
  | 'messages'
  | 'subscriptions'
  | 'planCatalog'
  | 'tickets'

type SourceCoverage = {
  status: 'available' | 'unavailable'
  rows: number | null
  truncated: boolean
}

async function readAll<T>(
  loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<PaginatedResult<T>> {
  const rows: T[] = []

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE
    const { data, error } = await loadPage(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)

    const pageRows = data ?? []
    rows.push(...pageRows)
    if (pageRows.length < PAGE_SIZE) return { rows, truncated: false }
  }

  return { rows, truncated: true }
}

async function readAllAuthUsers(): Promise<PaginatedResult<AuthUserRow> & { total: number }> {
  const rows: AuthUserRow[] = []

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: PAGE_SIZE })
    if (error) throw error

    rows.push(...data.users.map((user) => ({ id: user.id, created_at: user.created_at })))
    if (data.users.length < PAGE_SIZE) return { rows, total: rows.length, truncated: false }
  }

  return { rows, total: rows.length, truncated: true }
}

function getSettled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null
}

function isCurrentSubscription(entitlement: EntitlementRow, now: number) {
  return entitlement.is_active && (
    !entitlement.expires_at || new Date(entitlement.expires_at).getTime() > now
  )
}

function monthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function addUtcMonths(date: Date, amount: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1))
}

function monthKey(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function sourceCoverage<T>(result: PromiseSettledResult<PaginatedResult<T>>): SourceCoverage {
  if (result.status === 'rejected') {
    console.error('[Admin metrics source]', result.reason)
    return { status: 'unavailable', rows: null, truncated: false }
  }

  return {
    status: 'available',
    rows: result.value.rows.length,
    truncated: result.value.truncated,
  }
}

export async function GET() {
  try {
    await requireMasterAdmin()

    const nowDate = new Date()
    const now = nowDate.getTime()
    const currentMonth = monthStart(nowDate)
    const trendStart = addUtcMonths(currentMonth, -(TREND_MONTHS - 1))

    const results = await Promise.allSettled([
      readAllAuthUsers(),
      readAll<OrganizationRow>((from, to) => supabaseAdmin
        .from('organizations')
        .select('id,created_at')
        .order('id')
        .range(from, to)),
      readAll<ClientRow>((from, to) => supabaseAdmin
        .from('clients')
        .select('id,status,plan_value,created_at')
        .order('id')
        .range(from, to)),
      readAll<InstanceRow>((from, to) => supabaseAdmin
        .from('evolution_instances')
        .select('instance_name,status')
        .order('instance_name')
        .range(from, to)),
      readAll<MessageRow>((from, to) => supabaseAdmin
        .from('alert_history')
        .select('id,status,created_at')
        .gte('created_at', trendStart.toISOString())
        .order('id')
        .range(from, to)),
      readAll<EntitlementRow>((from, to) => supabaseAdmin
        .from('organization_entitlements')
        .select('organization_id,plan,is_active,expires_at')
        .order('organization_id')
        .range(from, to)),
      readAll<CatalogRow>((from, to) => supabaseAdmin
        .from('saas_plan_catalog')
        .select('plan,display_name,monthly_price_cents,sort_order')
        .order('plan')
        .range(from, to)),
      readAll<TicketRow>((from, to) => supabaseAdmin
        .from('tickets')
        .select('id,status,priority')
        .order('id')
        .range(from, to)),
    ])

    const [
      authUsersResult,
      organizationsResult,
      clientsResult,
      instancesResult,
      messagesResult,
      subscriptionsResult,
      catalogResult,
      ticketsResult,
    ] = results

    const authUsers = authUsersResult.status === 'fulfilled' ? authUsersResult.value : null
    if (authUsersResult.status === 'rejected') console.error('[Admin metrics auth users]', authUsersResult.reason)

    const organizations = getSettled(organizationsResult)?.rows ?? null
    const clients = getSettled(clientsResult)?.rows ?? null
    const instances = getSettled(instancesResult)?.rows ?? null
    const messages = getSettled(messagesResult)?.rows ?? null
    const subscriptions = getSettled(subscriptionsResult)?.rows ?? null
    const catalog = getSettled(catalogResult)?.rows ?? null
    const tickets = getSettled(ticketsResult)?.rows ?? null

    const activeClients = clients?.filter((client) => client.status === 'active') ?? null
    const managedValues = activeClients?.map((client) => Number(client.plan_value ?? 0)) ?? null
    const managedRevenue = managedValues && managedValues.every(Number.isFinite)
      ? managedValues.reduce((total, value) => total + value, 0)
      : null

    const activeSubscriptions = subscriptions?.filter((subscription) => (
      isCurrentSubscription(subscription, now)
    )) ?? null
    const priceByPlan = catalog
      ? new Map(catalog.map((plan) => [plan.plan, plan.monthly_price_cents]))
      : null
    const unpricedSubscriptions = activeSubscriptions && priceByPlan
      ? activeSubscriptions.filter((subscription) => {
          const price = priceByPlan.get(subscription.plan)
          return typeof price !== 'number'
        })
      : null
    const saasMrr = activeSubscriptions && priceByPlan && unpricedSubscriptions?.length === 0
      ? activeSubscriptions.reduce((total, subscription) => (
          total + Number(priceByPlan.get(subscription.plan)) / 100
        ), 0)
      : null

    const planIds = new Set<string>([
      ...(catalog?.map((plan) => plan.plan) ?? []),
      ...(activeSubscriptions?.map((subscription) => subscription.plan) ?? []),
    ])
    const catalogByPlan = new Map(catalog?.map((plan) => [plan.plan, plan]) ?? [])
    const subscriptionsByPlan = [...planIds]
      .map((planId) => {
        const plan = catalogByPlan.get(planId)
        const planSubscriptions = activeSubscriptions?.filter((item) => item.plan === planId) ?? null
        const price = plan?.monthly_price_cents
        return {
          plan: planId,
          label: plan?.display_name ?? planId,
          subscriptions: planSubscriptions?.length ?? null,
          monthlyPrice: typeof price === 'number' ? price / 100 : null,
          mrr: planSubscriptions && typeof price === 'number'
            ? planSubscriptions.length * price / 100
            : null,
          sortOrder: plan?.sort_order ?? Number.MAX_SAFE_INTEGER,
        }
      })
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'pt-BR'))
      .map((plan) => ({
        plan: plan.plan,
        label: plan.label,
        subscriptions: plan.subscriptions,
        monthlyPrice: plan.monthlyPrice,
        mrr: plan.mrr,
      }))

    const activeOrganizationIds = activeSubscriptions
      ? new Set(activeSubscriptions.map((subscription) => subscription.organization_id))
      : null
    const organizationsWithoutSubscription = organizations && activeOrganizationIds
      ? organizations.filter((organization) => !activeOrganizationIds.has(organization.id)).length
      : null

    const activeInstances = instances?.filter((instance) => instance.status !== 'deleted') ?? null
    const connectedInstances = activeInstances?.filter((instance) => instance.status === 'connected').length ?? null
    const disconnectedInstances = activeInstances
      ? activeInstances.length - (connectedInstances ?? 0)
      : null

    const messagesThisMonth = messages?.filter((message) => (
      message.status === 'sent' && new Date(message.created_at) >= currentMonth
    )).length ?? null
    const failedMessagesThisMonth = messages?.filter((message) => (
      message.status === 'failed' && new Date(message.created_at) >= currentMonth
    )).length ?? null

    const unresolvedTickets = tickets?.filter((ticket) => (
      ticket.status !== 'closed' && ticket.status !== 'resolved'
    )) ?? null
    const criticalTickets = unresolvedTickets?.filter((ticket) => ticket.priority === 'critical').length ?? null

    const expiresBefore = now + 14 * 24 * 60 * 60 * 1_000
    const expiringSubscriptions = activeSubscriptions?.filter((subscription) => {
      if (!subscription.expires_at) return false
      const expiresAt = new Date(subscription.expires_at).getTime()
      return expiresAt > now && expiresAt <= expiresBefore
    }).length ?? null

    const trend = Array.from({ length: TREND_MONTHS }, (_, index) => {
      const date = addUtcMonths(trendStart, index)
      const key = monthKey(date)
      return {
        month: key,
        label: new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
          .format(date)
          .replace('.', ''),
        newOrganizations: organizations
          ? organizations.filter((organization) => monthKey(organization.created_at) === key).length
          : null,
        newAccessAccounts: authUsers
          ? authUsers.rows.filter((user) => monthKey(user.created_at) === key).length
          : null,
        newClients: clients
          ? clients.filter((client) => monthKey(client.created_at) === key).length
          : null,
        deliveredMessages: messages
          ? messages.filter((message) => message.status === 'sent' && monthKey(message.created_at) === key).length
          : null,
      }
    })

    const coverageSources: Record<SourceName, SourceCoverage> = {
      authUsers: authUsers
        ? { status: 'available', rows: authUsers.total, truncated: authUsers.truncated }
        : { status: 'unavailable', rows: null, truncated: false },
      organizations: sourceCoverage(organizationsResult),
      clients: sourceCoverage(clientsResult),
      instances: sourceCoverage(instancesResult),
      messages: sourceCoverage(messagesResult),
      subscriptions: sourceCoverage(subscriptionsResult),
      planCatalog: sourceCoverage(catalogResult),
      tickets: sourceCoverage(ticketsResult),
    }
    const availableSources = Object.values(coverageSources).filter((source) => source.status === 'available').length
    const truncatedSources = Object.values(coverageSources).filter((source) => source.truncated).length
    const overallCoverage = availableSources === Object.keys(coverageSources).length
      && truncatedSources === 0
      && unpricedSubscriptions?.length === 0
      ? 'complete'
      : availableSources === 0
        ? 'unavailable'
        : 'partial'

    const response = {
      generatedAt: nowDate.toISOString(),
      saasMrr,
      managedRevenue,
      registeredSaasCustomers: organizations?.length ?? null,
      activeSaasCustomers: activeOrganizationIds?.size ?? null,
      accessAccounts: authUsers?.total ?? null,
      managedEndClients: activeClients?.length ?? null,
      // Campos legados mantidos temporariamente para consumidores administrativos antigos.
      totalUsers: authUsers?.total ?? null,
      totalOrganizations: organizations?.length ?? null,
      activeSubscriptions: activeSubscriptions?.length ?? null,
      totalActiveClients: activeClients?.length ?? null,
      totalInstances: activeInstances?.length ?? null,
      connectedInstances,
      disconnectedInstances,
      totalMessagesMonth: messagesThisMonth,
      failedMessagesMonth: failedMessagesThisMonth,
      openTickets: unresolvedTickets?.length ?? null,
      criticalTickets,
      expiringSubscriptions,
      organizationsWithoutSubscription,
      unpricedSubscriptions: unpricedSubscriptions?.length ?? null,
      subscriptionsByPlan,
      trend,
      coverage: {
        status: overallCoverage,
        availableSources,
        totalSources: Object.keys(coverageSources).length,
        truncatedSources,
        organizationsWithActiveSubscription: activeOrganizationIds?.size ?? null,
        organizationsWithoutActiveSubscription: organizationsWithoutSubscription,
        pricedActiveSubscriptions: activeSubscriptions && unpricedSubscriptions
          ? activeSubscriptions.length - unpricedSubscriptions.length
          : null,
        unpricedActiveSubscriptions: unpricedSubscriptions?.length ?? null,
        sources: coverageSources,
        trendWindow: {
          from: trendStart.toISOString(),
          to: nowDate.toISOString(),
          months: TREND_MONTHS,
        },
      },
      // Compatibilidade com consumidores administrativos existentes.
      totalMRR: saasMrr,
    }

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

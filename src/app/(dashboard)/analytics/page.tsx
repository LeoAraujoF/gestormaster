import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOrganizationMembership } from '@/lib/access-control'
import { getAnalyticsDashboard, listAnalyticsScenarios } from '@/lib/analytics-service'
import { AnalyticsView } from './analytics-view'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const membership = await getOrganizationMembership(supabase, user.id)
  if (!membership) redirect('/login')
  const dashboard = await getAnalyticsDashboard(membership.organizationId, membership.role, 'month')
  const scenarios = dashboard
    ? await listAnalyticsScenarios(membership.organizationId, null, 20).catch(() => ({ scenarios: [], next_cursor: null }))
    : { scenarios: [], next_cursor: null }
  return <AnalyticsView initialData={dashboard} initialScenarios={scenarios.scenarios} initialCursor={scenarios.next_cursor} />
}

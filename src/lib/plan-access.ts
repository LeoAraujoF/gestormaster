import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrganizationMembership } from '@/lib/access-control'
import { organizationHasCapability } from '@/lib/plan-catalog'
import type { PlanCapability } from '@/lib/plan-types'

export async function getCapabilityMembership(supabase: SupabaseClient, userId: string, capability: PlanCapability) {
  const membership = await getOrganizationMembership(supabase, userId)
  if (!membership || !(await organizationHasCapability(membership.organizationId, capability))) return null
  return membership
}

import 'server-only'

import { cookies, headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getOrganizationMembership } from '@/lib/access-control'
import { PORTAL_COOKIE, resolvePortalSession } from '@/lib/client-portal-service'

export async function requireManager() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const membership = await getOrganizationMembership(supabase, user.id)
  return membership ? { user, ...membership } : null
}

export async function requirePortalSession(slug: string) {
  const token = (await cookies()).get(PORTAL_COOKIE)?.value
  return resolvePortalSession(slug, token, (await headers()).get('user-agent'))
}

export function isTrustedMutation(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return process.env.NODE_ENV !== 'production'
  try { return new URL(origin).host === new URL(request.url).host } catch { return false }
}

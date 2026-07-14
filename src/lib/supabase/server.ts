import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getSupabasePublicConfig } from './config'

export async function createClient() {
  const config = getSupabasePublicConfig()
  if (!config) throw new Error('Configuração pública do Supabase indisponível.')

  const cookieStore = await cookies()

  return createServerClient(
    config.url,
    config.key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  )
}

export async function getActiveOrganization(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id, role, organizations(*)')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return data
}

export type SupabasePublicConfigSource = {
  url?: string
  publishableKey?: string
  anonKey?: string
}

export type SupabasePublicConfig = {
  url: string
  key: string
}

export function resolveSupabasePublicConfig(
  source: SupabasePublicConfigSource,
): SupabasePublicConfig | null {
  const url = source.url?.trim()
  const key = source.publishableKey?.trim() || source.anonKey?.trim()

  if (!url || !key) return null

  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost') return null
  } catch {
    return null
  }

  return { url, key }
}

export function getSupabasePublicConfig() {
  return resolveSupabasePublicConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  })
}

import { createBrowserClient } from '@supabase/ssr'
import { getSupabasePublicConfig } from './config'

export function createClient() {
  const config = getSupabasePublicConfig()
  if (!config) throw new Error('Configuração pública do Supabase indisponível.')

  return createBrowserClient(config.url, config.key)
}

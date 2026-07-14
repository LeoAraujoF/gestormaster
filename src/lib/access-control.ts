import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolve a organização a partir da tabela de membros, que é a fonte de
 * autorização. Nunca use user_metadata para decidir o tenant: esse campo pode
 * ser alterado pelo próprio usuário autenticado.
 */
export async function getAuthorizedOrganizationId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (data?.organization_id) return data.organization_id

  // Mantém compatibilidade apenas para instalações legadas que ainda não
  // possuem o modelo multi-tenant. Quando a tabela existe, ausência de vínculo
  // sempre nega acesso.
  if (error?.code === '42P01') return userId

  return null
}

export async function getOrganizationMembership(
  supabase: SupabaseClient,
  userId: string
): Promise<{ organizationId: string; role: 'owner' | 'admin' | 'member' } | null> {
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (!data?.organization_id || !['owner', 'admin', 'member'].includes(data.role)) return null
  return { organizationId: data.organization_id, role: data.role as 'owner' | 'admin' | 'member' }
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const adminEmail = process.env.ADMIN_EMAIL
  return Boolean(adminEmail && email && email === adminEmail)
}

/** URL canônica da aplicação para retornos de provedores de pagamento. */
export function getTrustedAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
  if (configured) {
    const url = new URL(configured)
    if (url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && url.protocol === 'http:')) {
      return url.origin
    }
  }

  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000'
  throw new Error('NEXT_PUBLIC_APP_URL deve ser configurada com uma URL HTTPS em produção')
}

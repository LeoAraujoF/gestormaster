import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabasePublicConfig } from './config'

function configurationUnavailable(request: NextRequest) {
  const headers = {
    'Cache-Control': 'no-store',
    'Content-Type': request.nextUrl.pathname.startsWith('/api')
      ? 'application/json; charset=utf-8'
      : 'text/plain; charset=utf-8',
  }

  if (request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.json(
      { error: { code: 'SUPABASE_CONFIGURATION_UNAVAILABLE', message: 'Serviço temporariamente indisponível.' } },
      { status: 503, headers },
    )
  }

  return new NextResponse('Serviço temporariamente indisponível.', { status: 503, headers })
}

export async function updateSession(request: NextRequest) {
  const config = getSupabasePublicConfig()
  if (!config) return configurationUnavailable(request)

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    config.url,
    config.key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims
  const user = claims?.sub ? {
    id: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    app_metadata: typeof claims.app_metadata === 'object' && claims.app_metadata ? claims.app_metadata : {},
    user_metadata: typeof claims.user_metadata === 'object' && claims.user_metadata ? claims.user_metadata : {},
  } : null

  // 1. Bloqueio padrão de Autenticação (Precisa estar logado)
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/cadastro') &&
    !request.nextUrl.pathname.startsWith('/auth') &&
    !request.nextUrl.pathname.startsWith('/api') &&
    !request.nextUrl.pathname.startsWith('/forgot-password') &&
    !request.nextUrl.pathname.startsWith('/reset-password') &&
    !request.nextUrl.pathname.startsWith('/portal') &&
    !request.nextUrl.pathname.startsWith('/privacidade') &&
    !request.nextUrl.pathname.startsWith('/termos') &&
    request.nextUrl.pathname !== '/'
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 2. Bloqueio de Assinatura (Paywall) - Só ocorre se ele já estiver logado
  if (user) {
    const isPublicRoute =
      request.nextUrl.pathname.startsWith('/planos') ||
      request.nextUrl.pathname.startsWith('/afiliados') ||
      request.nextUrl.pathname.startsWith('/login') ||
      request.nextUrl.pathname.startsWith('/cadastro') ||
      request.nextUrl.pathname.startsWith('/api') ||
      request.nextUrl.pathname.startsWith('/auth') ||
      request.nextUrl.pathname.startsWith('/termos') ||
      request.nextUrl.pathname.startsWith('/privacidade') ||
      request.nextUrl.pathname.startsWith('/portal') ||
      request.nextUrl.pathname.startsWith('/onboarding') ||
      request.nextUrl.pathname === '/'

    // Campos de autorização vêm de app_metadata (gravado apenas pelo servidor via service role),
    // NUNCA de user_metadata, que o próprio usuário consegue editar pelo navegador.
    const isManualActive = user.app_metadata?.payment_status === 'Ativo' || user.app_metadata?.payment_status === 'Pago'
    let hasOrganizationEntitlement = false
    try {
      const { data: memberships } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
      const organizationIds = (memberships || []).map((membership) => membership.organization_id).filter(Boolean)
      if (organizationIds.length) {
        const { data: entitlements } = await supabase
          .from('organization_entitlements')
          .select('organization_id, is_active, expires_at')
          .in('organization_id', organizationIds)
        hasOrganizationEntitlement = (entitlements || []).some((entitlement) =>
          entitlement.is_active && (!entitlement.expires_at || new Date(entitlement.expires_at) > new Date())
        )
      }
    } catch {
      // A migração de entitlement pode ainda não existir; usa o legado abaixo.
    }
    const hasSubscription = user.app_metadata?.has_active_subscription === true || isManualActive || hasOrganizationEntitlement
    const hasOnboarding = user.user_metadata?.onboarding_completed === true
    const isAdmin = user.email === process.env.ADMIN_EMAIL

    // Regra 1: Se não fez o onboarding e não é rota pública (e não está no próprio onboarding)
    if (!hasOnboarding && !isPublicRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/onboarding'
      return NextResponse.redirect(url)
    }

    // Regra 2: Se o cliente não pagou, e tentou acessar rota privada (que não seja planos, nem onboarding)
    if (!isPublicRoute && !hasSubscription && !isAdmin && request.nextUrl.pathname !== '/onboarding') {
      const url = request.nextUrl.clone()
      url.pathname = '/planos'
      return NextResponse.redirect(url)
    }

    // Regra 3: Bloqueio do painel Master Admin
    if (request.nextUrl.pathname.startsWith('/admin') && !isAdmin) {
      const url = request.nextUrl.clone()
      url.pathname = '/painel'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

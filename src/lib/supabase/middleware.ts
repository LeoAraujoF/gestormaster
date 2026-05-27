import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 1. Bloqueio padrão de Autenticação (Precisa estar logado)
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/cadastro') &&
    !request.nextUrl.pathname.startsWith('/auth') &&
    !request.nextUrl.pathname.startsWith('/api')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 2. Bloqueio de Assinatura (Paywall) - Só ocorre se ele já estiver logado
  if (user) {
    const isPublicRoute = 
      request.nextUrl.pathname.startsWith('/planos') || 
      request.nextUrl.pathname.startsWith('/login') || 
      request.nextUrl.pathname.startsWith('/cadastro') || 
      request.nextUrl.pathname.startsWith('/api') || 
      request.nextUrl.pathname.startsWith('/auth')

    const hasSubscription = user.user_metadata?.has_active_subscription === true
    const isAdmin = user.email === process.env.ADMIN_EMAIL

    // Se o cliente não pagou e não é o administrador, e tentou acessar uma rota privada (ex: painel, financeiro)
    if (!isPublicRoute && !hasSubscription && !isAdmin) {
      const url = request.nextUrl.clone()
      url.pathname = '/planos'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

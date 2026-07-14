import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getOrganizationMembership, getTrustedAppUrl } from '@/lib/access-control'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new NextResponse('Não autorizado', { status: 401 })

    const membership = await getOrganizationMembership(supabase, user.id)
    if (!membership) return new NextResponse('Organização não autorizada', { status: 403 })
    if (membership.role === 'member') {
      return new NextResponse('Somente proprietários e administradores podem gerenciar a assinatura', { status: 403 })
    }
    if (!process.env.STRIPE_SECRET_KEY) return new NextResponse('Stripe não configurada', { status: 503 })

    const { data: entitlement, error } = await supabase
      .from('organization_entitlements')
      .select('provider_customer_id')
      .eq('organization_id', membership.organizationId)
      .maybeSingle()
    if (error) return new NextResponse('Não foi possível consultar a assinatura', { status: 503 })
    if (!entitlement?.provider_customer_id) {
      return new NextResponse('Nenhuma assinatura Stripe encontrada para esta organização.', { status: 404 })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const session = await stripe.billingPortal.sessions.create({
      customer: entitlement.provider_customer_id,
      return_url: `${getTrustedAppUrl()}/minha-conta`,
    })
    return NextResponse.json({ url: session.url })
  } catch (error) {
    const statusCode = error instanceof Stripe.errors.StripeError ? error.statusCode : 500
    console.error('[Stripe Portal]', error instanceof Error ? error.message : 'erro interno')
    return new NextResponse('Erro ao abrir portal de cobrança', { status: statusCode || 500 })
  }
}

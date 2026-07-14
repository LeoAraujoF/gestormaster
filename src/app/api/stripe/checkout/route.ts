import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getOrganizationMembership, getTrustedAppUrl } from '@/lib/access-control'
import { getIpFromRequest, logAudit } from '@/lib/audit'
import { getPlanById, stripePriceIdForPlan } from '@/lib/plan-catalog'
import { isStripeSubscriptionTerminal } from '@/lib/stripe-subscription'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new NextResponse('Não autorizado', { status: 401 })

    const membership = await getOrganizationMembership(supabase, user.id)
    if (!membership) return new NextResponse('Organização não autorizada', { status: 403 })
    if (membership.role === 'member') {
      return new NextResponse('Somente proprietários e administradores podem alterar a assinatura', { status: 403 })
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return new NextResponse('Stripe não configurada', { status: 503 })
    }

    const body = await request.json().catch(() => ({})) as { planId?: unknown }
    const plan = await getPlanById(String(body.planId || ''))
    if (!plan?.isPurchasable || plan.monthlyPriceCents == null) {
      return new NextResponse('Plano inválido', { status: 400 })
    }

    const priceId = stripePriceIdForPlan(plan.id)
    if (!priceId) return new NextResponse('Preço Stripe não configurado para este plano', { status: 503 })

    const { data: entitlement, error: entitlementError } = await supabase
      .from('organization_entitlements')
      .select('source,provider_customer_id,provider_subscription_id,provider_status')
      .eq('organization_id', membership.organizationId)
      .maybeSingle()
    if (entitlementError) return new NextResponse('Não foi possível consultar a assinatura atual', { status: 503 })
    const terminalSubscription = isStripeSubscriptionTerminal(entitlement?.provider_status)
    if (entitlement?.source === 'stripe' && entitlement.provider_subscription_id && !terminalSubscription) {
      return new NextResponse('Esta organização já possui uma assinatura Stripe. Use o portal para alterar o plano.', { status: 409 })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const stripePrice = await stripe.prices.retrieve(priceId)
    if (
      !stripePrice.active
      || stripePrice.currency !== 'brl'
      || stripePrice.unit_amount !== plan.monthlyPriceCents
      || stripePrice.recurring?.interval !== 'month'
    ) {
      console.error(`[Stripe] Price incompatível com o catálogo para o plano ${plan.id}`)
      return new NextResponse('Preço Stripe incompatível com o catálogo do plano', { status: 503 })
    }

    const appUrl = getTrustedAppUrl()
    const session = await stripe.checkout.sessions.create({
      ...(entitlement?.provider_customer_id
        ? { customer: entitlement.provider_customer_id }
        : { customer_email: user.email }),
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${appUrl}/minha-conta?success=true`,
      cancel_url: `${appUrl}/minha-conta?canceled=true`,
      client_reference_id: user.id,
      metadata: {
        userId: user.id,
        organizationId: membership.organizationId,
        planId: plan.id,
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          organizationId: membership.organizationId,
          planId: plan.id,
        },
      },
    })

    await logAudit({
      organization_id: membership.organizationId,
      user_id: user.id,
      action: 'stripe.checkout',
      resource: 'subscriptions',
      resource_id: session.id,
      details: { plan: plan.id, price_id: priceId },
      ip_address: getIpFromRequest(request),
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    const statusCode = error instanceof Stripe.errors.StripeError ? error.statusCode : 500
    console.error('[Stripe Checkout]', error instanceof Error ? error.message : 'erro interno')
    return new NextResponse('Erro ao criar checkout', { status: statusCode || 500 })
  }
}

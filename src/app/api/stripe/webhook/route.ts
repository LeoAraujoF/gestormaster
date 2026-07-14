import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getIpFromRequest, logAudit } from '@/lib/audit'
import { stripePriceIdForPlan } from '@/lib/plan-catalog'
import type { PlanId } from '@/lib/plan-types'
import {
  isStripeEntitlementActive,
  planIdFromStripePrice,
  stripeSubscriptionExpiresAt,
} from '@/lib/stripe-subscription'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { claimWebhookEvent, releaseWebhookEvent } from '@/lib/webhook-events'

function configuredPrices(): Partial<Record<PlanId, string | undefined>> {
  return {
    starter: stripePriceIdForPlan('starter') || undefined,
    pro: stripePriceIdForPlan('pro') || undefined,
    master: stripePriceIdForPlan('master') || undefined,
  }
}

function stripeObjectId(value: string | { id: string } | Stripe.DeletedCustomer | null): string | null {
  return typeof value === 'string' ? value : value?.id || null
}

async function syncSubscription(subscription: Stripe.Subscription, eventCreated: number) {
  const organizationId = subscription.metadata.organizationId
  const userId = subscription.metadata.userId
  if (!organizationId || !userId) throw new Error('Assinatura sem vínculo local confiável')

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('organization_members')
    .select('organization_id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle()
  if (membershipError || !membership) throw new Error('Vínculo da assinatura não corresponde à organização')

  const priceIds = subscription.items.data.map((item) => item.price.id)
  const plans = [...new Set(priceIds.map((priceId) => planIdFromStripePrice(priceId, configuredPrices())).filter(Boolean))]
  if (plans.length !== 1) throw new Error('Assinatura não corresponde a um único plano configurado')
  const planId = plans[0] as PlanId
  const customerId = stripeObjectId(subscription.customer)
  if (!customerId) throw new Error('Assinatura sem cliente Stripe')
  const active = isStripeEntitlementActive(subscription.status)
  const expiresAt = stripeSubscriptionExpiresAt(subscription.items.data)

  const { data: applied, error } = await supabaseAdmin.rpc('sync_stripe_organization_entitlement', {
    p_organization_id: organizationId,
    p_plan: planId,
    p_is_active: active,
    p_provider_customer_id: customerId,
    p_provider_subscription_id: subscription.id,
    p_provider_status: subscription.status,
    p_expires_at: expiresAt,
    p_updated_by: userId,
    p_event_created_at: new Date(eventCreated * 1000).toISOString(),
  })
  if (error) throw error

  if (applied) {
    const { data: members, error: membersError } = await supabaseAdmin
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', organizationId)
    if (membersError) throw membersError
    await Promise.all((members || []).map(async ({ user_id: memberId }) => {
      const { data: member, error: memberError } = await supabaseAdmin.auth.admin.getUserById(memberId)
      if (memberError || !member.user) throw memberError || new Error('Membro da organização não encontrado')
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(memberId, {
        app_metadata: {
          ...member.user.app_metadata,
          has_active_subscription: active,
          stripe_customer_id: customerId,
        },
      })
      if (updateError) throw updateError
    }))
  }

  return { organizationId, userId, planId, active, applied: Boolean(applied) }
}

export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return new NextResponse('Webhook não configurado', { status: 503 })
  }

  const payload = await request.text()
  const signature = request.headers.get('Stripe-Signature')
  if (!signature) return new NextResponse('Assinatura Stripe ausente', { status: 400 })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' })
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (error) {
    console.error('[Stripe Webhook] assinatura inválida', error instanceof Error ? error.message : '')
    return new NextResponse('Assinatura inválida', { status: 400 })
  }

  let claimed = false
  try {
    claimed = await claimWebhookEvent('stripe', event.id)
    if (!claimed) return new NextResponse('Evento já processado', { status: 200 })

    let result: Awaited<ReturnType<typeof syncSubscription>> | null = null
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode !== 'subscription' || !session.subscription) throw new Error('Checkout não contém assinatura recorrente')
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price'] })
      result = await syncSubscription(subscription, event.created)

      const { data: affiliateUser } = await supabaseAdmin.auth.admin.getUserById(result.userId)
      const referredBy = affiliateUser.user?.user_metadata?.referred_by
      const commissionAmount = session.amount_total ? (session.amount_total / 100) * 0.30 : 0
      if (referredBy && commissionAmount > 0) {
        const { error: affiliateError } = await supabaseAdmin.from('affiliate_earnings').insert({
          referrer_id: referredBy,
          referred_user_id: result.userId,
          amount: commissionAmount,
          status: 'pending',
          source_event_id: event.id,
        })
        if (affiliateError && affiliateError.code !== '23505') {
          console.error('[Stripe Webhook] falha ao registrar comissão', affiliateError.message)
        }
      }
    } else if (
      event.type === 'customer.subscription.created'
      || event.type === 'customer.subscription.updated'
      || event.type === 'customer.subscription.deleted'
    ) {
      const eventSubscription = event.data.object as Stripe.Subscription
      const currentSubscription = await stripe.subscriptions.retrieve(eventSubscription.id, { expand: ['items.data.price'] })
      result = await syncSubscription(currentSubscription, event.created)
    }

    if (result) {
      await logAudit({
        organization_id: result.organizationId,
        user_id: result.userId,
        action: 'stripe.subscription_sync',
        resource: 'subscriptions',
        resource_id: event.id,
        details: {
          event_type: event.type,
          plan: result.planId,
          active: result.active,
          applied: result.applied,
        },
        ip_address: getIpFromRequest(request),
      })
    }

    return new NextResponse('Webhook recebido com sucesso', { status: 200 })
  } catch (error) {
    console.error('[Stripe Webhook]', error instanceof Error ? error.message : 'erro interno')
    if (claimed) await releaseWebhookEvent('stripe', event.id)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

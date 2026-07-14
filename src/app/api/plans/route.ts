import { NextResponse } from 'next/server'
import { getPlanCatalog, stripePriceIdForPlan } from '@/lib/plan-catalog'

export async function GET() {
  try {
    const plans = (await getPlanCatalog()).filter((plan) => plan.isPublic).map((plan) => ({
      ...plan,
      checkout: {
        stripe: Boolean(plan.isPurchasable && stripePriceIdForPlan(plan.id) && process.env.STRIPE_SECRET_KEY),
        pix: Boolean(plan.isPurchasable && plan.monthlyPriceCents != null && process.env.PIXGO_API_KEY),
        affiliateCredit: Boolean(plan.isPurchasable && plan.monthlyPriceCents != null),
      },
    }))
    return NextResponse.json({ plans }, { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } })
  } catch (error) {
    console.error('[plans]', error)
    return NextResponse.json({ error: 'Não foi possível carregar os planos' }, { status: 500 })
  }
}

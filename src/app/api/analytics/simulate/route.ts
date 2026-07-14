import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOrganizationMembership } from '@/lib/access-control'
import { previewPriceSimulation } from '@/lib/analytics-service'

const schema = z.object({
  current_price: z.number().positive().max(1_000_000),
  new_price: z.number().positive().max(1_000_000),
  assumed_churn_pct: z.number().min(0).max(100),
}).strict()

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const membership = await getOrganizationMembership(supabase, user.id)
    if (!membership) return NextResponse.json({ error: 'Organização não autorizada' }, { status: 403 })
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'Parâmetros da simulação inválidos' }, { status: 400 })
    const result = await previewPriceSimulation(membership.organizationId, {
      currentPrice: parsed.data.current_price,
      newPrice: parsed.data.new_price,
      assumedChurnPct: parsed.data.assumed_churn_pct,
    })
    return NextResponse.json(result)
  } catch (error: any) {
    if (error?.message === 'ANALYTICS_REQUIRED') return NextResponse.json({ error: 'Recurso disponível nos planos Pro e Master', upgrade_required: true }, { status: 403 })
    console.error('[analytics/simulate]', error)
    return NextResponse.json({ error: 'Falha ao simular reajuste' }, { status: 500 })
  }
}

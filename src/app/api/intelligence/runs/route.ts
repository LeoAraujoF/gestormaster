import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrganizationMembership } from '@/lib/access-control'
import { listIntelligenceRuns } from '@/lib/intelligence-service'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const membership = await getOrganizationMembership(supabase, user.id)
    if (!membership) return NextResponse.json({ error: 'Organização não autorizada' }, { status: 403 })
    const requested = Number(new URL(request.url).searchParams.get('page') || 1)
    const page = Number.isInteger(requested) && requested > 0 ? requested : 1
    const result = await listIntelligenceRuns(membership.organizationId, page)
    if (!result) return NextResponse.json({ error: 'Recurso exclusivo do plano Master', upgrade_required: true }, { status: 403 })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[intelligence/runs]', error)
    return NextResponse.json({ error: 'Falha ao carregar histórico' }, { status: 500 })
  }
}

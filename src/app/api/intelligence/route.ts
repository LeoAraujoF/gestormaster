import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrganizationMembership } from '@/lib/access-control'
import { getIntelligenceDashboard } from '@/lib/intelligence-service'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const membership = await getOrganizationMembership(supabase, user.id)
    if (!membership) return NextResponse.json({ error: 'Organização não autorizada' }, { status: 403 })
    const dashboard = await getIntelligenceDashboard(membership.organizationId)
    if (!dashboard) return NextResponse.json({ error: 'Recurso exclusivo do plano Master', upgrade_required: true }, { status: 403 })
    return NextResponse.json(dashboard)
  } catch (error: any) {
    console.error('[intelligence]', error)
    return NextResponse.json({ error: 'Falha ao carregar o Intelligence' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrganizationMembership } from '@/lib/access-control'
import { getOrganizationPlanContext } from '@/lib/plan-catalog'
import { supabaseAdmin } from '@/lib/supabase/service-role'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const membership = await getOrganizationMembership(supabase, user.id)
  if (!membership) return NextResponse.json({ error: 'Organização não autorizada' }, { status: 403 })

  try {
    const [context, clients, instances] = await Promise.all([
      getOrganizationPlanContext(membership.organizationId),
      supabaseAdmin.from('clients').select('id', { count: 'exact', head: true }).eq('organization_id', membership.organizationId),
      supabaseAdmin.from('evolution_instances').select('id', { count: 'exact', head: true }).eq('organization_id', membership.organizationId),
    ])
    return NextResponse.json({
      ...context,
      role: membership.role,
      usage: { clients: clients.count || 0, whatsappInstances: instances.count || 0 },
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[entitlements]', error)
    return NextResponse.json({ error: 'Não foi possível consultar o plano' }, { status: 500 })
  }
}

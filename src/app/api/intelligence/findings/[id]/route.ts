import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOrganizationMembership } from '@/lib/access-control'
import { updateFindingState } from '@/lib/intelligence-service'
import { getIpFromRequest, logAudit } from '@/lib/audit'

const bodySchema = z.object({ state: z.enum(['read', 'dismissed']) }).strict()

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const membership = await getOrganizationMembership(supabase, user.id)
    if (!membership) return NextResponse.json({ error: 'Organização não autorizada' }, { status: 403 })
    const { id } = await params
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Finding inválido' }, { status: 400 })
    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
    const result = await updateFindingState(membership.organizationId, id, parsed.data.state)
    await logAudit({ organization_id: membership.organizationId, user_id: user.id, action: `intelligence.finding.${parsed.data.state}`, resource: 'intelligence_findings', resource_id: id, ip_address: getIpFromRequest(request) })
    return NextResponse.json(result)
  } catch (error: any) {
    if (error?.message === 'FINDING_NOT_FOUND') return NextResponse.json({ error: 'Finding não encontrado' }, { status: 404 })
    console.error('[intelligence/findings]', error)
    return NextResponse.json({ error: 'Falha ao atualizar finding' }, { status: 500 })
  }
}

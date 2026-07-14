import { NextResponse } from 'next/server'
import { getPortalDashboard } from '@/lib/client-portal-service'
import { requirePortalSession } from '@/lib/client-portal-route'

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const session = await requirePortalSession(slug)
  if (!session) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })
  return NextResponse.json(await getPortalDashboard(session), { headers: { 'Cache-Control': 'private, no-store' } })
}

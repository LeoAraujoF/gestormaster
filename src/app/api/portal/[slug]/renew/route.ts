import { NextResponse } from 'next/server'
import { renewFromPortal } from '@/lib/client-portal-service'
import { isTrustedMutation, requirePortalSession } from '@/lib/client-portal-route'

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: 'Origem inválida' }, { status: 403 })
  const { slug } = await context.params
  const session = await requirePortalSession(slug)
  if (!session) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })
  try { return NextResponse.json({ charge: await renewFromPortal(session) }) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'RENEWAL_FAILED' }, { status: 409 }) }
}

import { NextResponse } from 'next/server'
import { createPortalRequest } from '@/lib/client-portal-service'
import { isTrustedMutation, requirePortalSession } from '@/lib/client-portal-route'

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: 'Origem inválida' }, { status: 403 })
  const { slug } = await context.params
  const session = await requirePortalSession(slug)
  if (!session) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  try { return NextResponse.json({ request: await createPortalRequest(session, 'due_date', String(body.dueDate || '')) }) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'REQUEST_FAILED' }, { status: 400 }) }
}

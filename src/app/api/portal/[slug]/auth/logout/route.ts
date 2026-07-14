import { NextResponse } from 'next/server'
import { PORTAL_COOKIE, revokePortalSession } from '@/lib/client-portal-service'
import { isTrustedMutation, requirePortalSession } from '@/lib/client-portal-route'

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: 'Origem inválida' }, { status: 403 })
  const { slug } = await context.params
  const session = await requirePortalSession(slug)
  if (session) await revokePortalSession(session.id)
  const response = NextResponse.json({ ok: true })
  response.cookies.set(PORTAL_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', expires: new Date(0), path: '/' })
  return response
}

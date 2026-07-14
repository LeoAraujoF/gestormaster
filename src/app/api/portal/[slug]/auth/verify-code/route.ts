import { NextResponse } from 'next/server'
import { getClientIp } from '@/lib/rate-limit'
import { PORTAL_COOKIE, PORTAL_SESSION_SECONDS, verifyPortalCode } from '@/lib/client-portal-service'
import { isTrustedMutation } from '@/lib/client-portal-route'

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: 'Origem inválida' }, { status: 403 })
  const { slug } = await context.params
  const body = await request.json().catch(() => ({}))
  const result = await verifyPortalCode(slug, String(body.challengeId || ''), String(body.code || ''), getClientIp(request), request.headers.get('user-agent') || '')
  if (result.status !== 'confirmed' || !result.token) return NextResponse.json({ error: 'Código inválido ou expirado', status: result.status }, { status: 400 })
  const response = NextResponse.json({ ok: true })
  response.cookies.set(PORTAL_COOKIE, result.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: PORTAL_SESSION_SECONDS, path: '/' })
  return response
}

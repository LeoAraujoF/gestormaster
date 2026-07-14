import { NextResponse } from 'next/server'
import { getClientIp } from '@/lib/rate-limit'
import { requestPortalCode } from '@/lib/client-portal-service'
import { isTrustedMutation } from '@/lib/client-portal-route'

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: 'Origem inválida' }, { status: 403 })
  const { slug } = await context.params
  const body = await request.json().catch(() => ({}))
  const result = await requestPortalCode(slug, String(body.phone || ''), getClientIp(request))
  return NextResponse.json(result, { status: 202, headers: { 'Cache-Control': 'no-store' } })
}

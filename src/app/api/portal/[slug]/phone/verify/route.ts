import { NextResponse } from 'next/server'
import { verifyPortalPhoneChange } from '@/lib/client-portal-service'
import { isTrustedMutation, requirePortalSession } from '@/lib/client-portal-route'

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: 'Origem inválida' }, { status: 403 })
  const { slug } = await context.params
  const session = await requirePortalSession(slug)
  if (!session) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  try {
    const result = await verifyPortalPhoneChange(session, String(body.verificationId || ''), String(body.code || ''))
    return result?.status === 'confirmed' ? NextResponse.json(result) : NextResponse.json(result, { status: 400 })
  } catch { return NextResponse.json({ error: 'Código inválido ou expirado' }, { status: 400 }) }
}

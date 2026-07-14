import { NextResponse } from 'next/server'
import { getPortalSettingsForManager, invitePortalClient } from '@/lib/client-portal-service'
import { getTrustedAppUrl } from '@/lib/access-control'
import { isTrustedMutation, requireManager } from '@/lib/client-portal-route'

export async function POST(request: Request) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: 'Origem inválida' }, { status: 403 })
  const manager = await requireManager()
  if (!manager) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['owner', 'admin'].includes(manager.role)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const body = await request.json()
  const state = await getPortalSettingsForManager(manager.organizationId)
  if (!state.entitled || !state.settings.enabled) return NextResponse.json({ error: 'Portal inativo' }, { status: 409 })
  try {
    await invitePortalClient(manager.organizationId, String(body.clientId || ''), `${getTrustedAppUrl()}/portal/${state.settings.slug}`)
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Não foi possível enviar o convite' }, { status: 409 }) }
}

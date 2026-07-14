import { NextResponse } from 'next/server'
import { getPortalSettingsForManager, savePortalSettings } from '@/lib/client-portal-service'
import { isTrustedMutation, requireManager } from '@/lib/client-portal-route'

export async function GET() {
  const manager = await requireManager()
  if (!manager) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  return NextResponse.json(await getPortalSettingsForManager(manager.organizationId), { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function PATCH(request: Request) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: 'Origem inválida' }, { status: 403 })
  const manager = await requireManager()
  if (!manager) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  try {
    return NextResponse.json(await savePortalSettings({ organizationId: manager.organizationId, userId: manager.user.id, role: manager.role, values: await request.json() }))
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INVALID'
    return NextResponse.json({ error: code }, { status: ['FORBIDDEN', 'UPGRADE_REQUIRED'].includes(code) ? 403 : 400 })
  }
}

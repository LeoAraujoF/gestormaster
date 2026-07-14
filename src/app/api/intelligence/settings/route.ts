import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOrganizationMembership } from '@/lib/access-control'
import { getIntelligenceDashboard, saveIntelligenceByok, updateIntelligenceSettings } from '@/lib/intelligence-service'
import { INTELLIGENCE_AGENTS } from '@/lib/intelligence-types'
import { getIpFromRequest, logAudit } from '@/lib/audit'

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  timezone: z.string().max(64).optional(),
  report_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  enabled_agents: z.array(z.enum(INTELLIGENCE_AGENTS)).min(1).max(5).optional(),
  use_byok_after_quota: z.boolean().optional(),
  api_key: z.string().max(300).optional(),
  remove_byok: z.boolean().optional(),
}).strict()

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const membership = await getOrganizationMembership(supabase, user.id)
  if (!membership) return NextResponse.json({ error: 'Organização não autorizada' }, { status: 403 })
  const dashboard = await getIntelligenceDashboard(membership.organizationId)
  if (!dashboard) return NextResponse.json({ error: 'Recurso exclusivo do plano Master', upgrade_required: true }, { status: 403 })
  return NextResponse.json({ settings: dashboard.settings, usage: dashboard.usage, can_manage: ['owner', 'admin'].includes(membership.role) })
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const membership = await getOrganizationMembership(supabase, user.id)
    if (!membership || !['owner', 'admin'].includes(membership.role)) return NextResponse.json({ error: 'Apenas owner ou admin pode configurar' }, { status: 403 })
    const access = await getIntelligenceDashboard(membership.organizationId)
    if (!access) return NextResponse.json({ error: 'Recurso exclusivo do plano Master', upgrade_required: true }, { status: 403 })
    const parsed = settingsSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'Configuração inválida' }, { status: 400 })
    const { api_key, remove_byok, ...settingsInput } = parsed.data
    if (api_key && remove_byok) return NextResponse.json({ error: 'Escolha cadastrar ou remover a chave' }, { status: 400 })
    if (api_key) await saveIntelligenceByok(membership.organizationId, user.id, api_key)
    if (remove_byok) await saveIntelligenceByok(membership.organizationId, user.id, null)
    if (Object.keys(settingsInput).length) await updateIntelligenceSettings(membership.organizationId, settingsInput)
    await logAudit({ organization_id: membership.organizationId, user_id: user.id, action: 'intelligence.settings.update', resource: 'intelligence_settings', details: { fields: Object.keys(parsed.data).filter((field) => field !== 'api_key'), byok_changed: Boolean(api_key || remove_byok) }, ip_address: getIpFromRequest(request) })
    const refreshed = await getIntelligenceDashboard(membership.organizationId)
    return NextResponse.json({ settings: refreshed?.settings, usage: refreshed?.usage })
  } catch (error: any) {
    const badRequest = ['INVALID_TIMEZONE', 'INVALID_TIME', 'INVALID_AGENTS', 'INVALID_API_KEY'].includes(error?.message)
    console.error('[intelligence/settings]', badRequest ? error?.message : error)
    return NextResponse.json({ error: badRequest ? 'Configuração inválida' : 'Falha ao salvar configurações' }, { status: badRequest ? 400 : 500 })
  }
}

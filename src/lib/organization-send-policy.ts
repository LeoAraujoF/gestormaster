import { DEFAULT_TIMEZONE, parseTimeToMinutes, safeTimeZone } from './contact-policy'
import { supabaseAdmin } from './supabase/service-role'

/**
 * Política de envio da organização: fuso e janela de horário permitido.
 *
 * Vem de `collection_settings`, que já guardava `send_window_start`/`_end` mas só
 * era consultado pelo agendador da cobrança inteligente — nada verificava a
 * janela na hora de entregar.
 *
 * O cache curto existe porque o worker consulta isto por mensagem; sem ele, uma
 * campanha grande viraria uma consulta extra por envio.
 */
const TTL_MS = Math.max(1_000, Number(process.env.ORGANIZATION_SEND_POLICY_TTL_MS) || 60_000)

const DEFAULT_WINDOW_START_MINUTE = 8 * 60
const DEFAULT_WINDOW_END_MINUTE = 20 * 60

export type OrganizationSendPolicy = {
  timeZone: string
  windowStartMinute: number
  windowEndMinute: number
}

const DEFAULT_POLICY: OrganizationSendPolicy = {
  timeZone: DEFAULT_TIMEZONE,
  windowStartMinute: DEFAULT_WINDOW_START_MINUTE,
  windowEndMinute: DEFAULT_WINDOW_END_MINUTE,
}

const cache = new Map<string, { policy: OrganizationSendPolicy; expiresAt: number }>()

export async function resolveOrganizationSendPolicy(
  organizationId: string | null | undefined,
): Promise<OrganizationSendPolicy> {
  if (!organizationId) return DEFAULT_POLICY

  const cached = cache.get(organizationId)
  if (cached && cached.expiresAt > Date.now()) return cached.policy

  const { data, error } = await supabaseAdmin
    .from('collection_settings')
    .select('timezone, send_window_start, send_window_end')
    .eq('organization_id', organizationId)
    .maybeSingle()

  // Uma falha de leitura não pode derrubar o envio: cai no padrão sem cachear,
  // para que a próxima tentativa volte a consultar.
  if (error) return DEFAULT_POLICY

  const policy: OrganizationSendPolicy = {
    timeZone: safeTimeZone(data?.timezone),
    windowStartMinute: parseTimeToMinutes(data?.send_window_start) ?? DEFAULT_WINDOW_START_MINUTE,
    windowEndMinute: parseTimeToMinutes(data?.send_window_end) ?? DEFAULT_WINDOW_END_MINUTE,
  }
  cache.set(organizationId, { policy, expiresAt: Date.now() + TTL_MS })
  return policy
}

export async function resolveOrganizationTimezone(organizationId: string | null | undefined): Promise<string> {
  return (await resolveOrganizationSendPolicy(organizationId)).timeZone
}

/** Usado nos testes e ao trocar as configurações de envio. */
export function forgetOrganizationSendPolicy(organizationId?: string) {
  if (organizationId) cache.delete(organizationId)
  else cache.clear()
}

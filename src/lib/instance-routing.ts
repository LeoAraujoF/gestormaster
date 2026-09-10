import 'server-only'

import { supabaseAdmin } from './supabase/service-role'

export type RoutableInstance = {
  id: string
  instance_name: string
  base_url: string | null
  api_key: string | null
  connection_mode: string | null
  min_delay: number | null
  max_delay: number | null
  sending_paused: boolean
  sending_pause_reason: string | null
  daily_message_limit: number | null
  message_min_interval_ms: number | null
  phone_number: string | null
  burst_message_count: number | null
  burst_pause_minutes: number | null
  organization_id?: string
  user_id?: string
}

export const ROUTABLE_INSTANCE_SELECT =
  'id, instance_name, base_url, api_key, connection_mode, min_delay, max_delay, sending_paused, sending_pause_reason, daily_message_limit, message_min_interval_ms, phone_number, burst_message_count, burst_pause_minutes, organization_id, user_id'

/**
 * Escolhe a instância que deve receber o envio agora: conectada, não pausada,
 * priorizando sempre a principal (`is_primary`).
 *
 * Nunca retorna duas — a mensagem sai por uma só. Quando `excludeInstanceId` é
 * informado (a instância que acabou de se mostrar indisponível), a busca
 * procura a próxima da mesma organização — é o que dá o "principal cai, a
 * secundária assume" sem nunca duplicar o envio.
 */
export async function pickUsableInstance(input: {
  organizationId?: string | null
  userId?: string | null
  excludeInstanceId?: string | null
}): Promise<RoutableInstance | null> {
  if (!input.organizationId && !input.userId) return null

  let query = supabaseAdmin
    .from('evolution_instances')
    .select(ROUTABLE_INSTANCE_SELECT)
    .eq('status', 'connected')
    .eq('sending_paused', false)
    .order('is_primary', { ascending: false })
    .limit(1)
  query = input.organizationId ? query.eq('organization_id', input.organizationId) : query.eq('user_id', input.userId!)
  if (input.excludeInstanceId) query = query.neq('id', input.excludeInstanceId)

  const { data } = await query.maybeSingle()
  return (data as RoutableInstance | null) ?? null
}

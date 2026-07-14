import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/service-role'

/**
 * Reserva um evento de webhook antes de executar efeitos financeiros. A tabela
 * tem uma chave única por provedor/evento e impede reentregas de duplicarem
 * créditos, planos ou comissões.
 */
export async function claimWebhookEvent(provider: string, eventId: string): Promise<boolean> {
  const { error } = await supabaseAdmin.from('webhook_events').insert({
    provider,
    event_id: eventId,
  })

  if (!error) return true
  if (error.code === '23505') return false
  throw new Error('Não foi possível registrar o evento de webhook')
}

/** Libera a reserva quando o processamento falha, para o provedor poder repetir. */
export async function releaseWebhookEvent(provider: string, eventId: string): Promise<void> {
  await supabaseAdmin
    .from('webhook_events')
    .delete()
    .eq('provider', provider)
    .eq('event_id', eventId)
}

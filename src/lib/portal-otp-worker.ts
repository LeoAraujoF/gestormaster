import { SecretsManager } from './encryption'
import { supabaseAdmin } from './supabase/service-role'
import { EvolutionWhatsAppProvider } from '../providers/whatsapp/EvolutionWhatsAppProvider'

type OtpKind = 'portal-login' | 'portal-phone'

async function connectedInstance(organizationId: string) {
  const { data } = await supabaseAdmin.from('evolution_instances')
    .select('instance_name, base_url, api_key, connection_mode, is_primary')
    .eq('organization_id', organizationId).eq('status', 'connected').eq('is_primary', true)
    .limit(1).maybeSingle()
  if (!data) throw new Error('PORTAL_EVOLUTION_UNAVAILABLE')
  return data
}

async function send(organizationId: string, phone: string, code: string, kind: OtpKind) {
  const instance = await connectedInstance(organizationId)
  const integrated = instance.connection_mode === 'integrated'
  const url = integrated ? process.env.EVOLUTION_API_URL : instance.base_url
  const key = integrated ? process.env.EVOLUTION_API_KEY : (instance.api_key ? SecretsManager.decrypt(instance.api_key) : '')
  if (!url || !key) throw new Error('PORTAL_EVOLUTION_CREDENTIALS_MISSING')
  const provider = new EvolutionWhatsAppProvider(url, key)
  const message = kind === 'portal-login'
    ? `Seu código de acesso ao portal é *${code}*. Ele expira em 10 minutos. Não compartilhe este código.`
    : `Seu código para confirmar o novo telefone é *${code}*. Ele expira em 10 minutos. Não compartilhe este código.`
  await provider.sendMessage(instance.instance_name, phone.replace(/\D/g, ''), message)
}

export async function processPortalOtpJob(data: Record<string, unknown>): Promise<boolean> {
  const challengeId = typeof data.portalChallengeId === 'string' ? data.portalChallengeId : null
  const verificationId = typeof data.portalPhoneVerificationId === 'string' ? data.portalPhoneVerificationId : null
  if (!challengeId && !verificationId) return false

  const table = challengeId ? 'client_portal_auth_challenges' : 'phone_change_verifications'
  const id = challengeId || verificationId!
  const query = challengeId
    ? supabaseAdmin.from('client_portal_auth_challenges').select('id, organization_id, phone_e164, code_ciphertext, send_status, expires_at, consumed_at').eq('id', id).maybeSingle()
    : supabaseAdmin.from('phone_change_verifications').select('id, organization_id, new_phone_e164, code_ciphertext, send_status, expires_at, used_at').eq('id', id).maybeSingle()
  const { data: row, error } = await query
  if (error || !row) throw new Error('PORTAL_OTP_NOT_FOUND')
  if (row.send_status === 'sent' || ('used_at' in row && row.used_at) || ('consumed_at' in row && row.consumed_at) || new Date(row.expires_at) <= new Date()) return true
  if (!row.code_ciphertext) throw new Error('PORTAL_OTP_CIPHERTEXT_MISSING')

  try {
    const phone = 'phone_e164' in row ? row.phone_e164 : row.new_phone_e164
    await send(row.organization_id, phone, SecretsManager.decrypt(row.code_ciphertext), challengeId ? 'portal-login' : 'portal-phone')
    await supabaseAdmin.from(table).update({ send_status: 'sent', sent_at: new Date().toISOString(), code_ciphertext: null, error_code: null }).eq('id', id)
  } catch (error) {
    await supabaseAdmin.from(table).update({ send_status: 'failed', error_code: error instanceof Error ? error.message.slice(0, 120) : 'SEND_FAILED' }).eq('id', id)
    throw error
  }
  return true
}

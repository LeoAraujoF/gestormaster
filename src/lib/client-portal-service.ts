import 'server-only'

import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { organizationHasCapability } from '@/lib/plan-catalog'
import { messageQueue } from '@/lib/queue'
import { rateLimit } from '@/lib/rate-limit'
import { normalizeBrazilPhone, parseDueDate } from '@/lib/autoatendimento'
import { createMercadoPagoPixCharge } from '@/lib/pix-charges'
import { SecretsManager } from '@/lib/encryption'
import { generatePortalCode, generatePortalToken, hashPortalCode, maskPhone, normalizePortalSlug, portalHash } from '@/lib/client-portal-crypto'
import { logAudit } from '@/lib/audit'

export const PORTAL_COOKIE = 'gm_portal_session'
export const PORTAL_SESSION_SECONDS = 7 * 24 * 60 * 60
const OTP_SECONDS = 10 * 60

type PortalSettingsRow = {
  display_name: string
  logo_url: string | null
  primary_color: string
  allow_renewal: boolean
  allow_due_date_request: boolean
  allow_phone_change: boolean
  allow_support_request: boolean
}

type PortalClientRow = {
  id: string
  name: string
  status: string
  due_date: string | null
  plan_value: number | string | null
  phone_e164: string | null
  user_id: string | null
}

export type PortalSession = {
  id: string
  organizationId: string
  clientId: string
  slug: string
  settings: PortalSettingsRow
  client: PortalClientRow
}

export async function portalEntitled(organizationId: string) {
  return organizationHasCapability(organizationId, 'client_portal')
}

export async function getPortalSettingsForManager(organizationId: string) {
  const [{ data: org }, { data: settings }, entitled, { data: instance }, { data: mercadoPago }] = await Promise.all([
    supabaseAdmin.from('organizations').select('id, name').eq('id', organizationId).single(),
    supabaseAdmin.from('client_portal_settings').select('*').eq('organization_id', organizationId).maybeSingle(),
    portalEntitled(organizationId),
    supabaseAdmin.from('evolution_instances').select('id').eq('organization_id', organizationId).eq('status', 'connected').eq('is_primary', true).limit(1).maybeSingle(),
    supabaseAdmin.from('integrations').select('id').eq('organization_id', organizationId).eq('provider', 'mercadopago').eq('is_active', true).limit(1).maybeSingle(),
  ])
  const base = normalizePortalSlug(org?.name || 'portal') || 'portal'
  const proposedSlug = `${base.slice(0, 38)}-${organizationId.slice(0, 6)}`
  const { data: clients } = await supabaseAdmin.from('clients').select('id, name, phone_e164').eq('organization_id', organizationId).order('name').limit(500)
  return {
    entitled,
    settings: settings || {
      organization_id: organizationId, enabled: false, slug: proposedSlug, display_name: org?.name || 'Portal do Cliente',
      logo_url: null, primary_color: '#111827', allow_renewal: true, allow_due_date_request: true,
      allow_phone_change: true, allow_support_request: true,
    },
    blockers: { evolution: !instance, mercado_pago: !mercadoPago },
    clients: (clients || []).map((client) => ({ id: client.id, name: client.name, phone: maskPhone(client.phone_e164), canInvite: Boolean(client.phone_e164) })),
  }
}

export async function savePortalSettings(input: {
  organizationId: string; userId: string; role: string; values: Record<string, unknown>
}) {
  if (!['owner', 'admin'].includes(input.role)) throw new Error('FORBIDDEN')
  if (!(await portalEntitled(input.organizationId))) throw new Error('UPGRADE_REQUIRED')
  const current = await getPortalSettingsForManager(input.organizationId)
  const slug = normalizePortalSlug(String(input.values.slug || current.settings.slug))
  if (!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(slug)) throw new Error('SLUG_INVALID')
  const displayName = String(input.values.display_name || current.settings.display_name).trim().slice(0, 80)
  if (!displayName) throw new Error('DISPLAY_NAME_INVALID')
  const logoUrl = input.values.logo_url ? String(input.values.logo_url).trim() : null
  if (logoUrl && (!logoUrl.startsWith('https://') || logoUrl.length > 500)) throw new Error('LOGO_INVALID')
  const color = String(input.values.primary_color || current.settings.primary_color)
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('COLOR_INVALID')
  const enabled = input.values.enabled === true
  if (enabled && current.blockers.evolution) throw new Error('EVOLUTION_REQUIRED')
  const row = {
    organization_id: input.organizationId, slug, display_name: displayName, logo_url: logoUrl, primary_color: color,
    enabled, allow_renewal: input.values.allow_renewal !== false,
    allow_due_date_request: input.values.allow_due_date_request !== false,
    allow_phone_change: input.values.allow_phone_change !== false,
    allow_support_request: input.values.allow_support_request !== false,
    updated_by: input.userId, updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabaseAdmin.from('client_portal_settings').upsert(row, { onConflict: 'organization_id' }).select('*').single()
  if (error) throw new Error(error.code === '23505' ? 'SLUG_TAKEN' : error.message)
  await logAudit({ organization_id: input.organizationId, user_id: input.userId, action: 'client_portal.settings.updated', resource: 'client_portal_settings', resource_id: input.organizationId, details: { enabled, slug, features: { renewal: row.allow_renewal, due_date: row.allow_due_date_request, phone: row.allow_phone_change, support: row.allow_support_request } } })
  return data
}

export async function getPublicPortalBrand(slug: string) {
  const { data } = await supabaseAdmin.from('client_portal_settings')
    .select('organization_id, slug, display_name, logo_url, primary_color')
    .eq('slug', slug).eq('enabled', true).maybeSingle()
  if (!data || !(await portalEntitled(data.organization_id))) return null
  return data
}

export async function requestPortalCode(slug: string, rawPhone: string, ip: string) {
  const opaqueChallengeId = randomUUID()
  const generic = { accepted: true, challengeId: opaqueChallengeId, message: 'Se o telefone estiver cadastrado, o código será enviado pelo WhatsApp.' }
  const phone = normalizeBrazilPhone(rawPhone)
  const ipHash = portalHash(ip)
  const [ipLimit, phoneLimit] = await Promise.all([
    rateLimit(`portal:otp:ip:${ipHash}`, 10, 3600, { failOpen: false }),
    rateLimit(`portal:otp:phone:${portalHash(phone || rawPhone)}`, 5, 3600, { failOpen: false }),
  ])
  if (!ipLimit.ok || !phoneLimit.ok || !phone) return generic
  const brand = await getPublicPortalBrand(slug)
  if (!brand) return generic
  const { data: client } = await supabaseAdmin.from('clients').select('id').eq('organization_id', brand.organization_id).eq('phone_e164', phone).maybeSingle()
  if (!client) return generic
  const { data: recent } = await supabaseAdmin.from('client_portal_auth_challenges').select('created_at')
    .eq('organization_id', brand.organization_id).eq('phone_e164', phone).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (recent && Date.now() - new Date(recent.created_at).valueOf() < 60_000) return generic

  const id = randomUUID()
  const code = generatePortalCode()
  const { error } = await supabaseAdmin.from('client_portal_auth_challenges').insert({
    id, organization_id: brand.organization_id, client_id: client.id, phone_e164: phone,
    code_hash: hashPortalCode(id, code), code_ciphertext: SecretsManager.encrypt(code), requested_ip_hash: ipHash,
    expires_at: new Date(Date.now() + OTP_SECONDS * 1000).toISOString(),
  })
  if (error) return generic
  try {
    await messageQueue.add('send-portal-login-code', { portalChallengeId: id }, { jobId: `portal-login-${id}` })
  } catch {
    await supabaseAdmin.from('client_portal_auth_challenges').update({ send_status: 'failed', error_code: 'QUEUE_UNAVAILABLE' }).eq('id', id)
  }
  return { ...generic, challengeId: id }
}

export async function verifyPortalCode(slug: string, challengeId: string, code: string, ip: string, userAgent: string) {
  const brand = await getPublicPortalBrand(slug)
  if (!brand || !/^\d{6}$/.test(code)) return { status: 'invalid' as const }
  const limited = await rateLimit(`portal:verify:${portalHash(`${ip}:${challengeId}`)}`, 8, 600, { failOpen: false })
  if (!limited.ok) return { status: 'locked' as const }
  const { data, error } = await supabaseAdmin.rpc('consume_client_portal_challenge', {
    p_challenge_id: challengeId, p_code_hash: hashPortalCode(challengeId, code),
  })
  if (error || data?.status !== 'confirmed' || data.organization_id !== brand.organization_id) return { status: data?.status || 'invalid' }
  const token = generatePortalToken()
  const { error: sessionError } = await supabaseAdmin.from('client_portal_sessions').insert({
    organization_id: data.organization_id, client_id: data.client_id, token_hash: portalHash(token),
    ip_hash: portalHash(ip), user_agent_hash: portalHash(userAgent || 'unknown'),
    expires_at: new Date(Date.now() + PORTAL_SESSION_SECONDS * 1000).toISOString(),
  })
  if (sessionError) throw new Error('SESSION_CREATE_FAILED')
  return { status: 'confirmed' as const, token }
}

export async function resolvePortalSession(slug: string, token?: string | null, userAgent?: string | null): Promise<PortalSession | null> {
  if (!token) return null
  const { data: session } = await supabaseAdmin.from('client_portal_sessions')
    .select('id, organization_id, client_id, expires_at, revoked_at, last_seen_at, user_agent_hash')
    .eq('token_hash', portalHash(token)).is('revoked_at', null).gt('expires_at', new Date().toISOString()).maybeSingle()
  if (!session) return null
  if (session.user_agent_hash && userAgent && session.user_agent_hash !== portalHash(userAgent)) return null
  const [{ data: settings }, { data: client }, entitled] = await Promise.all([
    supabaseAdmin.from('client_portal_settings').select('*').eq('organization_id', session.organization_id).eq('slug', slug).eq('enabled', true).maybeSingle(),
    supabaseAdmin.from('clients').select('id, name, status, due_date, plan_value, phone_e164, user_id').eq('organization_id', session.organization_id).eq('id', session.client_id).maybeSingle(),
    portalEntitled(session.organization_id),
  ])
  if (!settings || !client || !entitled) return null
  if (Date.now() - new Date(session.last_seen_at).valueOf() > 60 * 60 * 1000) {
    void supabaseAdmin.from('client_portal_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', session.id)
  }
  return { id: session.id, organizationId: session.organization_id, clientId: session.client_id, slug, settings: settings as PortalSettingsRow, client: client as PortalClientRow }
}

export async function revokePortalSession(sessionId: string) {
  await supabaseAdmin.from('client_portal_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', sessionId)
}

export async function getPortalDashboard(session: PortalSession) {
  const now = new Date().toISOString()
  const [{ data: services }, { data: charges }, { data: payments }] = await Promise.all([
    supabaseAdmin.from('client_services').select('services(name)').eq('client_id', session.clientId),
    supabaseAdmin.from('pix_charges').select('id, status, amount, description, copia_e_cola, qr_code_base64, ticket_url, expires_at, paid_at, payment_id, created_at').eq('organization_id', session.organizationId).eq('client_id', session.clientId).order('created_at', { ascending: false }).limit(100),
    supabaseAdmin.from('payments').select('id, amount_paid, payment_method, provider, paid_at, created_at').eq('organization_id', session.organizationId).eq('client_id', session.clientId).order('created_at', { ascending: false }).limit(100),
  ])
  const paidPaymentIds = new Set((charges || []).map((charge) => charge.payment_id).filter(Boolean))
  const history = [
    ...(charges || []).filter((charge) => charge.status === 'paid').map((charge) => ({ id: charge.id, source: 'pix', amount: charge.amount, paidAt: charge.paid_at, method: 'pix', chargeId: charge.id })),
    ...(payments || []).filter((payment) => !paidPaymentIds.has(payment.id)).map((payment) => ({ id: payment.id, source: 'legacy', amount: payment.amount_paid, paidAt: payment.paid_at || payment.created_at, method: payment.payment_method || 'legacy', chargeId: null })),
  ].sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)))
  const pendingPix = (charges || []).find((charge) => charge.status === 'pending' && (!charge.expires_at || charge.expires_at > now)) || null
  const serviceRows = (services || []) as Array<{ services: Array<{ name: string }> }>
  return {
    brand: { name: session.settings.display_name, slug: session.slug, logoUrl: session.settings.logo_url, color: session.settings.primary_color },
    client: { name: session.client.name, status: session.client.status, dueDate: session.client.due_date, amount: Number(session.client.plan_value || 0), phone: maskPhone(session.client.phone_e164), services: serviceRows.flatMap((item) => item.services.map((service) => service.name)).filter(Boolean) },
    features: { renewal: session.settings.allow_renewal, dueDate: session.settings.allow_due_date_request, phone: session.settings.allow_phone_change, support: session.settings.allow_support_request },
    pendingPix, history,
  }
}

export async function renewFromPortal(session: PortalSession) {
  if (!session.settings.allow_renewal) throw new Error('FEATURE_DISABLED')
  const now = new Date().toISOString()
  await supabaseAdmin.from('pix_charges').update({ status: 'expired' })
    .eq('organization_id', session.organizationId).eq('client_id', session.clientId)
    .eq('status', 'pending').eq('purpose', 'renewal').lte('expires_at', now)
  const { data: pending } = await supabaseAdmin.from('pix_charges').select('*')
    .eq('organization_id', session.organizationId).eq('client_id', session.clientId).eq('status', 'pending')
    .gt('expires_at', now).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (pending) return pending
  const amount = Number(session.client.plan_value || 0)
  if (amount <= 0) throw new Error('PLAN_REQUIRED')
  const { data: instance } = await supabaseAdmin.from('evolution_instances').select('instance_name')
    .eq('organization_id', session.organizationId).eq('status', 'connected').eq('is_primary', true).limit(1).maybeSingle()
  if (!instance) throw new Error('EVOLUTION_REQUIRED')
  let billingUserId = session.client.user_id
  if (!billingUserId) {
    const { data: organization } = await supabaseAdmin.from('organizations').select('owner_id').eq('id', session.organizationId).maybeSingle()
    billingUserId = organization?.owner_id || null
  }
  if (!billingUserId) throw new Error('ORGANIZATION_OWNER_REQUIRED')
  const billingPhone = session.client.phone_e164
  if (!billingPhone) throw new Error('PHONE_REQUIRED')
  try {
    return await createMercadoPagoPixCharge({ organizationId: session.organizationId, userId: billingUserId,
      clientId: session.clientId, amount, phone: billingPhone, instanceName: instance.instance_name,
      planName: 'Plano atual', purpose: 'renewal', months: 1 })
  } catch (error) {
    const { data: concurrent } = await supabaseAdmin.from('pix_charges').select('*')
      .eq('organization_id', session.organizationId).eq('client_id', session.clientId)
      .eq('status', 'pending').eq('purpose', 'renewal').gt('expires_at', now).limit(1).maybeSingle()
    if (concurrent) return concurrent
    throw error
  }
}

export async function createPortalRequest(session: PortalSession, type: 'due_date' | 'human_support', dueDate?: string) {
  const allowed = type === 'due_date' ? session.settings.allow_due_date_request : session.settings.allow_support_request
  if (!allowed) throw new Error('FEATURE_DISABLED')
  if (type === 'due_date' && (!dueDate || !parseDueDate(dueDate.split('-').reverse().join('/')))) throw new Error('DUE_DATE_INVALID')
  const { data: existing } = await supabaseAdmin.from('client_change_requests').select('id').eq('organization_id', session.organizationId)
    .eq('client_id', session.clientId).eq('request_type', type).eq('status', 'pending').limit(1).maybeSingle()
  if (existing) return existing
  const { data, error } = await supabaseAdmin.from('client_change_requests').insert({
    organization_id: session.organizationId, client_id: session.clientId, request_type: type,
    requested_due_date: type === 'due_date' ? dueDate : null, requested_from_phone: session.client.phone_e164,
  }).select('id, status, created_at').single()
  if (error) throw new Error(error.message)
  await logAudit({ organization_id: session.organizationId, action: `client_portal.request.${type}`, resource: 'client_change_requests', resource_id: data.id, details: { client_id: session.clientId, requested_due_date: type === 'due_date' ? dueDate : null } })
  return data
}

export async function requestPortalPhoneChange(session: PortalSession, rawPhone: string) {
  if (!session.settings.allow_phone_change) throw new Error('FEATURE_DISABLED')
  const phone = normalizeBrazilPhone(rawPhone)
  if (!phone) throw new Error('PHONE_INVALID')
  const limit = await rateLimit(`portal:phone-change:${session.organizationId}:${session.clientId}`, 5, 3600, { failOpen: false })
  if (!limit.ok) throw new Error('RATE_LIMITED')
  const { data: conflict } = await supabaseAdmin.from('clients').select('id').eq('organization_id', session.organizationId).eq('phone_e164', phone).neq('id', session.clientId).maybeSingle()
  if (conflict) throw new Error('PHONE_IN_USE')
  const id = randomUUID(), code = generatePortalCode()
  const { error } = await supabaseAdmin.from('phone_change_verifications').insert({ id, organization_id: session.organizationId,
    client_id: session.clientId, new_phone_e164: phone, code_hash: hashPortalCode(id, code), code_ciphertext: SecretsManager.encrypt(code),
    send_status: 'pending', requested_via: 'portal', expires_at: new Date(Date.now() + OTP_SECONDS * 1000).toISOString() })
  if (error) throw new Error(error.message)
  try { await messageQueue.add('send-portal-phone-code', { portalPhoneVerificationId: id }, { jobId: `portal-phone-${id}` }) }
  catch { await supabaseAdmin.from('phone_change_verifications').update({ send_status: 'failed', error_code: 'QUEUE_UNAVAILABLE' }).eq('id', id); throw new Error('QUEUE_UNAVAILABLE') }
  return { verificationId: id }
}

export async function verifyPortalPhoneChange(session: PortalSession, verificationId: string, code: string) {
  const { data: verification } = await supabaseAdmin.from('phone_change_verifications').select('organization_id, client_id').eq('id', verificationId).maybeSingle()
  if (!verification || verification.organization_id !== session.organizationId || verification.client_id !== session.clientId) throw new Error('VERIFICATION_INVALID')
  const { data, error } = await supabaseAdmin.rpc('complete_phone_change', { p_verification_id: verificationId, p_code_hash: hashPortalCode(verificationId, code) })
  if (error) throw new Error('VERIFICATION_FAILED')
  return data
}

export async function invitePortalClient(organizationId: string, clientId: string, link: string) {
  const [{ data: client }, { data: instance }] = await Promise.all([
    supabaseAdmin.from('clients').select('id, user_id, phone_e164').eq('organization_id', organizationId).eq('id', clientId).maybeSingle(),
    supabaseAdmin.from('evolution_instances').select('instance_name').eq('organization_id', organizationId).eq('status', 'connected').eq('is_primary', true).limit(1).maybeSingle(),
  ])
  if (!client?.phone_e164 || !instance) throw new Error('INVITE_BLOCKED')
  await messageQueue.add('send-message', { organizationId, userId: client.user_id, clientId, instanceName: instance.instance_name,
    phone: client.phone_e164, message: `Acesse seu Portal do Cliente com segurança: ${link}` })
}

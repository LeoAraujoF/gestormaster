import { supabaseAdmin } from '@/lib/supabase/service-role'
import { messageQueue } from '@/lib/queue'
import { getTrustedAppUrl } from '@/lib/access-control'
import { recordApprovedCollectionPayment } from '@/lib/intelligent-collections'

export type PixChargePurpose = 'manual' | 'renewal' | 'charge'
export type PixChargeStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'failed'

export interface PixCharge {
  id: string
  organization_id: string
  user_id: string
  client_id: string | null
  provider: string
  provider_payment_id: string | null
  purpose: PixChargePurpose
  status: PixChargeStatus
  amount: number
  description: string | null
  phone: string | null
  instance_name: string | null
  months_to_renew: number
  plan_name: string | null
  copia_e_cola: string | null
  qr_code_base64: string | null
  ticket_url: string | null
  external_reference: string | null
  expires_at: string | null
  paid_at: string | null
  payment_id: string | null
  processed_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface CreatePixChargeInput {
  organization_id: string
  user_id: string
  client_id?: string | null
  amount: number
  description?: string | null
  phone?: string | null
  instance_name?: string | null
  purpose?: PixChargePurpose
  months_to_renew?: number
  plan_name?: string | null
  expires_at?: string | null
  metadata?: Record<string, unknown>
}

export function computeNewDueDate(currentDueDate: string, months: number): string {
  const originalDueDate = new Date(`${currentDueDate}T12:00:00`)
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const renewalBase = originalDueDate < today ? today : originalDueDate
  const next = new Date(renewalBase)
  next.setMonth(next.getMonth() + months)
  return next.toISOString().split('T')[0]
}

export function formatBRL(amount: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount)
}

/** Monta external_reference legível + parseável para o webhook. */
export function buildExternalReference(parts: {
  organizationId: string
  instanceName: string
  phone: string
  purpose: PixChargePurpose
  clientId?: string | null
  planName?: string | null
  months?: number
  chargeId: string
}): string {
  const purposeTag = parts.purpose === 'renewal' ? 'RENEWAL' : parts.purpose.toUpperCase()
  return [
    parts.organizationId,
    parts.instanceName,
    parts.phone,
    purposeTag,
    parts.clientId || '',
    parts.planName || '',
    String(parts.months ?? 1),
    parts.chargeId,
  ].join('|')
}

export function parseExternalReference(extRef: string | null | undefined): {
  organizationId: string
  instanceName: string
  phone: string
  purpose: PixChargePurpose
  clientId: string | null
  planName: string | null
  months: number
  chargeId: string | null
} | null {
  if (!extRef || !extRef.includes('|')) return null
  const parts = extRef.split('|')
  const tag = (parts[3] || 'MANUAL').toUpperCase()
  let purpose: PixChargePurpose = 'manual'
  if (tag === 'RENEWAL') purpose = 'renewal'
  else if (tag === 'CHARGE') purpose = 'charge'

  return {
    organizationId: parts[0],
    instanceName: parts[1] || '',
    phone: parts[2] || '',
    purpose,
    clientId: parts[4] || null,
    planName: parts[5] || null,
    months: Math.max(1, parseInt(parts[6] || '1', 10) || 1),
    chargeId: parts[7] || null,
  }
}

export async function createPixChargeDraft(input: CreatePixChargeInput): Promise<PixCharge> {
  const { data, error } = await supabaseAdmin
    .from('pix_charges')
    .insert({
      organization_id: input.organization_id,
      user_id: input.user_id,
      client_id: input.client_id || null,
      amount: input.amount,
      description: input.description || null,
      phone: input.phone || null,
      instance_name: input.instance_name || null,
      purpose: input.purpose || 'manual',
      months_to_renew: input.months_to_renew ?? 1,
      plan_name: input.plan_name || null,
      expires_at: input.expires_at || null,
      status: 'pending',
      metadata: input.metadata || {},
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Falha ao criar cobrança PIX')
  }
  return data as PixCharge
}

export async function attachProviderPayment(
  chargeId: string,
  payload: {
    provider_payment_id: string
    copia_e_cola?: string | null
    qr_code_base64?: string | null
    ticket_url?: string | null
    external_reference?: string | null
    expires_at?: string | null
  }
): Promise<PixCharge> {
  const { data, error } = await supabaseAdmin
    .from('pix_charges')
    .update({
      provider_payment_id: payload.provider_payment_id,
      copia_e_cola: payload.copia_e_cola || null,
      qr_code_base64: payload.qr_code_base64 || null,
      ticket_url: payload.ticket_url || null,
      external_reference: payload.external_reference || null,
      expires_at: payload.expires_at || null,
    })
    .eq('id', chargeId)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Falha ao vincular pagamento ao PIX')
  }
  return data as PixCharge
}

export async function markChargeFailed(chargeId: string, reason: string): Promise<void> {
  await supabaseAdmin
    .from('pix_charges')
    .update({
      status: 'failed',
      metadata: { failure_reason: reason },
    })
    .eq('id', chargeId)
}

export interface CreateMercadoPagoPixChargeInput {
  organizationId: string
  userId: string
  clientId?: string | null
  amount: number
  phone: string
  instanceName: string
  months?: number
  planName?: string | null
  purpose?: PixChargePurpose
  description?: string
  expiresMinutes?: number
}

/** Único caminho para criar PIX Mercado Pago, usado pela API e pelo bot. */
export async function createMercadoPagoPixCharge(input: CreateMercadoPagoPixChargeInput): Promise<PixCharge> {
  const expiresMinutes = Math.max(5, Math.min(60 * 24 * 7, input.expiresMinutes || 60 * 24))
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000)
  const { data: integration } = await supabaseAdmin
    .from('integrations')
    .select('credentials')
    .eq('organization_id', input.organizationId)
    .eq('provider', 'mercadopago')
    .eq('is_active', true)
    .maybeSingle()

  const accessToken = integration?.credentials?.access_token as string | undefined
  if (!accessToken) throw new Error('Integração Mercado Pago não encontrada ou inativa')

  const charge = await createPixChargeDraft({
    organization_id: input.organizationId,
    user_id: input.userId,
    client_id: input.clientId || null,
    amount: input.amount,
    description: input.description || (input.purpose === 'renewal' ? `Renovação — ${input.planName || 'Plano'}` : 'Pagamento via PIX'),
    phone: input.phone,
    instance_name: input.instanceName,
    purpose: input.purpose || 'renewal',
    months_to_renew: input.months || 1,
    plan_name: input.planName || null,
    expires_at: expiresAt.toISOString(),
  })

  const externalReference = buildExternalReference({
    organizationId: input.organizationId,
    instanceName: input.instanceName,
    phone: input.phone,
    purpose: input.purpose || 'renewal',
    clientId: input.clientId || null,
    planName: input.planName || null,
    months: input.months || 1,
    chargeId: charge.id,
  })

  try {
    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-Idempotency-Key': charge.id,
      },
      body: JSON.stringify({
        transaction_amount: input.amount,
        description: charge.description,
        payment_method_id: 'pix',
        date_of_expiration: expiresAt.toISOString(),
        external_reference: externalReference,
        notification_url: `${getTrustedAppUrl()}/api/webhooks/mercadopago?orgId=${input.organizationId}`,
        metadata: { charge_id: charge.id },
      }),
    })
    const payment = await response.json()
    if (!response.ok || !payment.id) {
      const reason = typeof payment?.message === 'string' ? `: ${payment.message}` : ''
      throw new Error(`Mercado Pago recusou a criação da cobrança${reason}`)
    }

    return attachProviderPayment(charge.id, {
      provider_payment_id: String(payment.id),
      copia_e_cola: payment.point_of_interaction?.transaction_data?.qr_code || null,
      qr_code_base64: payment.point_of_interaction?.transaction_data?.qr_code_base64 || null,
      ticket_url: payment.point_of_interaction?.transaction_data?.ticket_url || null,
      external_reference: externalReference,
      expires_at: payment.date_of_expiration || expiresAt.toISOString(),
    })
  } catch (error) {
    await markChargeFailed(charge.id, 'provider_creation_failed')
    throw error
  }
}

interface ProcessApprovedPaymentInput {
  organizationId: string
  providerPaymentId: string
  amount: number
  externalReference?: string | null
  rawStatus?: string
  ipAddress?: string | null
}

export interface ProcessApprovedPaymentResult {
  alreadyProcessed: boolean
  charge: PixCharge | null
  renewed: boolean
  newDueDate: string | null
  paymentId: string | null
}

/**
 * Confirma pagamento PIX de forma idempotente:
 * 1) localiza/cria charge
 * 2) renova cliente se for renewal
 * 3) registra payments
 * 4) notifica cliente e dono
 */
export async function processApprovedPixPayment(input: ProcessApprovedPaymentInput): Promise<ProcessApprovedPaymentResult> {
  const parsed = parseExternalReference(input.externalReference)
  if (!parsed?.chargeId || parsed.organizationId !== input.organizationId) {
    throw new Error('Referência externa da cobrança é inválida')
  }

  const { data: charge, error: chargeError } = await supabaseAdmin
    .from('pix_charges')
    .select('*')
    .eq('id', parsed.chargeId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()
  if (chargeError || !charge) throw new Error('Cobrança local não encontrada')

  const typedCharge = charge as PixCharge
  if (typedCharge.provider_payment_id && typedCharge.provider_payment_id !== input.providerPaymentId) {
    throw new Error('Pagamento não pertence à cobrança local')
  }
  if (Math.round(typedCharge.amount * 100) !== Math.round(input.amount * 100)) {
    throw new Error('Valor aprovado diverge da cobrança local')
  }

  const { data: cycleClient } = typedCharge.client_id
    ? await supabaseAdmin.from('clients').select('due_date').eq('id', typedCharge.client_id).eq('organization_id', input.organizationId).maybeSingle()
    : { data: null }

  const { data: finalized, error: finalizeError } = await supabaseAdmin.rpc('finalize_pix_charge', {
    p_charge_id: typedCharge.id,
    p_provider_payment_id: input.providerPaymentId,
    p_amount: input.amount,
  })
  if (finalizeError || !finalized) throw new Error('Falha ao finalizar cobrança PIX')

  const result = finalized as { already_processed: boolean; payment_id?: string | null; new_due_date?: string | null }
  const { data: updated } = await supabaseAdmin.from('pix_charges').select('*').eq('id', typedCharge.id).single()
  const finalCharge = (updated || typedCharge) as PixCharge
  const renewed = Boolean(finalCharge.client_id && ['renewal', 'charge'].includes(finalCharge.purpose))

  if (!result.already_processed && renewed) {
    await recordApprovedCollectionPayment({
      organizationId: finalCharge.organization_id,
      clientId: finalCharge.client_id,
      dueDate: cycleClient?.due_date || null,
      amount: finalCharge.amount,
      pixChargeId: finalCharge.id,
      paymentId: result.payment_id || finalCharge.payment_id,
      paidAt: finalCharge.paid_at || undefined,
    })
  }

  if (!result.already_processed && finalCharge.instance_name && finalCharge.phone) {
    const dueLine = result.new_due_date
      ? `\n📅 Novo vencimento: *${new Date(`${result.new_due_date}T12:00:00`).toLocaleDateString('pt-BR')}*`
      : ''
    await messageQueue.add('send-message', {
      organization_id: finalCharge.organization_id,
      userId: finalCharge.user_id,
      instance_name: finalCharge.instance_name,
      phone: finalCharge.phone,
      message: `✅ *Pagamento confirmado!*\n\nRecebemos ${formatBRL(finalCharge.amount)}.${dueLine}`,
      source: 'mercadopago_webhook',
    })
  }

  return {
    alreadyProcessed: Boolean(result.already_processed),
    charge: finalCharge,
    renewed,
    newDueDate: result.new_due_date || null,
    paymentId: result.payment_id || finalCharge.payment_id,
  }
}

/** Revisa cobranças pendentes para recuperar notificações perdidas do gateway. */
export async function reconcilePendingPixCharges(limit = 100): Promise<{ checked: number; finalized: number }> {
  const now = new Date().toISOString()
  await supabaseAdmin.from('pix_charges').update({ status: 'expired' }).eq('status', 'pending').lt('expires_at', now)

  const { data: charges, error } = await supabaseAdmin
    .from('pix_charges')
    .select('id, organization_id, provider_payment_id')
    .eq('provider', 'mercadopago')
    .eq('status', 'pending')
    .not('provider_payment_id', 'is', null)
    .gte('expires_at', now)
    .limit(limit)
  if (error) throw new Error('Falha ao listar cobranças pendentes')

  let finalized = 0
  for (const charge of charges || []) {
    const { data: integration } = await supabaseAdmin
      .from('integrations')
      .select('credentials')
      .eq('organization_id', charge.organization_id)
      .eq('provider', 'mercadopago')
      .eq('is_active', true)
      .maybeSingle()
    const token = integration?.credentials?.access_token as string | undefined
    if (!token) continue

    const response = await fetch(`https://api.mercadopago.com/v1/payments/${charge.provider_payment_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) continue
    const payment = await response.json()
    if (payment.status === 'approved') {
      const result = await processApprovedPixPayment({
        organizationId: charge.organization_id,
        providerPaymentId: String(charge.provider_payment_id),
        amount: Number(payment.transaction_amount),
        externalReference: payment.external_reference || null,
      })
      if (!result.alreadyProcessed) finalized++
    } else if (['cancelled', 'rejected', 'expired'].includes(payment.status)) {
      await supabaseAdmin
        .from('pix_charges')
        .update({ status: payment.status === 'rejected' ? 'failed' : payment.status })
        .eq('id', charge.id)
        .eq('status', 'pending')
    }
  }
  return { checked: charges?.length || 0, finalized }
}

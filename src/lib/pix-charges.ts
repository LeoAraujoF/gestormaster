import { supabaseAdmin } from '@/lib/supabase/service-role'
import { messageQueue } from '@/lib/queue'
import { logAudit } from '@/lib/audit'

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
export async function processApprovedPixPayment(
  input: ProcessApprovedPaymentInput
): Promise<ProcessApprovedPaymentResult> {
  const provider = 'mercadopago'
  const parsed = parseExternalReference(input.externalReference)

  // 1. Buscar charge existente
  let charge: PixCharge | null = null

  const { data: byProvider } = await supabaseAdmin
    .from('pix_charges')
    .select('*')
    .eq('provider', provider)
    .eq('provider_payment_id', input.providerPaymentId)
    .maybeSingle()

  if (byProvider) {
    charge = byProvider as PixCharge
  } else if (parsed?.chargeId) {
    const { data: byId } = await supabaseAdmin
      .from('pix_charges')
      .select('*')
      .eq('id', parsed.chargeId)
      .maybeSingle()
    if (byId) charge = byId as PixCharge
  }

  // 2. Já processado? (idempotência)
  if (charge?.status === 'paid' && charge.processed_at) {
    return {
      alreadyProcessed: true,
      charge,
      renewed: false,
      newDueDate: null,
      paymentId: charge.payment_id,
    }
  }

  // 3. Criar charge legada (fluxos antigos sem ledger)
  if (!charge) {
    const userId = parsed?.organizationId || input.organizationId
    const { data: created, error: createErr } = await supabaseAdmin
      .from('pix_charges')
      .insert({
        organization_id: input.organizationId,
        user_id: userId,
        client_id: parsed?.clientId || null,
        provider,
        provider_payment_id: input.providerPaymentId,
        purpose: parsed?.purpose || 'manual',
        status: 'pending',
        amount: input.amount,
        phone: parsed?.phone || null,
        instance_name: parsed?.instanceName || null,
        months_to_renew: parsed?.months || 1,
        plan_name: parsed?.planName || null,
        external_reference: input.externalReference || null,
      })
      .select('*')
      .single()

    if (createErr || !created) {
      // Colisão por unique index: outro worker já criou
      const { data: race } = await supabaseAdmin
        .from('pix_charges')
        .select('*')
        .eq('provider', provider)
        .eq('provider_payment_id', input.providerPaymentId)
        .maybeSingle()
      if (race?.status === 'paid' && race.processed_at) {
        return {
          alreadyProcessed: true,
          charge: race as PixCharge,
          renewed: false,
          newDueDate: null,
          paymentId: race.payment_id,
        }
      }
      charge = (race as PixCharge) || null
      if (!charge) {
        throw new Error(createErr?.message || 'Não foi possível registrar a cobrança paga')
      }
    } else {
      charge = created as PixCharge
    }
  }

  // 4. Claim atômico: só um worker processa
  const nowIso = new Date().toISOString()
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from('pix_charges')
    .update({
      status: 'paid',
      paid_at: nowIso,
      processed_at: nowIso,
      provider_payment_id: input.providerPaymentId,
      amount: input.amount,
    })
    .eq('id', charge.id)
    .is('processed_at', null)
    .select('*')
    .maybeSingle()

  if (claimErr) {
    throw new Error(claimErr.message)
  }

  if (!claimed) {
    // Outro processo já processou
    const { data: existing } = await supabaseAdmin
      .from('pix_charges')
      .select('*')
      .eq('id', charge.id)
      .single()
    return {
      alreadyProcessed: true,
      charge: (existing as PixCharge) || charge,
      renewed: false,
      newDueDate: null,
      paymentId: existing?.payment_id || null,
    }
  }

  charge = claimed as PixCharge

  let renewed = false
  let newDueDate: string | null = null
  let paymentRowId: string | null = null
  let clientName: string | null = null

  const purpose = charge.purpose || parsed?.purpose || 'manual'
  const clientId = charge.client_id || parsed?.clientId || null
  const months = charge.months_to_renew || parsed?.months || 1
  const instanceName = charge.instance_name || parsed?.instanceName || null
  const phone = charge.phone || parsed?.phone || null

  // 5. Renovação automática (quando há client_id)
  if (clientId && (purpose === 'renewal' || purpose === 'charge')) {
    const { data: client, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('id, name, due_date, status, plan_value, screens, user_id, phone, client_services(services(cost))')
      .eq('id', clientId)
      .single()

    if (!clientErr && client) {
      clientName = client.name
      newDueDate = computeNewDueDate(client.due_date, months)

      const { error: renewErr } = await supabaseAdmin
        .from('clients')
        .update({
          due_date: newDueDate,
          status: 'active',
        })
        .eq('id', client.id)

      if (renewErr) {
        console.error('[PIX] Erro ao renovar cliente:', renewErr)
      } else {
        renewed = true
      }

      const servicesCost =
        (client.client_services as Array<{ services?: { cost?: number } | null }> | null)?.reduce(
          (acc, cs) => acc + (cs.services?.cost || 0),
          0
        ) || 0
      const screens = client.screens || 1
      const netProfit = input.amount - servicesCost * screens * months

      const { data: paymentRow, error: payErr } = await supabaseAdmin
        .from('payments')
        .insert({
          user_id: client.user_id || charge.user_id,
          client_id: client.id,
          amount_paid: input.amount,
          net_profit: netProfit,
          months_renewed: months,
          organization_id: charge.organization_id,
        })
        .select('id')
        .single()

      // organization_id pode não existir em payments legada — retry sem ela
      if (payErr) {
        const { data: paymentRow2, error: payErr2 } = await supabaseAdmin
          .from('payments')
          .insert({
            user_id: client.user_id || charge.user_id,
            client_id: client.id,
            amount_paid: input.amount,
            net_profit: netProfit,
            months_renewed: months,
          })
          .select('id')
          .single()

        if (payErr2) {
          console.error('[PIX] Erro ao registrar payment:', payErr2)
        } else {
          paymentRowId = paymentRow2?.id || null
        }
      } else {
        paymentRowId = paymentRow?.id || null
      }

      if (paymentRowId) {
        await supabaseAdmin
          .from('pix_charges')
          .update({ payment_id: paymentRowId })
          .eq('id', charge.id)
      }
    }
  } else {
    // PIX manual sem cliente: só registra payment genérico se houver user
    const { data: paymentRow } = await supabaseAdmin
      .from('payments')
      .insert({
        user_id: charge.user_id,
        client_id: null,
        amount_paid: input.amount,
        net_profit: input.amount,
        months_renewed: 0,
      })
      .select('id')
      .maybeSingle()

    // client_id null pode falhar se NOT NULL — ignora
    if (paymentRow?.id) {
      paymentRowId = paymentRow.id
      await supabaseAdmin.from('pix_charges').update({ payment_id: paymentRowId }).eq('id', charge.id)
    }
  }

  // 6. Notificações WhatsApp
  const valorFormatado = formatBRL(input.amount)
  if (instanceName && phone) {
    let recibo = `✅ *Pagamento Confirmado!*\n\nRecebemos o seu pagamento de ${valorFormatado}.\nMuito obrigado!`
    if (renewed && newDueDate) {
      const dueBr = new Date(`${newDueDate}T12:00:00`).toLocaleDateString('pt-BR')
      recibo = `✅ *Pagamento Confirmado!*\n\nRecebemos ${valorFormatado}.\n\nSeu plano foi *renovado automaticamente*.\n📅 Novo vencimento: *${dueBr}*\n\nObrigado pela confiança!`
    }

    try {
      await messageQueue.add('send-message', {
        organization_id: charge.organization_id,
        instance_id: null,
        instance_name: instanceName,
        phone,
        message: recibo,
        source: 'mercadopago_webhook',
      })
    } catch (e) {
      console.error('[PIX] Falha ao enfileirar recibo:', e)
    }
  }

  // Notifica o dono
  try {
    const ownerId = charge.user_id
    const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(ownerId)
    let adminPhone = ownerData?.user?.user_metadata?.support_phone as string | undefined
    if (adminPhone && instanceName) {
      adminPhone = adminPhone.replace(/\D/g, '')
      const dueLine = renewed && newDueDate
        ? `\n📅 *Novo vencimento:* ${new Date(`${newDueDate}T12:00:00`).toLocaleDateString('pt-BR')}`
        : ''
      const adminMsg = renewed
        ? `🔔 *RENOVAÇÃO AUTOMÁTICA CONFIRMADA*\n\n*Cliente:* ${clientName || '—'}\n*Telefone:* ${phone || '—'}\n*Valor:* ${valorFormatado}\n*Meses:* ${months}${dueLine}\n\n_Vencimento e status já atualizados no painel._`
        : `🔔 *PIX RECEBIDO*\n\n*Valor:* ${valorFormatado}\n*Telefone:* ${phone || '—'}\n*Descrição:* ${charge.description || 'PIX manual'}`

      await messageQueue.add('send-message', {
        organization_id: charge.organization_id,
        instance_id: null,
        instance_name: instanceName,
        phone: adminPhone,
        message: adminMsg,
        source: 'mercadopago_webhook_admin',
      })
    }
  } catch (e) {
    console.error('[PIX] Falha ao notificar admin:', e)
  }

  await logAudit({
    user_id: charge.user_id,
    action: renewed ? 'pix.renewal.auto' : 'pix.payment.confirmed',
    resource: 'pix_charges',
    resource_id: charge.id,
    details: {
      provider_payment_id: input.providerPaymentId,
      amount: input.amount,
      client_id: clientId,
      renewed,
      new_due_date: newDueDate,
      payment_id: paymentRowId,
      purpose,
    },
    ip_address: input.ipAddress || null,
  })

  return {
    alreadyProcessed: false,
    charge: { ...charge, payment_id: paymentRowId, status: 'paid' },
    renewed,
    newDueDate,
    paymentId: paymentRowId,
  }
}

import { logAudit } from '@/lib/audit'
import { supabaseAdmin } from '@/lib/supabase/service-role'

interface CancelClientRenewalInput {
  organizationId: string
  clientId: string
  requestedFromPhone: string
}

export interface CancelClientRenewalResult {
  alreadyCanceled: boolean
  cancelledPixCharges: number
  providerCancellations: number
  providerCancellationFailures: number
  supportReviewRequested: boolean
}

async function cancelMercadoPagoPayment(accessToken: string, paymentId: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Cancela a renovação solicitada pelo próprio cliente no WhatsApp.
 * Todas as operações são limitadas à organização e são idempotentes.
 */
export async function cancelClientRenewalByCustomer(
  input: CancelClientRenewalInput,
): Promise<CancelClientRenewalResult> {
  const { data: client, error: clientError } = await supabaseAdmin
    .from('clients')
    .select('id, user_id, status')
    .eq('id', input.clientId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()
  if (clientError) throw new Error(`Falha ao localizar cliente: ${clientError.message}`)
  if (!client) throw new Error('Cliente não encontrado para cancelamento')

  const alreadyCanceled = client.status === 'canceled'
  const now = new Date().toISOString()
  const { error: initialStatusError } = await supabaseAdmin
    .from('clients')
    .update({ status: 'canceled', updated_at: now })
    .eq('id', client.id)
    .eq('organization_id', input.organizationId)
  if (initialStatusError) throw new Error(`Falha ao cancelar cliente: ${initialStatusError.message}`)

  const [{ data: charges, error: chargesError }, { data: integration }] = await Promise.all([
    supabaseAdmin
      .from('pix_charges')
      .select('id, provider_payment_id, metadata')
      .eq('organization_id', input.organizationId)
      .eq('client_id', client.id)
      .eq('status', 'pending')
      .in('purpose', ['renewal', 'charge']),
    supabaseAdmin
      .from('integrations')
      .select('credentials')
      .eq('organization_id', input.organizationId)
      .eq('provider', 'mercadopago')
      .eq('is_active', true)
      .maybeSingle(),
  ])
  if (chargesError) throw new Error(`Falha ao consultar cobranças PIX: ${chargesError.message}`)

  const accessToken = integration?.credentials?.access_token as string | undefined
  let providerCancellations = 0
  let providerCancellationFailures = 0
  for (const charge of charges || []) {
    let providerCancellationFailed = false
    if (charge.provider_payment_id) {
      if (accessToken && await cancelMercadoPagoPayment(accessToken, String(charge.provider_payment_id))) {
        providerCancellations++
      } else {
        providerCancellationFailures++
        providerCancellationFailed = true
      }
    }

    const metadata = charge.metadata && typeof charge.metadata === 'object'
      ? charge.metadata as Record<string, unknown>
      : {}
    const { error } = await supabaseAdmin
      .from('pix_charges')
      .update({
        status: 'cancelled',
        purpose: 'manual',
        metadata: {
          ...metadata,
          cancelled_by: 'customer_whatsapp',
          cancelled_at: now,
          provider_cancellation_failed: providerCancellationFailed,
        },
      })
      .eq('id', charge.id)
      .eq('organization_id', input.organizationId)
      .eq('status', 'pending')
    if (error) throw new Error(`Falha ao cancelar cobrança PIX: ${error.message}`)
  }

  const cleanupResults = await Promise.all([
    supabaseAdmin.from('billing_cycles')
      .update({ status: 'cancelled', cancelled_at: now })
      .eq('organization_id', input.organizationId)
      .eq('client_id', client.id)
      .in('status', ['open', 'overdue']),
    supabaseAdmin.from('contact_reservations')
      .update({ status: 'cancelled', decision_reason: 'CUSTOMER_CANCELLED_RENEWAL', updated_at: now })
      .eq('organization_id', input.organizationId)
      .eq('client_id', client.id)
      .eq('category', 'billing')
      .in('status', ['reserved', 'processing', 'deferred']),
    supabaseAdmin.from('collection_dispatches')
      .update({ status: 'cancelled', error_message: 'Cancelado pelo cliente via WhatsApp', updated_at: now })
      .eq('organization_id', input.organizationId)
      .eq('client_id', client.id)
      .in('status', ['pending', 'processing', 'retryable']),
    supabaseAdmin.from('alert_history')
      .update({ status: 'failed', error_message: 'CUSTOMER_CANCELLED_RENEWAL' })
      .eq('organization_id', input.organizationId)
      .eq('client_id', client.id)
      .eq('contact_category', 'billing')
      .eq('status', 'pending'),
  ])
  const cleanupError = cleanupResults.find((result) => result.error)?.error
  if (cleanupError) throw new Error(`Falha ao interromper alertas pendentes: ${cleanupError.message}`)

  let supportReviewRequested = false
  if (providerCancellationFailures > 0) {
    const { error: supportError } = await supabaseAdmin.from('client_change_requests').insert({
      organization_id: input.organizationId,
      client_id: client.id,
      request_type: 'human_support',
      requested_from_phone: input.requestedFromPhone,
    })
    supportReviewRequested = !supportError
  }

  // Fecha uma eventual corrida com webhook/scheduler enquanto o provedor era cancelado.
  const { error: finalStatusError } = await supabaseAdmin
    .from('clients')
    .update({ status: 'canceled', updated_at: now })
    .eq('id', client.id)
    .eq('organization_id', input.organizationId)
  if (finalStatusError) throw new Error(`Falha ao confirmar cancelamento: ${finalStatusError.message}`)

  await logAudit({
    organization_id: input.organizationId,
    user_id: client.user_id,
    action: 'client.renewal.cancelled_by_customer',
    resource: 'clients',
    resource_id: client.id,
    details: {
      channel: 'whatsapp',
      requested_from_phone: input.requestedFromPhone,
      already_canceled: alreadyCanceled,
      cancelled_pix_charges: charges?.length || 0,
      provider_cancellations: providerCancellations,
      provider_cancellation_failures: providerCancellationFailures,
      support_review_requested: supportReviewRequested,
    },
  })

  return {
    alreadyCanceled,
    cancelledPixCharges: charges?.length || 0,
    providerCancellations,
    providerCancellationFailures,
    supportReviewRequested,
  }
}

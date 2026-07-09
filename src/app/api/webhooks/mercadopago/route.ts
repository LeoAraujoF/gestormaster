import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { getIpFromRequest } from '@/lib/audit'
import { processApprovedPixPayment } from '@/lib/pix-charges'

export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    const orgId = url.searchParams.get('orgId')

    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
    }

    let paymentId: string | null = null

    try {
      const body = await req.json()
      if (
        body.action === 'payment.created' ||
        body.action === 'payment.updated' ||
        body.type === 'payment'
      ) {
        paymentId = body.data?.id != null ? String(body.data.id) : null
      }
    } catch {
      // body vazio / IPN query-only
    }

    if (!paymentId) {
      paymentId = url.searchParams.get('data.id') || url.searchParams.get('id')
    }

    if (!paymentId) {
      return NextResponse.json({ received: true })
    }

    // Token MP da organização
    let accessToken: string | null = null
    const { data: mpInt } = await supabaseAdmin
      .from('integrations')
      .select('credentials')
      .eq('organization_id', orgId)
      .eq('provider', 'mercadopago')
      .eq('is_active', true)
      .maybeSingle()

    accessToken = mpInt?.credentials?.access_token || null

    if (!accessToken) {
      console.warn(`[Webhook MP] Org ${orgId} sem token MP ativo.`)
      return NextResponse.json({ received: true })
    }

    // Sempre consultar status real (não confiar só no webhook)
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!mpResponse.ok) {
      console.error(`[Webhook MP] Erro ao consultar pagamento ${paymentId}:`, await mpResponse.text())
      return NextResponse.json({ error: 'Failed to fetch payment' }, { status: 500 })
    }

    const paymentData = await mpResponse.json()
    const status = paymentData.status as string

    // Expira / cancela cobrança pendente se MP reportar
    if (status === 'expired' || status === 'cancelled' || status === 'rejected') {
      await supabaseAdmin
        .from('pix_charges')
        .update({ status: status === 'rejected' ? 'failed' : status === 'cancelled' ? 'cancelled' : 'expired' })
        .eq('provider', 'mercadopago')
        .eq('provider_payment_id', String(paymentId))
        .eq('status', 'pending')

      return NextResponse.json({ received: true, status })
    }

    if (status !== 'approved') {
      return NextResponse.json({ received: true, status })
    }

    // Validação de org via external_reference
    const extRef = paymentData.external_reference as string | undefined
    if (extRef?.includes('|')) {
      const refOrg = extRef.split('|')[0]
      if (refOrg && refOrg !== orgId) {
        console.warn(`[Webhook MP] org mismatch: query=${orgId} ref=${refOrg}`)
        return NextResponse.json({ received: true, error: 'org_mismatch' })
      }
    }

    const result = await processApprovedPixPayment({
      organizationId: orgId,
      providerPaymentId: String(paymentId),
      amount: Number(paymentData.transaction_amount),
      externalReference: extRef || null,
      rawStatus: status,
      ipAddress: getIpFromRequest(req),
    })

    console.log(
      `[Webhook MP] payment=${paymentId} already=${result.alreadyProcessed} renewed=${result.renewed} due=${result.newDueDate}`
    )

    return NextResponse.json({
      received: true,
      already_processed: result.alreadyProcessed,
      renewed: result.renewed,
      new_due_date: result.newDueDate,
      charge_id: result.charge?.id || null,
    })
  } catch (error: any) {
    console.error('[Webhook MP] Erro Interno:', error)
    // 200 para o MP não retentar em loop em erros nossos de parsing
    return NextResponse.json({ received: true, error: 'internal' })
  }
}

/** IPN/GET legados do Mercado Pago */
export async function GET(req: Request) {
  return POST(req)
}

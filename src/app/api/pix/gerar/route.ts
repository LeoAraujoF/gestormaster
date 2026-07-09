import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { createClient } from '@/lib/supabase/server'
import { logAudit, getIpFromRequest } from '@/lib/audit'
import {
  attachProviderPayment,
  buildExternalReference,
  createPixChargeDraft,
  markChargeFailed,
  type PixChargePurpose,
} from '@/lib/pix-charges'

/** Default: PIX dinâmico expira em 24h */
const DEFAULT_EXPIRES_MINUTES = 24 * 60

export async function POST(req: Request) {
  try {
    let orgId: string | undefined
    let userId: string | undefined

    // 1. Autenticação híbrida (API key ou sessão)
    const authHeader = req.headers.get('authorization')

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1]
      const hash = crypto.createHash('sha256').update(token).digest('hex')
      const { data: keyData } = await supabaseAdmin
        .from('api_keys')
        .select('organization_id, user_id')
        .eq('key_hash', hash)
        .single()

      if (keyData) {
        orgId = keyData.organization_id
        userId = keyData.user_id || keyData.organization_id
        supabaseAdmin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('key_hash', hash).then()
      }
    } else {
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        orgId = (user.user_metadata?.organization_id as string) || user.id
        userId = user.id
      }
    }

    if (!orgId || !userId) {
      return NextResponse.json(
        { error: 'Não autorizado. Forneça um Bearer Token válido ou faça login no painel.' },
        { status: 401 }
      )
    }

    const payload = await req.json()
    const {
      valor,
      descricao,
      telefone_pagador,
      instance_name,
      client_id,
      months,
      purpose: purposeRaw,
      expires_minutes,
      plan_name,
    } = payload

    if (!valor || !telefone_pagador || !instance_name) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: valor, telefone_pagador, instance_name' },
        { status: 400 }
      )
    }

    const amount = Number(valor)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Valor inválido' }, { status: 400 })
    }

    const monthsToRenew = Math.max(1, parseInt(String(months || 1), 10) || 1)
    let purpose: PixChargePurpose = 'manual'
    if (purposeRaw === 'renewal' || purposeRaw === 'charge' || purposeRaw === 'manual') {
      purpose = purposeRaw
    } else if (client_id) {
      purpose = 'renewal'
    }

    // Validar cliente se informado
    let planName: string | null = plan_name || null
    if (client_id) {
      const { data: client } = await supabaseAdmin
        .from('clients')
        .select('id, name, plan_value, user_id, phone')
        .eq('id', client_id)
        .single()

      if (!client) {
        return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
      }
      if (!planName) planName = client.name
    }

    // Integração Mercado Pago (org ou user legado)
    const { data: mpByOrg } = await supabaseAdmin
      .from('integrations')
      .select('credentials')
      .eq('organization_id', orgId)
      .eq('provider', 'mercadopago')
      .eq('is_active', true)
      .maybeSingle()

    let accessToken = (mpByOrg?.credentials?.access_token as string | undefined) || null

    if (!accessToken && userId !== orgId) {
      const { data: mpByUser } = await supabaseAdmin
        .from('integrations')
        .select('credentials')
        .eq('organization_id', userId)
        .eq('provider', 'mercadopago')
        .eq('is_active', true)
        .maybeSingle()
      accessToken = (mpByUser?.credentials?.access_token as string | undefined) || null
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Integração com Mercado Pago não encontrada ou inativa' },
        { status: 400 }
      )
    }
    const expiresMinutes = Math.max(
      5,
      Math.min(60 * 24 * 7, parseInt(String(expires_minutes || DEFAULT_EXPIRES_MINUTES), 10) || DEFAULT_EXPIRES_MINUTES)
    )
    const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000)

    // 2. Draft no ledger
    const charge = await createPixChargeDraft({
      organization_id: orgId,
      user_id: userId,
      client_id: client_id || null,
      amount,
      description: descricao || (purpose === 'renewal' ? `Renovação (${monthsToRenew} mês/es)` : 'Pagamento via Pix'),
      phone: String(telefone_pagador).replace(/\D/g, ''),
      instance_name,
      purpose,
      months_to_renew: monthsToRenew,
      plan_name: planName,
      expires_at: expiresAt.toISOString(),
    })

    const externalReference = buildExternalReference({
      organizationId: orgId,
      instanceName: instance_name,
      phone: String(telefone_pagador).replace(/\D/g, ''),
      purpose,
      clientId: client_id || null,
      planName,
      months: monthsToRenew,
      chargeId: charge.id,
    })

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    // 3. PIX dinâmico no Mercado Pago
    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-Idempotency-Key': charge.id,
      },
      body: JSON.stringify({
        transaction_amount: amount,
        description: charge.description,
        payment_method_id: 'pix',
        date_of_expiration: expiresAt.toISOString(),
        payer: {
          email: 'pagamento@automacao.com',
        },
        external_reference: externalReference,
        notification_url: `${appUrl}/api/webhooks/mercadopago?orgId=${orgId}`,
        metadata: {
          charge_id: charge.id,
          purpose,
          client_id: client_id || null,
          months: monthsToRenew,
        },
      }),
    })

    const mpData = await mpResponse.json()

    if (!mpResponse.ok) {
      console.error('Erro MP:', mpData)
      await markChargeFailed(charge.id, JSON.stringify(mpData))
      return NextResponse.json(
        { error: 'Falha ao processar pagamento no Mercado Pago', details: mpData },
        { status: 500 }
      )
    }

    const copia = mpData.point_of_interaction?.transaction_data?.qr_code || null
    const qrBase64 = mpData.point_of_interaction?.transaction_data?.qr_code_base64 || null
    const ticketUrl = mpData.point_of_interaction?.transaction_data?.ticket_url || null
    // MP pode devolver expiração levemente diferente
    const mpExpires = mpData.date_of_expiration || expiresAt.toISOString()

    await attachProviderPayment(charge.id, {
      provider_payment_id: String(mpData.id),
      copia_e_cola: copia,
      qr_code_base64: qrBase64,
      ticket_url: ticketUrl,
      external_reference: externalReference,
      expires_at: mpExpires,
    })

    await logAudit({
      user_id: userId,
      action: 'pix.generate',
      resource: 'pix_charges',
      resource_id: charge.id,
      details: {
        valor: amount,
        telefone_pagador,
        instance_name,
        purpose,
        client_id: client_id || null,
        months: monthsToRenew,
        provider_payment_id: mpData.id,
        expires_at: mpExpires,
      },
      ip_address: getIpFromRequest(req),
    })

    return NextResponse.json({
      success: true,
      charge_id: charge.id,
      pix_id: mpData.id,
      purpose,
      status: 'pending',
      amount,
      months_to_renew: monthsToRenew,
      expires_at: mpExpires,
      copia_e_cola: copia,
      qr_code_base64: qrBase64,
      ticket_url: ticketUrl,
    })
  } catch (error: any) {
    console.error('API Pix Error:', error)
    return NextResponse.json({ error: 'Erro interno', message: error.message }, { status: 500 })
  }
}

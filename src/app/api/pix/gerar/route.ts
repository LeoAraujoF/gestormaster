import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { createClient } from '@/lib/supabase/server'
import { logAudit, getIpFromRequest } from '@/lib/audit'
import { getAuthorizedOrganizationId } from '@/lib/access-control'
import {
  createMercadoPagoPixCharge,
  type PixChargePurpose,
} from '@/lib/pix-charges'
import { organizationHasCapability } from '@/lib/plan-catalog'

export async function POST(req: Request) {
  try {
    let orgId: string | undefined
    let userId: string | undefined
    let authenticatedByApiKey = false

    // 1. Autenticação híbrida (API key ou sessão)
    const authHeader = req.headers.get('authorization')

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1]
      const hash = crypto.createHash('sha256').update(token).digest('hex')
      const { data: keyData } = await supabaseAdmin
        .from('api_keys')
        .select('organization_id')
        .eq('key_hash', hash)
        .single()

      if (keyData) {
        authenticatedByApiKey = true
        orgId = keyData.organization_id
        const { data: owner } = await supabaseAdmin
          .from('organization_members')
          .select('user_id')
          .eq('organization_id', orgId)
          .eq('role', 'owner')
          .maybeSingle()
        userId = owner?.user_id || orgId
        supabaseAdmin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('key_hash', hash).then()
      }
    } else {
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        orgId = await getAuthorizedOrganizationId(supabase, user.id) || undefined
        userId = user.id
      }
    }

    if (!orgId || !userId) {
      return NextResponse.json(
        { error: 'Não autorizado. Forneça um Bearer Token válido ou faça login no painel.' },
        { status: 401 }
      )
    }
    const requiredCapability = authenticatedByApiKey ? 'developer_api' : 'pix_manual'
    if (!(await organizationHasCapability(orgId, requiredCapability))) {
      return NextResponse.json({ error: authenticatedByApiKey ? 'A API está disponível somente no plano Master.' : 'Plano sem acesso ao PIX', upgrade_required: true }, { status: 403 })
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
        .select('id, name, plan_value, user_id, phone, organization_id')
        .eq('id', client_id)
        .single()

      if (!client || (client.organization_id && client.organization_id !== orgId) || (!client.organization_id && client.user_id !== userId)) {
        return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
      }
      if (!planName) planName = client.name
    }

    const centralizedCharge = await createMercadoPagoPixCharge({
      organizationId: orgId,
      userId,
      clientId: client_id || null,
      amount,
      phone: String(telefone_pagador).replace(/\D/g, ''),
      instanceName: instance_name,
      months: monthsToRenew,
      planName,
      purpose,
      description: descricao || undefined,
      expiresMinutes: expires_minutes ? Number(expires_minutes) : undefined,
    })

    await logAudit({
      user_id: userId,
      action: 'pix.generate',
      resource: 'pix_charges',
      resource_id: centralizedCharge.id,
      details: { valor: amount, client_id: client_id || null, purpose, provider_payment_id: centralizedCharge.provider_payment_id },
      ip_address: getIpFromRequest(req),
    })

    return NextResponse.json({
      success: true,
      charge_id: centralizedCharge.id,
      pix_id: centralizedCharge.provider_payment_id,
      purpose,
      status: centralizedCharge.status,
      amount: centralizedCharge.amount,
      months_to_renew: centralizedCharge.months_to_renew,
      expires_at: centralizedCharge.expires_at,
      copia_e_cola: centralizedCharge.copia_e_cola,
      qr_code_base64: centralizedCharge.qr_code_base64,
      ticket_url: centralizedCharge.ticket_url,
    })

  } catch (error: any) {
    console.error('API Pix Error:', error)
    return NextResponse.json({ error: 'Erro interno', message: error.message }, { status: 500 })
  }
}

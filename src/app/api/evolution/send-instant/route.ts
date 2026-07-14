import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'

import { getOrganizationMembership } from '@/lib/access-control'
import {
  categoryForAlertType,
  createCoordinatedAlert,
  dateInTimezone,
  enqueueContactReservation,
  organizationTimezone,
  reserveContact,
} from '@/lib/contact-coordination'
import { logAudit, getIpFromRequest } from '@/lib/audit'
import { parseMessageTemplate } from '@/lib/message-parser'
import { organizationHasCapability } from '@/lib/plan-catalog'
import { redisConnection } from '@/lib/redis'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const membership = await getOrganizationMembership(supabase, user.id)
    if (!membership || !(await organizationHasCapability(membership.organizationId, 'automation_basic'))) {
      return NextResponse.json({ error: 'Automação não disponível neste plano', upgrade_required: true }, { status: 403 })
    }
    if (await redisConnection.sismember('global:banned_users', user.id)) {
      return NextResponse.json({ error: 'Sua conta foi suspensa temporariamente. Contate o suporte.' }, { status: 403 })
    }

    const { clientId, ruleId, confirmRecentContact = false } = await req.json()
    if (!clientId || !ruleId) return NextResponse.json({ error: 'Cliente e regra são obrigatórios' }, { status: 400 })
    const [{ data: client }, { data: rule }, { data: instance }] = await Promise.all([
      supabaseAdmin.from('clients').select('id, name, phone, phone_e164, plan_value, due_date, user_id')
        .eq('id', clientId).eq('organization_id', membership.organizationId).maybeSingle(),
      supabaseAdmin.from('automations').select('id, alert_type, message_template')
        .eq('id', ruleId).eq('organization_id', membership.organizationId).maybeSingle(),
      supabaseAdmin.from('evolution_instances').select('id')
        .eq('organization_id', membership.organizationId).eq('status', 'connected')
        .order('is_primary', { ascending: false }).limit(1).maybeSingle(),
    ])
    if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    if (!rule) return NextResponse.json({ error: 'Regra de automação não encontrada' }, { status: 404 })
    if (!instance) return NextResponse.json({ error: 'WhatsApp não configurado ou desconectado' }, { status: 400 })
    if (!(client.phone_e164 || client.phone)) return NextResponse.json({ error: 'Cliente não possui telefone' }, { status: 400 })

    const category = categoryForAlertType(rule.alert_type)
    const timezone = await organizationTimezone(membership.organizationId)
    const now = new Date()
    const finalMessage = parseMessageTemplate(rule.message_template || '', client, user.user_metadata || {})
    const reservation = await reserveContact({
      organizationId: membership.organizationId,
      clientId: client.id,
      contactDate: dateInTimezone(now, timezone),
      timezone,
      category,
      source: category === 'manual' ? 'manual' : 'system',
      sourceId: category === 'manual' ? randomUUID() : rule.id,
      requestedBy: user.id,
      automationId: rule.id,
      messageContent: finalMessage,
      allowManualOverride: Boolean(confirmRecentContact),
    })
    if (reservation.decision === 'confirmation_required') {
      const { data: latest } = await supabaseAdmin.from('contact_reservations')
        .select('created_at, category').eq('organization_id', membership.organizationId)
        .eq('client_id', client.id).in('status', ['reserved', 'processing', 'sent'])
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      return NextResponse.json({
        error: 'Este cliente já recebeu uma mensagem nas últimas 24 horas.',
        requires_confirmation: true,
        existing_category: latest?.category || reservation.existingCategory,
        last_contact_at: latest?.created_at || null,
      }, { status: 409 })
    }
    if (!reservation.reservationId || reservation.decision === 'blocked') {
      return NextResponse.json({ error: 'Contato bloqueado por uma mensagem de maior prioridade.', reason: reservation.reason }, { status: 409 })
    }
    if (reservation.decision === 'idempotent') {
      const { data: existing } = await supabaseAdmin.from('contact_reservations')
        .select('alert_history_id, status').eq('id', reservation.reservationId).maybeSingle()
      if (existing?.alert_history_id) {
        return NextResponse.json({ success: true, idempotent: true, message: 'Esta mensagem já foi programada.' })
      }
    }
    const alertHistoryId = await createCoordinatedAlert({
      reservationId: reservation.reservationId,
      organizationId: membership.organizationId,
      userId: user.id,
      clientId: client.id,
      automationId: rule.id,
      messageContent: finalMessage,
      origin: category === 'manual' ? 'manual' : 'system',
      category,
      decision: reservation.decision,
      reason: reservation.reason,
      scheduledAt: reservation.nextAttemptDate ? `${reservation.nextAttemptDate}T08:00:00-03:00` : now.toISOString(),
    })
    if (reservation.decision !== 'deferred') await enqueueContactReservation(reservation.reservationId)

    await logAudit({
      organization_id: membership.organizationId,
      user_id: user.id,
      action: 'whatsapp.send_instant',
      resource: 'evolution',
      resource_id: alertHistoryId,
      details: { client_id: clientId, rule_id: ruleId, category, decision: reservation.decision },
      ip_address: getIpFromRequest(req),
    })
    return NextResponse.json({
      success: true,
      deferred: reservation.decision === 'deferred',
      message: reservation.decision === 'deferred' ? 'Mensagem adiada por uma cobrança prioritária.' : 'Mensagem enfileirada com sucesso.',
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao enviar mensagem' }, { status: 500 })
  }
}

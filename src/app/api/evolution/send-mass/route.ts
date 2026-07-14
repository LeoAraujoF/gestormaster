import { NextResponse } from 'next/server'

import { getOrganizationMembership } from '@/lib/access-control'
import {
  createCoordinatedAlert,
  dateInTimezone,
  enqueueContactReservation,
  organizationTimezone,
  reserveContact,
} from '@/lib/contact-coordination'
import { logAudit, getIpFromRequest } from '@/lib/audit'
import { parseMessageTemplate } from '@/lib/message-parser'
import { getOrganizationPlanContext } from '@/lib/plan-catalog'
import { redisConnection } from '@/lib/redis'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'

type MassRequest = {
  action?: 'preview' | 'confirm'
  audience?: 'all' | 'active' | 'inactive' | 'expired' | 'service'
  serviceId?: string
  messageTemplate?: string
  mediaUrl?: string | null
  scheduledAt?: string | null
}

function isValidMediaUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  try { return new URL(value).protocol === 'https:' } catch { return false }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const membership = await getOrganizationMembership(supabase, user.id)
    if (!membership) return NextResponse.json({ error: 'Organização não encontrada' }, { status: 403 })
    const plan = await getOrganizationPlanContext(membership.organizationId)
    if (!plan.active || !plan.capabilities.includes('automation_basic')) {
      return NextResponse.json({ error: 'Automação não disponível neste plano', upgrade_required: true }, { status: 403 })
    }
    if (await redisConnection.sismember('global:banned_users', user.id)) {
      return NextResponse.json({ error: 'Sua conta foi suspensa temporariamente. Contate o suporte.' }, { status: 403 })
    }

    const body = await req.json() as MassRequest
    const action = body.action || 'confirm'
    const audience = body.audience || 'all'
    const messageTemplate = body.messageTemplate?.trim() || ''
    if (!messageTemplate && !body.mediaUrl) {
      return NextResponse.json({ error: 'Mensagem ou banner é obrigatório' }, { status: 400 })
    }
    if (messageTemplate.length > 4000) return NextResponse.json({ error: 'Mensagem muito longa' }, { status: 400 })
    if (body.mediaUrl && !isValidMediaUrl(body.mediaUrl)) return NextResponse.json({ error: 'URL de mídia inválida' }, { status: 400 })
    if (!['all', 'active', 'inactive', 'expired', 'service'].includes(audience)) {
      return NextResponse.json({ error: 'Público inválido' }, { status: 400 })
    }
    if (plan.plan === 'starter' && audience === 'service') {
      return NextResponse.json({ error: 'Segmentação por serviço está disponível nos planos Pro e Master', upgrade_required: true }, { status: 403 })
    }

    let serviceClientIds: Set<string> | null = null
    if (audience === 'service') {
      if (!body.serviceId) return NextResponse.json({ error: 'Selecione um serviço' }, { status: 400 })
      const { data: service } = await supabaseAdmin.from('services').select('id')
        .eq('id', body.serviceId).eq('organization_id', membership.organizationId).maybeSingle()
      if (!service) return NextResponse.json({ error: 'Serviço não encontrado' }, { status: 404 })
      serviceClientIds = new Set<string>()
      for (let from = 0; ; from += 1000) {
        const { data: links, error: linksError } = await supabaseAdmin.from('client_services')
          .select('client_id').eq('service_id', service.id).range(from, from + 999)
        if (linksError) throw linksError
        for (const link of links || []) serviceClientIds.add(link.client_id)
        if (!links || links.length < 1000) break
      }
      if (!serviceClientIds.size) return NextResponse.json({ error: 'Nenhum cliente encontrado para este serviço' }, { status: 400 })
    }

    const clients: Array<{ id: string; name: string; phone: string | null; phone_e164: string | null; plan_value: number; due_date: string; user_id: string }> = []
    for (let from = 0; ; from += 1000) {
      let pageQuery = supabaseAdmin.from('clients')
        .select('id, name, phone, phone_e164, plan_value, due_date, user_id')
        .eq('organization_id', membership.organizationId)
        .range(from, from + 999)
      if (audience === 'active') pageQuery = pageQuery.eq('status', 'active')
      else if (audience === 'inactive') pageQuery = pageQuery.eq('status', 'inactive')
      else if (audience === 'expired') pageQuery = pageQuery.eq('status', 'vencido')
      const { data: page, error: clientsError } = await pageQuery
      if (clientsError) throw clientsError
      clients.push(...(page || []))
      if (!page || page.length < 1000) break
    }
    const audienceClients = serviceClientIds ? clients.filter((client) => serviceClientIds.has(client.id)) : clients
    const withValidPhone = audienceClients.filter((client) => (client.phone_e164 || client.phone || '').replace(/\D/g, '').length >= 10)
    const clientLimit = plan.limits.clients
    const eligibleByPlan = clientLimit == null ? withValidPhone : withValidPhone.slice(0, clientLimit)
    const overPlanLimit = withValidPhone.length - eligibleByPlan.length
    if (!eligibleByPlan.length) return NextResponse.json({ error: 'Nenhum cliente com telefone válido encontrado' }, { status: 400 })

    const timezone = await organizationTimezone(membership.organizationId)
    const scheduledDate = body.scheduledAt ? new Date(body.scheduledAt) : new Date()
    if (Number.isNaN(scheduledDate.getTime())) return NextResponse.json({ error: 'Data de agendamento inválida' }, { status: 400 })
    const contactDate = dateInTimezone(scheduledDate, timezone)
    const clientIds = eligibleByPlan.map((client) => client.id)
    const conflictMap = new Map<string, string>()
    for (let index = 0; index < clientIds.length; index += 500) {
      const { data: conflicts, error: conflictsError } = await supabaseAdmin.from('contact_reservations')
        .select('client_id, category')
        .eq('organization_id', membership.organizationId)
        .eq('contact_date', contactDate)
        .in('status', ['reserved', 'processing', 'sent'])
        .in('client_id', clientIds.slice(index, index + 500))
      if (conflictsError) throw conflictsError
      for (const conflict of conflicts || []) conflictMap.set(conflict.client_id, conflict.category)
    }
    const preview = {
      total: eligibleByPlan.length,
      eligible: eligibleByPlan.length - conflictMap.size,
      deferred: conflictMap.size,
      blocked: overPlanLimit,
      planLimit: clientLimit,
      contactDate,
    }
    if (action === 'preview') return NextResponse.json({ preview })

    const { data: instance } = await supabaseAdmin.from('evolution_instances')
      .select('id')
      .eq('organization_id', membership.organizationId).eq('status', 'connected')
      .order('is_primary', { ascending: false }).limit(1).maybeSingle()
    if (!instance) return NextResponse.json({ error: 'Nenhum WhatsApp conectado' }, { status: 400 })

    const { data: tempRule, error: ruleError } = await supabaseAdmin.from('automations').insert({
      user_id: user.id,
      organization_id: membership.organizationId,
      alert_type: 'promotion',
      days_offset: 0,
      send_time: '00:00',
      message_template: messageTemplate,
      is_active: false,
    }).select('id').single()
    if (ruleError || !tempRule) throw new Error(ruleError?.message || 'Erro ao criar campanha')

    const summary = { queued: 0, deferred: 0, blocked: overPlanLimit, failed: 0, total: eligibleByPlan.length, planLimit: clientLimit }
    const delay = Math.max(0, scheduledDate.getTime() - Date.now())
    for (const client of eligibleByPlan) {
      try {
        const finalMessage = parseMessageTemplate(messageTemplate, client, user.user_metadata || {})
        const reservation = await reserveContact({
          organizationId: membership.organizationId,
          clientId: client.id,
          contactDate,
          timezone,
          category: 'promotion',
          source: 'mass',
          sourceId: tempRule.id,
          requestedBy: user.id,
          automationId: tempRule.id,
          messageContent: finalMessage,
          mediaUrl: body.mediaUrl || null,
        })
        if (!reservation.reservationId) {
          summary.blocked++
          continue
        }
        await createCoordinatedAlert({
          reservationId: reservation.reservationId,
          organizationId: membership.organizationId,
          userId: user.id,
          clientId: client.id,
          automationId: tempRule.id,
          messageContent: finalMessage,
          origin: 'mass',
          category: 'promotion',
          decision: reservation.decision,
          reason: reservation.reason,
          scheduledAt: reservation.nextAttemptDate
            ? `${reservation.nextAttemptDate}T08:00:00-03:00`
            : scheduledDate.toISOString(),
        })
        if (reservation.decision === 'deferred') summary.deferred++
        else {
          await enqueueContactReservation(reservation.reservationId, delay)
          summary.queued++
        }
      } catch {
        summary.failed++
      }
    }

    await logAudit({
      organization_id: membership.organizationId,
      user_id: user.id,
      action: 'whatsapp.send_mass',
      resource: 'evolution',
      details: { audience, ...summary, contactDate },
      ip_address: getIpFromRequest(req),
    })
    return NextResponse.json({
      success: true,
      summary,
      message: `${summary.queued} mensagens enfileiradas; ${summary.deferred} adiadas por contato prioritário; ${summary.blocked} bloqueadas.`,
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao processar disparo' }, { status: 500 })
  }
}

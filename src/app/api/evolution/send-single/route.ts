import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { redisConnection } from '@/lib/redis'
import { messageQueue } from '@/lib/queue'
import { logAudit, getIpFromRequest } from '@/lib/audit'
import { normalizeWhatsAppNumber } from '@/lib/phone'
import { hasWhatsAppConsent } from '@/lib/whatsapp-safety'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (await redisConnection.sismember('global:banned_users', user.id)) {
      return NextResponse.json({ error: 'Sua conta foi suspensa temporariamente. Contate o suporte.' }, { status: 403 })
    }

    const body = await req.json() as {
      instanceName?: unknown
      phone?: unknown
      message?: unknown
      mediaBase64?: unknown
      mediaMimeType?: unknown
      leadId?: unknown
      consent_confirmed?: unknown
    }
    const instanceName = typeof body.instanceName === 'string' ? body.instanceName.trim() : ''
    const phone = typeof body.phone === 'string' ? body.phone : ''
    const message = typeof body.message === 'string' ? body.message : ''
    const mediaBase64 = typeof body.mediaBase64 === 'string' ? body.mediaBase64 : null
    const mediaMimeType = typeof body.mediaMimeType === 'string' ? body.mediaMimeType : null
    const leadId = typeof body.leadId === 'string' ? body.leadId : null
    const consentConfirmed = body.consent_confirmed === true

    if (!instanceName || !phone || (!message && !mediaBase64)) {
      return NextResponse.json({ error: 'Faltam campos obrigatórios (instanceName, phone e message ou mídia)' }, { status: 400 })
    }

    const { data: instance, error: instanceError } = await supabase
      .from('evolution_instances')
      .select('id, organization_id, instance_name, sending_paused, sending_pause_reason')
      .eq('user_id', user.id)
      .eq('instance_name', instanceName)
      .maybeSingle()

    if (instanceError || !instance || !instance.organization_id) {
      return NextResponse.json({ error: 'Instância não encontrada ou sem permissão' }, { status: 400 })
    }

    if (instance.sending_paused) {
      return NextResponse.json({ error: `Envios pausados nesta instância: ${instance.sending_pause_reason || 'revisão necessária'}` }, { status: 409 })
    }

    if (leadId) {
      const { data: lead } = await supabase
        .from('leads')
        .select('id, whatsapp_opt_in, whatsapp_opt_out, whatsapp_opt_in_categories')
        .eq('id', leadId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!lead) return NextResponse.json({ error: 'Lead não encontrado ou sem permissão' }, { status: 400 })

      if (!hasWhatsAppConsent(lead, 'marketing')) {
        return NextResponse.json({ error: 'O lead não possui consentimento para mensagens de marketing.', code: 'WHATSAPP_CONSENT_REQUIRED' }, { status: 412 })
      }

      const { data: activeHistory } = await supabaseAdmin
        .from('alert_history')
        .select('id')
        .eq('user_id', user.id)
        .eq('lead_id', leadId)
        .in('status', ['queued', 'accepted', 'sent', 'delivered', 'read', 'pending'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (activeHistory) {
        return NextResponse.json({ success: true, queued: false, already_queued: true, history_id: activeHistory.id }, { status: 202 })
      }
    }

    else if (!consentConfirmed) {
      return NextResponse.json({ error: 'Confirme que o destinatário autorizou receber esta mensagem.', code: 'WHATSAPP_CONSENT_REQUIRED' }, { status: 412 })
    }

    const cleanPhone = normalizeWhatsAppNumber(phone)
    if (!cleanPhone) {
      return NextResponse.json({ error: 'Número de telefone inválido. Informe o DDI, por exemplo +55 11 99999-9999.' }, { status: 400 })
    }

    const { data: history, error: historyError } = await supabaseAdmin.from('alert_history').insert({
      user_id: user.id,
      organization_id: instance.organization_id,
      client_id: null,
      lead_id: leadId,
      phone: cleanPhone,
      instance_name: instance.instance_name,
      status: 'queued',
      message_content: message,
      queued_at: new Date().toISOString(),
      scheduled_at: new Date().toISOString(),
    }).select('id').single()
    if (historyError || !history) {
      throw new Error(`Falha ao registrar histórico da mensagem: ${historyError?.message || 'registro ausente'}`)
    }

    const job = await messageQueue.add('send-message', {
      organizationId: instance.organization_id,
      userId: user.id,
      instanceId: instance.id,
      instanceName: instance.instance_name,
      phone: cleanPhone,
      finalMessage: message,
      mediaBase64,
      mediaMimeType,
      alertHistoryId: history.id,
      leadId,
      source: leadId ? 'lead_campaign' : 'manual_single',
    }, {
      jobId: `alert-history:${history.id}`,
      priority: 5,
    })

    await supabaseAdmin.from('alert_history')
      .update({ source_job_id: String(job.id) })
      .eq('id', history.id)

    await logAudit({
      user_id: user.id,
      organization_id: instance.organization_id,
      action: 'whatsapp.send_single_queued',
      resource: 'evolution',
      resource_id: history.id,
      details: { instance_name: instance.instance_name, phone: `***${cleanPhone.slice(-4)}`, job_id: job.id, lead_id: leadId },
      ip_address: getIpFromRequest(req),
    })

    return NextResponse.json({
      success: true,
      queued: true,
      job_id: job.id,
      history_id: history.id,
    }, { status: 202 })
  } catch (error: unknown) {
    console.error('send-single error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { redisConnection } from '@/lib/redis'
import { messageQueue } from '@/lib/queue'
import { logAudit, getIpFromRequest } from '@/lib/audit'
import { normalizeCampaignPhone, parseLeadCampaignMessage } from '@/lib/lead-campaign'

const campaignRequestSchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1).max(2000).transform((ids) => [...new Set(ids)]),
  instanceNames: z.array(z.string().trim().min(1).max(100)).min(1).max(10),
  messageVariants: z.array(z.string().max(4000)).min(1).max(5),
  mediaBase64: z.string().max(8_000_000).nullable().optional(),
  mediaMimeType: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/).max(100).nullable().optional(),
  minDelaySeconds: z.number().int().min(0).max(600).default(15),
  maxDelaySeconds: z.number().int().min(0).max(600).default(30),
  pauseCount: z.number().int().min(10).max(2000).default(50),
  pauseDurationMinutes: z.number().int().min(0).max(240).default(5),
  messagesPerInstance: z.number().int().min(1).max(1000).default(10),
}).superRefine((value, context) => {
  if (value.maxDelaySeconds < value.minDelaySeconds) {
    context.addIssue({ code: 'custom', path: ['maxDelaySeconds'], message: 'maxDelaySeconds deve ser maior ou igual a minDelaySeconds' })
  }
})

function randomInteger(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (await redisConnection.sismember('global:banned_users', user.id)) {
      return NextResponse.json({ error: 'Sua conta foi suspensa temporariamente. Contate o suporte.' }, { status: 403 })
    }

    const parsed = campaignRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload da campanha inválido.', details: parsed.error.flatten() }, { status: 400 })
    }
    const input = parsed.data
    const instanceNames = [...new Set(input.instanceNames)]
    const hasMessage = input.messageVariants.some((message) => message.trim().length > 0)
    if (!hasMessage && !input.mediaBase64) {
      return NextResponse.json({ error: 'Adicione uma mensagem ou uma mídia.' }, { status: 400 })
    }

    const { data: instances, error: instanceError } = await supabaseAdmin
      .from('evolution_instances')
      .select('id, organization_id, instance_name, sending_paused, sending_pause_reason')
      .eq('user_id', user.id)
      .in('instance_name', instanceNames)

    if (instanceError) throw instanceError
    const instancesByName = new Map((instances || []).map((instance) => [instance.instance_name, instance]))
    if (instancesByName.size !== instanceNames.length) {
      return NextResponse.json({ error: 'Uma ou mais instâncias não foram encontradas ou não pertencem ao usuário.' }, { status: 400 })
    }
    const pausedInstance = (instances || []).find((instance) => instance.sending_paused)
    if (pausedInstance) {
      return NextResponse.json({ error: `Envios pausados na instância ${pausedInstance.instance_name}: ${pausedInstance.sending_pause_reason || 'revisão necessária'}` }, { status: 409 })
    }
    const organizationIds = new Set((instances || []).map((instance) => instance.organization_id).filter(Boolean))
    if (organizationIds.size !== 1) {
      return NextResponse.json({ error: 'As instâncias selecionadas precisam pertencer à mesma organização.' }, { status: 400 })
    }
    const organizationId = [...organizationIds][0]

    const { data: leads, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('id, name, phone, email, status, custom_fields, whatsapp_opt_in, whatsapp_opt_out, whatsapp_opt_in_categories')
      .eq('user_id', user.id)
      .in('id', input.leadIds)

    if (leadError) throw leadError
    const { data: activeHistories, error: activeHistoryError } = await supabaseAdmin
      .from('alert_history')
      .select('lead_id')
      .eq('user_id', user.id)
      .in('lead_id', input.leadIds)
      .in('status', ['queued', 'accepted', 'sent', 'delivered', 'read', 'pending'])
    if (activeHistoryError) throw activeHistoryError
    const activeLeadIds = new Set((activeHistories || []).map((history) => history.lead_id).filter(Boolean))
    const leadsById = new Map((leads || []).map((lead) => [lead.id, lead]))
    const skipped: Array<{ lead_id: string; name: string; reason: string }> = []
    const eligibleLeads: Array<{ lead: NonNullable<typeof leads>[number]; phone: string; instanceName: string; message: string }> = []

    for (const leadId of input.leadIds) {
      const lead = leadsById.get(leadId)
      if (!lead) {
        skipped.push({ lead_id: leadId, name: leadId, reason: 'LEAD_NOT_FOUND' })
        continue
      }
      if (lead.status === 'concluido' || lead.status === 'concluído') {
        skipped.push({ lead_id: lead.id, name: lead.name, reason: 'ALREADY_COMPLETED' })
        continue
      }
      if (activeLeadIds.has(lead.id)) {
        skipped.push({ lead_id: lead.id, name: lead.name, reason: 'ALREADY_IN_FLIGHT' })
        continue
      }
      const normalizedPhone = lead.phone ? normalizeCampaignPhone(lead.phone) : null
      if (!normalizedPhone) {
        skipped.push({ lead_id: lead.id, name: lead.name, reason: 'PHONE_INVALID' })
        continue
      }

      const queueIndex = eligibleLeads.length
      const instanceName = instanceNames[Math.floor(queueIndex / input.messagesPerInstance) % instanceNames.length]
      const template = input.messageVariants[randomInteger(0, input.messageVariants.length - 1)] || ''
      eligibleLeads.push({
        lead,
        phone: normalizedPhone,
        instanceName,
        message: parseLeadCampaignMessage(template, lead),
      })
    }

    if (eligibleLeads.length === 0) {
      return NextResponse.json({ success: true, queued: true, queued_count: 0, queued_lead_ids: [], skipped })
    }

    const queuedAt = new Date().toISOString()
    const { data: histories, error: historyError } = await supabaseAdmin
      .from('alert_history')
      .insert(eligibleLeads.map(({ lead, phone, instanceName, message }) => ({
        user_id: user.id,
        organization_id: organizationId,
        client_id: null,
        lead_id: lead.id,
        phone,
        instance_name: instanceName,
        status: 'queued',
        message_content: message,
        queued_at: queuedAt,
        scheduled_at: queuedAt,
      })))
      .select('id, lead_id')

    if (historyError || !histories || histories.length !== eligibleLeads.length) {
      throw new Error(`Falha ao registrar histórico da campanha: ${historyError?.message || 'registros incompletos'}`)
    }

    const historyByLeadId = new Map(histories.map((history) => [history.lead_id, history.id]))
    let cumulativeDelay = 0
    const jobs = eligibleLeads.map(({ lead, phone, instanceName, message }, index) => {
      if (index > 0) {
        cumulativeDelay += randomInteger(input.minDelaySeconds, input.maxDelaySeconds) * 1000
      }
      if (index > 0 && index % input.pauseCount === 0) {
        cumulativeDelay += input.pauseDurationMinutes * 60 * 1000
      }
      const alertHistoryId = historyByLeadId.get(lead.id)
      if (!alertHistoryId) throw new Error(`Histórico ausente para o lead ${lead.id}`)
      return {
        name: 'send-message',
        data: {
          organizationId,
          userId: user.id,
          instanceId: instancesByName.get(instanceName)?.id || null,
          instanceName,
          phone,
          finalMessage: message,
          mediaBase64: input.mediaBase64 || null,
          mediaMimeType: input.mediaMimeType || null,
          alertHistoryId,
          leadId: lead.id,
          source: 'lead_campaign',
        },
        opts: {
          jobId: `alert-history:${alertHistoryId}`,
          priority: 5,
          delay: cumulativeDelay,
        },
      }
    })

    try {
      await messageQueue.addBulk(jobs)
    } catch (error) {
      await supabaseAdmin.from('alert_history').update({ status: 'failed', failed_at: new Date().toISOString(), error_message: 'QUEUE_ENQUEUE_FAILED' }).in('id', histories.map((history) => history.id))
      throw error
    }

    const queuedLeadIds = eligibleLeads.map(({ lead }) => lead.id)
    const { error: leadStatusError } = await supabaseAdmin
      .from('leads')
      .update({ status: 'enfileirado' })
      .eq('user_id', user.id)
      .in('id', queuedLeadIds)
    if (leadStatusError) console.error('Falha ao marcar leads como enfileirados:', leadStatusError)

    await logAudit({
      user_id: user.id,
      organization_id: organizationId,
      action: 'whatsapp.send_campaign_queued',
      resource: 'campaigns',
      details: { queued_count: queuedLeadIds.length, skipped_count: skipped.length, instance_names: instanceNames },
      ip_address: getIpFromRequest(request),
    })

    return NextResponse.json({
      success: true,
      queued: true,
      queued_count: queuedLeadIds.length,
      queued_lead_ids: queuedLeadIds,
      skipped,
    }, { status: 202 })
  } catch (error: unknown) {
    console.error('send-campaign error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { redisConnection } from '@/lib/redis'
import { messageQueue } from '@/lib/queue'
import { MESSAGE_PRIORITY } from '@/lib/message-priority'
import { logAudit, getIpFromRequest } from '@/lib/audit'
import { normalizeCampaignPhone, parseLeadCampaignMessage } from '@/lib/lead-campaign'
import { resolveMassInstances } from '@/lib/instance-routing'

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
      .select('id, organization_id, instance_name, sending_paused, sending_pause_reason, min_delay, message_min_interval_ms')
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

    // Papel do número: o principal fica reservado a lembretes e alertas, e um
    // número já em outra campanha não entra nesta. A única exceção é a operação
    // de um número só — ver resolveMassInstances.
    const decisaoMassa = await resolveMassInstances({ organizationId, instanceNames })
    if (decisaoMassa.permitidas.length === 0) {
      const motivos: Record<string, string> = {
        NOT_FOUND: 'não encontrado',
        PRIMARY_RESERVED: 'é o número principal, reservado a lembretes e alertas',
        MASS_NOT_ALLOWED: 'não está liberado para disparo em massa',
        BUSY_WITH_MASS: 'já está em uma campanha em andamento',
      }
      const detalhe = decisaoMassa.recusadas
        .map((item) => `${item.instance_name}: ${motivos[item.motivo] || item.motivo}`)
        .join('; ')
      return NextResponse.json({
        error: `Nenhum número disponível para disparo em massa. ${detalhe}`,
        refused_instances: decisaoMassa.recusadas,
      }, { status: 409 })
    }
    // Segue apenas com os números aprovados, na ordem em que foram pedidos.
    const massInstanceNames = decisaoMassa.permitidas.map((instancia) => instancia.instance_name)

    const { data: leads, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('id, name, phone, email, status, custom_fields')
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
    const phonesJaIncluidos = new Set<string>()
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
      // Uma mensagem por pessoa. A base tem o mesmo telefone cadastrado como
      // leads diferentes (importação repetida de CSV), e deduplicar só por
      // `lead_id` fazia a mesma pessoa receber uma mensagem por cadastro — sete,
      // no pior caso observado em 10/09/2026. A trava definitiva é o índice
      // único (mass_run_id, phone) no banco; esta checagem evita chegar lá e
      // explica ao operador, no log da campanha, quem ficou de fora e por quê.
      if (phonesJaIncluidos.has(normalizedPhone)) {
        skipped.push({ lead_id: lead.id, name: lead.name, reason: 'PHONE_DUPLICATE' })
        continue
      }
      phonesJaIncluidos.add(normalizedPhone)

      const queueIndex = eligibleLeads.length
      const instanceName = massInstanceNames[Math.floor(queueIndex / input.messagesPerInstance) % massInstanceNames.length]
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

    // O worker impõe um intervalo mínimo por instância (anti-bloqueio) que não
    // pode ser afrouxado pela campanha. Pedir 5s quando o piso é 15s não
    // acelerava nada — só fazia a tela mostrar um ritmo que nunca aconteceu.
    // Aqui a cadência pedida é elevada ao piso e devolvida ao cliente.
    const instanceFloorSeconds = Math.max(
      0,
      ...[...instancesByName.values()].map((instance) => Math.ceil(Math.max(
        Number(instance.message_min_interval_ms) || 0,
        (Number(instance.min_delay) || 0) * 1000,
      ) / 1000)),
    )
    const effectiveMinDelaySeconds = Math.max(input.minDelaySeconds, instanceFloorSeconds)
    const effectiveMaxDelaySeconds = Math.max(input.maxDelaySeconds, effectiveMinDelaySeconds)
    const cadenceClamped = effectiveMinDelaySeconds !== input.minDelaySeconds
      || effectiveMaxDelaySeconds !== input.maxDelaySeconds

    // A execução ganha identidade antes de qualquer job existir. É ela que
    // permite pausar/parar uma campanha já enfileirada (o worker consulta o
    // status antes de cada envio) e que marca estes números como ocupados, para
    // que lembrete e alerta não saiam por eles enquanto a campanha roda.
    const { data: run, error: runError } = await supabaseAdmin
      .from('mass_campaign_runs')
      .insert({
        organization_id: organizationId,
        user_id: user.id,
        status: 'running',
        instance_names: massInstanceNames,
        total_messages: eligibleLeads.length,
        skipped_messages: skipped.length,
      })
      .select('id')
      .single()

    if (runError || !run) {
      throw new Error(`Falha ao registrar a execução da campanha: ${runError?.message || 'sem retorno'}`)
    }

    const queuedAt = new Date().toISOString()
    const { data: histories, error: historyError } = await supabaseAdmin
      .from('alert_history')
      .insert(eligibleLeads.map(({ lead, phone, instanceName, message }) => ({
        user_id: user.id,
        organization_id: organizationId,
        client_id: null,
        lead_id: lead.id,
        mass_run_id: run.id,
        phone,
        instance_name: instanceName,
        status: 'queued',
        message_content: message,
        queued_at: queuedAt,
        scheduled_at: queuedAt,
      })))
      .select('id, lead_id')

    if (historyError || !histories || histories.length !== eligibleLeads.length) {
      // Sem isto a run ficaria 'running' sem nenhum job, ocupando os números
      // para lembrete indefinidamente.
      await supabaseAdmin.from('mass_campaign_runs')
        .update({ status: 'stopped', stop_reason: 'HISTORY_INSERT_FAILED', finished_at: new Date().toISOString() })
        .eq('id', run.id)
      throw new Error(`Falha ao registrar histórico da campanha: ${historyError?.message || 'registros incompletos'}`)
    }

    const historyByLeadId = new Map(histories.map((history) => [history.lead_id, history.id]))
    let cumulativeDelay = 0
    const jobs = eligibleLeads.map(({ lead, phone, instanceName, message }, index) => {
      if (index > 0) {
        cumulativeDelay += randomInteger(effectiveMinDelaySeconds, effectiveMaxDelaySeconds) * 1000
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
          massRunId: run.id,
          source: 'lead_campaign',
        },
        opts: {
          // Separador com hífen, não `:`. O BullMQ 5.77 rejeita id customizado
          // com um único dois-pontos (`Custom Id cannot contain :`, job.js), o
          // que fazia toda campanha estourar no addBulk antes de tocar no Redis.
          jobId: `alert-history-${alertHistoryId}`,
          priority: MESSAGE_PRIORITY.bulk,
          delay: cumulativeDelay,
        },
      }
    })

    try {
      await messageQueue.addBulk(jobs)
    } catch (error) {
      await supabaseAdmin.from('alert_history').update({ status: 'failed', failed_at: new Date().toISOString(), error_message: 'QUEUE_ENQUEUE_FAILED' }).in('id', histories.map((history) => history.id))
      await supabaseAdmin.from('mass_campaign_runs')
        .update({ status: 'stopped', stop_reason: 'QUEUE_ENQUEUE_FAILED', finished_at: new Date().toISOString() })
        .eq('id', run.id)
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
      run_id: run.id,
      instance_names: massInstanceNames,
      refused_instances: decisaoMassa.recusadas,
      queued_count: queuedLeadIds.length,
      queued_lead_ids: queuedLeadIds,
      skipped,
      cadence: {
        min_delay_seconds: effectiveMinDelaySeconds,
        max_delay_seconds: effectiveMaxDelaySeconds,
        instance_floor_seconds: instanceFloorSeconds,
        clamped: cadenceClamped,
      },
    }, { status: 202 })
  } catch (error: unknown) {
    console.error('send-campaign error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno' }, { status: 500 })
  }
}

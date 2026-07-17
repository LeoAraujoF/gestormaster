import '../lib/env'

import crypto from 'crypto'
import { Job, Worker } from 'bullmq'
import { supabaseAdmin } from '../lib/supabase/service-role'
import { redisConnection } from '../lib/redis'
import { WEBHOOK_QUEUE_NAME, aiQueue, messageQueue } from '../lib/queue'
import { logger, runWithCorrelationId } from '../lib/logger'
import { createMercadoPagoPixCharge } from '../lib/pix-charges'
import { startOperationalHeartbeat } from '../lib/operational-heartbeat'

startOperationalHeartbeat('webhook_worker')
import {
  BOT_STATE_TTL_SECONDS,
  brazilPhoneE164Candidates,
  brazilPhoneLegacyCandidates,
  buildMainMenu,
  generateVerificationCode,
  isMenuCommand,
  normalizeBrazilPhone,
  parseDueDate,
  PHONE_VERIFICATION_TTL_MINUTES,
  resolveIncomingPhoneJid,
  verifyCode,
} from '../lib/autoatendimento'

type BotState =
  | { step: 'main_menu'; clientId: string }
  | { step: 'choosing_plan'; clientId: string; plans: Array<{ name: string; price: number }> }
  | { step: 'confirm_renewal'; clientId: string; price: number; planName: string }
  | { step: 'awaiting_due_date'; clientId: string }
  | { step: 'awaiting_new_phone'; clientId: string }
  | { step: 'awaiting_phone_code'; clientId: string; verificationId: string }

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

async function sendBotMessage(input: {
  organizationId: string
  userId: string
  instanceName: string
  phone: string
  message: string
}) {
  await messageQueue.add('send-message', {
    organizationId: input.organizationId,
    userId: input.userId,
    instanceName: input.instanceName,
    phone: input.phone,
    finalMessage: input.message,
    source: 'autoatendimento',
  })
}

async function loadAutoConfig(organizationId: string) {
  const { data } = await supabaseAdmin
    .from('integrations')
    .select('credentials, is_active')
    .eq('organization_id', organizationId)
    .eq('provider', 'autoatendimento')
    .maybeSingle()
  return {
    enabled: data?.is_active ?? true,
    credentials: data?.credentials || {},
  }
}

async function sendToAi(organizationId: string, instanceName: string, remoteJid: string, messageText: string) {
  const { data } = await supabaseAdmin
    .from('integrations')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('provider', 'ai_assistant')
    .eq('is_active', true)
    .maybeSingle()
  if (!data) return
  await aiQueue.add('process-ai', {
    organization_id: organizationId,
    instance_name: instanceName,
    remoteJid,
    messageText,
    integration_id: data.id,
  })
}

async function handleConnectionUpdate(payload: any) {
  const instanceName = payload.instance
  const state = payload.data?.state
  if (!instanceName || !state) return
  const sender = payload.sender || payload.data?.sender
  await supabaseAdmin
    .from('evolution_instances')
    .update({
      status: state === 'open' ? 'connected' : 'disconnected',
      ...(sender ? { phone_number: String(sender).split('@')[0] } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('instance_name', instanceName)
}

async function handleInboundMessage(payload: any) {
  const message = payload.data?.messages?.[0] || payload.data
  const remoteJid = resolveIncomingPhoneJid(message?.key)
  const text = message?.message?.conversation || message?.message?.extendedTextMessage?.text || message?.message?.imageMessage?.caption
  const instanceName = payload.instance as string | undefined

  if (!remoteJid || !instanceName || message?.key?.fromMe || !text) return
  const phoneCandidates = brazilPhoneE164Candidates(remoteJid.split('@')[0])
  const legacyPhoneCandidates = brazilPhoneLegacyCandidates(remoteJid.split('@')[0])
  const normalizedPhone = phoneCandidates[0]
  if (!normalizedPhone) return

  const { data: instance } = await supabaseAdmin
    .from('evolution_instances')
    .select('organization_id')
    .eq('instance_name', instanceName)
    .maybeSingle()
  if (!instance?.organization_id) return

  const organizationId = instance.organization_id
  const clientSelect = 'id, user_id, name, plan_value, phone, phone_e164, client_services(services(name, plans))'
  const [e164Result, legacyResult] = await Promise.all([
    supabaseAdmin
      .from('clients')
      .select(clientSelect)
      .eq('organization_id', organizationId)
      .in('phone_e164', phoneCandidates),
    supabaseAdmin
      .from('clients')
      .select(clientSelect)
      .eq('organization_id', organizationId)
      .in('phone', legacyPhoneCandidates),
  ])

  if (e164Result.error) throw e164Result.error
  if (legacyResult.error) throw legacyResult.error
  const clients = [...(e164Result.data || []), ...(legacyResult.data || [])]
  const client = phoneCandidates
    .map((candidate) => clients.find((item) => (
      item.phone_e164 === candidate || normalizeBrazilPhone(item.phone || '') === candidate
    )))
    .find(Boolean)

  if (!client) {
    logger.warn(`[Webhook] Cliente não localizado; ${phoneCandidates.length} variante(s) E.164 verificada(s).`)
    await sendToAi(organizationId, instanceName, remoteJid, text)
    return
  }

  if (!client.phone_e164) {
    logger.warn('[Webhook] Cliente localizado pelo telefone legado; phone_e164 ainda não preenchido.')
  }

  const deliveryPhone = client.phone_e164 || normalizeBrazilPhone(client.phone || '') || normalizedPhone

  const pauseKey = `bot_pause:${organizationId}:${normalizedPhone}`
  if (await redisConnection.get(pauseKey)) return

  const stateKey = `bot_state:${organizationId}:${normalizedPhone}`
  const config = await loadAutoConfig(organizationId)
  if (!config.enabled) return

  const textValue = text.trim()
  const stateRaw = await redisConnection.get(stateKey)
  let state: BotState | null = null
  if (stateRaw) {
    try {
      state = JSON.parse(stateRaw) as BotState
    } catch {
      await redisConnection.del(stateKey)
    }
  }

  const openMenu = async () => {
    await redisConnection.setex(stateKey, BOT_STATE_TTL_SECONDS, JSON.stringify({ step: 'main_menu', clientId: client.id }))
    const greeting = typeof config.credentials.greetingMessage === 'string' ? config.credentials.greetingMessage : ''
    await sendBotMessage({
      organizationId,
      userId: client.user_id,
      instanceName,
      phone: deliveryPhone,
      message: greeting ? `${greeting}\n\n${buildMainMenu(client.name).split('\n\n').slice(1).join('\n\n')}` : buildMainMenu(client.name),
    })
  }

  if (!state && isMenuCommand(textValue)) {
    await openMenu()
    return
  }
  if (!state) {
    await sendToAi(organizationId, instanceName, remoteJid, text)
    return
  }
  if (isMenuCommand(textValue) && !['1', '2', '3', '4', '5', '6'].includes(textValue)) {
    await openMenu()
    return
  }

  if (state.step === 'main_menu') {
    if (textValue === '1') {
      if (Number(client.plan_value) > 0) {
        await redisConnection.setex(stateKey, BOT_STATE_TTL_SECONDS, JSON.stringify({
          step: 'confirm_renewal', clientId: client.id, price: Number(client.plan_value), planName: 'Mensalidade',
        }))
        await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: deliveryPhone, message: `Sua mensalidade é ${currency.format(Number(client.plan_value))}. Confirmar geração do PIX?\n\n1️⃣ Sim\n2️⃣ Cancelar` })
        return
      }
      const plans = (client.client_services as Array<{ services?: { plans?: Array<{ name: string; price: number }> } }> | null)
        ?.flatMap((item) => item.services?.plans || []) || []
      if (!plans.length) {
        await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: deliveryPhone, message: 'Não encontrei um plano ativo. Escolha a opção 6 para falar com o atendente.' })
        return
      }
      await redisConnection.setex(stateKey, BOT_STATE_TTL_SECONDS, JSON.stringify({ step: 'choosing_plan', clientId: client.id, plans }))
      await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: deliveryPhone, message: `Escolha o plano:\n\n${plans.map((plan, index) => `${index + 1}. ${plan.name} — ${currency.format(plan.price)}`).join('\n')}` })
      return
    }

    if (textValue === '2') {
      const { data: pending } = await supabaseAdmin
        .from('pix_charges')
        .select('amount, copia_e_cola')
        .eq('client_id', client.id)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: deliveryPhone, message: pending?.copia_e_cola ? `PIX pendente de ${currency.format(Number(pending.amount))}:\n\n${pending.copia_e_cola}` : 'Não há PIX pendente e válido. Escolha a opção 1 para gerar uma nova cobrança.' })
      await redisConnection.del(stateKey)
      return
    }

    if (textValue === '3') {
      await redisConnection.setex(stateKey, BOT_STATE_TTL_SECONDS, JSON.stringify({ step: 'awaiting_due_date', clientId: client.id }))
      await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: deliveryPhone, message: 'Informe a data desejada no formato DD/MM/AAAA. A alteração depende da aprovação do gestor.' })
      return
    }

    if (textValue === '4') {
      const { data: history } = await supabaseAdmin
        .from('pix_charges')
        .select('amount, paid_at')
        .eq('client_id', client.id)
        .eq('status', 'paid')
        .order('paid_at', { ascending: false })
        .limit(3)
      const body = history?.length
        ? `Seus últimos pagamentos:\n\n${history.map((item) => `✅ ${new Date(item.paid_at).toLocaleDateString('pt-BR')} — ${currency.format(Number(item.amount))}`).join('\n')}`
        : 'Você ainda não possui pagamentos confirmados.'
      await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: deliveryPhone, message: body })
      await redisConnection.del(stateKey)
      return
    }

    if (textValue === '5') {
      await redisConnection.setex(stateKey, BOT_STATE_TTL_SECONDS, JSON.stringify({ step: 'awaiting_new_phone', clientId: client.id }))
      await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: deliveryPhone, message: 'Informe o novo número com DDD. Enviaremos um código de confirmação para ele.' })
      return
    }

    if (textValue === '6') {
      await redisConnection.setex(pauseKey, 12 * 60 * 60, 'paused')
      await supabaseAdmin.from('client_change_requests').insert({ organization_id: organizationId, client_id: client.id, request_type: 'human_support', requested_from_phone: normalizedPhone })
      const message = typeof config.credentials.transferMessage === 'string' ? config.credentials.transferMessage : 'Um atendente assumirá o atendimento em breve.'
      await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: deliveryPhone, message })
      await redisConnection.del(stateKey)
      return
    }

    await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: deliveryPhone, message: 'Opção inválida. Digite um número de 1 a 6.' })
    return
  }

  if (state.step === 'choosing_plan') {
    const selected = state.plans[Number(textValue) - 1]
    if (!selected) {
      await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: deliveryPhone, message: 'Opção inválida. Escolha um dos planos apresentados.' })
      return
    }
    await redisConnection.setex(stateKey, BOT_STATE_TTL_SECONDS, JSON.stringify({ step: 'confirm_renewal', clientId: client.id, price: selected.price, planName: selected.name }))
    await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: deliveryPhone, message: `Confirmar PIX de ${currency.format(selected.price)} para ${selected.name}?\n\n1️⃣ Sim\n2️⃣ Cancelar` })
    return
  }

  if (state.step === 'confirm_renewal') {
    if (textValue !== '1' && textValue.toLowerCase() !== 'sim') {
      await redisConnection.del(stateKey)
      await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: deliveryPhone, message: 'Operação cancelada. Digite menu para começar novamente.' })
      return
    }
    const charge = await createMercadoPagoPixCharge({
      organizationId,
      userId: client.user_id,
      clientId: client.id,
      amount: state.price,
      phone: deliveryPhone,
      instanceName,
      months: 1,
      planName: state.planName,
    })
    await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: deliveryPhone, message: `PIX de ${currency.format(state.price)} gerado:\n\n${charge.copia_e_cola || 'Código indisponível'}` })
    await redisConnection.del(stateKey)
    return
  }

  if (state.step === 'awaiting_due_date') {
    const dueDate = parseDueDate(textValue)
    if (!dueDate) {
      await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: deliveryPhone, message: 'Data inválida. Use DD/MM/AAAA e escolha uma data nos próximos 90 dias.' })
      return
    }
    await supabaseAdmin.from('client_change_requests').insert({ organization_id: organizationId, client_id: client.id, request_type: 'due_date', requested_due_date: dueDate, requested_from_phone: normalizedPhone })
    await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: deliveryPhone, message: 'Solicitação enviada ao gestor. Você será avisado após a análise.' })
    await redisConnection.del(stateKey)
    return
  }

  if (state.step === 'awaiting_new_phone') {
    const newPhone = normalizeBrazilPhone(textValue)
    if (!newPhone || newPhone === client.phone_e164) {
      await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: deliveryPhone, message: 'Número inválido ou igual ao atual. Informe outro telefone com DDD.' })
      return
    }
    const code = generateVerificationCode()
    const { data: verification, error } = await supabaseAdmin
      .from('phone_change_verifications')
      .insert({ organization_id: organizationId, client_id: client.id, new_phone_e164: newPhone, code_hash: code.hash, expires_at: new Date(Date.now() + PHONE_VERIFICATION_TTL_MINUTES * 60 * 1000).toISOString() })
      .select('id')
      .single()
    if (error || !verification) throw new Error('Não foi possível iniciar a confirmação de telefone')
    await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: newPhone, message: `Seu código de confirmação é: ${code.plain}. Ele expira em ${PHONE_VERIFICATION_TTL_MINUTES} minutos.` })
    await redisConnection.setex(stateKey, BOT_STATE_TTL_SECONDS, JSON.stringify({ step: 'awaiting_phone_code', clientId: client.id, verificationId: verification.id }))
    await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: deliveryPhone, message: 'Enviei o código ao novo número. Responda aqui com os 6 dígitos para concluir.' })
    return
  }

  if (state.step === 'awaiting_phone_code') {
    const { data: verification } = await supabaseAdmin
      .from('phone_change_verifications')
      .select('id, code_hash')
      .eq('id', state.verificationId)
      .eq('client_id', client.id)
      .maybeSingle()
    if (!verification) {
      await redisConnection.del(stateKey)
      await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: deliveryPhone, message: 'A confirmação não está mais disponível. Inicie o processo novamente pelo menu.' })
      return
    }

    const submittedHash = verifyCode(textValue, verification.code_hash) ? verification.code_hash : '__invalid__'
    const { data: completion, error: completionError } = await supabaseAdmin.rpc('complete_phone_change', {
      p_verification_id: verification.id,
      p_code_hash: submittedHash,
    })
    if (completionError) throw new Error('Não foi possível confirmar o telefone')

    const result = completion as { status: string; new_phone_e164?: string }
    if (result.status === 'invalid') {
      await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: deliveryPhone, message: 'Código inválido. Tente novamente.' })
      return
    }
    if (result.status !== 'confirmed' || !result.new_phone_e164) {
      await redisConnection.del(stateKey)
      await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: deliveryPhone, message: 'O código expirou ou excedeu as tentativas. Inicie o processo novamente pelo menu.' })
      return
    }
    await sendBotMessage({ organizationId, userId: client.user_id, instanceName, phone: result.new_phone_e164, message: 'Telefone atualizado com sucesso.' })
    await redisConnection.del(stateKey)
  }
}

const worker = new Worker(WEBHOOK_QUEUE_NAME, async (job: Job) => {
  const payload = job.data
  const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  const idempotencyKey = `webhook:idempotency:${hash}`
  const claimed = await redisConnection.set(idempotencyKey, 'processing', 'EX', 86400, 'NX')
  if (!claimed) return

  return runWithCorrelationId(payload.correlationId, undefined, async () => {
    try {
      if (payload.event === 'CONNECTION_UPDATE' || payload.event === 'connection.update') await handleConnectionUpdate(payload)
      if (payload.event === 'MESSAGES_UPSERT' || payload.event === 'messages.upsert') await handleInboundMessage(payload)
      logger.info(`[Webhook ${job.id}] processado com sucesso`)
    } catch (error: any) {
      await redisConnection.del(idempotencyKey)
      logger.error(`[Webhook ${job.id}] falhou: ${error.message}`)
      throw error
    }
  })
}, { connection: redisConnection as any, concurrency: 10 })

worker.on('failed', (job, error) => {
  if (job) logger.error(`[Webhook ${job.id}] falhou definitivamente: ${error.message}`)
})

import '../lib/env';
import { Worker, Job } from 'bullmq';
import { redisConnection } from '../lib/redis';
import { MESSAGE_QUEUE_NAME } from '../lib/queue';
import { supabaseAdmin } from '../lib/supabase/service-role';
import { EvolutionWhatsAppProvider } from '../providers/whatsapp/EvolutionWhatsAppProvider';
import { logger, runWithCorrelationId } from '../lib/logger';
import { RateLimiter } from '../lib/rate-limiter';
import { CircuitBreaker } from '../lib/circuit-breaker';
import { SecretsManager } from '../lib/encryption';
import { dispatchFailureStatus } from '../lib/collection-dispatch';
import { processPortalOtpJob } from '../lib/portal-otp-worker';
import { startOperationalHeartbeat } from '../lib/operational-heartbeat';
import { buildBillingAlertButtons } from '../lib/whatsapp-interactive';
import type { WhatsAppInteractiveMessage } from '../providers/whatsapp/IWhatsAppProvider';
import { normalizeSendMessageJob } from '../lib/message-job-contract';
import { normalizeWhatsAppNumber } from '../lib/phone';
import { hasWhatsAppConsent, reserveInstanceDailyQuota, reserveInstanceSendSlot, sleep, whatsappCategoryForContactCategory } from '../lib/whatsapp-safety';
import { isRetryableWhatsAppError, shouldPauseWhatsAppInstance, whatsappErrorCode } from '../providers/whatsapp/provider-error';

startOperationalHeartbeat('message_worker');

logger.info('🚀 Queue Worker iniciado e aguardando jobs...');

function extractProviderMessageId(response: unknown): string | undefined {
  if (!response || typeof response !== 'object') return undefined;
  const value = response as Record<string, any>;
  const candidates = [
    value.key?.id,
    value.data?.key?.id,
    value.message?.key?.id,
    value.messages?.[0]?.key?.id,
  ];
  return candidates.find((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0);
}

const worker = new Worker(MESSAGE_QUEUE_NAME, async (job: Job) => {
  if (await processPortalOtpJob(job.data)) return;
  const normalizedJob = normalizeSendMessageJob(job.data);
  let {
    clientId, phone, instanceUrl, apiKey, connectionMode,
    alertHistoryId, ruleId, userId, correlationId
  } = normalizedJob as typeof normalizedJob & { clientId?: string; ruleId?: string; instanceUrl?: string; apiKey?: string; connectionMode?: string };
  const jobSource = normalizedJob.source || undefined;
  const renewalReminderClientId = (job.data as Record<string, unknown>).renewalReminderClientId as string | undefined;
  const renewalReminderDueDate = (job.data as Record<string, unknown>).renewalReminderDueDate as string | undefined;
  userId = userId || undefined;
  correlationId = correlationId || undefined;
  let instanceId = normalizedJob.instanceId as string | undefined;
  let leadId = normalizedJob.leadId as string | undefined;
  const collectionDispatchId = normalizedJob.collectionDispatchId as string | undefined;
  const contactReservationId = normalizedJob.contactReservationId as string | undefined;
  let interactiveMessage = normalizedJob.interactiveMessage as WhatsAppInteractiveMessage | undefined;
  let contactCategory: string | undefined;
  let instanceSendingPaused = false;
  let instanceSendingPauseReason: string | null = null;
  let instanceDailyMessageLimit = 80;
  let instanceMessageMinIntervalMs = 15000;
  let instanceMessageMaxIntervalMs = 25000;

  let finalMessage = normalizedJob.finalMessage;
  let organizationId = normalizedJob.organizationId;
  let instanceName = normalizedJob.instanceName;
  let mediaUrl = normalizedJob.mediaUrl || undefined;
  const mediaBase64 = normalizedJob.mediaBase64 || undefined;
  const mediaMimeType = normalizedJob.mediaMimeType || undefined;

  if (contactReservationId) {
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc('claim_contact_reservation', {
      p_reservation_id: contactReservationId,
      p_is_retry: job.attemptsMade > 0,
    });
    if (claimError) throw new Error(`Falha ao reservar contato coordenado: ${claimError.message}`);
    if (!claimed) return;

    const { data: reservation, error: reservationError } = await supabaseAdmin.from('contact_reservations')
      .select('id, organization_id, client_id, requested_by, automation_id, alert_history_id, message_content, media_url, category, status')
      .eq('id', contactReservationId).maybeSingle();
    if (reservationError || !reservation) throw new Error('Reserva de contato não encontrada');
    if (reservation.status === 'cancelled') return;
    const { data: client } = await supabaseAdmin.from('clients')
      .select('id, phone_e164, phone, user_id, status')
      .eq('id', reservation.client_id).eq('organization_id', reservation.organization_id).maybeSingle();
    if (reservation.category === 'billing' && client?.status === 'canceled') {
      await supabaseAdmin.from('contact_reservations')
        .update({ status: 'cancelled', decision_reason: 'CUSTOMER_CANCELLED_RENEWAL' })
        .eq('id', reservation.id);
      return;
    }
    if (!client || !(client.phone_e164 || client.phone)) {
      await supabaseAdmin.from('contact_reservations').update({ status: 'failed', decision_reason: 'CLIENT_WITHOUT_PHONE' }).eq('id', reservation.id);
      throw new Error('Cliente sem telefone para contato coordenado');
    }
    const { data: instance } = await supabaseAdmin.from('evolution_instances')
      .select('id, instance_name, base_url, api_key, connection_mode, min_delay, max_delay, sending_paused, sending_pause_reason, daily_message_limit, message_min_interval_ms')
      .eq('organization_id', reservation.organization_id).eq('status', 'connected')
      .order('is_primary', { ascending: false }).limit(1).maybeSingle();
    if (!instance) {
      await supabaseAdmin.from('contact_reservations').update({ status: 'failed', decision_reason: 'NO_CONNECTED_INSTANCE' }).eq('id', reservation.id);
      throw new Error('Nenhuma instância conectada para contato coordenado');
    }

    clientId = client.id;
    phone = client.phone_e164 || client.phone;
    userId = reservation.requested_by || client.user_id;
    organizationId = reservation.organization_id;
    alertHistoryId = reservation.alert_history_id;
    ruleId = reservation.automation_id;
    finalMessage = reservation.message_content;
    mediaUrl = reservation.media_url || undefined;
    contactCategory = reservation.category;
    instanceId = instance.id;
    instanceName = instance.instance_name;
    instanceUrl = instance.base_url;
    apiKey = instance.api_key;
    connectionMode = instance.connection_mode;
    instanceSendingPaused = instance.sending_paused === true;
    instanceSendingPauseReason = instance.sending_pause_reason || null;
    instanceDailyMessageLimit = instance.daily_message_limit || instanceDailyMessageLimit;
    instanceMessageMinIntervalMs = Math.max(instance.message_min_interval_ms || 0, (instance.min_delay || 0) * 1000, 1000);
    instanceMessageMaxIntervalMs = Math.max(instanceMessageMinIntervalMs, (instance.max_delay || 25) * 1000);
  }

  if (collectionDispatchId) {
    contactCategory = 'billing';
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc('claim_collection_dispatch', {
      p_dispatch_id: collectionDispatchId,
      p_is_retry: job.attemptsMade > 0,
    });
    if (claimError) throw new Error(`Falha ao reservar despacho inteligente: ${claimError.message}`);
    if (!claimed) return;

    const { data: dispatch, error: dispatchError } = await supabaseAdmin
      .from('collection_dispatches')
      .select('id, organization_id, client_id, cycle_id, alert_history_id, message_content, status')
      .eq('id', collectionDispatchId)
      .maybeSingle();
    if (dispatchError || !dispatch) throw new Error('Despacho inteligente não encontrado');
    const { data: cycle } = await supabaseAdmin.from('billing_cycles').select('status').eq('id', dispatch.cycle_id).maybeSingle();
    if (!cycle || !['open', 'overdue'].includes(cycle.status)) {
      await supabaseAdmin.from('collection_dispatches').update({ status: 'cancelled' }).eq('id', dispatch.id).eq('status', 'processing');
      if (contactReservationId) {
        await supabaseAdmin.from('contact_reservations')
          .update({ status: 'cancelled', decision_reason: 'BILLING_CYCLE_CLOSED' })
          .eq('id', contactReservationId)
          .eq('status', 'processing');
      }
      return;
    }
    const { data: client } = await supabaseAdmin.from('clients')
      .select('id, phone_e164, phone, user_id, status')
      .eq('id', dispatch.client_id).eq('organization_id', dispatch.organization_id).maybeSingle();
    if (client?.status === 'canceled') {
      await supabaseAdmin.from('collection_dispatches')
        .update({ status: 'cancelled', error_message: 'Cancelado pelo cliente via WhatsApp' })
        .eq('id', dispatch.id);
      if (contactReservationId) {
        await supabaseAdmin.from('contact_reservations')
          .update({ status: 'cancelled', decision_reason: 'CUSTOMER_CANCELLED_RENEWAL' })
          .eq('id', contactReservationId);
      }
      return;
    }
    if (!client || !(client.phone_e164 || client.phone)) {
      await supabaseAdmin.from('collection_dispatches').update({ status: 'failed', error_message: 'Cliente sem telefone para despacho inteligente' }).eq('id', dispatch.id);
      throw new Error('Cliente sem telefone para despacho inteligente');
    }
    const { data: instance } = await supabaseAdmin.from('evolution_instances')
      .select('id, instance_name, base_url, api_key, connection_mode, min_delay, max_delay, sending_paused, sending_pause_reason, daily_message_limit, message_min_interval_ms')
      .eq('organization_id', dispatch.organization_id).eq('status', 'connected').limit(1).maybeSingle();
    if (!instance) {
      const status = dispatchFailureStatus(job.attemptsMade, job.opts.attempts);
      await supabaseAdmin.from('collection_dispatches').update({ status, error_message: 'Nenhuma instância conectada para despacho inteligente' }).eq('id', dispatch.id);
      throw new Error('Nenhuma instância conectada para despacho inteligente');
    }

    clientId = client.id;
    phone = client.phone_e164 || client.phone;
    userId = client.user_id;
    organizationId = dispatch.organization_id;
    alertHistoryId = dispatch.alert_history_id;
    finalMessage = dispatch.message_content;
    instanceId = instance.id;
    instanceName = instance.instance_name;
    instanceUrl = instance.base_url;
    apiKey = instance.api_key;
    connectionMode = instance.connection_mode;
    instanceSendingPaused = instance.sending_paused === true;
    instanceSendingPauseReason = instance.sending_pause_reason || null;
    instanceDailyMessageLimit = instance.daily_message_limit || instanceDailyMessageLimit;
    instanceMessageMinIntervalMs = Math.max(instance.message_min_interval_ms || 0, (instance.min_delay || 0) * 1000, 1000);
    instanceMessageMaxIntervalMs = Math.max(instanceMessageMinIntervalMs, (instance.max_delay || 25) * 1000);
  }

  if (!interactiveMessage && contactCategory === 'billing') {
    interactiveMessage = buildBillingAlertButtons(finalMessage);
  }

  return runWithCorrelationId(correlationId, organizationId, async () => {
    logger.info(`[Job ${job.id}] Processando disparo para ${phone}...`);

    // Helper: Atualiza o registro existente OU insere novo (para jobs antigos sem alertHistoryId)
    const updateAlertStatus = async (status: string, extra: Record<string, any> = {}) => {
      const historyStatus = status === 'processing' || status === 'retryable' ? 'pending' : status;
      if (alertHistoryId) {
        // Atualiza o registro existente criado pelo Scheduler
        const { error } = await supabaseAdmin.from('alert_history')
          .update({ status: historyStatus, source_job_id: String(job.id), ...extra })
          .eq('id', alertHistoryId);
        if (error) logger.error(`[Job ${job.id}] Erro ao atualizar alert_history ${alertHistoryId}: ${error.message}`);
      } else {
        // Fallback para jobs antigos que não tinham alertHistoryId e bots que não enviam userId
        let actualUserId = userId;

        // Se for uma mensagem do sistema/bot sem userId, tenta buscar o dono da org
        if (!actualUserId && organizationId) {
          const { data: orgData } = await supabaseAdmin
            .from('organization_members')
            .select('user_id')
            .eq('organization_id', organizationId)
            .eq('role', 'owner')
            .single();

          if (orgData?.user_id) {
            actualUserId = orgData.user_id;
          } else {
            // Se ainda não achar, busca qualquer usuário vinculado a essa organização
            const { data: orgUserData } = await supabaseAdmin
              .from('organization_members')
              .select('user_id')
              .eq('organization_id', organizationId)
              .limit(1)
              .single();

            if (orgUserData?.user_id) {
              actualUserId = orgUserData.user_id;
            }
          }
        }

        const { data: insertedHistory, error } = await supabaseAdmin.from('alert_history').insert({
          user_id: actualUserId,
          organization_id: organizationId,
          client_id: clientId,
          lead_id: leadId,
          phone,
          instance_name: instanceName,
          automation_id: ruleId,
          status: historyStatus,
          message_content: finalMessage,
          scheduled_at: new Date().toISOString(),
          queued_at: new Date().toISOString(),
          source_job_id: String(job.id),
          ...extra
        }).select('id').single();
        if (error) logger.error(`[Job ${job.id}] Erro ao inserir alert_history: ${error.message}`);
        if (insertedHistory?.id) alertHistoryId = insertedHistory.id;
      }
      if (jobSource === 'renewal_reminder' && renewalReminderClientId && renewalReminderDueDate && status === 'failed') {
        await supabaseAdmin.from('clients')
          .update({ renewal_reminder_last_sent_due_date: null })
          .eq('id', renewalReminderClientId)
          .eq('due_date', renewalReminderDueDate)
          .eq('renewal_reminder_last_sent_due_date', renewalReminderDueDate);
      }
      if (collectionDispatchId) {
        const dispatchStatus = status === 'sent'
          ? 'sent'
          : status === 'accepted'
            ? 'processing'
          : status === 'failed'
            ? 'failed'
            : ['processing', 'retryable', 'cancelled'].includes(status)
              ? status
              : null;
        if (dispatchStatus) {
          const { error } = await supabaseAdmin.from('collection_dispatches')
            .update({ status: dispatchStatus, ...(status === 'sent' ? { sent_at: new Date().toISOString() } : {}), ...extra })
            .eq('id', collectionDispatchId);
          if (error) logger.error(`[Job ${job.id}] Erro ao atualizar despacho inteligente ${collectionDispatchId}: ${error.message}`);
        }
      }
      if (contactReservationId) {
        const reservationStatus = status === 'sent'
          ? 'sent'
          : status === 'accepted'
            ? 'processing'
          : status === 'processing'
            ? 'processing'
            : status === 'failed' || status === 'retryable'
              ? 'failed'
              : null;
        if (reservationStatus) {
          const { error } = await supabaseAdmin.from('contact_reservations').update({
            status: reservationStatus,
            ...(status === 'sent' ? { sent_at: new Date().toISOString(), decision_reason: 'CONTACT_SENT' } : {}),
            ...(extra.error_message ? { decision_reason: extra.error_message } : {}),
            updated_at: new Date().toISOString(),
          }).eq('id', contactReservationId);
          if (error) logger.error(`[Job ${job.id}] Erro ao atualizar reserva ${contactReservationId}: ${error.message}`);
        }
      }
    };

    // 1. Checa Circuit Breaker (Backpressure global)
    if (await CircuitBreaker.isTripped()) {
      logger.warn(`[Job ${job.id}] 🛑 Circuit Breaker ABERTO! Evolution API parece estar instável. Atrasando mensagem.`);
      if (collectionDispatchId || contactReservationId) await updateAlertStatus(dispatchFailureStatus(job.attemptsMade, job.opts.attempts), { error_message: 'CIRCUIT_BREAKER_OPEN' });
      throw new Error('CIRCUIT_BREAKER_OPEN');
    }

    // 2. Kill Switch (Verifica se o usuário foi banido/suspenso)
    const isBanned = userId ? await redisConnection.sismember('global:banned_users', userId) : 0;
    if (isBanned) {
      logger.error(`[Job ${job.id}] 🛑 KILL SWITCH: Usuário ${userId} está banido. Interrompendo envio definitivamente.`);
      await updateAlertStatus('failed', { error_message: 'USER_BANNED' });
      throw new Error('USER_BANNED');
    }

    // 3. Rate Limiter por organização
    if (organizationId) {
      const { allowed, resetIn } = await RateLimiter.checkLimit(organizationId, 60, 60);
      if (!allowed) {
        logger.warn(`[Job ${job.id}] Tenant ${organizationId} excedeu limite. Atrasando job em ${resetIn}s`);
        if (collectionDispatchId || contactReservationId) await updateAlertStatus(dispatchFailureStatus(job.attemptsMade, job.opts.attempts), { error_message: `RATE_LIMIT_EXCEEDED:${resetIn}` });
        throw new Error(`RATE_LIMIT_EXCEEDED:${resetIn}`);
      }
    }

    // 4. Resolve as credenciais da instância no worker; jobs nunca carregam segredos.
    if (instanceId || instanceName) {
      let instanceQuery = supabaseAdmin
        .from('evolution_instances')
        .select('id, instance_name, base_url, api_key, connection_mode, min_delay, max_delay, organization_id, user_id, sending_paused, sending_pause_reason, daily_message_limit, message_min_interval_ms')
        .limit(1);
      if (instanceId) instanceQuery = instanceQuery.eq('id', instanceId);
      else if (instanceName) instanceQuery = instanceQuery.eq('instance_name', instanceName);
      if (organizationId) instanceQuery = instanceQuery.eq('organization_id', organizationId);
      else if (userId) instanceQuery = instanceQuery.eq('user_id', userId);

      const { data: resolvedInstance, error: instanceError } = await instanceQuery.maybeSingle();
      if (instanceError) throw new Error(`Falha ao resolver instância do job: ${instanceError.message}`);
      if (instanceId && !resolvedInstance) {
        await updateAlertStatus('failed', { error_message: 'INSTANCE_NOT_FOUND' });
        throw new Error('Instância do job não encontrada ou não pertence à organização');
      }
      if (resolvedInstance) {
        instanceId = resolvedInstance.id;
        instanceName = resolvedInstance.instance_name;
        instanceUrl = resolvedInstance.base_url;
        apiKey = resolvedInstance.api_key;
        connectionMode = resolvedInstance.connection_mode;
        instanceSendingPaused = resolvedInstance.sending_paused === true;
        instanceSendingPauseReason = resolvedInstance.sending_pause_reason || null;
        instanceDailyMessageLimit = resolvedInstance.daily_message_limit || instanceDailyMessageLimit;
        instanceMessageMinIntervalMs = Math.max(resolvedInstance.message_min_interval_ms || 0, (resolvedInstance.min_delay || 0) * 1000, 1000);
        instanceMessageMaxIntervalMs = Math.max(instanceMessageMinIntervalMs, (resolvedInstance.max_delay || 25) * 1000);
        organizationId = organizationId || resolvedInstance.organization_id;
        userId = userId || resolvedInstance.user_id;
      }
    }

    // 5. Determina URL e API Key da Evolution API
    let finalUrl = '';
    let finalApiKey = '';

    if (connectionMode === 'integrated' || (!instanceUrl && !apiKey)) {
      // Conexão Integrada: usa variáveis de ambiente do servidor
      finalUrl = process.env.EVOLUTION_API_URL || 'http://evolution-api:8080';
      finalApiKey = process.env.EVOLUTION_API_KEY || '';
      logger.info(`[Job ${job.id}] Usando conexão integrada: ${finalUrl}`);
    } else {
      finalUrl = (instanceUrl || '').replace(/\/message\/sendText\/.*$/, '');
      finalApiKey = apiKey ? SecretsManager.decrypt(apiKey) : '';
    }

    if (!finalUrl) {
      const errMsg = 'EVOLUTION_API_URL não configurada. Verifique as variáveis de ambiente.';
      await updateAlertStatus('failed', { error_message: errMsg });
      throw new Error(errMsg);
    }

    const provider = new EvolutionWhatsAppProvider(finalUrl, finalApiKey);

    // 5. Determina o nome da instância
    let targetInstanceName = instanceName || (instanceUrl ? instanceUrl.split('/').pop() : '');

    // Fallback: busca no banco a instância conectada
    if (!targetInstanceName) {
       let instanceQuery = supabaseAdmin.from('evolution_instances')
         .select('id, instance_name, min_delay, max_delay, sending_paused, sending_pause_reason, daily_message_limit, message_min_interval_ms')
         .eq('status', 'connected');
      if (organizationId) instanceQuery = instanceQuery.eq('organization_id', organizationId);
      else if (userId) instanceQuery = instanceQuery.eq('user_id', userId);

      const { data: insts } = await instanceQuery.order('is_primary', { ascending: false }).limit(1);
      if (insts && insts.length > 0) {
        targetInstanceName = insts[0].instance_name;
        instanceId = insts[0].id;
        instanceSendingPaused = insts[0].sending_paused === true;
        instanceSendingPauseReason = insts[0].sending_pause_reason || null;
        instanceDailyMessageLimit = insts[0].daily_message_limit || instanceDailyMessageLimit;
        instanceMessageMinIntervalMs = Math.max(insts[0].message_min_interval_ms || 0, (insts[0].min_delay || 0) * 1000, 1000);
        instanceMessageMaxIntervalMs = Math.max(instanceMessageMinIntervalMs, (insts[0].max_delay || 25) * 1000);
      }
    }

    if (!targetInstanceName) {
      const errMsg = 'Não foi possível determinar a Instância do WhatsApp para o disparo.';
      await updateAlertStatus('failed', { error_message: errMsg });
      throw new Error(errMsg);
    }

    logger.info(`[Job ${job.id}] Enviando para instância "${targetInstanceName}" → ${phone}`);

    try {
      if (clientId || leadId) {
        const category = leadId
          ? 'marketing'
          : whatsappCategoryForContactCategory(contactCategory || 'operational');
        const consentQuery = clientId
          ? supabaseAdmin.from('clients')
            .select('whatsapp_opt_in, whatsapp_opt_out, whatsapp_opt_in_categories')
            .eq('id', clientId)
            .maybeSingle()
          : supabaseAdmin.from('leads')
            .select('whatsapp_opt_in, whatsapp_opt_out, whatsapp_opt_in_categories')
            .eq('id', leadId)
            .maybeSingle();
        const { data: consentRecord } = await consentQuery;
        if (!hasWhatsAppConsent(consentRecord, category)) {
          await updateAlertStatus('failed', { error_message: 'WHATSAPP_CONSENT_REQUIRED' });
          logger.warn(`[Job ${job.id}] Envio bloqueado por ausência de consentimento (${category}).`);
          return;
        }
      }

      if (instanceSendingPaused) {
        const reason = instanceSendingPauseReason || 'INSTANCE_SENDING_PAUSED';
        logger.warn(`[Job ${job.id}] Envio pausado para a instância ${targetInstanceName}: ${reason}`);
        await updateAlertStatus('failed', { error_message: `INSTANCE_SENDING_PAUSED:${reason}` });
        return;
      }

      if (instanceId) {
        const quota = await reserveInstanceDailyQuota(instanceId, instanceDailyMessageLimit);
        if (!quota.allowed) {
          const delay = quota.resetInMs + Math.floor(Math.random() * 60000);
          logger.warn(`[Job ${job.id}] Limite diário da instância atingido; reagendando em ${Math.ceil(delay / 60000)} min.`);
          await updateAlertStatus('pending', { error_message: 'INSTANCE_DAILY_LIMIT_REACHED' });
          if (contactReservationId) {
            await supabaseAdmin.from('contact_reservations').update({
              status: 'reserved',
              decision_reason: 'INSTANCE_DAILY_LIMIT_REACHED',
              updated_at: new Date().toISOString(),
            }).eq('id', contactReservationId);
          }
          if (collectionDispatchId) {
            await supabaseAdmin.from('collection_dispatches').update({
              status: 'pending',
              error_message: 'INSTANCE_DAILY_LIMIT_REACHED',
              updated_at: new Date().toISOString(),
            }).eq('id', collectionDispatchId);
          }
          await job.moveToDelayed(Date.now() + delay, job.token);
          return;
        }
        const intervalRange = Math.max(0, instanceMessageMaxIntervalMs - instanceMessageMinIntervalMs);
        const interval = instanceMessageMinIntervalMs + Math.floor(Math.random() * (intervalRange + 1));
        await sleep(await reserveInstanceSendSlot(instanceId, interval));
      }

      let sentMessageCount = 0;
      let providerMessageId: string | undefined;
      const rememberProviderResponse = (response: unknown) => {
        providerMessageId = extractProviderMessageId(response) || providerMessageId;
      };
      const mediaPayload = mediaUrl || mediaBase64;
      const mediaType = mediaMimeType?.includes('/') ? mediaMimeType.split('/')[0] : (mediaMimeType || 'image');
      if (contactCategory === 'billing' && clientId && organizationId) {
        const { data: latestClient } = await supabaseAdmin.from('clients')
          .select('status')
          .eq('id', clientId)
          .eq('organization_id', organizationId)
          .maybeSingle();
        if (latestClient?.status === 'canceled') {
          if (collectionDispatchId) {
            await supabaseAdmin.from('collection_dispatches')
              .update({ status: 'cancelled', error_message: 'Cancelado pelo cliente via WhatsApp' })
              .eq('id', collectionDispatchId);
          }
          if (contactReservationId) {
            await supabaseAdmin.from('contact_reservations')
              .update({ status: 'cancelled', decision_reason: 'CUSTOMER_CANCELLED_RENEWAL' })
              .eq('id', contactReservationId);
          }
          return;
        }
      }

      // 6. Normaliza para o formato numérico E.164 aceito pela Evolution.
      if (!phone) {
        await updateAlertStatus('failed', { error_message: 'PHONE_MISSING' });
        throw new Error('Número de telefone ausente no job');
      }
      const normalizedPhone = normalizeWhatsAppNumber(phone);
      if (!normalizedPhone) {
        await updateAlertStatus('failed', { error_message: 'PHONE_INVALID' });
        throw new Error('Número de telefone inválido. Use o formato internacional, como +55 11 99999-9999.');
      }

      // 7. Envia a mensagem. Na Evolution 2.3.x os botões podem retornar 201
      // sem aparecer no aparelho, então o texto/legenda fica como fallback visível.
      if (interactiveMessage?.type === 'buttons') {
        if (mediaPayload) {
          rememberProviderResponse(await provider.sendMedia(targetInstanceName, normalizedPhone, mediaPayload, mediaType, finalMessage, {
            delay: 1200,
            presence: 'composing'
          }));
          sentMessageCount++;
        } else {
          rememberProviderResponse(await provider.sendMessage(targetInstanceName, normalizedPhone, finalMessage, {
            delay: 1200,
            presence: 'composing'
          }));
          sentMessageCount++;
        }
        try {
          rememberProviderResponse(await provider.sendButtons(targetInstanceName, normalizedPhone, interactiveMessage, {
            delay: 600,
            presence: 'composing'
          }));
          sentMessageCount++;
        } catch (interactiveError: any) {
          logger.warn(`[Job ${job.id}] Botões interativos indisponíveis; fallback em texto já enviado: ${interactiveError.message}`);
        }
      } else if (interactiveMessage?.type === 'list') {
        try {
          rememberProviderResponse(await provider.sendList(targetInstanceName, normalizedPhone, interactiveMessage, {
            delay: 1200,
            presence: 'composing'
          }));
          sentMessageCount++;
        } catch (interactiveError: any) {
          logger.warn(`[Job ${job.id}] Lista interativa indisponível; usando fallback em texto: ${interactiveError.message}`);
          rememberProviderResponse(await provider.sendMessage(targetInstanceName, normalizedPhone, finalMessage, {
            delay: 1200,
            presence: 'composing'
          }));
          sentMessageCount++;
        }
      } else if (mediaPayload) {
        rememberProviderResponse(await provider.sendMedia(targetInstanceName, normalizedPhone, mediaPayload, mediaType, finalMessage, {
          delay: 1200,
          presence: 'composing'
        }));
        sentMessageCount++;
      } else {
        rememberProviderResponse(await provider.sendMessage(targetInstanceName, normalizedPhone, finalMessage, {
          delay: 1200,
          presence: 'composing'
        }));
        sentMessageCount++;
      }

      // 8. O provider aceitou a requisição; a entrega real chega pelo webhook.
      await updateAlertStatus('accepted', {
        accepted_at: new Date().toISOString(),
        provider_message_id: providerMessageId,
        provider_status: 'ACCEPTED',
        instance_name: targetInstanceName,
        phone: normalizedPhone,
        message_content: finalMessage
      });

      logger.info(`[Job ${job.id}] ✅ Provider aceitou o envio; aguardando status de entrega.`);
      await CircuitBreaker.recordSuccess();

      // Incrementa a Quota do Mês no Redis
      const currentMonth = new Date().toISOString().slice(0, 7);
      if (userId) {
        const quotaKey = `usage:messages:${userId}:${currentMonth}`;
        await redisConnection.incrby(quotaKey, sentMessageCount);
        await redisConnection.expire(quotaKey, 60 * 60 * 24 * 32);
      }

    } catch (err: any) {
      // 8. Falha — Registra o erro
      logger.error(`[Job ${job.id}] ❌ Falha: ${err.message}`);

      const retryable = isRetryableWhatsAppError(err);
      if (shouldPauseWhatsAppInstance(err) && instanceId) {
        await supabaseAdmin.from('evolution_instances').update({
          sending_paused: true,
          sending_pause_reason: whatsappErrorCode(err),
          sending_paused_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', instanceId);
      }

      if (!err.message.startsWith('RATE_LIMIT_EXCEEDED') && !err.message.startsWith('CIRCUIT_BREAKER_OPEN') && retryable) {
        await CircuitBreaker.recordFailure();
      }
      await updateAlertStatus(
        retryable ? (collectionDispatchId || contactReservationId ? dispatchFailureStatus(job.attemptsMade, job.opts.attempts) : 'retryable') : 'failed',
        { error_message: retryable ? err.message : whatsappErrorCode(err) }
      );

      if (retryable && jobSource === 'renewal_reminder' && job.attemptsMade + 1 >= (job.opts.attempts || 1)) {
        await updateAlertStatus('failed', { error_message: err.message });
      }

      if (!retryable) {
        logger.warn(`[Job ${job.id}] Falha permanente; descartando retry automático.`);
        return;
      }

      throw err; // Lança para o BullMQ fazer o Retry/DLQ
    }
  });
}, {
  connection: redisConnection as any,
  concurrency: 5,
  limiter: {
    max: 1,
    duration: parseInt(process.env.QUEUE_DELAY_MS || '5000')
  }
});

worker.on('failed', (job, err) => {
  if (job) {
    console.log(`[Job ${job.id}] Falhou: ${err.message}`);
  }
});

worker.on('error', err => {
  console.error(err);
});

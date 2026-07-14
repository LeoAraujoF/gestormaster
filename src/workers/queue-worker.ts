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

startOperationalHeartbeat('message_worker');

logger.info('🚀 Queue Worker iniciado e aguardando jobs...');

const worker = new Worker(MESSAGE_QUEUE_NAME, async (job: Job) => {
  if (await processPortalOtpJob(job.data)) return;
  let {
    clientId, phone, instanceUrl, apiKey, connectionMode,
    alertHistoryId, ruleId, userId, correlationId
  } = job.data;
  const collectionDispatchId = job.data.collectionDispatchId as string | undefined;
  const contactReservationId = job.data.contactReservationId as string | undefined;

  // Compatibilidade com diferentes formatos de payload (CamelCase vs snake_case)
  let finalMessage = job.data.finalMessage || job.data.message;
  let organizationId = job.data.organizationId || job.data.organization_id;
  let instanceName = job.data.instanceName || job.data.instance_name;
  let mediaUrl = job.data.mediaUrl as string | undefined;

  if (contactReservationId) {
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc('claim_contact_reservation', {
      p_reservation_id: contactReservationId,
      p_is_retry: job.attemptsMade > 0,
    });
    if (claimError) throw new Error(`Falha ao reservar contato coordenado: ${claimError.message}`);
    if (!claimed) return;

    const { data: reservation, error: reservationError } = await supabaseAdmin.from('contact_reservations')
      .select('id, organization_id, client_id, requested_by, automation_id, alert_history_id, message_content, media_url')
      .eq('id', contactReservationId).maybeSingle();
    if (reservationError || !reservation) throw new Error('Reserva de contato não encontrada');
    const { data: client } = await supabaseAdmin.from('clients')
      .select('id, phone_e164, phone, user_id')
      .eq('id', reservation.client_id).eq('organization_id', reservation.organization_id).maybeSingle();
    if (!client || !(client.phone_e164 || client.phone)) {
      await supabaseAdmin.from('contact_reservations').update({ status: 'failed', decision_reason: 'CLIENT_WITHOUT_PHONE' }).eq('id', reservation.id);
      throw new Error('Cliente sem telefone para contato coordenado');
    }
    const { data: instance } = await supabaseAdmin.from('evolution_instances')
      .select('instance_name, base_url, api_key, connection_mode')
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
    instanceName = instance.instance_name;
    instanceUrl = instance.base_url;
    apiKey = instance.api_key;
    connectionMode = instance.connection_mode;
  }

  if (collectionDispatchId) {
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
      return;
    }
    const { data: client } = await supabaseAdmin.from('clients')
      .select('id, phone_e164, phone, user_id')
      .eq('id', dispatch.client_id).eq('organization_id', dispatch.organization_id).maybeSingle();
    if (!client || !(client.phone_e164 || client.phone)) {
      await supabaseAdmin.from('collection_dispatches').update({ status: 'failed', error_message: 'Cliente sem telefone para despacho inteligente' }).eq('id', dispatch.id);
      throw new Error('Cliente sem telefone para despacho inteligente');
    }
    const { data: instance } = await supabaseAdmin.from('evolution_instances')
      .select('instance_name, base_url, api_key, connection_mode')
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
    instanceName = instance.instance_name;
    instanceUrl = instance.base_url;
    apiKey = instance.api_key;
    connectionMode = instance.connection_mode;
  }

  return runWithCorrelationId(correlationId, organizationId, async () => {
    logger.info(`[Job ${job.id}] Processando disparo para ${phone}...`);

    // Helper: Atualiza o registro existente OU insere novo (para jobs antigos sem alertHistoryId)
    const updateAlertStatus = async (status: string, extra: Record<string, any> = {}) => {
      const historyStatus = status === 'processing' || status === 'retryable' ? 'pending' : status;
      if (alertHistoryId) {
        // Atualiza o registro existente criado pelo Scheduler
        const { error } = await supabaseAdmin.from('alert_history')
          .update({ status: historyStatus, ...extra })
          .eq('id', alertHistoryId);
        if (error) logger.error(`[Job ${job.id}] Erro ao atualizar alert_history ${alertHistoryId}: ${error.message}`);
      } else {
        // Fallback para jobs antigos que não tinham alertHistoryId e bots que não enviam userId
        let actualUserId = userId;

        // Se for uma mensagem do sistema/bot sem userId, tenta buscar o dono da org
        if (!actualUserId && organizationId) {
          const { data: orgData } = await supabaseAdmin
            .from('organizations')
            .select('owner_id')
            .eq('id', organizationId)
            .single();

          if (orgData?.owner_id) {
            actualUserId = orgData.owner_id;
          } else {
            // Se ainda não achar, busca qualquer usuário vinculado a essa organização
            const { data: orgUserData } = await supabaseAdmin
              .from('organization_users')
              .select('user_id')
              .eq('organization_id', organizationId)
              .limit(1)
              .single();

            if (orgUserData?.user_id) {
              actualUserId = orgUserData.user_id;
            }
          }
        }

        const { error } = await supabaseAdmin.from('alert_history').insert({
          user_id: actualUserId,
          organization_id: organizationId,
          client_id: clientId,
          automation_id: ruleId,
          status: historyStatus,
          message_content: finalMessage,
          scheduled_at: new Date().toISOString(),
          ...extra
        });
        if (error) logger.error(`[Job ${job.id}] Erro ao inserir alert_history: ${error.message}`);
      }
      if (collectionDispatchId) {
        const dispatchStatus = status === 'sent' ? 'sent' : status === 'failed' ? 'failed' : status;
        const { error } = await supabaseAdmin.from('collection_dispatches')
          .update({ status: dispatchStatus, ...(status === 'sent' ? { sent_at: new Date().toISOString() } : {}), ...extra })
          .eq('id', collectionDispatchId);
        if (error) logger.error(`[Job ${job.id}] Erro ao atualizar despacho inteligente ${collectionDispatchId}: ${error.message}`);
      }
      if (contactReservationId) {
        const reservationStatus = status === 'sent' ? 'sent' : status === 'processing' ? 'processing' : 'failed';
        const { error } = await supabaseAdmin.from('contact_reservations').update({
          status: reservationStatus,
          ...(status === 'sent' ? { sent_at: new Date().toISOString(), decision_reason: 'CONTACT_SENT' } : {}),
          ...(extra.error_message ? { decision_reason: extra.error_message } : {}),
          updated_at: new Date().toISOString(),
        }).eq('id', contactReservationId);
        if (error) logger.error(`[Job ${job.id}] Erro ao atualizar reserva ${contactReservationId}: ${error.message}`);
      }
    };

    // 1. Checa Circuit Breaker (Backpressure global)
    if (await CircuitBreaker.isTripped()) {
      logger.warn(`[Job ${job.id}] 🛑 Circuit Breaker ABERTO! Evolution API parece estar instável. Atrasando mensagem.`);
      if (collectionDispatchId || contactReservationId) await updateAlertStatus(dispatchFailureStatus(job.attemptsMade, job.opts.attempts), { error_message: 'CIRCUIT_BREAKER_OPEN' });
      throw new Error('CIRCUIT_BREAKER_OPEN');
    }

    // 2. Kill Switch (Verifica se o usuário foi banido/suspenso)
    const isBanned = await redisConnection.sismember('global:banned_users', userId);
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

    // 4. Determina URL e API Key da Evolution API
    let finalUrl = '';
    let finalApiKey = '';

    if (connectionMode === 'integrated' || (!instanceUrl && !apiKey)) {
      // Conexão Integrada: usa variáveis de ambiente do servidor
      finalUrl = process.env.EVOLUTION_API_URL || 'http://evolution-api:8080';
      finalApiKey = process.env.EVOLUTION_API_KEY || '';
      logger.info(`[Job ${job.id}] Usando conexão integrada: ${finalUrl}`);
    } else {
      finalUrl = instanceUrl.replace(/\/message\/sendText\/.*$/, '');
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
      let instanceQuery = supabaseAdmin.from('evolution_instances').select('instance_name').eq('status', 'connected');
      if (organizationId) instanceQuery = instanceQuery.eq('organization_id', organizationId);
      else instanceQuery = instanceQuery.eq('user_id', userId);

      const { data: insts } = await instanceQuery.limit(1);
      if (insts && insts.length > 0) targetInstanceName = insts[0].instance_name;
    }

    if (!targetInstanceName) {
      const errMsg = 'Não foi possível determinar a Instância do WhatsApp para o disparo.';
      await updateAlertStatus('failed', { error_message: errMsg });
      throw new Error(errMsg);
    }

    logger.info(`[Job ${job.id}] Enviando para instância "${targetInstanceName}" → ${phone}`);

    try {
      // 6. Normaliza o número de telefone (Adiciona 55 se for BR e estiver sem DDI)
      let normalizedPhone = phone.replace(/\D/g, '');
      if (normalizedPhone.length === 10 || normalizedPhone.length === 11) {
        normalizedPhone = `55${normalizedPhone}`;
      }

      // 7. Envia a mensagem (Texto ou Mídia)
      if (mediaUrl) {
        // Se houver mediaUrl, envia como mídia e usa o texto como legenda (caption)
        await provider.sendMedia(targetInstanceName, normalizedPhone, mediaUrl, 'image', finalMessage, {
          delay: 1200,
          presence: 'composing'
        });
      } else {
        // Se não houver, envia apenas texto
        await provider.sendMessage(targetInstanceName, normalizedPhone, finalMessage, {
          delay: 1200,
          presence: 'composing'
        });
      }

      // 8. Sucesso — Atualiza o registro para "sent"
      await updateAlertStatus('sent', {
        sent_at: new Date().toISOString(),
        message_content: finalMessage
      });

      logger.info(`[Job ${job.id}] ✅ Enviado com sucesso!`);
      await CircuitBreaker.recordSuccess();

      // Incrementa a Quota do Mês no Redis
      const currentMonth = new Date().toISOString().slice(0, 7);
      const quotaKey = `usage:messages:${userId}:${currentMonth}`;
      await redisConnection.incr(quotaKey);
      await redisConnection.expire(quotaKey, 60 * 60 * 24 * 32);

    } catch (err: any) {
      // 8. Falha — Registra o erro
      logger.error(`[Job ${job.id}] ❌ Falha: ${err.message}`);

      if (!err.message.startsWith('RATE_LIMIT_EXCEEDED') && !err.message.startsWith('CIRCUIT_BREAKER_OPEN')) {
        await CircuitBreaker.recordFailure();
        await updateAlertStatus(collectionDispatchId || contactReservationId ? dispatchFailureStatus(job.attemptsMade, job.opts.attempts) : 'failed', { error_message: err.message });
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

import '../lib/env';
import { DelayedError, Worker, Job } from 'bullmq';
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
import { MESSAGE_PRIORITY } from '../lib/message-priority';
import { millisecondsUntilSendWindow } from '../lib/contact-policy';
import { resolveOrganizationSendPolicy } from '../lib/organization-send-policy';
import { releaseInstanceDailyQuota, reserveInstanceDailyQuota, reserveInstanceSendSlot, sleep } from '../lib/whatsapp-safety';
import { pickUsableInstance } from '../lib/instance-routing';
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

/**
 * Pacing e backpressure são resolvidos devolvendo o job ao Redis
 * (`moveToDelayed` + `DelayedError`), nunca dormindo dentro do handler.
 *
 * Um `sleep` longo segura um slot de concorrência: com a fila em FIFO, uma única
 * instância com backlog ocupava todos os slots e travava os demais tenants —
 * o job N chegava a dormir N x intervalo (dezenas de minutos) em estado `active`.
 * Esperas muito curtas continuam inline porque o requeue custaria mais que elas.
 */
const BACKPRESSURE_FIELD = 'backpressure';
const MAX_INLINE_WAIT_MS = Math.max(0, Number(process.env.MESSAGE_INLINE_WAIT_MS) || 1500);
const MAX_DEFERRALS = Math.max(1, Number(process.env.MESSAGE_MAX_DEFERRALS) || 60);
const INSTANCE_PAUSED_RETRY_MS = Math.max(60_000, Number(process.env.INSTANCE_PAUSED_RETRY_MS) || 900_000);
const INSTANCE_PAUSED_GRACE_MS = Math.max(0, Number(process.env.INSTANCE_PAUSED_GRACE_MS) || 3_600_000);
const SEND_SLOT_MAX_HORIZON_MS = Math.max(60_000, Number(process.env.SEND_SLOT_MAX_HORIZON_MS) || 1_800_000);
const MESSAGE_WORKER_CONCURRENCY = Math.max(1, Number(process.env.MESSAGE_WORKER_CONCURRENCY) || 25);
const MESSAGE_WORKER_LIMITER_MAX = Math.max(1, Number(process.env.MESSAGE_WORKER_LIMITER_MAX) || 50);
const MESSAGE_WORKER_LIMITER_DURATION_MS = Math.max(100, Number(process.env.MESSAGE_WORKER_LIMITER_DURATION_MS) || 1000);

type BackpressureState = {
  attempt: number;
  deferrals: number;
  reason: string;
  readyAt: number;
  quotaKey: string | null;
  slotInstanceId: string | null;
  /** Quando a instância foi vista pausada pela primeira vez por este job. */
  pausedSince: number | null;
};

function readBackpressure(job: Job): BackpressureState | null {
  const raw = (job.data as Record<string, unknown> | undefined)?.[BACKPRESSURE_FIELD];
  if (!raw || typeof raw !== 'object') return null;
  const state = raw as Partial<BackpressureState>;
  if (typeof state.attempt !== 'number' || typeof state.readyAt !== 'number') return null;
  return {
    attempt: state.attempt,
    deferrals: Number(state.deferrals) || 0,
    reason: String(state.reason || 'unknown'),
    readyAt: state.readyAt,
    quotaKey: typeof state.quotaKey === 'string' ? state.quotaKey : null,
    slotInstanceId: typeof state.slotInstanceId === 'string' ? state.slotInstanceId : null,
    pausedSince: typeof state.pausedSince === 'number' ? state.pausedSince : null,
  };
}

/**
 * Quota e slot reservados valem apenas dentro da tentativa que os criou. Numa
 * tentativa nova (falha real de entrega) o job precisa reservar de novo.
 */
function currentAttemptState(job: Job): BackpressureState | null {
  const state = readBackpressure(job);
  return state && state.attempt === job.attemptsMade ? state : null;
}

function isDelayedError(error: unknown) {
  return error instanceof DelayedError || (error as { name?: string } | null)?.name === 'DelayedError';
}

/**
 * Devolve o job ao Redis liberando o slot de concorrência. `moveToDelayed` usa
 * `skipAttempt`, então backpressure não consome tentativas de entrega — mas os
 * adiamentos são contados para o job não circular indefinidamente.
 */
async function deferJob(
  job: Job,
  delayMs: number,
  reason: string,
  patch: Partial<Pick<BackpressureState, 'quotaKey' | 'slotInstanceId' | 'pausedSince'>> = {},
): Promise<never> {
  const previous = readBackpressure(job);
  const carried = currentAttemptState(job);
  const next: BackpressureState = {
    attempt: job.attemptsMade,
    deferrals: (previous?.deferrals || 0) + 1,
    reason,
    readyAt: Date.now() + Math.max(0, delayMs),
    quotaKey: patch.quotaKey !== undefined ? patch.quotaKey : (carried?.quotaKey ?? null),
    slotInstanceId: patch.slotInstanceId !== undefined ? patch.slotInstanceId : (carried?.slotInstanceId ?? null),
    // Sobrevive à troca de tentativa: a janela de espera por instância pausada
    // conta desde a primeira vez que este job viu a pausa.
    pausedSince: patch.pausedSince !== undefined ? patch.pausedSince : (previous?.pausedSince ?? null),
  };
  await job.updateData({ ...(job.data as Record<string, unknown>), [BACKPRESSURE_FIELD]: next });
  await job.moveToDelayed(next.readyAt, job.token);
  // O BullMQ só reconhece o reagendamento se o handler lançar DelayedError.
  // Retornar normal faz o worker tentar completar um job que já perdeu o lock.
  throw new DelayedError(reason);
}

const worker = new Worker(MESSAGE_QUEUE_NAME, async (job: Job) => {
  if (await processPortalOtpJob(job.data)) return;
  const normalizedJob = normalizeSendMessageJob(job.data);
  // Um job devolvido por backpressure já reivindicou a reserva numa passagem
  // anterior. Sem isto o re-claim (que só aceita 'reserved') falharia e a
  // mensagem seria descartada em silêncio.
  const requeuedByBackpressure = readBackpressure(job) !== null;
  let {
    clientId, phone, instanceUrl, apiKey, connectionMode,
    alertHistoryId, ruleId, userId, correlationId
  } = normalizedJob as typeof normalizedJob & { clientId?: string; ruleId?: string; instanceUrl?: string | null; apiKey?: string | null; connectionMode?: string | null };
  const manualRetry = normalizedJob.manualRetry === true;
  const jobSource = normalizedJob.source || undefined;
  const renewalReminderClientId = (job.data as Record<string, unknown>).renewalReminderClientId as string | undefined;
  const renewalReminderDueDate = (job.data as Record<string, unknown>).renewalReminderDueDate as string | undefined;
  userId = userId || undefined;
  correlationId = correlationId || undefined;
  let instanceId = normalizedJob.instanceId as string | undefined;
  let leadId = normalizedJob.leadId as string | undefined;
  const collectionDispatchId = normalizedJob.collectionDispatchId as string | undefined;
  const massRunId = (job.data as Record<string, unknown>).massRunId as string | undefined;
  const contactReservationId = normalizedJob.contactReservationId as string | undefined;
  let interactiveMessage = normalizedJob.interactiveMessage as WhatsAppInteractiveMessage | undefined;
  let contactCategory: string | undefined;
  let instanceSendingPaused = false;
  let instanceSendingPauseReason: string | null = null;
  let instanceDailyMessageLimit = 80;
  let instanceMessageMinIntervalMs = 15000;
  let instanceMessageMaxIntervalMs = 25000;
  // Pausa por rajada ("além do intervalo de envio"): 0 em qualquer um desativa.
  let instanceBurstMessageCount = 0;
  let instanceBurstPauseMinutes = 0;

  let finalMessage = normalizedJob.finalMessage;
  let organizationId = normalizedJob.organizationId;
  let instanceName = normalizedJob.instanceName;
  let mediaUrl = normalizedJob.mediaUrl || undefined;
  const mediaBase64 = normalizedJob.mediaBase64 || undefined;
  const mediaMimeType = normalizedJob.mediaMimeType || undefined;

  if (contactReservationId) {
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc('claim_contact_reservation', {
      p_reservation_id: contactReservationId,
      p_is_retry: manualRetry || job.attemptsMade > 0 || requeuedByBackpressure,
    });
    if (claimError) throw new Error(`Falha ao reservar contato coordenado: ${claimError.message}`);
    if (!claimed) return;

    const { data: reservation, error: reservationError } = await supabaseAdmin.from('contact_reservations')
      .select('id, organization_id, client_id, requested_by, automation_id, alert_history_id, message_content, media_url, category, status, source')
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
    // A régua fixa (before_due/on_due/after_due) tem um botão "Pausar" em /automacao
    // que desliga `is_active` em lote. Sem esta checagem, jobs que já estavam na
    // fila quando o operador pausou continuavam disparando — a pausa só impedia o
    // agendador de criar jobs *novos*, não parava os que já tinham partido.
    // Escopado a `source === 'legacy_automation'`: um "Cobrar agora" manual deve
    // funcionar mesmo com a regra desativada, exatamente como já funciona hoje.
    if (reservation.source === 'legacy_automation' && reservation.automation_id) {
      const { data: rule } = await supabaseAdmin.from('automations').select('is_active').eq('id', reservation.automation_id).maybeSingle();
      if (rule && rule.is_active === false) {
        await supabaseAdmin.from('contact_reservations')
          .update({ status: 'cancelled', decision_reason: 'AUTOMATION_RULE_PAUSED', updated_at: new Date().toISOString() })
          .eq('id', reservation.id).eq('status', 'processing');
        logger.info(`[Job ${job.id}] Régua ${reservation.automation_id} pausada; contato liberado sem envio.`);
        return;
      }
    }
    if (!client || !(client.phone_e164 || client.phone)) {
      await supabaseAdmin.from('contact_reservations').update({ status: 'failed', decision_reason: 'CLIENT_WITHOUT_PHONE' }).eq('id', reservation.id);
      throw new Error('Cliente sem telefone para contato coordenado');
    }
    const instance = await pickUsableInstance({ organizationId: reservation.organization_id });
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
    instanceBurstMessageCount = instance.burst_message_count || 0;
    instanceBurstPauseMinutes = instance.burst_pause_minutes || 0;
  }

  if (collectionDispatchId) {
    contactCategory = 'billing';
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc('claim_collection_dispatch', {
      p_dispatch_id: collectionDispatchId,
      p_is_retry: manualRetry || job.attemptsMade > 0 || requeuedByBackpressure,
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
    // Mesmo racional do bloco acima: a régua inteligente pode ser desligada em
    // `collection_settings.enabled` depois que o despacho já está na fila.
    const { data: collectionSettings } = await supabaseAdmin.from('collection_settings')
      .select('enabled').eq('organization_id', dispatch.organization_id).maybeSingle();
    if (collectionSettings && collectionSettings.enabled === false) {
      await supabaseAdmin.from('collection_dispatches')
        .update({ status: 'cancelled', error_message: 'INTELLIGENT_COLLECTIONS_DISABLED' })
        .eq('id', dispatch.id).eq('status', 'processing');
      if (contactReservationId) {
        await supabaseAdmin.from('contact_reservations')
          .update({ status: 'cancelled', decision_reason: 'INTELLIGENT_COLLECTIONS_DISABLED' })
          .eq('id', contactReservationId)
          .eq('status', 'processing');
      }
      logger.info(`[Job ${job.id}] Cobrança inteligente desativada para a organização; despacho liberado sem envio.`);
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
    const instance = await pickUsableInstance({ organizationId: dispatch.organization_id });
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
    instanceBurstMessageCount = instance.burst_message_count || 0;
    instanceBurstPauseMinutes = instance.burst_pause_minutes || 0;
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

    /**
     * Devolve a reserva coordenada ao estado de espera para que o job possa ser
     * reivindicado novamente quando voltar de um adiamento longo (limite diario,
     * instancia pausada). Sem isso a reserva ficaria presa em `processing` e
     * seria marcada como falha pela reconciliacao de reservas paradas.
     */
    const releaseCoordinationHold = async (reason: string) => {
      if (contactReservationId) {
        const { error } = await supabaseAdmin.from('contact_reservations').update({
          status: 'reserved',
          decision_reason: reason,
          updated_at: new Date().toISOString(),
        }).eq('id', contactReservationId);
        if (error) logger.error(`[Job ${job.id}] Erro ao liberar reserva ${contactReservationId}: ${error.message}`);
      }
      if (collectionDispatchId) {
        const { error } = await supabaseAdmin.from('collection_dispatches').update({
          status: 'pending',
          error_message: reason,
          updated_at: new Date().toISOString(),
        }).eq('id', collectionDispatchId);
        if (error) logger.error(`[Job ${job.id}] Erro ao liberar despacho ${collectionDispatchId}: ${error.message}`);
      }
    };

    // 1. Teto de adiamentos. Backpressure não gasta tentativas de entrega, então
    // precisa de um freio próprio para o job não circular para sempre.
    const backpressure = readBackpressure(job);
    if (backpressure && backpressure.deferrals >= MAX_DEFERRALS) {
      logger.error(`[Job ${job.id}] 🛑 Limite de adiamentos atingido (${backpressure.deferrals}x, último motivo: ${backpressure.reason}).`);
      // Só libera a quota se ela ainda pertence a esta tentativa; a de tentativas
      // anteriores já foi devolvida no catch e liberar de novo abriria uma vaga extra.
      const heldQuotaKey = currentAttemptState(job)?.quotaKey;
      if (heldQuotaKey) await releaseInstanceDailyQuota(heldQuotaKey);
      await updateAlertStatus('failed', { error_message: `BACKPRESSURE_DEFERRAL_LIMIT:${backpressure.reason}` });
      return;
    }

    // 2. Kill Switch (Verifica se o usuário foi banido/suspenso)
    const isBanned = userId ? await redisConnection.sismember('global:banned_users', userId) : 0;
    if (isBanned) {
      logger.error(`[Job ${job.id}] 🛑 KILL SWITCH: Usuário ${userId} está banido. Interrompendo envio definitivamente.`);
      await updateAlertStatus('failed', { error_message: 'USER_BANNED' });
      throw new Error('USER_BANNED');
    }

    // 3. Rate Limiter por organização. Estourar o limite é backpressure, não
    // falha de entrega: reagenda sem consumir tentativa.
    if (organizationId) {
      const { allowed, resetIn } = await RateLimiter.checkLimit(organizationId, 60, 60);
      if (!allowed) {
        logger.warn(`[Job ${job.id}] Tenant ${organizationId} excedeu limite. Reagendando em ${resetIn}s`);
        await updateAlertStatus('pending', { error_message: `RATE_LIMIT_EXCEEDED:${resetIn}` });
        await deferJob(job, resetIn * 1000 + Math.floor(Math.random() * 1000), `RATE_LIMIT_EXCEEDED:${resetIn}`);
      }
    }

    // 4. Resolve as credenciais da instância no worker; jobs nunca carregam segredos.
    if (instanceId || instanceName) {
      let instanceQuery = supabaseAdmin
        .from('evolution_instances')
        .select('id, instance_name, base_url, api_key, connection_mode, min_delay, max_delay, organization_id, user_id, sending_paused, sending_pause_reason, daily_message_limit, message_min_interval_ms, burst_message_count, burst_pause_minutes')
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
        instanceBurstMessageCount = resolvedInstance.burst_message_count || 0;
        instanceBurstPauseMinutes = resolvedInstance.burst_pause_minutes || 0;
        organizationId = organizationId || resolvedInstance.organization_id;
        userId = userId || resolvedInstance.user_id;

        // Falha (alternância principal -> secundária): o job nasceu preso a esta
        // instância especificamente. Se ela caiu depois de enfileirada — o caso
        // de uma fila grande que demora horas para escoar —, procura outra
        // conectada e não pausada da mesma organização em vez de esperar esta
        // voltar. Nunca envia pelas duas ao mesmo tempo, porque só troca quando a
        // originalmente escolhida está comprovadamente indisponível.
        //
        // O propósito é decisivo aqui. Sem ele, em 10/09/2026 a alternância levou
        // 43 mensagens de campanha para o número principal quando o secundário
        // começou a devolver HTTP 500 — consumiu a cota diária do principal e os
        // lembretes das 18h05 e as boas-vindas não saíram
        // (INSTANCE_DAILY_LIMIT_REACHED). Agora massa só troca por outro número
        // liberado para massa; sem alternativa, a mensagem espera em vez de
        // invadir o canal de lembretes.
        if (instanceSendingPaused) {
          const fallback = await pickUsableInstance({
            organizationId,
            userId,
            excludeInstanceId: instanceId,
            // Campanha de leads (massRunId) e disparo em massa de promoção a
            // clientes (category 'promotion', vindo de /send-mass) contam como
            // massa. Cobrança, renovação, aviso de vencimento e boas-vindas são
            // alerta, e é o canal que o principal existe para proteger.
            purpose: massRunId || contactCategory === 'promotion' ? 'mass' : 'alerts',
            massRunId,
          });
          if (fallback) {
            logger.warn(`[Job ${job.id}] Instância ${instanceName} pausada (${instanceSendingPauseReason}); alternando para ${fallback.instance_name}.`);
            instanceId = fallback.id;
            instanceName = fallback.instance_name;
            instanceUrl = fallback.base_url;
            apiKey = fallback.api_key;
            connectionMode = fallback.connection_mode;
            instanceSendingPaused = false;
            instanceSendingPauseReason = null;
            instanceDailyMessageLimit = fallback.daily_message_limit || instanceDailyMessageLimit;
            instanceMessageMinIntervalMs = Math.max(fallback.message_min_interval_ms || 0, (fallback.min_delay || 0) * 1000, 1000);
            instanceMessageMaxIntervalMs = Math.max(instanceMessageMinIntervalMs, (fallback.max_delay || 25) * 1000);
            instanceBurstMessageCount = fallback.burst_message_count || 0;
            instanceBurstPauseMinutes = fallback.burst_pause_minutes || 0;
          }
        }
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
      // Jobs antigos sem instância no payload: a busca já prioriza a principal e
      // ignora instâncias pausadas, então nunca cai numa que está fora do ar.
      const fallbackInstance = await pickUsableInstance({ organizationId, userId });
      if (fallbackInstance) {
        targetInstanceName = fallbackInstance.instance_name;
        instanceId = fallbackInstance.id;
        instanceSendingPaused = false;
        instanceSendingPauseReason = null;
        instanceDailyMessageLimit = fallbackInstance.daily_message_limit || instanceDailyMessageLimit;
        instanceMessageMinIntervalMs = Math.max(fallbackInstance.message_min_interval_ms || 0, (fallbackInstance.min_delay || 0) * 1000, 1000);
        instanceMessageMaxIntervalMs = Math.max(instanceMessageMinIntervalMs, (fallbackInstance.max_delay || 25) * 1000);
        instanceBurstMessageCount = fallbackInstance.burst_message_count || 0;
        instanceBurstPauseMinutes = fallbackInstance.burst_pause_minutes || 0;
      }
    }

    if (!targetInstanceName) {
      const errMsg = 'Não foi possível determinar a Instância do WhatsApp para o disparo.';
      await updateAlertStatus('failed', { error_message: errMsg });
      throw new Error(errMsg);
    }

    logger.info(`[Job ${job.id}] Enviando para instância "${targetInstanceName}" → ${phone}`);

    // 6. Circuit breaker por provedor: uma Evolution externa de um tenant fora do
    // ar não pode interromper os envios de quem usa outro servidor.
    // 6.5 Freio da campanha em massa.
    //
    // Até 10/09/2026 não havia como parar uma campanha já enfileirada: o botão
    // "PARAR CAMPANHA" só abortava a requisição HTTP, e os jobs seguiam saindo
    // com o atraso programado. Agora a execução tem status, e é consultado aqui,
    // imediatamente antes do envio — o que para a campanha sem precisar mexer no
    // Redis, porque cada job acorda, lê o status e decide sozinho.
    if (massRunId) {
      const { data: massRun } = await supabaseAdmin
        .from('mass_campaign_runs')
        .select('status, stop_reason')
        .eq('id', massRunId)
        .maybeSingle();

      // Sem a linha não há como saber se a campanha foi interrompida. Não enviar
      // é a escolha segura: a mensagem fica como falha auditável em vez de
      // escapar de um freio que pode ter sido acionado.
      if (!massRun) {
        logger.warn(`[Job ${job.id}] Execução de campanha ${massRunId} não encontrada; não enviando.`);
        await updateAlertStatus('failed', { error_message: 'MASS_RUN_NOT_FOUND' });
        await releaseCoordinationHold('MASS_RUN_NOT_FOUND');
        return;
      }

      if (massRun.status === 'stopped') {
        logger.info(`[Job ${job.id}] Campanha ${massRunId} parada pelo operador (${massRun.stop_reason || 'sem motivo'}); descartando envio.`);
        // 'failed' e não 'cancelled': o enum alert_send_status não tem
        // 'cancelled', e gravar valor fora do enum vira 400 silencioso no
        // PostgREST. O motivo fica no error_message.
        await updateAlertStatus('failed', { error_message: `MASS_RUN_STOPPED:${massRun.stop_reason || 'OPERATOR'}` });
        await releaseCoordinationHold('MASS_RUN_STOPPED');
        return;
      }

      if (massRun.status === 'paused') {
        // Mesma lógica da pausa de instância: espera uma janela antes de
        // desistir, porque quem pausou vai retomar.
        const pausedSince = readBackpressure(job)?.pausedSince ?? Date.now();
        if (Date.now() - pausedSince < INSTANCE_PAUSED_GRACE_MS) {
          logger.info(`[Job ${job.id}] Campanha ${massRunId} pausada; reagendando.`);
          await updateAlertStatus('pending', { error_message: 'MASS_RUN_PAUSED' });
          await releaseCoordinationHold('MASS_RUN_PAUSED');
          await deferJob(job, INSTANCE_PAUSED_RETRY_MS, 'MASS_RUN_PAUSED', { pausedSince });
        }
        logger.warn(`[Job ${job.id}] Campanha ${massRunId} pausada além da janela de espera; descartando envio.`);
        await updateAlertStatus('failed', { error_message: 'MASS_RUN_PAUSED_EXPIRED' });
        await releaseCoordinationHold('MASS_RUN_PAUSED_EXPIRED');
        return;
      }
    }

    const providerScope = CircuitBreaker.scopeFor(finalUrl);
    if (await CircuitBreaker.isTripped(providerScope)) {
      const retryInMs = await CircuitBreaker.retryAfterMs(providerScope);
      logger.warn(`[Job ${job.id}] ⛔ Circuit Breaker ABERTO para ${finalUrl}; reagendando em ${Math.ceil(retryInMs / 1000)}s.`);
      await updateAlertStatus('pending', { error_message: 'CIRCUIT_BREAKER_OPEN' });
      await deferJob(job, retryInMs + Math.floor(Math.random() * 5000), 'CIRCUIT_BREAKER_OPEN');
    }

    if (instanceSendingPaused) {
      const reason = instanceSendingPauseReason || 'INSTANCE_SENDING_PAUSED';
      // A pausa é liberada por um operador, então a mensagem espera uma janela
      // antes de ser descartada em vez de morrer já na primeira passagem.
      // A janela conta da primeira detecção, não de `job.timestamp`: um job
      // agendado para dias à frente já nasceria com a janela vencida.
      const pausedSince = readBackpressure(job)?.pausedSince ?? Date.now();
      if (Date.now() - pausedSince < INSTANCE_PAUSED_GRACE_MS) {
        logger.warn(`[Job ${job.id}] Envio pausado em ${targetInstanceName} (${reason}); reagendando.`);
        await updateAlertStatus('pending', { error_message: `INSTANCE_SENDING_PAUSED:${reason}` });
        await releaseCoordinationHold(`INSTANCE_SENDING_PAUSED:${reason}`);
        await deferJob(job, INSTANCE_PAUSED_RETRY_MS, `INSTANCE_SENDING_PAUSED:${reason}`, { pausedSince });
      }
      logger.warn(`[Job ${job.id}] Envio pausado em ${targetInstanceName}: ${reason}. Janela de espera esgotada.`);
      await updateAlertStatus('failed', { error_message: `INSTANCE_SENDING_PAUSED:${reason}` });
      return;
    }

    const sendPolicy = await resolveOrganizationSendPolicy(organizationId);

    // 7. Janela de horário da organização (`collection_settings`).
    //
    // Só vale para tráfego não urgente. A prioridade do job é o critério: código
    // de acesso, resposta a quem acabou de escrever e aviso de pagamento saem a
    // qualquer hora; cobrança, automação e disparo em massa esperam a janela
    // abrir em vez de chegar de madrugada.
    if ((job.opts.priority ?? 0) >= MESSAGE_PRIORITY.billing) {
      const untilWindow = millisecondsUntilSendWindow(
        new Date(),
        sendPolicy.timeZone,
        sendPolicy.windowStartMinute,
        sendPolicy.windowEndMinute,
      );
      if (untilWindow > 0) {
        logger.info(`[Job ${job.id}] Fora da janela de envio; reagendando em ${Math.ceil(untilWindow / 60000)} min.`);
        await updateAlertStatus('pending', { error_message: 'OUTSIDE_SEND_WINDOW' });
        await releaseCoordinationHold('OUTSIDE_SEND_WINDOW');
        // Espalha a reabertura para a fila inteira não disparar no mesmo segundo.
        await deferJob(job, untilWindow + Math.floor(Math.random() * 300_000), 'OUTSIDE_SEND_WINDOW');
      }
    }

    // 8. Pacing da instância: quota diária + intervalo mínimo entre mensagens.
    // Ambos são reservados antes do envio e viajam no job, para que o
    // reagendamento não reserve duas vezes.
    let reservedQuotaKey: string | null = null;
    if (instanceId) {
      const paced = currentAttemptState(job);
      if (paced && paced.slotInstanceId === instanceId) {
        reservedQuotaKey = paced.quotaKey;
        const remainingMs = paced.readyAt - Date.now();
        if (remainingMs > 0) await sleep(Math.min(remainingMs, MAX_INLINE_WAIT_MS));
      } else {
        const quota = await reserveInstanceDailyQuota(instanceId, instanceDailyMessageLimit, sendPolicy.timeZone);
        if (!quota.allowed) {
          const delay = quota.resetInMs + Math.floor(Math.random() * 60000);
          logger.warn(`[Job ${job.id}] Limite diário da instância atingido; reagendando em ${Math.ceil(delay / 60000)} min.`);
          await updateAlertStatus('pending', { error_message: 'INSTANCE_DAILY_LIMIT_REACHED' });
          await releaseCoordinationHold('INSTANCE_DAILY_LIMIT_REACHED');
          await deferJob(job, delay, 'INSTANCE_DAILY_LIMIT_REACHED', { quotaKey: null, slotInstanceId: null });
        }
        reservedQuotaKey = quota.key;

        const intervalRange = Math.max(0, instanceMessageMaxIntervalMs - instanceMessageMinIntervalMs);
        const interval = instanceMessageMinIntervalMs + Math.floor(Math.random() * (intervalRange + 1));
        const waitMs = await reserveInstanceSendSlot(instanceId, interval, SEND_SLOT_MAX_HORIZON_MS, {
          size: instanceBurstMessageCount,
          pauseMs: instanceBurstPauseMinutes * 60_000,
        });
        if (waitMs === null) {
          logger.warn(`[Job ${job.id}] Fila da instância ${targetInstanceName} saturada; reagendando sem reservar slot.`);
          await releaseInstanceDailyQuota(reservedQuotaKey);
          reservedQuotaKey = null;
          await updateAlertStatus('pending', { error_message: 'INSTANCE_SEND_SLOT_SATURATED' });
          await releaseCoordinationHold('INSTANCE_SEND_SLOT_SATURATED');
          await deferJob(job, Math.floor(SEND_SLOT_MAX_HORIZON_MS / 2) + Math.floor(Math.random() * 60000), 'INSTANCE_SEND_SLOT_SATURATED', { quotaKey: null, slotInstanceId: null });
        }
        // `deferJob` sempre lança, então o ?? 0 é apenas defensivo para o narrowing.
        const slotWaitMs = waitMs ?? 0;
        // O slot já é nosso: devolve o job ao Redis e volta na hora marcada, em
        // vez de segurar um slot de concorrência dormindo.
        if (slotWaitMs > MAX_INLINE_WAIT_MS) {
          await deferJob(job, slotWaitMs, 'INSTANCE_SEND_SLOT', { quotaKey: reservedQuotaKey, slotInstanceId: instanceId });
        }
        if (slotWaitMs > 0) await sleep(slotWaitMs);
      }
    }

    try {
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
      await CircuitBreaker.recordSuccess(providerScope);

      // Incrementa a Quota do Mês no Redis
      const currentMonth = new Date().toISOString().slice(0, 7);
      if (userId) {
        const quotaKey = `usage:messages:${userId}:${currentMonth}`;
        await redisConnection.incrby(quotaKey, sentMessageCount);
        await redisConnection.expire(quotaKey, 60 * 60 * 24 * 32);
      }

    } catch (err: any) {
      // Reagendamento por backpressure não é falha de entrega: precisa subir intacto
      // para o BullMQ, sem contar falha no circuit breaker nem marcar histórico.
      if (isDelayedError(err)) throw err;

      // 8. Falha — Registra o erro
      logger.error(`[Job ${job.id}] ❌ Falha: ${err.message}`);

      // A vaga do dia só deve ser consumida por mensagem que chegou ao provedor.
      // Sem devolver, cada tentativa queima mais um slot do limite diário.
      if (reservedQuotaKey) {
        await releaseInstanceDailyQuota(reservedQuotaKey);
        reservedQuotaKey = null;
      }

      const retryable = isRetryableWhatsAppError(err);
      if (shouldPauseWhatsAppInstance(err) && instanceId) {
        await supabaseAdmin.from('evolution_instances').update({
          sending_paused: true,
          sending_pause_reason: whatsappErrorCode(err),
          sending_paused_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', instanceId);
      }

      if (retryable) {
        await CircuitBreaker.recordFailure(providerScope);
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
  // O ritmo de envio é garantido pelo slot por instância (Redis), não pela
  // concorrência do worker. Com o pacing feito por `moveToDelayed`, os slots
  // deixam de ficar presos dormindo e podem atender vários tenants em paralelo.
  concurrency: MESSAGE_WORKER_CONCURRENCY,
  // Teto de segurança contra disparada, não mecanismo de pacing. O valor
  // anterior (1 job a cada QUEUE_DELAY_MS) limitava a plataforma inteira a ~12
  // mensagens por minuto, somando todos os tenants.
  limiter: {
    max: MESSAGE_WORKER_LIMITER_MAX,
    duration: MESSAGE_WORKER_LIMITER_DURATION_MS
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

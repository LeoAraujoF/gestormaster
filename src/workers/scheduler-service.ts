import '../lib/env';
import cron from 'node-cron';
import { supabaseAdmin } from '../lib/supabase/service-role';
import { messageQueue, healthQueue } from '../lib/queue';
import { logger, runWithCorrelationId } from '../lib/logger';
import { parseMessageTemplate } from '../lib/message-parser';
import { prepareIntelligentCollectionData, resolveIntelligentRecoveryCoverage, scheduleIntelligentCollections } from '../lib/intelligent-collections';
import { scheduleIntelligenceRuns } from '../lib/intelligence-service';
import { captureAnalyticsSnapshots } from '../lib/analytics-service';
import { createCoordinatedAlert, reconcileStaleContactReservations, releaseDeferredContacts, reserveContact } from '../lib/contact-coordination';
import { startOperationalHeartbeat } from '../lib/operational-heartbeat';
import { decideFixedBillingRule, type FixedBillingAlertType } from '../lib/collection-orchestration';
import { normalizePhoneE164 } from '../lib/phone';

startOperationalHeartbeat('scheduler');

logger.info('⏰ Scheduler Service iniciado. Aguardando cron jobs...');

function addDateOnlyDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

function daysBetweenDateOnly(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T12:00:00Z`).getTime();
  const end = new Date(`${endDate}T12:00:00Z`).getTime();
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

function formatDateOnly(dateOnly: string): string {
  const [year, month, day] = dateOnly.split('-');
  return `${day}/${month}/${year}`;
}

async function scheduleRenewalReminders(todayDate: string): Promise<number> {
  const reminderWindowEnd = addDateOnlyDays(todayDate, 60);
  const { data: clients, error } = await supabaseAdmin
    .from('clients')
    .select('id, user_id, organization_id, name, plan_value, due_date, renewal_reminder_days_before, renewal_reminder_last_sent_due_date')
    .eq('renewal_reminder_enabled', true)
    .eq('status', 'active')
    .gte('due_date', todayDate)
    .lte('due_date', reminderWindowEnd);

  if (error) throw new Error(`Erro ao buscar lembretes de renovação: ${error.message}`);
  if (!clients || clients.length === 0) return 0;

  const userMetaCache = new Map<string, Record<string, any>>();
  const instanceCache = new Map<string, any | null>();
  let queued = 0;

  for (const client of clients) {
    const daysBefore = Math.min(60, Math.max(1, Number(client.renewal_reminder_days_before || 7)));
    if (daysBetweenDateOnly(todayDate, client.due_date) !== daysBefore) continue;

    const userKey = client.user_id as string;
    if (!userMetaCache.has(userKey)) {
      try {
        const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userKey);
        userMetaCache.set(userKey, (user?.user_metadata || {}) as Record<string, any>);
      } catch (metadataError: any) {
        logger.warn(`[Scheduler] Não foi possível buscar o telefone do gestor ${userKey}: ${metadataError.message}`);
        userMetaCache.set(userKey, {});
      }
    }
    const userMeta = userMetaCache.get(userKey) || {};

    const instanceKey = client.organization_id ? `org:${client.organization_id}` : `user:${client.user_id}`;
    if (!instanceCache.has(instanceKey)) {
      let instanceQuery = supabaseAdmin
        .from('evolution_instances')
        .select('id, instance_name, phone_number')
        .eq('status', 'connected')
        .order('is_primary', { ascending: false })
        .limit(1);
      instanceQuery = client.organization_id
        ? instanceQuery.eq('organization_id', client.organization_id)
        : instanceQuery.eq('user_id', client.user_id);
      const { data: instances } = await instanceQuery;
      instanceCache.set(instanceKey, instances?.[0] || null);
    }
    const instance = instanceCache.get(instanceKey);
    if (!instance) {
      logger.warn(`[Scheduler] Lembrete de ${client.name} aguardando uma instância WhatsApp conectada.`);
      continue;
    }

    const reminderPhone = normalizePhoneE164(String(userMeta.support_phone || ''))
      || normalizePhoneE164(String(instance.phone_number || ''));
    if (!reminderPhone) {
      logger.warn(`[Scheduler] Lembrete de ${client.name} ignorado: configure o WhatsApp de suporte em Minha conta.`);
      continue;
    }

    const { data: claimed, error: claimError } = await supabaseAdmin
      .from('clients')
      .update({ renewal_reminder_last_sent_due_date: client.due_date })
      .eq('id', client.id)
      .eq('renewal_reminder_enabled', true)
      .eq('due_date', client.due_date)
      .or(`renewal_reminder_last_sent_due_date.is.null,renewal_reminder_last_sent_due_date.neq.${client.due_date}`)
      .select('id');

    if (claimError) {
      logger.error(`[Scheduler] Não foi possível reservar o lembrete de ${client.name}: ${claimError.message}`);
      continue;
    }
    if (!claimed || claimed.length === 0) continue;

    const formattedDueDate = formatDateOnly(client.due_date);
    const dayLabel = daysBefore === 1 ? 'dia' : 'dias';
    const finalMessage = [
      'Lembrete interno de renovação',
      `Cliente: ${client.name}`,
      `Vencimento: ${formattedDueDate} (em ${daysBefore} ${dayLabel})`,
      `Plano mensal cadastrado: R$ ${Number(client.plan_value || 0).toFixed(2).replace('.', ',')}`,
      'Acesse o Gestor para verificar e renovar.',
    ].join('\n');

    try {
      await messageQueue.add('renewal-reminder', {
        userId: client.user_id,
        organizationId: client.organization_id || undefined,
        instanceId: instance.id,
        instanceName: instance.instance_name,
        phone: reminderPhone,
        finalMessage,
        source: 'renewal_reminder',
        renewalReminderClientId: client.id,
        renewalReminderDueDate: client.due_date,
        correlationId: logger.bindings()?.correlationId,
      }, {
        jobId: `renewal-reminder-${client.id}-${client.due_date}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60000 },
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 604800, count: 1000 },
      });
      queued += 1;
    } catch (queueError: any) {
      await supabaseAdmin
        .from('clients')
        .update({ renewal_reminder_last_sent_due_date: null })
        .eq('id', client.id)
        .eq('due_date', client.due_date)
        .eq('renewal_reminder_last_sent_due_date', client.due_date);
      logger.error(`[Scheduler] Falha ao enfileirar o lembrete de ${client.name}: ${queueError.message}`);
    }
  }

  return queued;
}

// --- Scheduler Principal (A cada 5 min) ---
cron.schedule('*/5 * * * *', async () => {
  return runWithCorrelationId(undefined, undefined, async () => {
    logger.info(`[Scheduler] 🤖 Iniciando varredura principal (Automações & Health Monitor)... (${new Date().toISOString()})`);

  try {
    const now = new Date();

    // 0. Varredura Global: Atualiza TODOS os clientes vencidos da base
    // Utiliza o fuso horário padrão do Brasil (-03:00) como linha de corte
    const brazilDate = new Date(now.getTime() - (3 * 60 * 60 * 1000));
    const brTodayStr = brazilDate.toISOString().split('T')[0];

    try {
      const renewalRemindersQueued = await scheduleRenewalReminders(brTodayStr);
      if (renewalRemindersQueued) {
        logger.info(`[Scheduler] ${renewalRemindersQueued} lembretes internos de renovação enfileirados.`);
      }
    } catch (reminderError: any) {
      logger.error(`[Scheduler] Falha nos lembretes internos de renovação: ${reminderError.message}`);
    }

    const { error: updateGlobalErr } = await supabaseAdmin
      .from('clients')
      .update({ status: 'vencido' })
      .eq('status', 'active')
      .lt('due_date', brTodayStr);

    if (updateGlobalErr) {
      logger.error(`[Scheduler] Erro na varredura global de clientes vencidos: ${updateGlobalErr.message}`);
    }

    // 0.1 Varredura Global: Atualiza para Inativo clientes vencidos há mais de 30 dias (Churn Definitivo)
    const past30DaysDate = new Date(brazilDate.getTime() - (30 * 24 * 60 * 60 * 1000));
    const brPast30DaysStr = past30DaysDate.toISOString().split('T')[0];

    const { error: updateInactiveErr } = await supabaseAdmin
      .from('clients')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .in('status', ['active', 'vencido'])
      .lt('due_date', brPast30DaysStr);

    if (updateInactiveErr) {
      logger.error(`[Scheduler] Erro na varredura global de clientes inativos: ${updateInactiveErr.message}`);
    }

    // 0.2 Régua inteligente: só organizações que fizeram opt-in entram aqui.
    const { data: intelligentSettings, error: intelligentSettingsError } = await supabaseAdmin
      .from('collection_settings')
      .select('organization_id, enabled');
    if (intelligentSettingsError) throw new Error(`Erro ao buscar configurações inteligentes: ${intelligentSettingsError.message}`);
    for (const setting of intelligentSettings || []) {
      await prepareIntelligentCollectionData(setting.organization_id);
    }
    const intelligentOrganizations = new Set((intelligentSettings || []).filter((setting) => setting.enabled).map((setting) => setting.organization_id));
    const intelligentQueued = await scheduleIntelligentCollections(now);
    if (intelligentQueued) logger.info(`[Scheduler] ${intelligentQueued} despachos inteligentes enfileirados.`);
    const staleReservationsReconciled = await reconcileStaleContactReservations(now);
    if (staleReservationsReconciled) {
      logger.info(`[Scheduler] ${staleReservationsReconciled} reservas de contato presas reconciliadas.`);
    }
    const deferredQueued = await releaseDeferredContacts(now);
    if (deferredQueued) logger.info(`[Scheduler] ${deferredQueued} contatos adiados liberados.`);
    try {
      const intelligenceQueued = await scheduleIntelligenceRuns(now);
      if (intelligenceQueued) logger.info(`[Scheduler] ${intelligenceQueued} relatórios Intelligence enfileirados.`);
    } catch (intelligenceError: any) {
      logger.warn(`[Scheduler] Intelligence indisponível: ${intelligenceError.message}`);
    }

    // 1. Busca automações ativas
    const { data: automations, error: autoErr } = await supabaseAdmin
      .from('automations')
      .select('*')
      .eq('is_active', true)
      .in('alert_type', ['before_due', 'on_due', 'after_due']);

    if (autoErr) throw new Error(`Erro ao buscar automações: ${autoErr.message}`);

    const { data: advancedEntitlements } = await supabaseAdmin.from('organization_entitlements')
      .select('organization_id').eq('is_active', true).in('plan', ['pro', 'master']);
    const advancedAutomationOrganizations = new Set((advancedEntitlements || []).map((item) => item.organization_id));

    const processedUsersForOverdue = new Set<string>();

    for (const rule of automations || []) {
      if (!rule.organization_id || !advancedAutomationOrganizations.has(rule.organization_id)) continue;
      const intelligentEnabled = intelligentOrganizations.has(rule.organization_id);
      if (!rule.send_time) continue;

      // 1.1 Busca metadados do usuário para obter o fuso horário (timezone)
      let userMeta: any = {};
      try {
        const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(rule.user_id);
        if (user && user.user_metadata) {
          userMeta = user.user_metadata;
        }
      } catch (err: any) {
        logger.warn(`[Scheduler] Não foi possível buscar metadados do usuário ${rule.user_id}: ${err.message}`);
      }

      // 1.2 Calcula a Hora e Data Local do Usuário
      const tzString = userMeta.timezone || '-03:00';
      const sign = tzString[0] === '-' ? -1 : 1;
      const tzHours = parseInt(tzString.slice(1, 3)) || 3;
      const tzMins = parseInt(tzString.slice(4, 6)) || 0;
      const offsetMs = sign * (tzHours * 60 + tzMins) * 60000;

      // Cria um Date "falso" onde a hora UTC dele é na verdade a hora local do usuário
      const localDate = new Date(now.getTime() + offsetMs);

      const localNowMins = localDate.getUTCHours() * 60 + localDate.getUTCMinutes();
      const localTodayStr = localDate.toISOString().split('T')[0];

      const [h, m] = rule.send_time.split(':').map(Number);
      const ruleMins = h * 60 + m;

      // Checa se o horário de envio caiu na janela dos últimos 5 minutos locais
      if (ruleMins <= (localNowMins - 5) || ruleMins > localNowMins) {
        continue;
      }

      const alertType = rule.alert_type as FixedBillingAlertType;
      if (intelligentEnabled && alertType !== 'after_due') {
        const decision = decideFixedBillingRule({
          intelligentEnabled,
          alertType,
          planValue: 0,
          hasPendingCycle: false,
          intelligentStepCoversDay: false,
        });
        logger.info(`[Scheduler] Regra fixa ${rule.id} suprimida: ${decision.reason}.`);
        continue;
      }

      // Calcula a Data Alvo (targetDate) baseada na regra
      // Usa Math.abs() porque o banco pode salvar days_offset como negativo
      const offset = Math.abs(rule.days_offset || 0);
      let targetDateObj = new Date(localDate);
      if (rule.alert_type === 'before_due') {
        // "Aviso prévio": buscar clientes que vencem DAQUI A N dias
        targetDateObj.setUTCDate(targetDateObj.getUTCDate() + offset);
      } else if (rule.alert_type === 'after_due') {
        // "Cobrança atrasado": buscar clientes que venceram HÁ N dias
        targetDateObj.setUTCDate(targetDateObj.getUTCDate() - offset);
      }
      // Se for 'on_due', 'renewal', 'promotion' ou 'quick_message', a targetDateObj continua sendo 'hoje local'

      const targetDateStr = targetDateObj.toISOString().split('T')[0];

      // Busca os clientes que possuem esse vencimento
      let query = supabaseAdmin.from('clients')
        .select('*')
        .eq('due_date', targetDateStr);

      if (rule.alert_type === 'after_due') {
        query = query.in('status', ['active', 'vencido']);
      } else {
        query = query.eq('status', 'active');
      }

      if (rule.organization_id) {
        query = query.eq('organization_id', rule.organization_id);
      } else {
        query = query.eq('user_id', rule.user_id);
      }

      const { data: clients, error: clientErr } = await query;
      if (clientErr || !clients || clients.length === 0) continue;

      const intelligentCoverage = intelligentEnabled && alertType === 'after_due'
        ? await resolveIntelligentRecoveryCoverage({
          organizationId: rule.organization_id,
          clientIds: clients.map((client) => client.id),
          dueDate: targetDateStr,
          relativeDay: offset,
        })
        : new Map();

      // Busca uma instância da Evolution conectada para disparar
      let instanceQuery = supabaseAdmin.from('evolution_instances')
        .select('*')
        .eq('status', 'connected');

      if (rule.organization_id) {
        instanceQuery = instanceQuery.eq('organization_id', rule.organization_id);
      } else {
        instanceQuery = instanceQuery.eq('user_id', rule.user_id);
      }

      const { data: instances } = await instanceQuery.limit(1);
      if (!instances || instances.length === 0) {
        logger.warn(`[Scheduler] ⚠️ Regra ${rule.id}: Nenhuma instância WhatsApp conectada para disparar.`);
        continue;
      }
      const instance = instances[0];

      const jobsToQueue = [];

      for (const client of clients) {
        const clientPhone = normalizePhoneE164(client.phone_e164 || client.phone || '');
        if (!clientPhone) continue;

        const coverage = intelligentCoverage.get(client.id);
        const orchestrationDecision = decideFixedBillingRule({
          intelligentEnabled,
          alertType,
          planValue: Number(client.plan_value || 0),
          hasPendingCycle: coverage?.hasPendingCycle ?? false,
          intelligentStepCoversDay: coverage?.intelligentStepCoversDay ?? false,
        });
        if (!orchestrationDecision.execute) {
          logger.info(`[Scheduler] Cliente ${client.id} suprimido na regra fixa ${rule.id}: ${orchestrationDecision.reason}.`);
          continue;
        }

        // Proteção contra envios duplicados no mesmo dia para a mesma automação
        const { data: historyCheck } = await supabaseAdmin.from('alert_history')
          .select('id')
          .eq('client_id', client.id)
          .eq('automation_id', rule.id)
          .gte('created_at', `${localTodayStr}T00:00:00Z`)
          .limit(1);

        if (historyCheck && historyCheck.length > 0) continue;

        // Construir a mensagem dinâmica com Spintax e Variáveis Duplas
        const finalMsg = parseMessageTemplate(rule.message_template || '', client, userMeta);

        if (!rule.organization_id) {
          logger.warn(`[Scheduler] Regra ${rule.id} sem organização não pode usar coordenação de contato.`);
          continue;
        }
        const reservation = await reserveContact({
          organizationId: rule.organization_id,
          clientId: client.id,
          contactDate: localTodayStr,
          timezone: tzString,
          category: 'billing',
          source: 'legacy_automation',
          sourceId: rule.id,
          requestedBy: rule.user_id,
          automationId: rule.id,
          messageContent: finalMsg,
        });
        if (!reservation.reservationId || !['reserved', 'idempotent'].includes(reservation.decision)) continue;

        let insertedAlertId: string;
        try {
          insertedAlertId = await createCoordinatedAlert({
            reservationId: reservation.reservationId,
            organizationId: rule.organization_id,
            userId: rule.user_id,
            clientId: client.id,
            automationId: rule.id,
            messageContent: finalMsg,
            origin: 'legacy_automation',
            category: 'billing',
            decision: reservation.decision,
            reason: reservation.reason,
            scheduledAt: now.toISOString(),
          });
        } catch (insertErr: any) {
          logger.error(`[Scheduler] Erro ao criar histórico coordenado para ${client.id}: ${insertErr.message}`);
          continue;
        }

        if (insertedAlertId) {
          jobsToQueue.push({
            name: 'send-automated-message',
            data: {
              clientId: client.id,
              phone: clientPhone,
              finalMessage: finalMsg,
              instanceUrl: instance.base_url,
              apiKey: instance.api_key,
              instanceName: instance.instance_name,
              connectionMode: instance.connection_mode,
              alertHistoryId: insertedAlertId,
              contactReservationId: reservation.reservationId,
              ruleId: rule.id,
              userId: rule.user_id,
              organizationId: rule.organization_id,
              correlationId: logger.bindings()?.correlationId
            },
            opts: {
              removeOnComplete: { age: 86400, count: 1000 },
              jobId: `auto-${rule.id}-${client.id}-${localTodayStr}`
            }
          });
        }
      }

      // Envia em lote para o Redis
      if (jobsToQueue.length > 0) {
        await messageQueue.addBulk(jobsToQueue as any);
        logger.info(`[Scheduler] 🚀 ${jobsToQueue.length} mensagens injetadas na Fila para a regra ${rule.id}`);
      }
    }

    // 2. Dispara o Health Monitor
    await healthQueue.add('sync-instances', { timestamp: Date.now(), correlationId: logger.bindings()?.correlationId }, {
      removeOnComplete: true,
    });

    logger.info('[Scheduler] ✅ Varredura principal (Automações e Health) concluída.');

  } catch (error: any) {
    logger.error(`[Scheduler] ❌ Erro na rotina de agendamento principal: ${error.message}`);
  }
  });
});

// --- Snapshot executivo e projeções da Fase 7 (aos 15 minutos de cada hora) ---
// A unicidade diária faz a execução ocorrer às 00h15 locais e também recuperar
// automaticamente o snapshot caso o scheduler estivesse indisponível nesse horário.
cron.schedule('15 * * * *', async () => {
  return runWithCorrelationId(undefined, undefined, async () => {
    try {
      const result = await captureAnalyticsSnapshots(new Date());
      if (result.captured || result.forecasts) {
        logger.info(`[Scheduler] Analytics diário: ${result.captured} snapshots e ${result.forecasts} projeções persistidos.`);
      }
    } catch (error: any) {
      logger.error(`[Scheduler] Falha na captura diária do Analytics: ${error.message}`);
    }
  });
});

// --- Warmup Engine Cron (A cada 2 min) ---
cron.schedule('*/2 * * * *', async () => {
  return runWithCorrelationId(undefined, undefined, async () => {
    try {
      return;
      logger.info('[Scheduler] 🔥 Job de execute-warmup disparado.');
    } catch (error: any) {
      logger.error(`[Scheduler] ❌ Erro ao disparar Warmup: ${error.message}`);
    }
  });
});

// --- Liberação de Comissões de Afiliados (Rodar 1x por dia, à meia-noite 00:00) ---
cron.schedule('0 0 * * *', async () => {
  return runWithCorrelationId(undefined, undefined, async () => {
    logger.info(`[Scheduler] 💰 Iniciando liberação de comissões de afiliados... (${new Date().toISOString()})`);
    try {
      const HOLD_DAYS = 7;
      const releaseDate = new Date();
      releaseDate.setDate(releaseDate.getDate() - HOLD_DAYS);

      // Busca comissões pendentes e antigas
      const { data: pendingEarnings, error: searchError } = await supabaseAdmin
        .from('affiliate_earnings')
        .select('id')
        .eq('status', 'pending')
        .lte('created_at', releaseDate.toISOString());

      if (searchError) throw searchError;

      if (pendingEarnings && pendingEarnings.length > 0) {
        const idsToRelease = pendingEarnings.map(e => e.id);

        const { error: updateError } = await supabaseAdmin
          .from('affiliate_earnings')
          .update({ status: 'available' })
          .in('id', idsToRelease);

        if (updateError) throw updateError;
        logger.info(`[Scheduler] ✅ ${idsToRelease.length} comissões foram liberadas com sucesso.`);
      } else {
        logger.info(`[Scheduler] Nenhuma comissão pendente para liberar hoje.`);
      }
    } catch (error: any) {
      logger.error(`[Scheduler] ❌ Erro na liberação de comissões: ${error.message}`);
    }
  });
});

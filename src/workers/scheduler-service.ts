import '../lib/env';
import cron from 'node-cron';
import { supabaseAdmin } from '../lib/supabase/service-role';
import { messageQueue, healthQueue, warmupQueue } from '../lib/queue';
import { logger, runWithCorrelationId } from '../lib/logger';
import { parseMessageTemplate } from '../lib/message-parser';

logger.info('⏰ Scheduler Service iniciado. Aguardando cron jobs...');

// --- Scheduler Principal (A cada 5 min) ---
cron.schedule('*/5 * * * *', async () => {
  return runWithCorrelationId(undefined, undefined, async () => {
    logger.info(`[Scheduler] 🤖 Iniciando varredura principal (Automações & Health Monitor)... (${new Date().toISOString()})`);
  
  try {
    const now = new Date();

    // 1. Busca automações ativas
    const { data: automations, error: autoErr } = await supabaseAdmin
      .from('automations')
      .select('*')
      .eq('is_active', true);
      
    if (autoErr) throw new Error(`Erro ao buscar automações: ${autoErr.message}`);

    const processedUsersForOverdue = new Set<string>();

    for (const rule of automations || []) {
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

      // Rotina: Atualiza clientes atrasados para o status "vencido"
      // Respeita o fuso horário (localTodayStr) do dono da regra
      if (!processedUsersForOverdue.has(rule.user_id)) {
        processedUsersForOverdue.add(rule.user_id);
        const { error: updateErr } = await supabaseAdmin
          .from('clients')
          .update({ status: 'vencido' })
          .eq('status', 'active')
          .lt('due_date', localTodayStr)
          .eq('user_id', rule.user_id);
        
        if (updateErr) {
          logger.warn(`[Scheduler] Erro ao atualizar status para vencido do user ${rule.user_id}: ${updateErr.message}`);
        } else {
          logger.info(`[Scheduler] Verificação de clientes vencidos executada para o usuário ${rule.user_id}`);
        }
      }

      // Checa se o horário de envio caiu na janela dos últimos 5 minutos locais
      if (ruleMins <= (localNowMins - 5) || ruleMins > localNowMins) {
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
        if (!client.phone) continue;

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

        // Registra o Histórico como Pending
        const historyData: any = {
          client_id: client.id,
          automation_id: rule.id,
          status: 'pending',
          message_content: finalMsg,
          scheduled_at: now.toISOString(),
          user_id: rule.user_id
        };
        if (rule.organization_id) historyData.organization_id = rule.organization_id;

        const { data: insertedAlert, error: insertErr } = await supabaseAdmin
          .from('alert_history')
          .insert(historyData)
          .select()
          .single();

        if (insertErr) {
          logger.error(`[Scheduler] ❌ Erro ao criar histórico de alerta para ${client.id}: ${insertErr.message}`);
          continue;
        }

        if (insertedAlert) {
          jobsToQueue.push({
            name: 'send-automated-message',
            data: {
              clientId: client.id,
              phone: client.phone,
              finalMessage: finalMsg,
              instanceUrl: instance.base_url,
              apiKey: instance.api_key,
              instanceName: instance.instance_name,
              connectionMode: instance.connection_mode,
              alertHistoryId: insertedAlert.id,
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

// --- Warmup Engine Cron (A cada 2 min) ---
cron.schedule('*/2 * * * *', async () => {
  return runWithCorrelationId(undefined, undefined, async () => {
    try {
      await warmupQueue.add('execute-warmup', { timestamp: Date.now() }, {
        removeOnComplete: true,
      });
      logger.info('[Scheduler] 🔥 Job de execute-warmup disparado.');
    } catch (error: any) {
      logger.error(`[Scheduler] ❌ Erro ao disparar Warmup: ${error.message}`);
    }
  });
});

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

logger.info('🚀 Queue Worker iniciado e aguardando jobs...');

const worker = new Worker(MESSAGE_QUEUE_NAME, async (job: Job) => {
  const { 
    clientId, phone, finalMessage, instanceUrl, apiKey, instanceName, connectionMode,
    alertHistoryId, ruleId, userId, organizationId, correlationId 
  } = job.data;

  return runWithCorrelationId(correlationId, organizationId, async () => {
    logger.info(`[Job ${job.id}] Processando disparo para ${phone}...`);

    // Helper: Atualiza o registro existente OU insere novo (para jobs antigos sem alertHistoryId)
    const updateAlertStatus = async (status: string, extra: Record<string, any> = {}) => {
      if (alertHistoryId) {
        // Atualiza o registro existente criado pelo Scheduler
        const { error } = await supabaseAdmin.from('alert_history')
          .update({ status, ...extra })
          .eq('id', alertHistoryId);
        if (error) logger.error(`[Job ${job.id}] Erro ao atualizar alert_history ${alertHistoryId}: ${error.message}`);
      } else {
        // Fallback para jobs antigos que não tinham alertHistoryId
        const { error } = await supabaseAdmin.from('alert_history').insert({
          user_id: userId,
          organization_id: organizationId,
          client_id: clientId,
          automation_id: ruleId,
          status,
          message_content: finalMessage,
          scheduled_at: new Date().toISOString(),
          ...extra
        });
        if (error) logger.error(`[Job ${job.id}] Erro ao inserir alert_history: ${error.message}`);
      }
    };

    // 1. Checa Circuit Breaker (Backpressure global)
    if (await CircuitBreaker.isTripped()) {
      logger.warn(`[Job ${job.id}] 🛑 Circuit Breaker ABERTO! Evolution API parece estar instável. Atrasando mensagem.`);
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
      // 6. Envia a mensagem
      await provider.sendMessage(targetInstanceName, phone, finalMessage, {
        delay: 1200,
        presence: 'composing'
      });

      // 7. Sucesso — Atualiza o registro para "sent"
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
        await updateAlertStatus('failed', { error_message: err.message });
      }

      throw err; // Lança para o BullMQ fazer o Retry/DLQ
    }
  });
}, { 
  connection: redisConnection,
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

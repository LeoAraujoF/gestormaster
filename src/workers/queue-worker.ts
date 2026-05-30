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
    clientId, phone, finalMessage, instanceUrl, apiKey, 
    ruleId, userId, organizationId, correlationId 
  } = job.data;

  return runWithCorrelationId(correlationId, organizationId, async () => {
    logger.info(`[Job ${job.id}] Processando disparo para ${phone}...`);

    // 1. Checa Circuit Breaker (Backpressure global)
    if (await CircuitBreaker.isTripped()) {
      logger.warn(`[Job ${job.id}] 🛑 Circuit Breaker ABERTO! Evolution API parece estar instável. Atrasando mensagem.`);
      throw new Error('CIRCUIT_BREAKER_OPEN');
    }

    // 2. Kill Switch (Verifica se o usuário foi banido/suspenso)
    const isBanned = await redisConnection.sismember('global:banned_users', userId);
    if (isBanned) {
      logger.error(`[Job ${job.id}] 🛑 KILL SWITCH: Usuário ${userId} está banido. Interrompendo envio definitivamente.`);
      
      await supabaseAdmin.from('alert_history').insert({
        user_id: userId,
        organization_id: organizationId,
        client_id: clientId,
        automation_id: ruleId,
        status: 'failed',
        error_message: 'USER_BANNED',
        scheduled_at: new Date().toISOString()
      });
      
      throw new Error('USER_BANNED');
    }

    if (organizationId) {
      // Limite: 60 mensagens por minuto por cliente (Pode virar dinâmico pelo DB futuramente)
      const { allowed, resetIn } = await RateLimiter.checkLimit(organizationId, 60, 60);
      if (!allowed) {
        logger.warn(`[Job ${job.id}] Tenant ${organizationId} excedeu limite. Atrasando job em ${resetIn}s`);
        // Adia a mensagem (delayed job). Necessário lançar erro pro BullMQ aplicar backoff,
        // ou usamos moveToDelayed se suportado (Aqui jogamos um erro padrão RateLimit)
        throw new Error(`RATE_LIMIT_EXCEEDED:${resetIn}`);
      }
    }

  try {
    const rawApiKey = SecretsManager.decrypt(apiKey);
    const provider = new EvolutionWhatsAppProvider(instanceUrl.replace(/\/message\/sendText\/.*$/, ''), rawApiKey);
    
    // Opcional: extrair o instanceName da instanceUrl (ex: http://api/message/sendText/Mylena -> Mylena)
    const instanceName = instanceUrl.split('/').pop() || '';

    await provider.sendMessage(instanceName, phone, finalMessage, {
      delay: 1200,
      presence: 'composing'
    });

    // Sucesso - Registra no banco ignorando RLS via supabaseAdmin
    const { error } = await supabaseAdmin.from('alert_history').insert({
      user_id: userId,
      organization_id: organizationId,
      client_id: clientId,
      automation_id: ruleId,
      status: 'sent',
      message_content: finalMessage,
      sent_at: new Date().toISOString(),
      scheduled_at: new Date().toISOString()
    });

    if (error) logger.error(`[Job ${job.id}] Erro ao salvar histórico: ${error.message}`);
    else {
      logger.info(`[Job ${job.id}] ✅ Enviado com sucesso!`);
      await CircuitBreaker.recordSuccess(); // Requisição limpa, reseta falhas
      
      // Incrementa a Quota do Mês no Redis (Limites de Plano)
      const currentMonth = new Date().toISOString().slice(0, 7); // ex: '2026-05'
      const quotaKey = `usage:messages:${userId}:${currentMonth}`;
      await redisConnection.incr(quotaKey);
      await redisConnection.expire(quotaKey, 60 * 60 * 24 * 32); // Expira em ~32 dias
    }

  } catch (err: any) {
    // Falha - Registra no banco e lança o erro para o BullMQ fazer o Retry (Backoff)
    logger.error(`[Job ${job.id}] ❌ Falha: ${err.message}`);
    
    // Ignora falhas controladas para não abrir o circuito injustamente
    if (!err.message.startsWith('RATE_LIMIT_EXCEEDED') && !err.message.startsWith('CIRCUIT_BREAKER_OPEN')) {
      await CircuitBreaker.recordFailure(); // Falha real (ex: timeout da Evolution API)
      
      await supabaseAdmin.from('alert_history').insert({
        user_id: userId,
        organization_id: organizationId,
        client_id: clientId,
        automation_id: ruleId,
        status: 'failed',
        error_message: err.message,
        scheduled_at: new Date().toISOString()
      });
    }

    // Se lançar o erro, o job será marcado como failed e irá retentar ou ir pra DLQ
    if (err.message.startsWith('RATE_LIMIT_EXCEEDED') || err.message.startsWith('CIRCUIT_BREAKER_OPEN')) {
       // Apenas lança para re-enfileirar, sem gravar failed history
       throw err;
    }
    throw err; 
  }
  });
}, { 
  connection: redisConnection,
  concurrency: 5, // Limita a 5 jobs paralelos por vez
  limiter: {
    max: 1,
    duration: parseInt(process.env.QUEUE_DELAY_MS || '5000') // Rate Limiter: 1 disparo a cada 5s
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

import '../lib/env';
import { Worker, Job } from 'bullmq';
import { redisConnection } from '../lib/redis';
import { MESSAGE_QUEUE_NAME } from '../lib/queue';
import { supabaseAdmin } from '../lib/supabase/service-role';
import { EvolutionWhatsAppProvider } from '../providers/whatsapp/EvolutionWhatsAppProvider';
import { logger, runWithCorrelationId } from '../lib/logger';

logger.info('🚀 Queue Worker iniciado e aguardando jobs...');

const worker = new Worker(MESSAGE_QUEUE_NAME, async (job: Job) => {
  const { 
    clientId, phone, finalMessage, instanceUrl, apiKey, 
    ruleId, userId, organizationId, correlationId 
  } = job.data;

  return runWithCorrelationId(correlationId, organizationId, async () => {
    logger.info(`[Job ${job.id}] Processando disparo para ${phone}...`);

  try {
    const provider = new EvolutionWhatsAppProvider(instanceUrl.replace(/\/message\/sendText\/.*$/, ''), apiKey);
    
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
    else logger.info(`[Job ${job.id}] ✅ Enviado com sucesso!`);

  } catch (err: any) {
    // Falha - Registra no banco e lança o erro para o BullMQ fazer o Retry (Backoff)
    logger.error(`[Job ${job.id}] ❌ Falha: ${err.message}`);
    
    await supabaseAdmin.from('alert_history').insert({
      user_id: userId,
      organization_id: organizationId,
      client_id: clientId,
      automation_id: ruleId,
      status: 'failed',
      error_message: err.message,
      scheduled_at: new Date().toISOString()
    });

    // Se lançar o erro, o job será marcado como failed e irá retentar ou ir pra DLQ
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

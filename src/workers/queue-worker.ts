import '../lib/env';
import { Worker, Job } from 'bullmq';
import { redisConnection } from '../lib/redis';
import { MESSAGE_QUEUE_NAME } from '../lib/queue';
import { supabaseAdmin } from '../lib/supabase/service-role';

console.log('🚀 Queue Worker iniciado e aguardando jobs...');

const worker = new Worker(MESSAGE_QUEUE_NAME, async (job: Job) => {
  const { 
    clientId, phone, finalMessage, instanceUrl, apiKey, 
    ruleId, userId, organizationId 
  } = job.data;

  console.log(`[Job ${job.id}] Processando disparo para ${phone}...`);

  try {
    const apiReq = await fetch(instanceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: JSON.stringify({
        number: phone,
        options: { delay: 1200, presence: 'composing' },
        text: finalMessage
      })
    });

    if (!apiReq.ok) {
      const errData = await apiReq.text();
      throw new Error(`API erro: ${errData}`);
    }

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

    if (error) console.error(`[Job ${job.id}] Erro ao salvar histórico:`, error.message);
    else console.log(`[Job ${job.id}] ✅ Enviado com sucesso!`);

  } catch (err: any) {
    // Falha - Registra no banco e lança o erro para o BullMQ fazer o Retry (Backoff)
    console.error(`[Job ${job.id}] ❌ Falha:`, err.message);
    
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

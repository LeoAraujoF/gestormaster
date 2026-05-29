import '../lib/env';
import { Worker, Job } from 'bullmq';
import { redisConnection } from '../lib/redis';
import { WEBHOOK_QUEUE_NAME } from '../lib/queue';
import { supabaseAdmin } from '../lib/supabase/service-role';
import crypto from 'crypto';

console.log('🛡️ Webhook Worker iniciado e aguardando eventos...');

const worker = new Worker(WEBHOOK_QUEUE_NAME, async (job: Job) => {
  const payload = job.data;
  
  // 1. Controle de Idempotência
  const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const idempotencyKey = `webhook:idempotency:${hash}`;

  const alreadyProcessed = await redisConnection.get(idempotencyKey);
  if (alreadyProcessed) {
    console.log(`[Job ${job.id}] ♻️ Evento duplicado descartado (Idempotency Key: ${idempotencyKey})`);
    return; // Sucesso imediato (não processa novamente)
  }

  console.log(`[Job ${job.id}] 📥 Processando webhook: ${payload.event}`);

  try {
    if (payload.event === 'CONNECTION_UPDATE') {
      const instanceName = payload.instance;
      const state = payload.data?.state;
      
      if (instanceName && state) {
         const { error } = await supabaseAdmin.from('evolution_instances')
           .update({ 
             status: state === 'open' ? 'connected' : 'disconnected',
             updated_at: new Date().toISOString()
           })
           .eq('instance_name', instanceName);
           
         if (error) throw error;
      }
    } 
    else if (payload.event === 'MESSAGES_UPSERT') {
      const msg = payload.data?.messages?.[0];
      if (msg && !msg.key.fromMe) {
        console.log(`Mensagem recebida de ${msg.key.remoteJid}: ${msg.message?.conversation}`);
        // Futuro: Gravar no banco de dados quando a UI do Chat estiver pronta
      }
    }

    // 3. Marca como processado no Redis (Expira em 24h)
    await redisConnection.setex(idempotencyKey, 86400, 'processed');
    console.log(`[Job ${job.id}] ✅ Evento Inbound processado com sucesso!`);

  } catch (error: any) {
    console.error(`[Job ${job.id}] ❌ Falha ao processar webhook:`, error.message);
    throw error; // Devolve pra fila e retenta em 2 segundos (backoff)
  }

}, { 
  connection: redisConnection,
  concurrency: 10, // Maior concorrência pois só insere/atualiza no BD local
});

worker.on('failed', (job, err) => {
  if (job) {
    console.log(`[Webhook Job ${job.id}] Falhou: ${err.message}`);
  }
});

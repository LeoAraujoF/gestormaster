import '../lib/env';
import { Worker, Job } from 'bullmq';
import { redisConnection } from '../lib/redis';
import { WEBHOOK_QUEUE_NAME, aiQueue } from '../lib/queue';
import { supabaseAdmin } from '../lib/supabase/service-role';
import crypto from 'crypto';
import { logger, runWithCorrelationId } from '../lib/logger';

logger.info('🛡️ Webhook Worker iniciado e aguardando eventos...');

const worker = new Worker(WEBHOOK_QUEUE_NAME, async (job: Job) => {
  const payload = job.data;
  
  // Webhooks geralmente não trazem correlationId, então o wrapper vai criar um
  return runWithCorrelationId(payload.correlationId, undefined, async () => {
    // 1. Controle de Idempotência
    const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const idempotencyKey = `webhook:idempotency:${hash}`;

    const alreadyProcessed = await redisConnection.get(idempotencyKey);
    if (alreadyProcessed) {
      logger.info(`[Job ${job.id}] ♻️ Evento duplicado descartado (Idempotency Key: ${idempotencyKey})`);
      return; // Sucesso imediato (não processa novamente)
    }

    logger.info(`[Job ${job.id}] 📥 Processando webhook: ${payload.event}`);

  try {
    if (payload.event === 'CONNECTION_UPDATE' || payload.event === 'connection.update') {
      const instanceName = payload.instance;
      const state = payload.data?.state;
      const sender = payload.sender || payload.data?.sender;
      
      if (instanceName && state) {
         const updateData: any = { 
           status: state === 'open' ? 'connected' : 'disconnected',
           updated_at: new Date().toISOString()
         };

         if (state === 'open' && sender) {
           updateData.phone_number = sender.split('@')[0];
         }

         const { error, data: updatedInstance } = await supabaseAdmin.from('evolution_instances')
           .update(updateData)
           .eq('instance_name', instanceName)
           .select('organization_id')
           .single();
           
         if (error) throw error;

         // Se acabou de conectar com sucesso, vamos checar se a org tem Typebot ativo para plugar
         if (state === 'open' && updatedInstance?.organization_id) {
           const { data: typebotInt } = await supabaseAdmin
             .from('integrations')
             .select('credentials')
             .eq('organization_id', updatedInstance.organization_id)
             .eq('provider', 'typebot')
             .eq('is_active', true)
             .single();

           if (typebotInt) {
             try {
               const { createEvolutionClient } = await import('../lib/evolution');
               const evolution = createEvolutionClient();
               await evolution.setTypebot(instanceName, {
                 enabled: true,
                 url: typebotInt.credentials.viewer_url,
                 typebot: typebotInt.credentials.typebot_name,
                 expire: 0,
                 keywordFinish: "#SAIR",
                 delayMessage: 1000,
                 unknownMessage: "",
                 listeningFromMe: false,
                 stopBotFromMe: true,
                 keepOpen: false,
                 debounceTime: 10
               });
               logger.info(`🤖 Typebot plugado automaticamente na instância ${instanceName}`);
             } catch (e) {
               logger.error(`Falha ao plugar Typebot na instância ${instanceName}`, e);
             }
           }
         }
      }
    }
    else if (payload.event === 'MESSAGES_UPSERT') {
      const msg = payload.data?.messages?.[0];
      if (msg && !msg.key.fromMe) {
        const textMessage = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        logger.info(`Mensagem recebida de ${msg.key.remoteJid}: ${textMessage}`);
        
        const instanceName = payload.instance;
        if (instanceName && textMessage) {
          const { data: instanceData } = await supabaseAdmin
            .from('evolution_instances')
            .select('organization_id')
            .eq('instance_name', instanceName)
            .single();

          if (instanceData?.organization_id) {
            const { data: aiData } = await supabaseAdmin
              .from('integrations')
              .select('credentials')
              .eq('organization_id', instanceData.organization_id)
              .eq('provider', 'ai_assistant')
              .eq('is_active', true)
              .single();

            if (aiData) {
              await aiQueue.add('process-ai', {
                organization_id: instanceData.organization_id,
                instance_name: instanceName,
                remoteJid: msg.key.remoteJid,
                messageText: textMessage,
                credentials: aiData.credentials
              });
              logger.info(`🤖 [Job ${job.id}] Mensagem enviada para AI Worker (Org: ${instanceData.organization_id})`);
            }
          }
        }
      }
    }

    // 3. Marca como processado no Redis (Expira em 24h)
    await redisConnection.setex(idempotencyKey, 86400, 'processed');
    logger.info(`[Job ${job.id}] ✅ Evento Inbound processado com sucesso!`);

  } catch (error: any) {
    logger.error(`[Job ${job.id}] ❌ Falha ao processar webhook: ${error.message}`);
    throw error; // Devolve pra fila e retenta em 2 segundos (backoff)
  }
  });

}, { 
  connection: redisConnection as any,
  concurrency: 10, // Maior concorrência pois só insere/atualiza no BD local
});

worker.on('failed', (job, err) => {
  if (job) {
    logger.error(`[Webhook Job ${job.id}] Falhou: ${err.message}`);
  }
});

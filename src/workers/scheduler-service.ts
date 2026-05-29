import '../lib/env';
import cron from 'node-cron';
import { supabaseAdmin } from '../lib/supabase/service-role';
import { messageQueue, healthQueue, warmupQueue } from '../lib/queue';
import { logger, runWithCorrelationId } from '../lib/logger';

logger.info('⏰ Scheduler Service iniciado. Aguardando cron jobs...');

// --- Health Monitor Cron (A cada 5 min) ---
cron.schedule('*/5 * * * *', async () => {
  return runWithCorrelationId(undefined, undefined, async () => {
    logger.info(`[Scheduler] 🤖 Iniciando varredura de instâncias (Health Monitor)... (${new Date().toISOString()})`);
  
  try {
    // 1. Busca automações que precisam disparar
    // (Por enquanto, apenas um mock estrutural)
    // const { data: rules } = await supabaseAdmin.from('automations').select('*').eq('is_active', true);
    
    // Se achar clientes que caem na regra (Ex: Vencimento hoje):
    // const jobs = [...];
    // await messageQueue.addBulk(jobs);

    // 2. Dispara o Health Monitor para checar instâncias do WhatsApp
    await healthQueue.add('sync-instances', { timestamp: Date.now(), correlationId: logger.bindings()?.correlationId }, {
      removeOnComplete: true,
    });

    logger.info('[Scheduler] ✅ Varredura concluída sem novos jobs de mensagem na fila. Job de sync-instances disparado.');

  } catch (error: any) {
    logger.error(`[Scheduler] ❌ Erro na rotina de agendamento do Health Monitor: ${error.message}`);
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

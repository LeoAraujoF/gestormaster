import '../lib/env';
import cron from 'node-cron';
import { supabaseAdmin } from '../lib/supabase/service-role';
import { messageQueue, healthQueue } from '../lib/queue';

console.log('⏰ Scheduler Service iniciado. Aguardando cron jobs...');

// Exemplo: Executar todo dia às 08:00 da manhã -> '0 8 * * *'
// Para ambiente de desenvolvimento/testes, rodaremos a cada 5 minutos
cron.schedule('*/5 * * * *', async () => {
  console.log(`[Scheduler] 🤖 Iniciando varredura de automações... (${new Date().toISOString()})`);
  
  try {
    // 1. Busca automações que precisam disparar
    // (Por enquanto, apenas um mock estrutural)
    // const { data: rules } = await supabaseAdmin.from('automations').select('*').eq('is_active', true);
    
    // Se achar clientes que caem na regra (Ex: Vencimento hoje):
    // const jobs = [...];
    // await messageQueue.addBulk(jobs);

    // 2. Dispara o Health Monitor para checar instâncias do WhatsApp
    await healthQueue.add('sync-instances', { timestamp: Date.now() }, {
      removeOnComplete: true,
    });

    console.log('[Scheduler] ✅ Varredura concluída sem novos jobs de mensagem na fila. Job de sync-instances disparado.');

  } catch (error: any) {
    console.error('[Scheduler] ❌ Erro na rotina de agendamento:', error.message);
  }
});

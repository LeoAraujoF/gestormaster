import '../lib/env';
import cron from 'node-cron';
import { supabaseAdmin } from '../lib/supabase/service-role';
import { messageQueue } from '../lib/queue';

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

    console.log('[Scheduler] ✅ Varredura concluída sem novos jobs na fila.');

  } catch (error: any) {
    console.error('[Scheduler] ❌ Erro na rotina de agendamento:', error.message);
  }
});

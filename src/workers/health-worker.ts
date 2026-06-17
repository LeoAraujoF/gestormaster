import '../lib/env';
import { Worker, Job } from 'bullmq';
import { HEALTH_QUEUE_NAME } from '../lib/queue';
import { redisConnection } from '../lib/redis';
import { supabaseAdmin } from '../lib/supabase/service-role';
import { EvolutionWhatsAppProvider } from '../providers/whatsapp/EvolutionWhatsAppProvider';
import { logger, runWithCorrelationId } from '../lib/logger';
import { SecretsManager } from '../lib/encryption';

logger.info('🩺 Health Monitor Worker iniciado e aguardando jobs...');

const healthWorker = new Worker(HEALTH_QUEUE_NAME, async (job: Job) => {
  if (job.name !== 'sync-instances') return;

  return runWithCorrelationId(undefined, undefined, async () => {
    try {
      // 1. Busca todas as instâncias do nosso banco (únicas por base_url e api_key)
    // Para simplificar e performar, se o usuário não tiver uma api_key externa, usamos a global.
    const globalBaseUrl = process.env.EVOLUTION_API_URL?.replace(/\/$/, '') || 'http://localhost:8080';
    const globalApiKey = process.env.EVOLUTION_API_KEY || '';

    const { data: dbInstances, error } = await supabaseAdmin
      .from('evolution_instances')
      .select('instance_name, connection_mode, base_url, api_key, status');

    if (error || !dbInstances) {
      throw new Error(`Erro ao buscar instâncias no DB: ${error?.message}`);
    }

    // 2. Agrupa por provedor (URL/KEY)
    const providerGroups: Record<string, { baseUrl: string; apiKey: string; instances: string[] }> = {};

    dbInstances.forEach(inst => {
      const baseUrl = inst.connection_mode === 'external' && inst.base_url ? inst.base_url : globalBaseUrl;
      const rawApiKey = inst.connection_mode === 'external' && inst.api_key ? inst.api_key : globalApiKey;
      const apiKey = SecretsManager.decrypt(rawApiKey);
      
      const groupKey = `${baseUrl}|${apiKey}`;

      if (!providerGroups[groupKey]) {
        providerGroups[groupKey] = { baseUrl, apiKey, instances: [] };
      }
      providerGroups[groupKey].instances.push(inst.instance_name);
    });

    // 3. Verifica cada provedor usando o endpoint global fetchInstances()
    let totalUpdated = 0;

    for (const groupKey of Object.keys(providerGroups)) {
      const { baseUrl, apiKey, instances } = providerGroups[groupKey];
      const provider = new EvolutionWhatsAppProvider(baseUrl, apiKey);

      try {
        // Fetch all instances from this Evolution API server
        const evoInstances = await provider.fetchAllInstances();
        
        // Mapeia o array recebido para um formato fácil de ler
        // evoInstances é geralmente um array de objetos: [{ name: 'TESTE', connectionStatus: 'open' }]
        const statusMap: Record<string, string> = {};
        
        if (Array.isArray(evoInstances)) {
          evoInstances.forEach(evo => {
            statusMap[evo.name] = evo.connectionStatus || evo.status || 'disconnected';
          });
        }

        // 4. Atualiza o banco caso os status sejam diferentes
        for (const localInstance of instances) {
          const currentDbInst = dbInstances.find(i => i.instance_name === localInstance);
          const evoStatus = statusMap[localInstance] || 'disconnected';
          
          let mappedStatus = 'disconnected';
          if (evoStatus === 'open' || evoStatus === 'connected') mappedStatus = 'connected';
          else if (evoStatus === 'connecting') mappedStatus = 'connecting';
          
          if (currentDbInst && currentDbInst.status !== mappedStatus) {
            await supabaseAdmin
              .from('evolution_instances')
              .update({ status: mappedStatus, updated_at: new Date().toISOString() })
              .eq('instance_name', localInstance);
            
            logger.info(`[HealthMonitor] 🔄 Instância '${localInstance}' atualizada: ${currentDbInst.status} -> ${mappedStatus}`);
            totalUpdated++;
          }
        }
      } catch (err: any) {
        logger.error(`[HealthMonitor] ❌ Erro ao checar Evolution em ${baseUrl}: ${err.message}`);
      }
    }

    if (totalUpdated > 0) {
      logger.info(`[HealthMonitor] ✅ Sincronização concluída. ${totalUpdated} instâncias atualizadas.`);
    }

  } catch (error: any) {
    logger.error(`[HealthMonitor] Falha geral no sync-instances: ${error.message}`);
    throw error;
  }
  });
}, { connection: redisConnection as any, concurrency: 1 });

healthWorker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} (HealthMonitor) falhou: ${err.message}`);
});

export default healthWorker;

import '../lib/env';
import { Worker, Job } from 'bullmq';
import { WARMUP_QUEUE_NAME } from '../lib/queue';
import { redisConnection } from '../lib/redis';
import { supabaseAdmin } from '../lib/supabase/service-role';
import { EvolutionWhatsAppProvider } from '../providers/whatsapp/EvolutionWhatsAppProvider';
import { logger, runWithCorrelationId } from '../lib/logger';
import { generateWarmupMessage } from '../lib/openai';
import { SecretsManager } from '../lib/encryption';

logger.info('🔥 Warmup Worker iniciado e aguardando ciclos...');

const warmupWorker = new Worker(WARMUP_QUEUE_NAME, async (job: Job) => {
  if (job.name !== 'execute-warmup') return;

  return runWithCorrelationId(undefined, undefined, async () => {
    try {
      // 1. Busca todas as instâncias em modo de aquecimento
      const { data: warmingInstances, error } = await supabaseAdmin
        .from('evolution_instances')
        .select('instance_name, phone_number, base_url, api_key')
        .eq('status', 'connected')
        .eq('is_warming_up', true);

      if (error || !warmingInstances || warmingInstances.length < 2) {
        logger.info('[Warmup] Instâncias insuficientes para aquecimento (Mínimo: 2 conectadas). Pulando ciclo.');
        return;
      }

      // 2. Sorteia 2 instâncias diferentes
      const shuffled = warmingInstances.sort(() => 0.5 - Math.random());
      const sender = shuffled[0];
      const receiver = shuffled[1];

      // Garante que ambos têm telefone
      if (!sender.phone_number || !receiver.phone_number) {
        logger.warn('[Warmup] Uma das instâncias sorteadas não possui phone_number salvo. Pulando.');
        return;
      }

      logger.info(`[Warmup] Preparando diálogo entre ${sender.instance_name} e ${receiver.instance_name}...`);

      // 3. Gera a mensagem usando a OpenAI
      const messageContent = await generateWarmupMessage();

      // 4. Conecta no provedor do Sender e envia pro Receiver
      const globalBaseUrl = process.env.EVOLUTION_API_URL?.replace(/\/$/, '') || 'http://localhost:8080';
      const globalApiKey = process.env.EVOLUTION_API_KEY || '';
      
      const baseUrl = sender.base_url || globalBaseUrl;
      const rawApiKey = sender.api_key || globalApiKey;
      const apiKey = SecretsManager.decrypt(rawApiKey);
      
      const provider = new EvolutionWhatsAppProvider(baseUrl, apiKey);
      
      // Delay aleatório humano (1 a 4 segundos)
      const delayMs = Math.floor(Math.random() * 3000) + 1000;
      
      await provider.sendMessage(sender.instance_name, receiver.phone_number, messageContent, {
        delay: delayMs,
        presence: 'composing'
      });

      logger.info(`[Warmup] ✅ Mensagem enviada de ${sender.instance_name} para ${receiver.instance_name}: "${messageContent}"`);

    } catch (err: any) {
      logger.error(`[Warmup] ❌ Falha no ciclo de aquecimento: ${err.message}`);
      throw err;
    }
  });
}, { connection: redisConnection });

warmupWorker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} (Warmup) falhou: ${err.message}`);
});

export default warmupWorker;

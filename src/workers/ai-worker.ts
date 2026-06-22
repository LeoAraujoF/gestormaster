import '../lib/env';
import { Worker, Job } from 'bullmq';
import { redisConnection } from '../lib/redis';
import { AI_QUEUE_NAME, messageQueue } from '../lib/queue';
import { logger } from '../lib/logger';
import OpenAI from 'openai';

logger.info('🧠 AI Worker (Multi-LLM) iniciado e aguardando contexto...');

// Quantidade máxima de mensagens antigas para lembrar
const MAX_HISTORY_LENGTH = 10;

const worker = new Worker(AI_QUEUE_NAME, async (job: Job) => {
  const { organization_id, instance_name, remoteJid, messageText, credentials } = job.data;
  
  if (!credentials?.api_key) {
    logger.error(`[AI Job ${job.id}] Org ${organization_id} não possui API Key configurada.`);
    return;
  }

  logger.info(`[AI Job ${job.id}] Processando IA para ${remoteJid}...`);

  try {
    // 1. Instanciar Cliente Genérico (OpenAI SDK suporta Groq, DeepSeek, etc)
    const openai = new OpenAI({
      apiKey: credentials.api_key,
      baseURL: credentials.base_url || undefined,
    });

    const modelName = credentials.model || 'gpt-4o-mini';
    const systemPrompt = credentials.prompt || 'Você é um assistente virtual prestativo.';

    // 2. Recuperar Histórico do Redis
    const historyKey = `ai_history:${organization_id}:${remoteJid}`;
    const rawHistory = await redisConnection.lrange(historyKey, 0, -1);
    
    // O Redis retorna de trás pra frente dependendo de como inserimos. 
    // Usaremos rpush, então os mais velhos estão no índice 0
    let history: {role: "user" | "assistant" | "system", content: string}[] = rawHistory.map(h => JSON.parse(h));

    // Formatar array de mensagens para a API
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: messageText }
    ];

    logger.info(`[AI Job ${job.id}] Enviando requisição para modelo: ${modelName} (${messages.length} mensagens no contexto)`);

    // 3. Chamada para o LLM
    const completion = await openai.chat.completions.create({
      model: modelName,
      messages: messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const aiReply = completion.choices[0]?.message?.content;

    if (!aiReply) {
      throw new Error("Resposta da IA veio vazia.");
    }

    // 4. Salvar Histórico (Mensagem do Usuário + Resposta da IA) no Redis
    await redisConnection.rpush(historyKey, JSON.stringify({ role: "user", content: messageText }));
    await redisConnection.rpush(historyKey, JSON.stringify({ role: "assistant", content: aiReply }));
    
    // Manter apenas as últimas N mensagens
    await redisConnection.ltrim(historyKey, -(MAX_HISTORY_LENGTH), -1);
    // Expirar histórico caso o usuário fique mais de 12 horas sem falar
    await redisConnection.expire(historyKey, 12 * 60 * 60);

    // 5. Enviar a resposta de volta para o WhatsApp
    await messageQueue.add('send-message', {
      organization_id,
      instance_id: null, // Padrão
      instance_name: instance_name,
      phone: remoteJid.split('@')[0],
      message: aiReply,
      source: 'ai_assistant'
    });

    logger.info(`[AI Job ${job.id}] ✅ IA respondeu com sucesso para ${remoteJid}`);

  } catch (error: any) {
    logger.error(`[AI Job ${job.id}] ❌ Falha no processamento da IA: ${error.message}`);
    throw error;
  }
}, { 
  connection: redisConnection as any,
  concurrency: 5, // Limita concorrência para evitar rate limits excessivos nas APIs de IA
});

worker.on('failed', (job, err) => {
  if (job) {
    logger.error(`[AI Job ${job.id}] Falhou: ${err.message}`);
  }
});

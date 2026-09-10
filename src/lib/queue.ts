import { Queue } from 'bullmq';
import { redisConnection } from './redis';
import { MESSAGE_PRIORITY } from './message-priority';

export const MESSAGE_QUEUE_NAME = 'messages-queue';

/**
 * Tentativas de entrega precisam sobreviver à janela do circuit breaker (120s).
 * Com 3 tentativas e backoff de 5s o job morria em ~35s, ou seja: toda mensagem
 * em voo durante uma instabilidade curta da Evolution era perdida.
 * 5 tentativas com base de 30s cobrem ~7,5 min (30s/1m/2m/4m).
 *
 * Backpressure (circuit breaker, rate limit, pacing, limite diário) NÃO consome
 * estas tentativas: o worker usa `moveToDelayed` + `DelayedError` nesses casos.
 */
export const MESSAGE_JOB_ATTEMPTS = 5;
export const MESSAGE_JOB_BACKOFF = { type: 'exponential' as const, delay: 30000 };

export const messageQueue = new Queue(MESSAGE_QUEUE_NAME, {
  connection: redisConnection as any,
  defaultJobOptions: {
    attempts: MESSAGE_JOB_ATTEMPTS,
    backoff: MESSAGE_JOB_BACKOFF,
    // Piso de segurança: no BullMQ v5 um job sem prioridade vai para `wait`, que é
    // drenada antes do ZSET `prioritized` — ou seja, esquecer a prioridade fazia o
    // job atropelar toda a fila. Com este default ele cai no fim dela.
    priority: MESSAGE_PRIORITY.bulk,
    removeOnComplete: { age: 86400, count: 1000 }, // Manter por 24h ou até 1000 jobs
    removeOnFail: { age: 604800, count: 5000 }, // 7 dias ou 5000 jobs
  },
});

export const WEBHOOK_QUEUE_NAME = 'webhook-queue';

export const webhookQueue = new Queue(WEBHOOK_QUEUE_NAME, {
  connection: redisConnection as any,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: { age: 604800, count: 5000 },
  },
});

export const AI_QUEUE_NAME = 'ai-queue';

export const aiQueue = new Queue(AI_QUEUE_NAME, {
  connection: redisConnection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: true,
    removeOnFail: { age: 604800, count: 1000 },
  },
});

export const INTELLIGENCE_QUEUE_NAME = 'intelligence-queue';

export const intelligenceQueue = new Queue(INTELLIGENCE_QUEUE_NAME, {
  connection: redisConnection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: { age: 604800, count: 1000 },
  },
});

export const HEALTH_QUEUE_NAME = 'health-queue';

export const healthQueue = new Queue(HEALTH_QUEUE_NAME, {
  connection: redisConnection as any,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: true, // Já descarta automaticamente
  },
});
export const WARMUP_QUEUE_NAME = 'warmup-queue';

export const warmupQueue = new Queue(WARMUP_QUEUE_NAME, {
  connection: redisConnection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: { age: 604800, count: 1000 }, // 7 dias ou 1000 jobs
  },
});

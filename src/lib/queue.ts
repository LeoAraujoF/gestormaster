import { Queue } from 'bullmq';
import { redisConnection } from './redis';

export const MESSAGE_QUEUE_NAME = 'messages-queue';

export const messageQueue = new Queue(MESSAGE_QUEUE_NAME, {
  connection: redisConnection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true, 
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

export const HEALTH_QUEUE_NAME = 'health-queue';

export const healthQueue = new Queue(HEALTH_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: true, // Já descarta automaticamente
  },
});
export const WARMUP_QUEUE_NAME = 'warmup-queue';

export const warmupQueue = new Queue(WARMUP_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: { age: 604800, count: 1000 }, // 7 dias ou 1000 jobs
  },
});

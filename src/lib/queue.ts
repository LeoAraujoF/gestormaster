import { Queue } from 'bullmq';
import { redisConnection } from './redis';

export const MESSAGE_QUEUE_NAME = 'messages-queue';

export const messageQueue = new Queue(MESSAGE_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true, 
    removeOnFail: false, 
  },
});

export const WEBHOOK_QUEUE_NAME = 'webhook-queue';

export const webhookQueue = new Queue(WEBHOOK_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5, // Mais tentativas pois inbound não deve ser perdido
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export const HEALTH_QUEUE_NAME = 'health-queue';

export const healthQueue = new Queue(HEALTH_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: true,
  },
  },
});

export const WARMUP_QUEUE_NAME = 'warmup-queue';

export const warmupQueue = new Queue(WARMUP_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

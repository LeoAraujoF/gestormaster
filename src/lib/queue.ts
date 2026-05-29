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

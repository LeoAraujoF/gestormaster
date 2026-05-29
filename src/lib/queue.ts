import { Queue } from 'bullmq';
import { redisConnection } from './redis';

export const MESSAGE_QUEUE_NAME = 'messages-queue';

export const messageQueue = new Queue(MESSAGE_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true, // Auto clear successful jobs to save RAM
    removeOnFail: false, // Keep failed jobs in Redis for manual retry (DLQ)
  },
});

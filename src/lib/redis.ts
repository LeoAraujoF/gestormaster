import { Redis } from 'ioredis';

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379');
const redisPassword = process.env.REDIS_PASSWORD || undefined;

export const redisConnection = new Redis({
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  maxRetriesPerRequest: null,
  retryStrategy: (times) => {
    // Tenta reconectar a cada 5 segundos se falhar, mas sem travar a aplicação
    return Math.min(times * 100, 5000);
  }
});

redisConnection.on('error', (err) => {
  console.warn('[Redis] Conexão falhou (provavelmente ambiente local):', err.message);
});

import { redisConnection } from './redis';

/**
 * Utilitário de Rate Limiting usando Redis.
 * O objetivo é impedir que Tenants específicos esgotem a fila (Noisy Neighbors).
 */

export class RateLimiter {
  /**
   * Checa se um tenant excedeu o limite. Incrementa o contador em 1.
   * 
   * @param tenantId O ID da organização
   * @param limit Maximo de requisições no período
   * @param durationSegundos Duração da janela (Ex: 60 para 1 minuto)
   * @returns { allowed: boolean, remaining: number, resetIn: number }
   */
  static async checkLimit(tenantId: string, limit: number, durationSegundos: number) {
    const key = `ratelimit:tenant:${tenantId}`;
    
    // Usamos um pipeline do Redis para garantir atomicidade
    const pipeline = redisConnection.pipeline();
    pipeline.incr(key);
    pipeline.ttl(key);
    
    const results = await pipeline.exec();
    
    if (!results || results.length !== 2) {
       throw new Error('Falha ao executar pipeline do Redis');
    }

    const count = results[0][1] as number;
    let ttl = results[1][1] as number;

    // Se a chave for recém criada (TTL = -1), definimos a expiração
    if (ttl === -1) {
      await redisConnection.expire(key, durationSegundos);
      ttl = durationSegundos;
    }

    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);

    return {
      allowed,
      remaining,
      resetIn: ttl
    };
  }
}

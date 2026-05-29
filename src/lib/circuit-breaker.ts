import { redisConnection } from './redis';

const FAILURES_THRESHOLD = 10;
const OPEN_DURATION_SECONDS = 120; // 2 minutos de respiro

/**
 * Circuit Breaker Pattern usando Redis.
 * Evita sobrecarregar a Evolution API se ela estiver caindo (Reconnect Storms).
 */
export class CircuitBreaker {
  
  static async recordFailure() {
    const key = 'circuit_breaker:failures';
    const failures = await redisConnection.incr(key);
    
    if (failures === 1) {
      await redisConnection.expire(key, OPEN_DURATION_SECONDS);
    }

    if (failures >= FAILURES_THRESHOLD) {
      // Abre o circuito
      await redisConnection.set('circuit_breaker:status', 'open', 'EX', OPEN_DURATION_SECONDS);
    }
  }

  static async recordSuccess() {
    // Reseta o contador de falhas contínuas
    await redisConnection.del('circuit_breaker:failures');
    await redisConnection.del('circuit_breaker:status');
  }

  static async isTripped(): Promise<boolean> {
    const status = await redisConnection.get('circuit_breaker:status');
    return status === 'open';
  }
}

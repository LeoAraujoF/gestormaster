import { createHash } from 'node:crypto';

import { redisConnection } from './redis';

const FAILURES_THRESHOLD = 10;
const OPEN_DURATION_SECONDS = 120; // 2 minutos de respiro

/**
 * Circuit Breaker Pattern usando Redis.
 * Evita sobrecarregar a Evolution API se ela estiver caindo (Reconnect Storms).
 *
 * O circuito é por provedor (base URL da Evolution), não global: uma instância
 * externa de um tenant caindo não pode interromper os envios de quem usa a
 * Evolution integrada ou outro servidor.
 */
export class CircuitBreaker {

  /** Deriva uma chave estável e curta a partir da base URL do provedor. */
  static scopeFor(baseUrl: string | null | undefined) {
    const normalized = (baseUrl || '').trim().replace(/\/+$/, '').toLowerCase();
    if (!normalized) return 'unknown';
    return createHash('sha1').update(normalized).digest('hex').slice(0, 16);
  }

  private static failuresKey(scope: string) {
    return `circuit_breaker:failures:${scope}`;
  }

  private static statusKey(scope: string) {
    return `circuit_breaker:status:${scope}`;
  }

  static async recordFailure(scope: string) {
    const key = this.failuresKey(scope);
    const failures = await redisConnection.incr(key);

    if (failures === 1) {
      await redisConnection.expire(key, OPEN_DURATION_SECONDS);
    }

    if (failures >= FAILURES_THRESHOLD) {
      // Abre o circuito
      await redisConnection.set(this.statusKey(scope), 'open', 'EX', OPEN_DURATION_SECONDS);
    }
  }

  static async recordSuccess(scope: string) {
    // Reseta o contador de falhas contínuas
    await redisConnection.del(this.failuresKey(scope));
    await redisConnection.del(this.statusKey(scope));
  }

  static async isTripped(scope: string): Promise<boolean> {
    const status = await redisConnection.get(this.statusKey(scope));
    return status === 'open';
  }

  /**
   * Quanto falta para o circuito fechar, em ms. Usado para reagendar o job em
   * vez de queimar tentativas de entrega enquanto o provedor está fora.
   */
  static async retryAfterMs(scope: string): Promise<number> {
    const ttl = await redisConnection.ttl(this.statusKey(scope));
    const seconds = ttl > 0 ? ttl : OPEN_DURATION_SECONDS;
    return seconds * 1000;
  }
}

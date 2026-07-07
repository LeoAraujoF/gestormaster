import { Redis } from 'ioredis'

/**
 * Rate limiter de janela fixa baseado em Redis (compartilhado entre instâncias).
 *
 * Usa um cliente próprio com `lazyConnect` (conecta só no primeiro uso, evitando
 * abrir conexão durante o build) e falha rápido se o Redis estiver fora.
 *
 * Fail-open: se o Redis estiver indisponível, NÃO bloqueia o tráfego — rate limiting
 * é uma mitigação de abuso, não deve derrubar requisições legítimas por falha de infra.
 */
let client: Redis | null = null

function getClient(): Redis {
  if (!client) {
    client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    })
    // Sem listener, um 'error' event derruba o processo. Aqui apenas engolimos;
    // o rateLimit() já trata a indisponibilidade com fail-open.
    client.on('error', () => {})
  }
  return client
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number
): Promise<{ ok: boolean; remaining: number }> {
  const redisKey = `ratelimit:${key}`
  try {
    const redis = getClient()
    const count = await redis.incr(redisKey)
    if (count === 1) {
      await redis.expire(redisKey, windowSec)
    }
    return { ok: count <= limit, remaining: Math.max(0, limit - count) }
  } catch (e) {
    console.error('Rate limit indisponível (fail-open):', e)
    return { ok: true, remaining: limit }
  }
}

/** Extrai o IP do cliente respeitando o proxy reverso (X-Forwarded-For). */
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

/** Resposta padrão 429 quando o limite é excedido. */
export function tooManyRequests() {
  return new Response(
    JSON.stringify({ error: 'Muitas requisições. Tente novamente em instantes.' }),
    { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } }
  )
}

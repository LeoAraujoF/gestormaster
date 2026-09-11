import { dateInTimezone, DEFAULT_TIMEZONE, millisecondsUntilNextDay, safeTimeZone } from '@/lib/contact-policy'
import { redisConnection } from '@/lib/redis'

/**
 * Reserva uma vaga do limite diário da instância.
 *
 * A janela fecha à meia-noite **local da organização**. Com a chave em dia UTC,
 * o limite reiniciava às 21h de Brasília e permitia dois lotes diários — 80
 * mensagens antes das 21h e mais 80 depois, no mesmo dia comercial.
 */
export async function reserveInstanceDailyQuota(
  instanceId: string,
  limit: number,
  timeZone: string = DEFAULT_TIMEZONE,
  date = new Date(),
) {
  const zone = safeTimeZone(timeZone)
  const key = `whatsapp:instance-daily:${instanceId}:${dateInTimezone(date, zone)}`
  const resetInMs = millisecondsUntilNextDay(date, zone)
  const count = await redisConnection.incr(key)
  if (count === 1) await redisConnection.expire(key, 172800)
  if (count <= limit) {
    return { allowed: true, remaining: Math.max(0, limit - count), resetInMs, key }
  }

  await redisConnection.decr(key)
  return { allowed: false, remaining: 0, resetInMs, key }
}

/**
 * Lê o consumo diário da instância **sem reservar nada**.
 *
 * Existe porque o contador vive só no Redis: até aqui o operador não tinha como
 * saber quanto já foi enviado nem por que um envio parou — em 10/09/2026 um teto
 * de 80/dia barrou lembretes e boas-vindas de forma completamente invisível na
 * interface.
 */
export async function peekInstanceDailyUsage(
  instanceId: string,
  timeZone: string = DEFAULT_TIMEZONE,
  date = new Date(),
): Promise<{ used: number; resetInMs: number }> {
  const zone = safeTimeZone(timeZone)
  const key = `whatsapp:instance-daily:${instanceId}:${dateInTimezone(date, zone)}`
  const raw = await redisConnection.get(key)
  return { used: Math.max(0, Number(raw) || 0), resetInMs: millisecondsUntilNextDay(date, zone) }
}

/**
 * Devolve uma reserva de quota diária que não virou envio.
 *
 * Sem isso cada nova tentativa de entrega queima mais um slot do limite diário,
 * e uma única mensagem com erro de rede consome várias vagas do dia.
 */
export async function releaseInstanceDailyQuota(key: string) {
  const remaining = await redisConnection.decr(key)
  // DECR recria a chave se ela já tiver expirado. Um contador negativo liberaria
  // envios acima do limite no dia seguinte, então descartamos esse resíduo.
  if (remaining < 0) await redisConnection.del(key)
}

/**
 * Reserva o próximo horário de envio da instância, de forma atômica e
 * compartilhada entre workers. Retorna quanto falta (ms) para o slot reservado,
 * ou `null` quando a fila da instância já está reservada além de `maxHorizonMs`
 * — nesse caso nada é reservado e cabe ao chamador tentar de novo mais tarde.
 *
 * `burst` é a pausa longa "além do intervalo": a cada `size` mensagens
 * enviadas por esta instância, insere `pauseMs` de espera antes de continuar —
 * o mesmo padrão de disparo em massa (pauseCount/pauseDurationMinutes), agora
 * valendo para qualquer envio da instância, não só campanhas de leads.
 * A pausa recai sobre a mensagem seguinte à que fechou a rajada, nunca sobre a
 * própria: um burst de N sai no ritmo normal e só a (N+1)ª espera mais.
 */
export async function reserveInstanceSendSlot(
  instanceId: string,
  minimumIntervalMs: number,
  maxHorizonMs = 0,
  burst?: { size: number; pauseMs: number },
): Promise<number | null> {
  const interval = Math.max(1000, minimumIntervalMs)
  const slotKey = `whatsapp:instance-slot:${instanceId}`
  const burstKey = `whatsapp:instance-burst:${instanceId}`
  const now = Date.now()
  const burstSize = Math.max(0, Math.floor(burst?.size || 0))
  const burstPauseMs = Math.max(0, Math.floor(burst?.pauseMs || 0))
  const script = `
    local now = tonumber(ARGV[1])
    local interval = tonumber(ARGV[2])
    local horizon = tonumber(ARGV[3])
    local burst_size = tonumber(ARGV[4])
    local burst_pause_ms = tonumber(ARGV[5])
    local current = tonumber(redis.call('GET', KEYS[1]) or '0')
    local slot = math.max(now, current)
    -- Sem teto, um limite diário alto reservaria slots horas à frente e a
    -- mensagem ficaria presa muito além da janela de reconciliação.
    if horizon > 0 and (slot - now) > horizon then
      return -1
    end
    local next_slot = slot + interval
    if burst_size > 0 and burst_pause_ms > 0 then
      local sent = redis.call('INCR', KEYS[2])
      if sent == 1 then redis.call('EXPIRE', KEYS[2], 172800) end
      if sent >= burst_size then
        next_slot = next_slot + burst_pause_ms
        redis.call('SET', KEYS[2], 0, 'EX', 172800)
      end
    end
    -- O TTL precisa cobrir todo o horizonte já reservado. Com uma janela fixa de
    -- 'interval', uma rajada que reserva slots minutos à frente perderia a chave
    -- antes de consumi-los e o próximo job dispararia em cima de um slot pendente.
    redis.call('SET', KEYS[1], next_slot, 'PX', (next_slot - now) + 60000)
    return slot - now
  `
  const delay = Number(await redisConnection.eval(script, 2, slotKey, burstKey, now, interval, Math.max(0, maxHorizonMs), burstSize, burstPauseMs))
  if (delay < 0) return null
  return Math.max(0, delay || 0)
}

export function sleep(milliseconds: number) {
  if (milliseconds <= 0) return Promise.resolve()
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

const REJECTION_BURST_THRESHOLD = 5
const REJECTION_BURST_WINDOW_SECONDS = 600 // 10 minutos

function rejectionKey(instanceName: string) {
  return `whatsapp:rejection-burst:${instanceName}`
}

/**
 * Contador de rejeições reportadas pelo próprio WhatsApp via webhook
 * (`messages.update` status ERROR/FAIL — ex.: bloqueio antispam). Diferente do
 * CircuitBreaker, que só reage a erros síncronos da chamada HTTP de envio, este
 * cobre o sinal assíncrono que só chega depois do provider já ter aceitado o
 * envio.
 */
export async function recordWhatsAppRejection(instanceName: string): Promise<{ count: number; shouldPause: boolean }> {
  const key = rejectionKey(instanceName)
  const count = await redisConnection.incr(key)
  if (count === 1) await redisConnection.expire(key, REJECTION_BURST_WINDOW_SECONDS)
  return { count, shouldPause: count >= REJECTION_BURST_THRESHOLD }
}

export async function resetWhatsAppRejections(instanceName: string) {
  await redisConnection.del(rejectionKey(instanceName))
}

export type ContactCategory = 'billing' | 'operational' | 'promotion' | 'manual'
export type ContactSource = 'intelligent_collection' | 'legacy_automation' | 'mass' | 'manual' | 'system'

export function dateInTimezone(date: Date, timezone = 'America/Sao_Paulo') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function categoryForAlertType(alertType: string): ContactCategory {
  if (['before_due', 'on_due', 'after_due'].includes(alertType)) return 'billing'
  if (alertType === 'promotion') return 'promotion'
  // A confirmação de renovação é uma notificação transacional prioritária.
  // Classificá-la como manual permite que ela substitua a reserva de boas-vindas
  // criada na mesma ativação, sem bloquear o aviso do pagamento confirmado.
  if (['quick_message', 'renewal'].includes(alertType)) return 'manual'
  return 'operational'
}

const DAY_MS = 86_400_000

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo'

/** Retorna o fuso se o runtime o reconhecer; senão, o padrão. */
export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return DEFAULT_TIMEZONE
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone })
    return timeZone
  } catch {
    return DEFAULT_TIMEZONE
  }
}

/**
 * Deslocamento do fuso, em ms, no instante informado.
 *
 * `formatToParts` não expõe milissegundos, então os dois lados da subtração são
 * truncados ao segundo.
 */
export function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)

  const values: Record<string, number> = {}
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = Number(part.value)
  }

  const asUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** Milissegundos até a próxima meia-noite no fuso informado. */
export function millisecondsUntilNextDay(date: Date, timeZone: string): number {
  const offset = timeZoneOffsetMs(date, timeZone)
  const localMidnight = (Math.floor((date.getTime() + offset) / DAY_MS) + 1) * DAY_MS

  let utcMidnight = localMidnight - offset
  // Se houver virada de horário de verão antes da meia-noite, o offset que vale
  // é o do instante alvo, não o de agora.
  const targetOffset = timeZoneOffsetMs(new Date(utcMidnight), timeZone)
  if (targetOffset !== offset) utcMidnight = localMidnight - targetOffset

  return Math.max(1000, utcMidnight - date.getTime())
}

/** Minutos desde a meia-noite local, no fuso informado. */
export function minutesOfDayInTimeZone(date: Date, timeZone: string): number {
  const localMs = date.getTime() + timeZoneOffsetMs(date, timeZone)
  const intoDay = ((localMs % DAY_MS) + DAY_MS) % DAY_MS
  return Math.floor(intoDay / 60_000)
}

/** Converte 'HH:MM' ou 'HH:MM:SS' em minutos; null se não for parseável. */
export function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export function isWithinSendWindow(minuteOfDay: number, startMinute: number, endMinute: number): boolean {
  // Janela aberta (ou degenerada) libera o dia inteiro.
  if (startMinute === endMinute) return true
  // Janela que atravessa a meia-noite, por exemplo 20:00 -> 08:00.
  if (startMinute > endMinute) return minuteOfDay >= startMinute || minuteOfDay < endMinute
  return minuteOfDay >= startMinute && minuteOfDay < endMinute
}

/**
 * Milissegundos até a janela de envio abrir; 0 se já está aberta.
 *
 * Serve para adiar mensagens não urgentes que caíram fora do horário comercial
 * da organização, em vez de entregá-las de madrugada.
 */
export function millisecondsUntilSendWindow(
  date: Date,
  timeZone: string,
  startMinute: number,
  endMinute: number,
): number {
  const minuteOfDay = minutesOfDayInTimeZone(date, timeZone)
  if (isWithinSendWindow(minuteOfDay, startMinute, endMinute)) return 0

  const minutesAhead = minuteOfDay < startMinute
    ? startMinute - minuteOfDay
    : 1440 - minuteOfDay + startMinute

  // Alinha ao início do minuto local para não abrir a janela alguns segundos antes.
  const secondsIntoMinute = Math.floor((date.getTime() + timeZoneOffsetMs(date, timeZone)) % 60_000)
  return Math.max(1000, minutesAhead * 60_000 - secondsIntoMinute)
}

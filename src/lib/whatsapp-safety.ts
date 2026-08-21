import { redisConnection } from '@/lib/redis'

export type WhatsAppConsentCategory = 'operational' | 'billing' | 'marketing'

type ConsentRecord = {
  whatsapp_opt_in?: boolean | null
  whatsapp_opt_out?: boolean | null
  whatsapp_opt_in_categories?: string[] | null
}

export function whatsappCategoryForAlertType(alertType: string): WhatsAppConsentCategory {
  if (['before_due', 'on_due', 'after_due'].includes(alertType)) return 'billing'
  if (alertType === 'promotion') return 'marketing'
  return 'operational'
}

export function whatsappCategoryForContactCategory(category: string): WhatsAppConsentCategory {
  return category === 'promotion' ? 'marketing' : category === 'billing' ? 'billing' : 'operational'
}

export function hasWhatsAppConsent(record: ConsentRecord | null | undefined, category: WhatsAppConsentCategory) {
  if (!record || record.whatsapp_opt_in !== true || record.whatsapp_opt_out === true) return false
  return Array.isArray(record.whatsapp_opt_in_categories)
    && record.whatsapp_opt_in_categories.includes(category)
}

export function normalizeConsentCategories(value: unknown): WhatsAppConsentCategory[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is WhatsAppConsentCategory =>
    item === 'operational' || item === 'billing' || item === 'marketing'))]
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function millisecondsUntilNextUtcDay(date = new Date()) {
  const nextDay = new Date(date)
  nextDay.setUTCHours(24, 0, 0, 0)
  return Math.max(1000, nextDay.getTime() - date.getTime())
}

export async function reserveInstanceDailyQuota(instanceId: string, limit: number, date = new Date()) {
  const key = `whatsapp:instance-daily:${instanceId}:${dayKey(date)}`
  const count = await redisConnection.incr(key)
  if (count === 1) await redisConnection.expire(key, 172800)
  if (count <= limit) {
    return { allowed: true, remaining: Math.max(0, limit - count), resetInMs: millisecondsUntilNextUtcDay(date) }
  }

  await redisConnection.decr(key)
  return { allowed: false, remaining: 0, resetInMs: millisecondsUntilNextUtcDay(date) }
}

export async function reserveInstanceSendSlot(instanceId: string, minimumIntervalMs: number) {
  const interval = Math.max(1000, minimumIntervalMs)
  const key = `whatsapp:instance-slot:${instanceId}`
  const now = Date.now()
  const script = `
    local now = tonumber(ARGV[1])
    local interval = tonumber(ARGV[2])
    local current = tonumber(redis.call('GET', KEYS[1]) or '0')
    local slot = math.max(now, current)
    local next_slot = slot + interval
    redis.call('SET', KEYS[1], next_slot, 'PX', interval + 60000)
    return slot - now
  `
  const delay = await redisConnection.eval(script, 1, key, now, interval)
  return Math.max(0, Number(delay) || 0)
}

export function sleep(milliseconds: number) {
  if (milliseconds <= 0) return Promise.resolve()
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

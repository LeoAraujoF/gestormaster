import { z } from 'zod'

const cursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
})

export type AuditCursor = z.infer<typeof cursorSchema>

const SENSITIVE_KEY = /(?:^|_)(?:authorization|cookie|credentials?|password|passwd|pwd|secret|token|api_key|apikey|access_key|private_key|service_role|session|hmac|signature|key|otp|pin)(?:$|_)/i
const SECRET_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+\b/g,
  /\b(?:whsec|sb_secret)_[A-Za-z0-9_-]+\b/g,
]

export function redactAuditText(value: string) {
  let redacted = value.replace(
    /([?&](?:authorization|password|secret|token|api[_-]?key|signature)=)[^&#\s]*/gi,
    '$1[REDACTED]',
  )
  redacted = redacted.replace(
    /\b(authorization|password|secret|token|api[_ -]?key|signature)\s*[:=]\s*[^\s,;&#]+/gi,
    '$1=[REDACTED]',
  )
  for (const pattern of SECRET_VALUE_PATTERNS) redacted = redacted.replace(pattern, '[REDACTED]')
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(redacted)
    && /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9_./+=-]{24,}$/.test(redacted)
  ) return '[REDACTED]'
  return redacted.length > 2_000 ? `${redacted.slice(0, 2_000)}… [TRUNCATED]` : redacted
}

export function redactAuditValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return redactAuditText(value)
  if (depth >= 6) return '[TRUNCATED]'
  if (Array.isArray(value)) {
    const items = value.slice(0, 50).map((item) => redactAuditValue(item, depth + 1))
    if (value.length > 50) items.push(`[${value.length - 50} ITEMS TRUNCATED]`)
    return items
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 100)
    const result: Record<string, unknown> = {}
    for (const [key, entryValue] of entries) {
      const normalizedKey = key.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[^a-z0-9]+/gi, '_')
      result[key] = SENSITIVE_KEY.test(normalizedKey) ? '[REDACTED]' : redactAuditValue(entryValue, depth + 1)
    }
    if (Object.keys(value as object).length > 100) result.__truncated__ = true
    return result
  }
  return String(value)
}

export function encodeAuditCursor(cursor: AuditCursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function decodeAuditCursor(value: string): AuditCursor | null {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')))
  } catch {
    return null
  }
}

export function csvCell(value: unknown) {
  const raw = value === null || value === undefined ? '' : String(value).replace(/\0/g, '')
  const safe = /^(?:[\t\r]|\s*[=+\-@])/.test(raw) ? `'${raw}` : raw
  return `"${safe.replace(/"/g, '""')}"`
}

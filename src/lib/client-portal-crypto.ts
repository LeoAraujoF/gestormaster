import crypto from 'crypto'

const TOKEN_BYTES = 32

function secret(): string {
  const value = process.env.PORTAL_AUTH_SECRET || process.env.ENCRYPTION_KEY
  if (!value || value.length < 32) throw new Error('PORTAL_AUTH_SECRET ou ENCRYPTION_KEY deve ter ao menos 32 caracteres')
  return value
}

export function portalHash(value: string): string {
  return crypto.createHmac('sha256', secret()).update(value).digest('hex')
}

export function hashPortalCode(id: string, code: string): string {
  return portalHash(`${id}:${code.trim()}`)
}

export function generatePortalCode(): string {
  return crypto.randomInt(100000, 1_000_000).toString()
}

export function generatePortalToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url')
}

export function maskPhone(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8) return '***'
  return `+${digits.slice(0, 2)} ** *****-${digits.slice(-4)}`
}

export function normalizePortalSlug(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
}

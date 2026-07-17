export type NormalizedClientPhone = {
  phone: string | null
  phone_e164: string | null
}

export function normalizeBrazilPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  const local = digits.startsWith('55') ? digits.slice(2) : digits
  if (!/^[1-9][0-9][0-9]{8,9}$/.test(local)) return null
  return `+55${local}`
}

export function normalizePhoneE164(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null

  const digits = value.replace(/\D/g, '')
  if (value.startsWith('+') && /^\d{8,15}$/.test(digits)) return `+${digits}`

  return normalizeBrazilPhone(digits)
}

export function normalizeClientPhone(raw: unknown): NormalizedClientPhone {
  const value = raw == null ? '' : String(raw)
  const phone = value.replace(/\D/g, '') || null
  return {
    phone,
    phone_e164: phone ? normalizePhoneE164(value) : null,
  }
}

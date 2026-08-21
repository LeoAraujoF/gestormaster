export type NormalizedClientPhone = {
  phone: string | null
  phone_e164: string | null
}

// E.164 permite no máximo 15 dígitos. O mínimo sintático de 8 dígitos
// acomoda países que possuem números nacionais menores que o brasileiro.
const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/

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

  // Números internacionais precisam trazer o DDI explicitamente. Também
  // aceitamos o prefixo internacional 00, comum em cadastros importados.
  if (value.startsWith('+') || value.startsWith('00')) {
    const internationalDigits = value.startsWith('00') ? digits.slice(2) : digits
    const candidate = `+${internationalDigits}`
    return E164_PATTERN.test(candidate) ? candidate : null
  }

  return normalizeBrazilPhone(digits)
}

export function normalizeClientPhone(raw: unknown): NormalizedClientPhone {
  const value = raw == null ? '' : String(raw)
  const digits = value.replace(/\D/g, '')
  const phoneE164 = digits ? normalizePhoneE164(value) : null
  return {
    // `phone` permanece como campo legado com os dígitos informados. O envio
    // usa sempre `phone_e164`, evitando que um número internacional seja
    // tratado como brasileiro na integração antiga.
    phone: digits || null,
    phone_e164: phoneE164,
  }
}

/** Retorna o formato aceito pela Evolution/Baileys, sem o sinal de +. */
export function normalizeWhatsAppNumber(raw: unknown): string | null {
  const value = raw == null ? '' : String(raw)
  const normalized = normalizePhoneE164(value)
  return normalized?.slice(1) || null
}

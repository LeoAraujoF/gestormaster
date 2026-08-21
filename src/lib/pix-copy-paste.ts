const PIX_CRC_TAG = '6304'

export function calculatePixCopyPasteCrc(payload: string): string {
  let crc = 0xffff

  for (let index = 0; index < payload.length; index++) {
    crc ^= payload.charCodeAt(index) << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000
        ? ((crc << 1) ^ 0x1021) & 0xffff
        : (crc << 1) & 0xffff
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function normalizePixCopyPasteCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

export function isValidPixCopyPasteCode(value: unknown): value is string {
  const code = normalizePixCopyPasteCode(value)
  if (!code || !code.startsWith('000201')) return false
  if (!/^[\x20-\x7E]+$/.test(code)) return false

  const crcMatch = code.match(/6304([0-9A-Fa-f]{4})$/)
  if (!crcMatch) return false

  let cursor = 0
  const tags = new Map<string, string>()

  while (cursor < code.length) {
    const id = code.slice(cursor, cursor + 2)
    const rawLength = code.slice(cursor + 2, cursor + 4)
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(rawLength)) return false

    const length = Number(rawLength)
    const next = cursor + 4 + length
    if (next > code.length) return false

    tags.set(id, code.slice(cursor + 4, next))
    cursor = next
  }

  const merchantAccount = Array.from(tags.entries())
    .find(([id, content]) => Number(id) >= 26 && Number(id) <= 51 && content.includes('br.gov.bcb.pix'))

  return cursor === code.length
    && tags.get('00') === '01'
    && tags.get('53') === '986'
    && tags.get('58') === 'BR'
    && Boolean(merchantAccount)
    && tags.get('63')?.toUpperCase() === crcMatch[1].toUpperCase()
    && calculatePixCopyPasteCrc(`${code.slice(0, -8)}${PIX_CRC_TAG}`) === crcMatch[1].toUpperCase()
}

export function getValidPixCopyPasteCode(value: unknown): string | null {
  const code = normalizePixCopyPasteCode(value)
  return code && isValidPixCopyPasteCode(code) ? code : null
}

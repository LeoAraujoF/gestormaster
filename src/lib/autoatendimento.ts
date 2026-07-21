import crypto from 'crypto'
import { normalizeBrazilPhone } from './phone'

export { normalizeBrazilPhone } from './phone'

export const BOT_STATE_TTL_SECONDS = 30 * 60
export const PHONE_VERIFICATION_TTL_MINUTES = 10
export const MAX_PHONE_VERIFICATION_ATTEMPTS = 5

export type AutoState =
  | { step: 'main_menu'; clientId: string }
  | { step: 'choosing_plan'; clientId: string; plans: Array<{ name: string; price: number }> }
  | { step: 'confirm_renewal'; clientId: string; price: number; planName: string }
  | { step: 'confirm_cancellation'; clientId: string }
  | { step: 'awaiting_due_date'; clientId: string }
  | { step: 'awaiting_new_phone'; clientId: string }
  | { step: 'awaiting_phone_code'; clientId: string; verificationId: string }

type EvolutionMessageKey = {
  remoteJid?: unknown
  remoteJidAlt?: unknown
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? value as UnknownRecord : null
}

function stringField(record: UnknownRecord | null, key: string): string | null {
  const value = record?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Extrai texto e IDs de respostas interativas recebidas pela Evolution/Baileys. */
export function extractIncomingMessageText(input: unknown): string | null {
  let message = asRecord(asRecord(input)?.message)
  for (const wrapper of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2']) {
    const wrapped = asRecord(asRecord(message?.[wrapper])?.message)
    if (wrapped) message = wrapped
  }
  if (!message) return null

  const direct = stringField(message, 'conversation')
    || stringField(asRecord(message.extendedTextMessage), 'text')
    || stringField(asRecord(message.imageMessage), 'caption')
  if (direct) return direct

  const buttonResponse = asRecord(message.buttonsResponseMessage)
  const buttonValue = stringField(buttonResponse, 'selectedButtonId')
    || stringField(buttonResponse, 'selectedDisplayText')
  if (buttonValue) return buttonValue

  const listReply = asRecord(asRecord(message.listResponseMessage)?.singleSelectReply)
  const listValue = stringField(listReply, 'selectedRowId')
  if (listValue) return listValue

  const templateReply = asRecord(message.templateButtonReplyMessage)
  const templateValue = stringField(templateReply, 'selectedId')
    || stringField(templateReply, 'selectedDisplayText')
  if (templateValue) return templateValue

  const nativeFlow = asRecord(asRecord(message.interactiveResponseMessage)?.nativeFlowResponseMessage)
  const paramsJson = stringField(nativeFlow, 'paramsJson')
  if (!paramsJson) return null
  try {
    const params = asRecord(JSON.parse(paramsJson))
    return stringField(params, 'id')
      || stringField(params, 'selectedId')
      || stringField(params, 'rowId')
  } catch {
    return null
  }
}

export function resolveIncomingPhoneJid(key: EvolutionMessageKey | null | undefined): string | null {
  if (!key) return null

  const remoteJid = typeof key.remoteJid === 'string' ? key.remoteJid.trim() : ''
  if (remoteJid.endsWith('@g.us')) return null

  for (const candidate of [key.remoteJidAlt, key.remoteJid]) {
    if (typeof candidate !== 'string') continue
    const jid = candidate.trim()
    const match = jid.match(/^(\d+)(?::\d+)?@s\.whatsapp\.net$/)
    if (match) return `${match[1]}@s.whatsapp.net`
  }

  return null
}

export function brazilPhoneE164Candidates(raw: string): string[] {
  const normalized = normalizeBrazilPhone(raw)
  if (!normalized) return []

  const local = normalized.slice(3)
  const candidates = [normalized]
  const subscriber = local.slice(2)

  // O WhatsApp pode representar celulares brasileiros pelo JID legado, sem o
  // nono dígito inserido após o DDD. Consulte as duas formas, preservando a
  // correspondência exata como primeira opção.
  if (local.length === 10 && /^[6-9]/.test(subscriber)) {
    candidates.push(`+55${local.slice(0, 2)}9${subscriber}`)
  } else if (local.length === 11 && subscriber.startsWith('9') && /^[6-9]/.test(subscriber[1] || '')) {
    candidates.push(`+55${local.slice(0, 2)}${subscriber.slice(1)}`)
  }

  return [...new Set(candidates)]
}

export function brazilPhoneLegacyCandidates(raw: string): string[] {
  return brazilPhoneE164Candidates(raw).flatMap((candidate) => {
    const digits = candidate.replace(/\D/g, '')
    return [digits, digits.slice(2)]
  }).filter((candidate, index, values) => values.indexOf(candidate) === index)
}

export function isMenuCommand(text: string): boolean {
  const value = text.trim().toLowerCase()
  return ['0', 'menu', 'sair', 'cancelar', 'oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'renovar'].includes(value)
}

export function parseDueDate(text: string): string | null {
  const match = text.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  const [, day, month, year] = match
  const date = new Date(`${year}-${month}-${day}T12:00:00`)
  if (Number.isNaN(date.valueOf()) || date.getDate() !== Number(day) || date.getMonth() + 1 !== Number(month)) return null
  const max = new Date()
  max.setDate(max.getDate() + 90)
  if (date < new Date() || date > max) return null
  return `${year}-${month}-${day}`
}

export function generateVerificationCode(): { plain: string; hash: string } {
  const plain = crypto.randomInt(100000, 1_000_000).toString()
  return { plain, hash: crypto.createHash('sha256').update(plain).digest('hex') }
}

export function verifyCode(code: string, expectedHash: string): boolean {
  const provided = crypto.createHash('sha256').update(code.trim()).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expectedHash))
}

export function buildMainMenu(name: string): string {
  return `Olá ${name.split(' ')[0]} 👋\n\n1️⃣ Renovar plano\n2️⃣ Segunda via do PIX\n3️⃣ Alterar vencimento\n4️⃣ Meu histórico\n5️⃣ Atualizar telefone\n6️⃣ Falar com atendente\n7️⃣ Não quero renovar\n\n_Digite o número da opção desejada._`
}

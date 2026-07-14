import crypto from 'crypto'

export const BOT_STATE_TTL_SECONDS = 30 * 60
export const PHONE_VERIFICATION_TTL_MINUTES = 10
export const MAX_PHONE_VERIFICATION_ATTEMPTS = 5

export type AutoState =
  | { step: 'main_menu'; clientId: string }
  | { step: 'choosing_plan'; clientId: string; plans: Array<{ name: string; price: number }> }
  | { step: 'confirm_renewal'; clientId: string; price: number; planName: string }
  | { step: 'awaiting_due_date'; clientId: string }
  | { step: 'awaiting_new_phone'; clientId: string }
  | { step: 'awaiting_phone_code'; clientId: string; verificationId: string }

export function normalizeBrazilPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  const local = digits.startsWith('55') ? digits.slice(2) : digits
  if (!/^[1-9][0-9][0-9]{8,9}$/.test(local)) return null
  return `+55${local}`
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
  return `Olá ${name.split(' ')[0]} 👋\n\n1️⃣ Renovar plano\n2️⃣ Segunda via do PIX\n3️⃣ Alterar vencimento\n4️⃣ Meu histórico\n5️⃣ Atualizar telefone\n6️⃣ Falar com atendente\n\n_Digite o número da opção desejada._`
}

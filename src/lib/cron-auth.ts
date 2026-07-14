import crypto from 'crypto'

/**
 * Valida se uma requisição de cron/serviço interno está autorizada.
 *
 * Aceita exclusivamente o padrão da Vercel Cron (header
 * `Authorization: Bearer <CRON_SECRET>`). Segredos em query strings vazam em
 * logs, histórico e cabeçalhos Referer.
 *
 * IMPORTANTE: o segredo NÃO deve ficar versionado (não colocar em vercel.json).
 * Configure CRON_SECRET no painel da Vercel / variáveis de ambiente do servidor.
 *
 * Fail-closed: se CRON_SECRET não estiver configurado, nega o acesso.
 */
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const authHeader = req.headers.get('authorization') || ''
  const expected = `Bearer ${secret}`
  if (safeEqual(authHeader, expected)) return true

  return false
}

/** Comparação em tempo constante para evitar timing attacks. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

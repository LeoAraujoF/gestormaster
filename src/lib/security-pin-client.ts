export type SecurityPinStatus = {
  configured: boolean
  lockedUntil: string | null
}

type SecurityApiErrorBody = {
  error?: string
  code?: string
  lockedUntil?: string
  remainingAttempts?: number
}

export class SecurityPinApiError extends Error {
  code?: string
  lockedUntil?: string
  remainingAttempts?: number

  constructor(body: SecurityApiErrorBody, fallback: string) {
    const baseMessage = body.error || fallback
    const attemptsMessage = body.code === 'PIN_INVALID' && typeof body.remainingAttempts === 'number'
      ? ` ${body.remainingAttempts} tentativa(s) restante(s).`
      : ''
    super(`${baseMessage}${attemptsMessage}`)
    this.name = 'SecurityPinApiError'
    this.code = body.code
    this.lockedUntil = body.lockedUntil
    this.remainingAttempts = body.remainingAttempts
  }
}

async function parseResponse<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => ({})) as SecurityApiErrorBody
  if (!response.ok) throw new SecurityPinApiError(body, fallback)
  return body as T
}

export async function fetchSecurityPinStatus(): Promise<SecurityPinStatus> {
  const response = await fetch('/api/security/pin', {
    cache: 'no-store',
    credentials: 'same-origin',
  })
  return parseResponse<SecurityPinStatus>(response, 'Não foi possível consultar o PIN de segurança.')
}

export async function updateSecurityPin(newPin: string, currentPin?: string) {
  const response = await fetch('/api/security/pin', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPin, ...(currentPin ? { currentPin } : {}) }),
  })
  return parseResponse<{ success: true; configured: true }>(
    response,
    'Não foi possível salvar o PIN de segurança.'
  )
}

export async function deleteProtectedResource(input: {
  resource: 'clients' | 'services' | 'promotions' | 'iptv_accounts'
  ids?: string[]
  scope?: 'all'
  pin: string
}) {
  const response = await fetch('/api/security/destructive-action', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parseResponse<{ success: true; count: number; message: string }>(
    response,
    'Não foi possível concluir a exclusão.'
  )
}

export class EvolutionApiError extends Error {
  readonly status: number
  readonly body: string

  constructor(status: number, body: string) {
    super(`Evolution API Error [${status}]: ${body}`)
    this.name = 'EvolutionApiError'
    this.status = status
    this.body = body
  }
}

function errorText(error: unknown) {
  if (error instanceof EvolutionApiError) return error.body.toLowerCase()
  return error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
}

export function isRetryableWhatsAppError(error: unknown) {
  if (error instanceof EvolutionApiError) {
    return error.status === 408 || error.status === 409 || error.status === 425 || error.status === 429 || error.status >= 500
  }
  const text = errorText(error)
  return /timeout|timed out|econnreset|econnrefused|etimedout|socket hang up|network|502|503|504/.test(text)
}

export function shouldPauseWhatsAppInstance(error: unknown) {
  if (error instanceof EvolutionApiError && [401, 403].includes(error.status)) return true
  return /blocked|banned|forbidden|unauthorized|logged out|logout|session closed|connection closed|not connected/.test(errorText(error))
}

export function whatsappErrorCode(error: unknown) {
  if (error instanceof EvolutionApiError) return `EVOLUTION_HTTP_${error.status}`
  return 'WHATSAPP_PROVIDER_ERROR'
}

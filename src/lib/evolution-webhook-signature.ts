import crypto from 'crypto'

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export function verifyEvolutionWebhookSignature(
  incomingSignature: string | null,
  rawBody: string,
  secrets: readonly string[],
): boolean {
  if (!incomingSignature || secrets.length === 0) return false

  const normalizedSignature = incomingSignature.replace(/^sha256=/i, '')
  return secrets.some((secret) => {
    if (!secret) return false
    if (safeEqual(incomingSignature, secret)) return true

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex')
    return safeEqual(normalizedSignature, expectedSignature)
  })
}

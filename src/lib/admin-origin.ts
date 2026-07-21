type AdminOriginInput = {
  origin: string | null
  fetchSite: string | null
  requestUrl: string
  trustedAppUrl: string
  forwardedHost: string | null
  forwardedProto: string | null
  allowHttp: boolean
}

function normalizeOrigin(value: string | null | undefined, allowHttp: boolean) {
  if (!value) return null
  try {
    const origin = new URL(value).origin
    const protocol = new URL(origin).protocol
    if (protocol === 'https:' || (allowHttp && protocol === 'http:')) return origin
  } catch {
    // Cabeçalhos malformados nunca são considerados origens confiáveis.
  }
  return null
}

function firstForwardedValue(value: string | null) {
  return value?.split(',')[0]?.trim() || null
}

export function isTrustedAdminMutationOrigin(input: AdminOriginInput) {
  if (input.fetchSite === 'cross-site') return false
  if (!input.origin) return true

  const requestOrigin = normalizeOrigin(input.origin, input.allowHttp)
  if (!requestOrigin) return false

  const allowedOrigins = new Set<string>()
  for (const candidate of [input.trustedAppUrl, input.requestUrl]) {
    const normalized = normalizeOrigin(candidate, input.allowHttp)
    if (normalized) allowedOrigins.add(normalized)
  }

  const forwardedHost = firstForwardedValue(input.forwardedHost)
  const forwardedProto = firstForwardedValue(input.forwardedProto)
  if (forwardedHost && forwardedProto && ['https', ...(input.allowHttp ? ['http'] : [])].includes(forwardedProto)) {
    const forwardedOrigin = normalizeOrigin(`${forwardedProto}://${forwardedHost}`, input.allowHttp)
    if (forwardedOrigin) allowedOrigins.add(forwardedOrigin)
  }

  return allowedOrigins.has(requestOrigin)
}

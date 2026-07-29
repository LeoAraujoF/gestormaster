export type PortalClientCandidate = {
  id: string
}

export function selectPortalClient<T extends PortalClientCandidate>(
  candidates: T[],
  requestedClientId?: string | null,
): T | null {
  if (requestedClientId) {
    return candidates.find((candidate) => candidate.id === requestedClientId) || null
  }

  return candidates.length === 1 ? candidates[0] : null
}

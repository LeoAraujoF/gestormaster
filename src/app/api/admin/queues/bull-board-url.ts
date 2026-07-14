export type BullBoardAvailability = {
  url: URL | null
  reason: "available" | "not_configured" | "read_only_required" | "invalid_url"
}

export function getBullBoardAvailability(): BullBoardAvailability {
  const configuredUrl = process.env.QUEUES_URL?.trim()
  if (!configuredUrl) return { url: null, reason: "not_configured" }
  if (process.env.BULL_BOARD_READ_ONLY !== "true") return { url: null, reason: "read_only_required" }

  try {
    const url = new URL(configuredUrl)
    const allowedProtocol = url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:")
    if (!allowedProtocol || url.username || url.password) return { url: null, reason: "invalid_url" }
    return { url, reason: "available" }
  } catch {
    return { url: null, reason: "invalid_url" }
  }
}

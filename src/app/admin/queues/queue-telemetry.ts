export const HEARTBEAT_STALE_AFTER_MS = 3 * 60 * 1000

/** Quantos jobs pendentes são inspecionados em cada ponta da fila. */
export const QUEUE_LAG_SAMPLE_SIZE = 250

/** A partir daqui a fila é considerada atrasada, não apenas ocupada. */
export const QUEUE_LAG_WARNING_MS = 15 * 60 * 1000

export type QueueCounts = {
  waiting: number
  active: number
  delayed: number
  prioritized: number
  waitingChildren: number
  completed: number
  failed: number
  paused: number
}

export type QueueTelemetry = {
  name: string
  label: string
  isPaused: boolean
  counts: QueueCounts
  backlog: number
  workers: number | null
  latestFailureAt: string | null
  /**
   * Idade do job pendente mais antigo que foi visto na amostragem.
   *
   * Contadores não mostram atraso: uma fila com 200 itens pode estar fluindo ou
   * parada há seis horas. Jobs `delayed` ficam de fora de propósito — pacing e
   * campanhas agendadas estão esperando porque devem, não porque atrasaram.
   *
   * É um piso, não um valor exato: `prioritized` é um ZSET ordenado por
   * prioridade, então o mais antigo pode estar fora da amostra das pontas.
   */
  approxLagMs: number
  oldestPendingAt: string | null
}

export type QueueTotals = QueueCounts & {
  backlog: number
  workers: number
  workersComplete: boolean
  maxApproxLagMs: number
}

export type HeartbeatSummary = {
  component: string
  reports: number
  reportedHealthy: number
  reportedDegraded: number
  reportedOffline: number
  stale: number
  latestSeenAt: string | null
}

export type QueueTelemetryResponse = {
  generatedAt: string
  lagWarningMs: number
  redis: {
    latencyMs: number
  }
  totals: QueueTotals
  queues: QueueTelemetry[]
  heartbeats: {
    available: boolean
    staleAfterSeconds: number
    summaries: HeartbeatSummary[]
  }
  bullBoard: {
    available: boolean
    reason: "available" | "not_configured" | "read_only_required" | "invalid_url"
  }
}

type HeartbeatRow = {
  component: string
  status: string
  last_seen_at: string
}

function count(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

export function normalizeQueueCounts(raw: Record<string, unknown>): QueueCounts {
  return {
    waiting: count(raw.waiting ?? raw.wait),
    active: count(raw.active),
    delayed: count(raw.delayed),
    prioritized: count(raw.prioritized),
    waitingChildren: count(raw["waiting-children"]),
    completed: count(raw.completed),
    failed: count(raw.failed),
    paused: count(raw.paused),
  }
}

/** Menor timestamp válido da amostra, ou null se nada pendente foi visto. */
export function oldestPendingTimestamp(timestamps: Array<number | null | undefined>): number | null {
  let oldest: number | null = null
  for (const value of timestamps) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue
    if (oldest === null || value < oldest) oldest = value
  }
  return oldest
}

export function calculateLagMs(oldestTimestamp: number | null, nowMs = Date.now()) {
  if (oldestTimestamp === null) return 0
  return Math.max(0, nowMs - oldestTimestamp)
}

export function calculateBacklog(counts: QueueCounts) {
  return counts.waiting + counts.delayed + counts.prioritized + counts.waitingChildren + counts.paused
}

export function calculateQueueTotals(queues: QueueTelemetry[]): QueueTotals {
  const totals: QueueTotals = {
    waiting: 0,
    active: 0,
    delayed: 0,
    prioritized: 0,
    waitingChildren: 0,
    completed: 0,
    failed: 0,
    paused: 0,
    backlog: 0,
    workers: 0,
    workersComplete: true,
    maxApproxLagMs: 0,
  }

  for (const queue of queues) {
    for (const key of ["waiting", "active", "delayed", "prioritized", "waitingChildren", "completed", "failed", "paused"] as const) {
      totals[key] += queue.counts[key]
    }
    totals.backlog += queue.backlog
    totals.maxApproxLagMs = Math.max(totals.maxApproxLagMs, queue.approxLagMs)
    if (queue.workers === null) totals.workersComplete = false
    else totals.workers += queue.workers
  }

  return totals
}

export function summarizeHeartbeats(
  rows: HeartbeatRow[],
  nowMs = Date.now(),
  staleAfterMs = HEARTBEAT_STALE_AFTER_MS,
): HeartbeatSummary[] {
  const summaries = new Map<string, HeartbeatSummary>()

  for (const row of rows) {
    const current = summaries.get(row.component) ?? {
      component: row.component,
      reports: 0,
      reportedHealthy: 0,
      reportedDegraded: 0,
      reportedOffline: 0,
      stale: 0,
      latestSeenAt: null,
    }
    const seenAt = Date.parse(row.last_seen_at)

    current.reports += 1
    if (row.status === "healthy") current.reportedHealthy += 1
    if (row.status === "degraded") current.reportedDegraded += 1
    if (row.status === "offline") current.reportedOffline += 1
    if (!Number.isFinite(seenAt) || nowMs - seenAt > staleAfterMs) current.stale += 1
    if (Number.isFinite(seenAt) && (!current.latestSeenAt || seenAt > Date.parse(current.latestSeenAt))) {
      current.latestSeenAt = new Date(seenAt).toISOString()
    }
    summaries.set(row.component, current)
  }

  return [...summaries.values()].sort((a, b) => a.component.localeCompare(b.component))
}

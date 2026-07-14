export const HEARTBEAT_STALE_AFTER_MS = 3 * 60 * 1000

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
}

export type QueueTotals = QueueCounts & {
  backlog: number
  workers: number
  workersComplete: boolean
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
  }

  for (const queue of queues) {
    for (const key of ["waiting", "active", "delayed", "prioritized", "waitingChildren", "completed", "failed", "paused"] as const) {
      totals[key] += queue.counts[key]
    }
    totals.backlog += queue.backlog
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

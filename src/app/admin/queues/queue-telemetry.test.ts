import test from "node:test"
import assert from "node:assert/strict"

import {
  calculateBacklog,
  calculateQueueTotals,
  normalizeQueueCounts,
  summarizeHeartbeats,
  type QueueTelemetry,
} from "./queue-telemetry"

test("normaliza estados reais do BullMQ e calcula backlog sem jobs ativos", () => {
  const counts = normalizeQueueCounts({ waiting: 3, active: 2, delayed: 4, prioritized: 1, "waiting-children": 2, paused: 5, failed: 7 })
  assert.equal(calculateBacklog(counts), 15)
  assert.equal(counts.active, 2)
  assert.equal(counts.failed, 7)
})

test("soma workers conhecidos e sinaliza cobertura parcial", () => {
  const base = (workers: number | null): QueueTelemetry => ({
    name: "queue",
    label: "Fila",
    isPaused: false,
    counts: normalizeQueueCounts({ waiting: 1 }),
    backlog: 1,
    workers,
    latestFailureAt: null,
  })
  const totals = calculateQueueTotals([base(2), base(null)])
  assert.equal(totals.workers, 2)
  assert.equal(totals.workersComplete, false)
  assert.equal(totals.backlog, 2)
})

test("agrega heartbeats sem expor organização ou métricas persistidas", () => {
  const summaries = summarizeHeartbeats([
    { component: "scheduler", status: "healthy", last_seen_at: "2026-07-13T12:00:00.000Z" },
    { component: "scheduler", status: "degraded", last_seen_at: "2026-07-13T11:55:00.000Z" },
  ], Date.parse("2026-07-13T12:01:00.000Z"))

  assert.deepEqual(summaries, [{
    component: "scheduler",
    reports: 2,
    reportedHealthy: 1,
    reportedDegraded: 1,
    reportedOffline: 0,
    stale: 1,
    latestSeenAt: "2026-07-13T12:00:00.000Z",
  }])
})

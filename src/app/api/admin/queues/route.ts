import { NextResponse } from "next/server"

import { adminErrorResponse, requireMasterAdmin } from "@/lib/admin-security"
import {
  aiQueue,
  healthQueue,
  intelligenceQueue,
  messageQueue,
  warmupQueue,
  webhookQueue,
} from "@/lib/queue"
import { redisConnection } from "@/lib/redis"
import { supabaseAdmin } from "@/lib/supabase/service-role"
import {
  HEARTBEAT_STALE_AFTER_MS,
  calculateBacklog,
  calculateQueueTotals,
  normalizeQueueCounts,
  summarizeHeartbeats,
  type QueueTelemetry,
  type QueueTelemetryResponse,
} from "@/app/admin/queues/queue-telemetry"
import { getBullBoardAvailability } from "./bull-board-url"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const JOB_STATES = ["waiting", "active", "delayed", "prioritized", "waiting-children", "completed", "failed", "paused"] as const
const REDIS_TIMEOUT_MS = 3_000

const queues = [
  { queue: messageQueue, label: "Mensagens" },
  { queue: webhookQueue, label: "Webhooks" },
  { queue: aiQueue, label: "IA" },
  { queue: intelligenceQueue, label: "Inteligência" },
  { queue: healthQueue, label: "Saúde de instâncias" },
  { queue: warmupQueue, label: "Aquecimento" },
]

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
    },
  })
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("QUEUE_TELEMETRY_TIMEOUT")), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function collectQueueTelemetry(entry: (typeof queues)[number]): Promise<QueueTelemetry> {
  const [rawCounts, workers, failedJobs, isPaused] = await Promise.all([
    withTimeout(entry.queue.getJobCounts(...JOB_STATES), REDIS_TIMEOUT_MS),
    withTimeout(entry.queue.getWorkersCount(), REDIS_TIMEOUT_MS).catch(() => null),
    withTimeout(entry.queue.getJobs("failed", 0, 0, false), REDIS_TIMEOUT_MS).catch(() => []),
    withTimeout(entry.queue.isPaused(), REDIS_TIMEOUT_MS),
  ])
  const counts = normalizeQueueCounts(rawCounts)
  const latestFailure = failedJobs[0]
  const latestFailureTimestamp = latestFailure?.finishedOn ?? latestFailure?.processedOn ?? latestFailure?.timestamp

  return {
    name: entry.queue.name,
    label: entry.label,
    isPaused,
    counts,
    backlog: calculateBacklog(counts),
    workers,
    latestFailureAt: latestFailureTimestamp ? new Date(latestFailureTimestamp).toISOString() : null,
  }
}

async function collectHeartbeats() {
  try {
    const { data, error, count } = await supabaseAdmin
      .from("intelligence_operational_heartbeats")
      .select("component,status,last_seen_at", { count: "exact" })
    if (error || count === null || count !== (data?.length ?? 0)) return { available: false, summaries: [] }
    return { available: true, summaries: summarizeHeartbeats(data ?? []) }
  } catch {
    return { available: false, summaries: [] }
  }
}

export async function GET() {
  try {
    await requireMasterAdmin()
    const pingStartedAt = performance.now()
    try {
      const pong = await withTimeout(redisConnection.ping(), REDIS_TIMEOUT_MS)
      if (pong !== "PONG") throw new Error("QUEUE_REDIS_UNEXPECTED_RESPONSE")
    } catch {
      return noStoreJson({ error: { code: "QUEUES_REDIS_UNAVAILABLE", message: "Redis indisponível para leitura da telemetria" } }, 503)
    }
    const redisLatencyMs = Math.max(0, Math.round(performance.now() - pingStartedAt))

    let queueTelemetry: QueueTelemetry[]
    let heartbeats: Awaited<ReturnType<typeof collectHeartbeats>>
    try {
      ;[queueTelemetry, heartbeats] = await Promise.all([
        Promise.all(queues.map(collectQueueTelemetry)),
        collectHeartbeats(),
      ])
    } catch {
      return noStoreJson({ error: { code: "QUEUES_TELEMETRY_UNAVAILABLE", message: "Os contadores do BullMQ não responderam no tempo esperado" } }, 503)
    }
    const board = getBullBoardAvailability()
    const response: QueueTelemetryResponse = {
      generatedAt: new Date().toISOString(),
      redis: { latencyMs: redisLatencyMs },
      totals: calculateQueueTotals(queueTelemetry),
      queues: queueTelemetry,
      heartbeats: {
        available: heartbeats.available,
        staleAfterSeconds: HEARTBEAT_STALE_AFTER_MS / 1000,
        summaries: heartbeats.summaries,
      },
      bullBoard: { available: board.url !== null, reason: board.reason },
    }
    return noStoreJson(response)
  } catch (error) {
    const response = adminErrorResponse(error)
    response.headers.set("Cache-Control", "private, no-store, max-age=0")
    return response
  }
}

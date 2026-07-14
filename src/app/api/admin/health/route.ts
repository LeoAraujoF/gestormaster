import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { redisConnection } from '@/lib/redis'
import { adminErrorResponse, requireMasterAdmin } from '@/lib/admin-security'
import {
  ADMIN_OPERATIONAL_ROUTINES,
  isAdminOperationalRoutineId,
  type AdminOperationalRoutineId,
} from '@/lib/admin-routine-contracts'
import {
  HEARTBEAT_STALE_AFTER_MS,
  buildOperationalComponentStates,
  buildOperationalIncidentSignals,
  type OperationalHeartbeatRow,
  type OperationalIncidentSignal,
} from '@/lib/admin-operations'

export const dynamic = 'force-dynamic'

type ServiceStatus = 'online' | 'degraded' | 'offline' | 'unconfigured'
type RoutineResult = {
  id: AdminOperationalRoutineId
  ok: boolean
  httpStatus: number | null
  durationMs: number | null
  summary: string | null
}
type AuditRow = {
  id: string
  created_at: string
  outcome: 'success' | 'failure'
  reason: string | null
  details: unknown
}

type IncidentRow = {
  id: string
  fingerprint: string
  source: string
  severity: 'warning' | 'critical'
  status: 'open' | 'acknowledged' | 'resolved'
  title: string
  summary: string
  evidence: Record<string, unknown>
  occurrence_count: number
  first_seen_at: string
  last_seen_at: string
  acknowledged_at: string | null
  resolved_at: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeRoutineResults(row: AuditRow): RoutineResult[] {
  if (!isRecord(row.details)) return []

  if (Array.isArray(row.details.routines)) {
    return row.details.routines.flatMap((value): RoutineResult[] => {
      if (!isRecord(value)) return []
      const id = isAdminOperationalRoutineId(value.id) ? value.id : null
      if (!id || typeof value.ok !== 'boolean') return []

      return [{
        id,
        ok: value.ok,
        httpStatus: typeof value.httpStatus === 'number' ? value.httpStatus : null,
        durationMs: typeof value.durationMs === 'number' ? value.durationMs : null,
        summary: typeof value.summary === 'string' ? value.summary : null,
      }]
    })
  }

  if (Array.isArray(row.details.crons_triggered)) {
    return row.details.crons_triggered.flatMap((value): RoutineResult[] => {
      const id = isAdminOperationalRoutineId(value) ? value : null
      return id ? [{
        id,
        ok: row.outcome === 'success',
        httpStatus: null,
        durationMs: null,
        summary: null,
      }] : []
    })
  }

  return []
}

async function checkDatabase() {
  const startedAt = Date.now()
  let status: ServiceStatus = 'offline'

  try {
    const { error } = await supabaseAdmin.from('clients').select('id').limit(1)
    if (!error) status = 'online'
  } catch {
    status = 'offline'
  }

  return {
    id: 'database',
    status,
    latencyMs: Date.now() - startedAt,
  }
}

async function checkRedis() {
  const startedAt = Date.now()
  let timeout: ReturnType<typeof setTimeout> | undefined
  let status: ServiceStatus = 'offline'

  try {
    const ping = await Promise.race([
      redisConnection.ping(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Redis timeout')), 2_000)
      }),
    ])
    if (ping === 'PONG') status = 'online'
  } catch {
    status = 'offline'
  } finally {
    if (timeout) clearTimeout(timeout)
  }

  return {
    id: 'redis',
    status,
    latencyMs: Date.now() - startedAt,
  }
}

async function checkEvolution() {
  const configuredUrl = process.env.EVOLUTION_API_URL?.trim()
  if (!configuredUrl) {
    return {
      id: 'evolution',
      status: 'unconfigured' as const,
      latencyMs: null,
      httpStatus: null,
    }
  }

  const startedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3_000)

  try {
    const response = await fetch(configuredUrl.replace(/\/$/, ''), {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    })

    return {
      id: 'evolution',
      status: response.status >= 500 ? 'degraded' as const : 'online' as const,
      latencyMs: Date.now() - startedAt,
      httpStatus: response.status,
    }
  } catch {
    return {
      id: 'evolution',
      status: 'offline' as const,
      latencyMs: Date.now() - startedAt,
      httpStatus: null,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function getRoutineHistory() {
  const { data, error } = await supabaseAdmin
    .from('audit_logs')
    .select('id, created_at, outcome, reason, details')
    .eq('action', 'admin.force_cron')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) return { available: false, items: [], recentRuns: [] }

  const rows = (data || []) as AuditRow[]
  const recentRuns = rows.map((row) => {
    const results = normalizeRoutineResults(row)
    return {
      id: row.id,
      executedAt: row.created_at,
      outcome: row.outcome,
      reason: row.reason,
      failedCount: results.length ? results.filter((result) => !result.ok).length : null,
      results,
    }
  })

  return {
    available: true,
    items: ADMIN_OPERATIONAL_ROUTINES.map((routine) => {
      const run = recentRuns.find((candidate) => candidate.results.some((result) => result.id === routine.id))
      const result = run?.results.find((candidate) => candidate.id === routine.id)

      return {
        ...routine,
        lastRun: run && result ? {
          executedAt: run.executedAt,
          outcome: result.ok ? 'success' as const : 'failure' as const,
          durationMs: result.durationMs,
          httpStatus: result.httpStatus,
          summary: result.summary,
        } : null,
      }
    }),
    recentRuns,
  }
}

async function collectOperationalComponents() {
  const { data, error } = await supabaseAdmin
    .from('admin_operational_heartbeats')
    .select('component,status,started_at,last_seen_at,version')

  if (error) {
    return {
      available: false,
      components: buildOperationalComponentStates([]),
    }
  }

  return {
    available: true,
    components: buildOperationalComponentStates((data || []) as OperationalHeartbeatRow[]),
  }
}

async function reconcileOperationalIncidents(signals: OperationalIncidentSignal[]) {
  const now = new Date().toISOString()
  const { data: activeRows, error: activeError } = await supabaseAdmin
    .from('admin_incidents')
    .select('id,fingerprint,status,occurrence_count')
    .neq('status', 'resolved')

  if (activeError) return { available: false, items: [] as IncidentRow[] }

  const signalFingerprints = signals.map((signal) => signal.fingerprint)
  const { data: matchingRows, error: matchingError } = signalFingerprints.length
    ? await supabaseAdmin
      .from('admin_incidents')
      .select('id,fingerprint,status,occurrence_count')
      .in('fingerprint', signalFingerprints)
    : { data: [], error: null }

  if (matchingError) return { available: false, items: [] as IncidentRow[] }

  const known = new Map(
    [...(activeRows || []), ...(matchingRows || [])].map((row) => [row.fingerprint, row]),
  )
  const currentFingerprints = new Set(signalFingerprints)

  const writes: Array<PromiseLike<unknown>> = []
  for (const signal of signals) {
    const existing = known.get(signal.fingerprint)
    if (!existing) {
      writes.push(supabaseAdmin.from('admin_incidents').insert({
        ...signal,
        first_seen_at: now,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
      }))
      continue
    }

    writes.push(supabaseAdmin.from('admin_incidents').update({
      source: signal.source,
      severity: signal.severity,
      title: signal.title,
      summary: signal.summary,
      evidence: signal.evidence,
      last_seen_at: now,
      updated_at: now,
      ...(existing.status === 'resolved' ? {
        status: 'open',
        acknowledged_at: null,
        acknowledged_by: null,
        resolved_at: null,
        occurrence_count: Number(existing.occurrence_count || 0) + 1,
      } : {}),
    }).eq('id', existing.id))
  }

  for (const incident of activeRows || []) {
    if (currentFingerprints.has(incident.fingerprint)) continue
    writes.push(supabaseAdmin.from('admin_incidents').update({
      status: 'resolved',
      resolved_at: now,
      updated_at: now,
    }).eq('id', incident.id))
  }

  await Promise.all(writes)

  const { data, error } = await supabaseAdmin
    .from('admin_incidents')
    .select('id,fingerprint,source,severity,status,title,summary,evidence,occurrence_count,first_seen_at,last_seen_at,acknowledged_at,resolved_at')
    .order('last_seen_at', { ascending: false })
    .limit(30)

  return error
    ? { available: false, items: [] as IncidentRow[] }
    : { available: true, items: (data || []) as IncidentRow[] }
}

export async function GET() {
  try {
    await requireMasterAdmin()
    const startedAt = Date.now()

    const [database, redis, evolution, routines, operational] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkEvolution(),
      getRoutineHistory(),
      collectOperationalComponents(),
    ])

    const memory = process.memoryUsage()
    const application = {
      id: 'application',
      status: 'online' as const,
      latencyMs: null,
      memoryRssMb: Math.round(memory.rss / 1024 / 1024),
      uptimeSeconds: Math.round(process.uptime()),
    }

    const services = [database, redis, evolution, application]
    const signals = buildOperationalIncidentSignals(operational.components, services)
    const incidents = await reconcileOperationalIncidents(signals)
    const activeIncidents = incidents.items.filter((incident) => incident.status !== 'resolved')

    return NextResponse.json(
      {
        data: {
          checkedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          services,
          routines,
          operations: {
            available: operational.available,
            staleAfterSeconds: HEARTBEAT_STALE_AFTER_MS / 1000,
            components: operational.components,
            incidents: {
              available: incidents.available,
              activeCount: activeIncidents.length,
              criticalCount: activeIncidents.filter((incident) => incident.severity === 'critical').length,
              items: incidents.items,
            },
          },
        },
        meta: { refreshIntervalMs: 30_000 },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return adminErrorResponse(error)
  }
}

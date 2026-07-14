import { supabaseAdmin } from './supabase/service-role'

export type OperationalComponent =
  | 'scheduler'
  | 'message_worker'
  | 'webhook_worker'
  | 'health_worker'
  | 'warmup_worker'
  | 'bull_board'
  | 'ai_worker'
  | 'intelligence_worker'

type HeartbeatStatus = 'healthy' | 'degraded'

const processStartedAt = new Date().toISOString()
const HEARTBEAT_INTERVAL_MS = 60_000
let warnedUnavailable = false

export async function reportOperationalHeartbeat(
  component: OperationalComponent,
  status: HeartbeatStatus = 'healthy',
  metrics: Record<string, string | number | boolean | null> = {},
) {
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin.from('admin_operational_heartbeats').upsert({
    component,
    status,
    started_at: processStartedAt,
    last_seen_at: now,
    version: process.env.npm_package_version || null,
    metrics: {
      pid: process.pid,
      runtime: process.release.name,
      ...metrics,
    },
    updated_at: now,
  }, { onConflict: 'component' })

  if (error && !warnedUnavailable) {
    warnedUnavailable = true
    console.warn(`[Heartbeat] Persistência indisponível: ${error.code || 'UNKNOWN'}`)
  }
}

export function startOperationalHeartbeat(component: OperationalComponent) {
  const send = () => {
    void reportOperationalHeartbeat(component).catch((error) => {
      if (!warnedUnavailable) {
        warnedUnavailable = true
        console.warn(`[Heartbeat] Falha inesperada: ${error instanceof Error ? error.message : 'UNKNOWN'}`)
      }
    })
  }

  send()
  const timer = setInterval(send, HEARTBEAT_INTERVAL_MS)
  timer.unref?.()
  return timer
}

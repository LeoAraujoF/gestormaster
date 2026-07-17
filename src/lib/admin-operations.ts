export const HEARTBEAT_STALE_AFTER_MS = 3 * 60 * 1000

export type OperationalComponentStatus = 'online' | 'degraded' | 'stale' | 'missing'
export type IncidentSeverity = 'warning' | 'critical'

export type OperationalHeartbeatRow = {
  component: string
  status: string
  started_at: string
  last_seen_at: string
  version: string | null
}

export type OperationalComponentState = {
  id: string
  name: string
  description: string
  status: OperationalComponentStatus
  lastSeenAt: string | null
  startedAt: string | null
  version: string | null
  staleAfterSeconds: number
  severity: IncidentSeverity
}

export type OperationalIncidentSignal = {
  fingerprint: string
  source: string
  severity: IncidentSeverity
  title: string
  summary: string
  evidence: Record<string, string | number | boolean | null>
}

type ServiceSignalInput = {
  id: string
  status: 'online' | 'degraded' | 'offline' | 'unconfigured'
}

const COMPONENTS: Array<Omit<OperationalComponentState, 'status' | 'lastSeenAt' | 'startedAt' | 'version'>> = [
  { id: 'scheduler', name: 'Scheduler', description: 'Agenda cobranças, snapshots e rotinas recorrentes.', staleAfterSeconds: 180, severity: 'critical' },
  { id: 'message_worker', name: 'Mensagens', description: 'Consome e envia mensagens da fila principal.', staleAfterSeconds: 180, severity: 'critical' },
  { id: 'webhook_worker', name: 'Webhooks', description: 'Processa eventos recebidos e autoatendimento.', staleAfterSeconds: 180, severity: 'critical' },
  { id: 'health_worker', name: 'Saúde das instâncias', description: 'Sincroniza o estado das conexões Evolution.', staleAfterSeconds: 180, severity: 'warning' },
  { id: 'warmup_worker', name: 'Aquecimento', description: 'Executa ciclos de aquecimento configurados.', staleAfterSeconds: 180, severity: 'warning' },
  { id: 'bull_board', name: 'Bull Board', description: 'Disponibiliza inspeção protegida das filas.', staleAfterSeconds: 180, severity: 'warning' },
  { id: 'ai_worker', name: 'IA conversacional', description: 'Processa respostas do assistente multi-LLM.', staleAfterSeconds: 180, severity: 'warning' },
  { id: 'intelligence_worker', name: 'Intelligence', description: 'Processa relatórios da Lembrado Intelligence.', staleAfterSeconds: 180, severity: 'warning' },
]

export function buildOperationalComponentStates(
  rows: OperationalHeartbeatRow[],
  now = new Date(),
): OperationalComponentState[] {
  const byComponent = new Map(rows.map((row) => [row.component, row]))

  return COMPONENTS.map((component) => {
    const row = byComponent.get(component.id)
    if (!row) return { ...component, status: 'missing', lastSeenAt: null, startedAt: null, version: null }

    const lastSeen = Date.parse(row.last_seen_at)
    const stale = !Number.isFinite(lastSeen) || now.getTime() - lastSeen > component.staleAfterSeconds * 1000
    return {
      ...component,
      status: stale ? 'stale' : row.status === 'degraded' ? 'degraded' : 'online',
      lastSeenAt: row.last_seen_at,
      startedAt: row.started_at,
      version: row.version,
    }
  })
}

export function buildOperationalIncidentSignals(
  components: OperationalComponentState[],
  services: ServiceSignalInput[],
): OperationalIncidentSignal[] {
  const heartbeatSignals = components.flatMap((component): OperationalIncidentSignal[] => {
    if (component.status === 'online') return []
    const missing = component.status === 'missing'
    return [{
      fingerprint: `heartbeat:${component.id}`,
      source: 'heartbeat',
      severity: component.severity,
      title: `${component.name} sem atualização`,
      summary: missing
        ? `${component.name} ainda não publicou heartbeat operacional.`
        : `${component.name} ultrapassou a janela de ${Math.round(component.staleAfterSeconds / 60)} minutos.`,
      evidence: {
        component: component.id,
        status: component.status,
        last_seen_at: component.lastSeenAt,
        stale_after_seconds: component.staleAfterSeconds,
      },
    }]
  })

  const serviceSignals = services.flatMap((service): OperationalIncidentSignal[] => {
    if (service.status === 'online' || service.status === 'unconfigured') return []
    const names: Record<string, string> = { database: 'Supabase', redis: 'Redis', evolution: 'Evolution API' }
    const name = names[service.id] || service.id
    return [{
      fingerprint: `service:${service.id}`,
      source: 'service',
      severity: service.id === 'redis' || service.id === 'database' ? 'critical' : 'warning',
      title: `${name} ${service.status === 'offline' ? 'indisponível' : 'degradado'}`,
      summary: `A verificação operacional classificou ${name} como ${service.status}.`,
      evidence: { service: service.id, status: service.status },
    }]
  })

  return [...heartbeatSignals, ...serviceSignals]
}

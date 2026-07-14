"use client"

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react"
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  Database,
  History,
  Loader2,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
  XCircle,
  Zap,
  type LucideProps,
} from "lucide-react"
import { toast } from "sonner"
import { useAdminCriticalAction } from "@/components/admin-critical-action-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { AdminOperationalRoutineId } from "@/lib/admin-routine-contracts"

const REFRESH_INTERVAL_MS = 30_000

const ROUTINE_NAMES: Record<RoutineId, string> = {
  "reconcile-pix": "reconciliação PIX",
  "schedule-intelligent-collections": "Cobrança Inteligente",
  "release-deferred-contacts": "contatos adiados",
  "recover-intelligence": "recuperação do Intelligence",
  "capture-analytics": "captura do Analytics",
}
type ServiceStatus = "online" | "degraded" | "offline" | "unconfigured"
type RoutineOutcome = "success" | "failure"
type RoutineId = AdminOperationalRoutineId

type ServiceHealth = {
  id: "database" | "redis" | "evolution" | "application"
  status: ServiceStatus
  latencyMs: number | null
  httpStatus?: number | null
  memoryRssMb?: number
  uptimeSeconds?: number
}

type RoutineResult = {
  id: RoutineId
  ok: boolean
  httpStatus: number | null
  durationMs: number | null
  summary: string | null
}

type RoutineLastRun = {
  executedAt: string
  outcome: RoutineOutcome
  durationMs: number | null
  httpStatus: number | null
  summary: string | null
}

type Routine = {
  id: RoutineId
  name: string
  description: string
  lastRun: RoutineLastRun | null
}

type RecentRun = {
  id: string
  executedAt: string
  outcome: RoutineOutcome
  reason: string | null
  failedCount: number | null
  results: RoutineResult[]
}

type OperationalComponent = {
  id: string
  name: string
  description: string
  status: "online" | "degraded" | "stale" | "missing"
  lastSeenAt: string | null
  startedAt: string | null
  version: string | null
  staleAfterSeconds: number
  severity: "warning" | "critical"
}

type OperationalIncident = {
  id: string
  severity: "warning" | "critical"
  status: "open" | "acknowledged" | "resolved"
  title: string
  summary: string
  occurrence_count: number
  first_seen_at: string
  last_seen_at: string
  acknowledged_at: string | null
  resolved_at: string | null
}

type HealthData = {
  checkedAt: string
  durationMs: number
  services: ServiceHealth[]
  routines: {
    available: boolean
    items: Routine[]
    recentRuns: RecentRun[]
  }
  operations: {
    available: boolean
    staleAfterSeconds: number
    components: OperationalComponent[]
    incidents: {
      available: boolean
      activeCount: number
      criticalCount: number
      items: OperationalIncident[]
    }
  }
}

type HealthResponse = {
  data: HealthData
  meta: { refreshIntervalMs: number }
}

const SERVICE_PRESENTATION: Record<ServiceHealth["id"], {
  name: string
  description: string
  icon: ComponentType<LucideProps>
}> = {
  database: {
    name: "Supabase / PostgreSQL",
    description: "Consulta real pela camada de dados",
    icon: Database,
  },
  redis: {
    name: "Redis / BullMQ",
    description: "Ping no Redis usado pelas filas",
    icon: Activity,
  },
  evolution: {
    name: "Evolution API",
    description: "Disponibilidade do endpoint configurado",
    icon: Zap,
  },
  application: {
    name: "Aplicação Node.js",
    description: "Processo que atendeu esta verificação",
    icon: Server,
  },
}

const STATUS_PRESENTATION: Record<ServiceStatus, { label: string; classes: string; dot: string }> = {
  online: {
    label: "Operacional",
    classes: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  degraded: {
    label: "Degradado",
    classes: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  offline: {
    label: "Indisponível",
    classes: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300",
    dot: "bg-red-500",
  },
  unconfigured: {
    label: "Não configurado",
    classes: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
}

const COMPONENT_STATUS_PRESENTATION: Record<OperationalComponent["status"], { label: string; classes: string; dot: string }> = {
  online: { label: "Ativo", classes: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  degraded: { label: "Degradado", classes: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  stale: { label: "Atrasado", classes: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300", dot: "bg-red-500" },
  missing: { label: "Sem heartbeat", classes: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300", dot: "bg-red-500" },
}

function formatTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date)
}

function formatDuration(value: number | null) {
  if (value === null) return "Não informado"
  if (value < 1_000) return `${value} ms`
  return `${(value / 1_000).toFixed(1)} s`
}

function formatUptime(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  if (days) return `${days}d ${hours}h`
  if (hours) return `${hours}h ${minutes}min`
  return `${minutes}min`
}

function getApiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback
  const error = "error" in payload ? payload.error : null
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message
  }
  return fallback
}

function isHealthResponse(payload: unknown): payload is HealthResponse {
  if (!payload || typeof payload !== "object" || !("data" in payload)) return false
  const data = payload.data
  if (!data || typeof data !== "object") return false
  if (!("services" in data) || !Array.isArray(data.services)) return false
  if (!("checkedAt" in data) || typeof data.checkedAt !== "string") return false
  if (!("durationMs" in data) || typeof data.durationMs !== "number") return false
  if (!("routines" in data) || !data.routines || typeof data.routines !== "object") return false
  return "items" in data.routines
    && Array.isArray(data.routines.items)
    && "recentRuns" in data.routines
    && Array.isArray(data.routines.recentRuns)
    && "available" in data.routines
    && typeof data.routines.available === "boolean"
    && "operations" in data
    && Boolean(data.operations)
    && typeof data.operations === "object"
}

function describeRun(run: RecentRun) {
  if (run.failedCount === null) {
    return run.outcome === "failure" ? "Falha antes do início das rotinas" : "Resultado individual não registrado"
  }
  if (run.failedCount === 0) return `${run.results.length} rotina(s) · nenhuma falha`
  const failedNames = run.results
    .filter((result) => !result.ok)
    .map((result) => ROUTINE_NAMES[result.id])
    .join(", ")
  return `${run.failedCount} falha(s): ${failedNames}`
}

function ServiceCard({ service }: { service: ServiceHealth }) {
  const presentation = SERVICE_PRESENTATION[service.id]
  const status = STATUS_PRESENTATION[service.status]
  const Icon = presentation.icon

  return (
    <Card className="relative overflow-hidden border-border/70 shadow-sm">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${status.dot}`} />
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="rounded-xl border bg-secondary/40 p-2.5">
            <Icon className="h-5 w-5 text-foreground/80" />
          </div>
          <Badge variant="outline" className={status.classes}>
            <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </Badge>
        </div>
        <div>
          <CardTitle className="text-base">{presentation.name}</CardTitle>
          <CardDescription className="mt-1">{presentation.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 border-t bg-secondary/10 pt-4 text-sm">
        {service.latencyMs !== null && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Latência</span>
            <span className="font-mono font-medium tabular-nums">{service.latencyMs} ms</span>
          </div>
        )}
        {service.httpStatus !== undefined && service.httpStatus !== null && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Resposta HTTP</span>
            <span className="font-mono font-medium">{service.httpStatus}</span>
          </div>
        )}
        {service.memoryRssMb !== undefined && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Memória RSS</span>
            <span className="font-mono font-medium tabular-nums">{service.memoryRssMb} MB</span>
          </div>
        )}
        {service.uptimeSeconds !== undefined && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Uptime do processo</span>
            <span className="font-medium tabular-nums">{formatUptime(service.uptimeSeconds)}</span>
          </div>
        )}
        {service.status === "unconfigured" && (
          <p className="text-muted-foreground">A variável de ambiente necessária não está definida.</p>
        )}
      </CardContent>
    </Card>
  )
}

function InitialLoading() {
  return (
    <div className="space-y-6" aria-label="Carregando saúde do sistema">
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <Skeleton className="h-36 w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-56 rounded-xl" />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-80 rounded-xl xl:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  )
}

export default function SystemPage() {
  const confirmCritical = useAdminCriticalAction()
  const requestRef = useRef<AbortController | null>(null)
  const [health, setHealth] = useState<HealthData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [acknowledgingIncidentId, setAcknowledgingIncidentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchHealth = useCallback(async () => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setIsRefreshing(true)

    try {
      const response = await fetch("/api/admin/health", {
        cache: "no-store",
        signal: controller.signal,
      })
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(getApiError(payload, "Não foi possível consultar a saúde do sistema"))
      if (!isHealthResponse(payload)) throw new Error("A API de saúde retornou um contrato inválido")
      setHealth(payload.data)
      setError(null)
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar a saúde do sistema")
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    const initialRequest = window.setTimeout(() => void fetchHealth(), 0)
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchHealth()
    }, REFRESH_INTERVAL_MS)

    return () => {
      window.clearTimeout(initialRequest)
      window.clearInterval(interval)
      requestRef.current?.abort()
    }
  }, [fetchHealth])

  const executeRoutines = async () => {
    const critical = await confirmCritical({
      title: "Executar rotinas operacionais",
      description: "A execução reconcilia dados e prepara trabalhos idempotentes. Mensagens permanecem protegidas pelas filas e reservas de contato.",
      confirmationText: "EXECUTAR ROTINAS",
    })
    if (!critical) return

    setIsExecuting(true)
    try {
      const response = await fetch("/api/admin/force-cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(critical),
      })
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(getApiError(payload, "Uma ou mais rotinas falharam"))
      toast.success("Rotinas operacionais concluídas")
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível executar as rotinas")
    } finally {
      setIsExecuting(false)
      void fetchHealth()
    }
  }

  const acknowledgeIncident = async (incident: OperationalIncident) => {
    const critical = await confirmCritical({
      title: "Reconhecer incidente",
      description: `${incident.title}. O reconhecimento registra que o evento está sendo acompanhado; a resolução permanece automática quando o serviço se recuperar.`,
      confirmationText: "RECONHECER INCIDENTE",
    })
    if (!critical) return

    setAcknowledgingIncidentId(incident.id)
    try {
      const response = await fetch(`/api/admin/incidents/${incident.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...critical, action: "acknowledge" }),
      })
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(getApiError(payload, "Não foi possível reconhecer o incidente"))
      toast.success("Incidente reconhecido")
      await fetchHealth()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível reconhecer o incidente")
    } finally {
      setAcknowledgingIncidentId(null)
    }
  }

  if (isLoading && !health) return <InitialLoading />

  if (!health) {
    return (
      <Card className="border-red-500/20">
        <CardContent className="flex min-h-72 flex-col items-center justify-center gap-4 text-center">
          <div className="rounded-full bg-red-500/10 p-3">
            <AlertTriangle className="h-6 w-6 text-red-500" />
          </div>
          <div className="space-y-1">
            <h2 className="font-semibold">Saúde do sistema indisponível</h2>
            <p className="max-w-md text-sm text-muted-foreground">{error || "A consulta não retornou dados."}</p>
          </div>
          <Button variant="outline" onClick={() => void fetchHealth()} disabled={isRefreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    )
  }

  const operationalCount = health.services.filter((service) => service.status === "online").length
  const offlineCount = health.services.filter((service) => service.status === "offline").length
  const degradedCount = health.services.filter((service) => service.status === "degraded").length
  const unconfiguredCount = health.services.filter((service) => service.status === "unconfigured").length
  const unhealthyComponents = health.operations.components.filter((component) => component.status !== "online").length
  const requiresAttention = offlineCount > 0 || degradedCount > 0 || health.operations.incidents.activeCount > 0
  const overallLabel = requiresAttention ? "Requer atenção" : unconfiguredCount > 0 ? "Configuração parcial" : "Todos operacionais"
  const OverallIcon = requiresAttention ? AlertTriangle : CheckCircle2

  return (
    <div className="flex flex-col space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Sistema e rotinas</h2>
          <p className="mt-1 text-muted-foreground">Saúde da infraestrutura e execução auditada das rotinas operacionais.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-xs text-muted-foreground">
            <p>Atualizado em {formatTimestamp(health.checkedAt)}</p>
            <p>Automático a cada 30 s com a aba visível</p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => void fetchHealth()}
            disabled={isRefreshing}
            aria-label="Atualizar saúde do sistema"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm" role="status">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-200">Não foi possível atualizar agora</p>
            <p className="text-amber-700/80 dark:text-amber-300/80">{error}. Os últimos dados válidos continuam visíveis.</p>
          </div>
        </div>
      )}

      <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-secondary/50 via-background to-background shadow-sm">
        <CardContent className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
          <div className="flex items-start gap-4">
            <div className={`rounded-2xl p-3 ${requiresAttention ? "bg-amber-500/10" : "bg-emerald-500/10"}`}>
              <OverallIcon className={`h-7 w-7 ${requiresAttention ? "text-amber-600" : "text-emerald-600"}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Estado consolidado</p>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight">{overallLabel}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {operationalCount} de {health.services.length} serviços e {health.operations.components.length - unhealthyComponents} de {health.operations.components.length} processos operacionais · verificação em {formatDuration(health.durationMs)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border bg-background/80 px-4 py-3 text-sm shadow-sm">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="font-medium">Acesso Master Admin</p>
              <p className="text-xs text-muted-foreground">Dados de infraestrutura protegidos</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {health.services.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
            <Server className="h-6 w-6 text-muted-foreground" />
            <p className="font-medium">Nenhum serviço retornado</p>
            <p className="text-sm text-muted-foreground">A API respondeu sem verificações de infraestrutura.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {health.services.map((service) => <ServiceCard key={service.id} service={service} />)}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="border-b bg-secondary/10">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-muted-foreground" />
              Processos e workers
            </CardTitle>
            <CardDescription>Heartbeat persistido a cada minuto; atraso após {Math.round(health.operations.staleAfterSeconds / 60)} minutos.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {!health.operations.available ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-6 text-center">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
                <p className="font-medium">Telemetria ainda indisponível</p>
                <p className="max-w-md text-sm text-muted-foreground">Aplique a migração da Etapa 3 e reinicie os workers para iniciar os heartbeats.</p>
              </div>
            ) : (
              <div className="divide-y">
                {health.operations.components.map((component) => {
                  const status = COMPONENT_STATUS_PRESENTATION[component.status]
                  return (
                    <div key={component.id} className="flex items-center justify-between gap-4 p-4">
                      <div className="min-w-0">
                        <p className="font-medium">{component.name}</p>
                        <p className="truncate text-xs text-muted-foreground" title={component.description}>{component.description}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {component.lastSeenAt ? `Último sinal ${formatTimestamp(component.lastSeenAt)}` : "Nenhum sinal registrado"}
                        </p>
                      </div>
                      <Badge variant="outline" className={`shrink-0 ${status.classes}`}>
                        <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="border-b bg-secondary/10">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BellRing className="h-5 w-5 text-muted-foreground" />
              Central de incidentes
              {health.operations.incidents.activeCount > 0 && (
                <Badge variant="destructive" className="ml-auto">{health.operations.incidents.activeCount} ativo(s)</Badge>
              )}
            </CardTitle>
            <CardDescription>Eventos são abertos e resolvidos automaticamente conforme a recuperação dos serviços.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {!health.operations.incidents.available ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-6 text-center">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
                <p className="font-medium">Incidentes indisponíveis</p>
                <p className="text-sm text-muted-foreground">A persistência de incidentes ainda não está acessível.</p>
              </div>
            ) : health.operations.incidents.items.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-6 text-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                <p className="font-medium">Nenhum incidente registrado</p>
                <p className="text-sm text-muted-foreground">Os serviços e processos monitorados estão sem ocorrências.</p>
              </div>
            ) : (
              <div className="divide-y">
                {health.operations.incidents.items.slice(0, 8).map((incident) => (
                  <div key={incident.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{incident.title}</p>
                          <Badge variant="outline" className={incident.severity === "critical"
                            ? "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300"
                            : "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"}>
                            {incident.severity === "critical" ? "Crítico" : "Alerta"}
                          </Badge>
                          {incident.status === "acknowledged" && <Badge variant="secondary">Reconhecido</Badge>}
                          {incident.status === "resolved" && <Badge variant="outline">Resolvido</Badge>}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{incident.summary}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Última ocorrência {formatTimestamp(incident.last_seen_at)}</p>
                      </div>
                      {incident.status === "open" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={Boolean(acknowledgingIncidentId)}
                          onClick={() => void acknowledgeIncident(incident)}
                        >
                          {acknowledgingIncidentId === incident.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                          Reconhecer
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-border/70 shadow-sm xl:col-span-2">
          <CardHeader className="flex flex-col gap-4 border-b bg-secondary/10 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5 text-muted-foreground" />
                Rotinas operacionais
              </CardTitle>
              <CardDescription className="mt-1">Execução em ordem, com reautenticação, motivo, idempotência e auditoria.</CardDescription>
            </div>
            <Button variant="destructive" onClick={() => void executeRoutines()} disabled={isExecuting}>
              {isExecuting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              {isExecuting ? "Executando…" : "Executar agora"}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {!health.routines.available ? (
              <div className="flex min-h-52 flex-col items-center justify-center gap-2 p-6 text-center">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
                <p className="font-medium">Histórico operacional indisponível</p>
                <p className="max-w-md text-sm text-muted-foreground">A saúde dos serviços foi carregada, mas os registros de auditoria não puderam ser consultados.</p>
              </div>
            ) : health.routines.items.length === 0 ? (
              <div className="flex min-h-52 flex-col items-center justify-center gap-2 p-6 text-center">
                <Clock className="h-6 w-6 text-muted-foreground" />
                <p className="font-medium">Nenhuma rotina disponível</p>
                <p className="text-sm text-muted-foreground">A API não retornou rotinas operacionais.</p>
              </div>
            ) : (
              <div className="divide-y">
                {health.routines.items.map((routine, index) => (
                  <div key={routine.id} className="grid gap-4 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-start">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border bg-secondary/30 font-mono text-sm font-semibold">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">{routine.name}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{routine.description}</p>
                      {routine.lastRun?.summary && (
                        <p className="mt-2 truncate text-xs text-muted-foreground" title={routine.lastRun.summary}>{routine.lastRun.summary}</p>
                      )}
                    </div>
                    {routine.lastRun ? (
                      <div className="space-y-1 text-left sm:text-right">
                        <Badge
                          variant="outline"
                          className={routine.lastRun.outcome === "success"
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300"}
                        >
                          {routine.lastRun.outcome === "success" ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
                          {routine.lastRun.outcome === "success" ? "Sucesso" : "Falha"}
                        </Badge>
                        <p className="text-xs text-muted-foreground">{formatTimestamp(routine.lastRun.executedAt)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDuration(routine.lastRun.durationMs)}
                          {routine.lastRun.httpStatus !== null ? ` · HTTP ${routine.lastRun.httpStatus}` : ""}
                        </p>
                      </div>
                    ) : (
                      <Badge variant="outline" className="w-fit text-muted-foreground">Sem execução registrada</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="border-b bg-secondary/10">
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="h-5 w-5 text-muted-foreground" />
              Histórico e falhas
            </CardTitle>
            <CardDescription>Últimas execuções manuais registradas na auditoria.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {!health.routines.available ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Histórico indisponível.</div>
            ) : health.routines.recentRuns.length === 0 ? (
              <div className="flex min-h-52 flex-col items-center justify-center gap-2 p-6 text-center">
                <History className="h-6 w-6 text-muted-foreground" />
                <p className="font-medium">Ainda não há execuções</p>
                <p className="text-sm text-muted-foreground">A primeira execução auditada aparecerá aqui.</p>
              </div>
            ) : (
              <div className="divide-y">
                {health.routines.recentRuns.slice(0, 5).map((run) => (
                  <div key={run.id} className="space-y-2 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <Badge
                        variant="outline"
                        className={run.outcome === "success"
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300"}
                      >
                        {run.outcome === "success" ? "Concluída" : "Falhou"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatTimestamp(run.executedAt)}</span>
                    </div>
                    {run.reason && <p className="line-clamp-2 text-sm" title={run.reason}>{run.reason}</p>}
                    <p className="text-xs text-muted-foreground">{describeRun(run)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

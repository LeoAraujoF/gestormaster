"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Gauge,
  HardDrive,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ServerCog,
  Trash2,
  UsersRound,
} from "lucide-react"
import { toast } from "sonner"

import { useAdminCriticalAction } from "@/components/admin-critical-action-provider"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { HeartbeatSummary, QueueTelemetryResponse } from "./queue-telemetry"
import type { AdminQueueAction } from "@/app/api/admin/queues/actions/_contracts"

const REFRESH_INTERVAL_MS = 15_000

const componentLabels: Record<string, string> = {
  scheduler: "Agendador",
  message_worker: "Worker de mensagens",
  webhook_worker: "Worker de webhooks",
  ai_worker: "Worker de IA",
  redis: "Redis",
  database: "Banco de dados",
  evolution: "Evolution API",
}

const queueActionPresentation: Record<AdminQueueAction, {
  title: string
  description: (queueLabel: string) => string
  confirmation: (queueName: string) => string
}> = {
  pause: {
    title: "Pausar fila",
    description: (label) => `Novos jobs de ${label} continuarão sendo recebidos, mas não serão processados até a retomada. Jobs ativos podem concluir.`,
    confirmation: (name) => `PAUSAR ${name}`,
  },
  resume: {
    title: "Retomar fila",
    description: (label) => `O processamento pendente de ${label} será retomado pelos workers disponíveis.`,
    confirmation: (name) => `RETOMAR ${name}`,
  },
  retry_failed: {
    title: "Repetir jobs falhos",
    description: (label) => `Até 100 jobs falhos mais antigos de ${label} voltarão para processamento. A idempotência de cada fluxo continua sendo aplicada.`,
    confirmation: (name) => `REPETIR FALHOS ${name}`,
  },
  clean_failed: {
    title: "Limpar falhas antigas",
    description: (label) => `Falhas de ${label} retidas há mais de 24 horas serão removidas, até o limite de 1.000 registros. Jobs ativos e pendentes não serão alterados.`,
    confirmation: (name) => `LIMPAR FALHOS ${name}`,
  },
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value)
}

function formatDateTime(value: string | null) {
  if (!value) return "Sem registro"
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value))
}

function getErrorMessage(payload: unknown, status: number) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error
    if (typeof error === "string") return error
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message
  }
  return status === 503 ? "A telemetria de filas está temporariamente indisponível." : "Não foi possível carregar a telemetria de filas."
}

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  tone = "default",
}: {
  title: string
  value: string
  description: string
  icon: typeof Activity
  tone?: "default" | "warning" | "danger"
}) {
  return (
    <Card size="sm" className={cn(tone === "danger" && "ring-destructive/30", tone === "warning" && "ring-amber-500/30")}>
      <CardHeader className="grid grid-cols-[1fr_auto] items-center gap-3">
        <CardDescription>{title}</CardDescription>
        <span className={cn(
          "flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground",
          tone === "danger" && "bg-destructive/10 text-destructive",
          tone === "warning" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        )}>
          <Icon className="size-4" />
        </span>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

function LoadingState() {
  return (
    <div className="space-y-6" aria-label="Carregando telemetria de filas">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card size="sm" key={index}>
            <CardHeader><Skeleton className="h-4 w-28" /></CardHeader>
            <CardContent className="space-y-2"><Skeleton className="h-8 w-20" /><Skeleton className="h-3 w-40" /></CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><Skeleton className="h-5 w-44" /><Skeleton className="h-4 w-72 max-w-full" /></CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }, (_, index) => <Skeleton className="h-10 w-full" key={index} />)}
        </CardContent>
      </Card>
    </div>
  )
}

function HeartbeatStatus({ summary }: { summary: HeartbeatSummary }) {
  if (summary.reportedOffline > 0) return <Badge variant="destructive">Offline reportado</Badge>
  if (summary.reportedDegraded > 0) return <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">Degradado reportado</Badge>
  if (summary.stale > 0) return <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">Sem atualização recente</Badge>
  return <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Saudável reportado</Badge>
}

export function QueueDashboard() {
  const confirmCritical = useAdminCriticalAction()
  const [data, setData] = useState<QueueTelemetryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setIsRefreshing(true)
    try {
      const response = await fetch("/api/admin/queues", {
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      })
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(getErrorMessage(payload, response.status))
      setData(payload as QueueTelemetryResponse)
      setError(null)
    } catch (refreshError) {
      if (controller.signal.aborted) return
      setError(refreshError instanceof Error ? refreshError.message : "Não foi possível carregar a telemetria de filas.")
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setIsRefreshing(false)
      }
    }
  }, [])

  const runQueueAction = async (
    queue: QueueTelemetryResponse["queues"][number],
    action: AdminQueueAction,
  ) => {
    const presentation = queueActionPresentation[action]
    const critical = await confirmCritical({
      title: presentation.title,
      description: presentation.description(queue.label),
      confirmationText: presentation.confirmation(queue.name),
    })
    if (!critical) return

    const actionKey = `${queue.name}:${action}`
    setPendingAction(actionKey)
    try {
      const response = await fetch("/api/admin/queues/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...critical,
          queue: queue.name,
          action,
          ...(action === "retry_failed" ? { limit: 100 } : {}),
          ...(action === "clean_failed" ? { limit: 1000, olderThanMinutes: 1_440 } : {}),
        }),
      })
      const payload = await response.json().catch(() => null) as {
        data?: { affected?: number }
        error?: { message?: string }
      } | null
      if (!response.ok) throw new Error(payload?.error?.message || "Não foi possível executar a ação na fila")

      const affected = Number(payload?.data?.affected || 0)
      if (action === "pause") toast.success(`${queue.label} pausada`)
      else if (action === "resume") toast.success(`${queue.label} retomada`)
      else if (action === "retry_failed") toast.success(`${affected} job(s) encaminhado(s) para nova tentativa`)
      else toast.success(`${affected} falha(s) antiga(s) removida(s)`)
      await refresh()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível executar a ação na fila")
    } finally {
      setPendingAction(null)
    }
  }

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0)
    return () => {
      window.clearTimeout(initialRefresh)
      abortRef.current?.abort()
    }
  }, [refresh])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = window.setInterval(() => {
      if (!document.hidden) void refresh()
    }, REFRESH_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [autoRefresh, refresh])

  const retainedJobs = data
    ? data.totals.backlog + data.totals.active + data.totals.completed + data.totals.failed
    : 0
  const heartbeatReports = data?.heartbeats.summaries.reduce((total, summary) => total + summary.reports, 0) ?? 0

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ServerCog className="size-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-[-0.025em]">Filas e workers</h1>
              <p className="text-sm text-muted-foreground">Snapshot operacional do BullMQ e dos heartbeats persistidos.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data?.bullBoard.available ? (
            <a
              href="/api/admin/queues-redirect"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Bull Board somente leitura
              <ExternalLink data-icon="inline-end" />
            </a>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setAutoRefresh((current) => !current)}>
            {autoRefresh ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
            {autoRefresh ? "Pausar atualização" : "Ativar atualização"}
          </Button>
          <Button size="sm" onClick={() => void refresh()} disabled={isRefreshing}>
            <RefreshCw data-icon="inline-start" className={cn(isRefreshing && "animate-spin")} />
            Atualizar agora
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", autoRefresh ? "bg-emerald-500" : "bg-muted-foreground/50")} />
          {autoRefresh ? "Atualização automática a cada 15 segundos" : "Atualização automática pausada"}
        </span>
        <span aria-live="polite">
          {data ? `Snapshot: ${formatDateTime(data.generatedAt)} · Redis: ${data.redis.latencyMs} ms` : "Aguardando primeiro snapshot"}
        </span>
      </div>

      {error ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Falha ao atualizar a telemetria</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{error}{data ? " O último snapshot válido permanece visível." : ""}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={isRefreshing}>Tentar novamente</Button>
        </div>
      ) : null}

      {!data && isRefreshing ? <LoadingState /> : null}

      {!data && !isRefreshing && !error ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhum snapshot disponível.</CardContent></Card>
      ) : null}

      {data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo das filas">
            <MetricCard
              title="Backlog atual"
              value={formatNumber(data.totals.backlog)}
              description="Aguardando, adiados, priorizados, dependentes ou pausados."
              icon={Gauge}
              tone={data.totals.backlog > 0 ? "warning" : "default"}
            />
            <MetricCard
              title="Em processamento"
              value={formatNumber(data.totals.active)}
              description="Jobs ativos neste snapshot."
              icon={Activity}
            />
            <MetricCard
              title="Workers conectados"
              value={data.totals.workersComplete ? formatNumber(data.totals.workers) : `${formatNumber(data.totals.workers)}+`}
              description={data.totals.workersComplete ? "Clientes worker conhecidos pelo Redis." : "Contagem parcial; ao menos uma fila não informou workers."}
              icon={UsersRound}
            />
            <MetricCard
              title="Falhas retidas"
              value={formatNumber(data.totals.failed)}
              description="Jobs com falha ainda armazenados pelo BullMQ."
              icon={AlertCircle}
              tone={data.totals.failed > 0 ? "danger" : "default"}
            />
          </section>

          {retainedJobs === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-sm font-medium">Nenhum job retido neste snapshot</p>
                <p className="text-xs text-muted-foreground">Os contadores atuais de backlog, ativos, concluídos e falhos são zero.</p>
              </div>
            </div>
          ) : null}

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2"><HardDrive className="size-4 text-muted-foreground" /> Filas BullMQ</CardTitle>
              <CardDescription>Contadores instantâneos do Redis. Concluídos e falhos refletem apenas a retenção configurada de cada fila.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Fila</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Backlog</TableHead>
                    <TableHead className="text-right">Ativos</TableHead>
                    <TableHead className="text-right">Workers</TableHead>
                    <TableHead className="text-right">Concluídos retidos</TableHead>
                    <TableHead className="text-right">Falhas retidas</TableHead>
                    <TableHead className="text-right">Última falha retida</TableHead>
                    <TableHead className="pr-4 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.queues.map((queue) => (
                    <TableRow key={queue.name}>
                      <TableCell className="pl-4">
                        <div className="font-medium">{queue.label}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{queue.name}</div>
                      </TableCell>
                      <TableCell>
                        {queue.isPaused
                          ? <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">Pausada</Badge>
                          : <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Processando</Badge>}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatNumber(queue.backlog)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(queue.counts.active)}</TableCell>
                      <TableCell className="text-right tabular-nums">{queue.workers === null ? "Indisponível" : formatNumber(queue.workers)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(queue.counts.completed)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", queue.counts.failed > 0 && "font-medium text-destructive")}>{formatNumber(queue.counts.failed)}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{formatDateTime(queue.latestFailureAt)}</TableCell>
                      <TableCell className="pr-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Ações da fila ${queue.label}`}
                              disabled={Boolean(pendingAction)}
                            >
                              {pendingAction?.startsWith(`${queue.name}:`)
                                ? <RefreshCw className="animate-spin" />
                                : <MoreHorizontal />}
                            </Button>
                          } />
                          <DropdownMenuContent align="end" className="w-56">
                            {queue.isPaused ? (
                              <DropdownMenuItem onSelect={() => void runQueueAction(queue, "resume")}>
                                <Play /> Retomar processamento
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onSelect={() => void runQueueAction(queue, "pause")}>
                                <Pause /> Pausar processamento
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled={queue.counts.failed === 0} onSelect={() => void runQueueAction(queue, "retry_failed")}>
                              <RotateCcw /> Repetir até 100 falhos
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={queue.counts.failed === 0}
                              onSelect={() => void runQueueAction(queue, "clean_failed")}
                            >
                              <Trash2 /> Limpar falhos com mais de 24h
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2"><Clock3 className="size-4 text-muted-foreground" /> Heartbeats persistidos</CardTitle>
              <CardDescription>
                Agregados por componente, sem identificar organizações. Um registro é considerado sem atualização recente após {Math.round(data.heartbeats.staleAfterSeconds / 60)} minutos.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {!data.heartbeats.available ? (
                <div className="flex items-start gap-3 px-4 py-8">
                  <AlertCircle className="mt-0.5 size-5 text-amber-600 dark:text-amber-400" />
                  <div>
                    <p className="font-medium">Heartbeats indisponíveis</p>
                    <p className="mt-1 text-sm text-muted-foreground">A leitura da tabela de heartbeats não respondeu; os dados das filas acima continuam válidos.</p>
                  </div>
                </div>
              ) : heartbeatReports === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="font-medium">Nenhum heartbeat persistido</p>
                  <p className="mt-1 text-sm text-muted-foreground">A tabela respondeu com sucesso, mas ainda não contém registros.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Componente</TableHead>
                      <TableHead>Status observado</TableHead>
                      <TableHead className="text-right">Relatórios</TableHead>
                      <TableHead className="text-right">Sem atualização recente</TableHead>
                      <TableHead className="pr-4 text-right">Mais recente</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.heartbeats.summaries.map((summary) => (
                      <TableRow key={summary.component}>
                        <TableCell className="pl-4 font-medium">{componentLabels[summary.component] ?? summary.component}</TableCell>
                        <TableCell><HeartbeatStatus summary={summary} /></TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(summary.reports)}</TableCell>
                        <TableCell className={cn("text-right tabular-nums", summary.stale > 0 && "font-medium text-amber-700 dark:text-amber-300")}>{formatNumber(summary.stale)}</TableCell>
                        <TableCell className="pr-4 text-right text-xs text-muted-foreground">{formatDateTime(summary.latestSeenAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {!data.bullBoard.available ? (
            <div className="rounded-xl border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              O Bull Board não é exibido nesta página. O acesso externo só é liberado com URL HTTPS válida, modo somente leitura atestado e autenticação Master recente.
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

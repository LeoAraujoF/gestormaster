"use client"

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleX,
  Download,
  FileSearch,
  Filter,
  Fingerprint,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  UserRound,
} from "lucide-react"
import { toast } from "sonner"

import { useAdminCriticalAction } from "@/components/admin-critical-action-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type AuditOutcome = "success" | "failure"

type AuditLog = {
  id: string
  action: string
  resource: string
  resourceId: string | null
  details: unknown
  ipAddress: string | null
  correlationId: string | null
  outcome: AuditOutcome
  reason: string | null
  createdAt: string
  actor: { id: string; email: string | null } | null
}

type FilterDraft = {
  from: string
  to: string
  action: string
  outcome: "all" | AuditOutcome
  correlationId: string
}

type ApiFilters = {
  from?: string
  to?: string
  action?: string
  outcome?: AuditOutcome
  correlationId?: string
}

type AuditResponse = {
  data: AuditLog[]
  meta: { nextCursor: string | null; pageSize: number }
}

const EMPTY_FILTERS: FilterDraft = {
  from: "",
  to: "",
  action: "",
  outcome: "all",
  correlationId: "",
}

function toApiFilters(filters: FilterDraft): ApiFilters {
  return {
    from: filters.from ? new Date(filters.from).toISOString() : undefined,
    to: filters.to ? new Date(filters.to).toISOString() : undefined,
    action: filters.action.trim() || undefined,
    outcome: filters.outcome === "all" ? undefined : filters.outcome,
    correlationId: filters.correlationId.trim() || undefined,
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value))
}

function shortId(value: string, size = 8) {
  return value.length > size ? `${value.slice(0, size)}…` : value
}

function actorLabel(log: AuditLog) {
  if (!log.actor) return "Sistema"
  return log.actor.email || shortId(log.actor.id, 12)
}

function OutcomeBadge({ outcome }: { outcome: AuditOutcome }) {
  return outcome === "success" ? (
    <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
      <CheckCircle2 aria-hidden="true" className="size-3.5" /> Sucesso
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300">
      <CircleX aria-hidden="true" className="size-3.5" /> Falha
    </Badge>
  )
}

function DetailsContent({ log }: { log: AuditLog }) {
  const serializedDetails = log.details === null ? null : JSON.stringify(log.details, null, 2)

  return (
    <div className="space-y-6 px-5 pb-6 sm:px-6">
      <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resultado</p>
          <div className="mt-1"><OutcomeBadge outcome={log.outcome} /></div>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Data e hora</p>
          <p className="mt-1 font-medium">{formatDate(log.createdAt)}</p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ação</p>
          <p className="mt-1 break-all font-mono text-xs">{log.action}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recurso</p>
          <p className="mt-1 break-all">{log.resource}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">ID do recurso</p>
          <p className="mt-1 break-all font-mono text-xs">{log.resourceId || "—"}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ator</p>
          <p className="mt-1 break-all">{actorLabel(log)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">IP</p>
          <p className="mt-1 break-all font-mono text-xs">{log.ipAddress || "—"}</p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Correlation ID</p>
          <p className="mt-1 break-all font-mono text-xs">{log.correlationId || "—"}</p>
        </div>
      </div>

      {log.reason && (
        <section aria-labelledby="audit-reason-heading">
          <h3 id="audit-reason-heading" className="text-sm font-semibold">Motivo registrado</h3>
          <p className="mt-2 whitespace-pre-wrap rounded-lg border bg-background p-3 text-sm">{log.reason}</p>
        </section>
      )}

      <section aria-labelledby="audit-details-heading">
        <div className="flex items-center justify-between gap-3">
          <h3 id="audit-details-heading" className="text-sm font-semibold">Detalhes redigidos</h3>
          <Badge variant="secondary">Sanitizado no servidor</Badge>
        </div>
        {serializedDetails ? (
          <pre className="mt-2 max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-zinc-950 p-4 font-mono text-xs leading-5 text-zinc-100">
            {serializedDetails}
          </pre>
        ) : (
          <p className="mt-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhum detalhe adicional foi registrado.</p>
        )}
      </section>
    </div>
  )
}

export default function AuditPage() {
  const confirmCritical = useAdminCriticalAction()
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTERS)
  const [filters, setFilters] = useState<ApiFilters>({})
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ limit: "50" })
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
    return params.toString()
  }, [filters])

  const fetchLogs = useCallback(async (cursor: string | null, append: boolean, signal?: AbortSignal) => {
    if (append) setIsLoadingMore(true)
    else setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams(queryString)
      if (cursor) params.set("cursor", cursor)
      const response = await fetch(`/api/admin/audit?${params}`, { cache: "no-store", signal })
      const payload = await response.json().catch(() => null) as AuditResponse | { error?: { message?: string } } | null
      if (!response.ok) {
        const message = payload && "error" in payload ? payload.error?.message : null
        throw new Error(message || "Não foi possível carregar os registros de auditoria.")
      }
      const data = payload as AuditResponse
      setLogs((current) => append ? [...current, ...data.data] : data.data)
      setNextCursor(data.meta.nextCursor)
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os registros de auditoria.")
      if (!append) {
        setLogs([])
        setNextCursor(null)
      }
    } finally {
      if (!signal?.aborted) {
        if (append) setIsLoadingMore(false)
        else setIsLoading(false)
      }
    }
  }, [queryString])

  useEffect(() => {
    const controller = new AbortController()
    const task = window.setTimeout(() => {
      setSelectedLog(null)
      void fetchLogs(null, false, controller.signal)
    }, 0)
    return () => {
      window.clearTimeout(task)
      controller.abort()
    }
  }, [fetchLogs, refreshKey])

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (draft.from && draft.to && new Date(draft.from) > new Date(draft.to)) {
      setError("A data inicial deve ser anterior à data final.")
      return
    }
    setFilters(toApiFilters(draft))
    setRefreshKey((value) => value + 1)
  }

  const clearFilters = () => {
    setDraft(EMPTY_FILTERS)
    setFilters({})
    setRefreshKey((value) => value + 1)
  }

  const exportAudit = async () => {
    if (!filters.from || !filters.to) {
      toast.error("Defina o início e o fim do período antes de exportar.")
      return
    }
    const confirmation = await confirmCritical({
      title: "Exportar auditoria",
      description: "A exportação contém dados operacionais sensíveis. Confirme sua identidade e registre o motivo do acesso.",
      confirmationText: "EXPORTAR AUDITORIA",
    })
    if (!confirmation) return

    setIsExporting(true)
    try {
      const response = await fetch("/api/admin/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...confirmation, filters }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null
        throw new Error(payload?.error?.message || "Não foi possível exportar a auditoria.")
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success("Exportação segura concluída.")
      setRefreshKey((value) => value + 1)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível exportar a auditoria.")
    } finally {
      setIsExporting(false)
    }
  }

  const loadedSuccesses = logs.filter((log) => log.outcome === "success").length
  const loadedFailures = logs.length - loadedSuccesses
  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="max-w-2xl">
          <div className="mb-2 flex items-center gap-2 text-danger">
            <ShieldCheck aria-hidden="true" className="size-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">Admin Master</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Explorador de auditoria</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Investigue eventos reais por período, ação, resultado e correlation ID. Campos sensíveis são redigidos no servidor.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={isLoading || isExporting}
            onClick={() => setRefreshKey((value) => value + 1)}
          >
            <RefreshCw aria-hidden="true" className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button type="button" className="gap-2" disabled={isExporting || isLoading} onClick={exportAudit}>
            {isExporting ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Download aria-hidden="true" className="size-4" />}
            Exportar período
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-start gap-3">
            <div className="rounded-lg border bg-muted/40 p-2"><Filter aria-hidden="true" className="size-4" /></div>
            <div>
              <CardTitle className="text-base">Filtros de investigação</CardTitle>
              <CardDescription className="mt-1">A exportação exige início e fim e aceita no máximo 31 dias por arquivo.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-12" onSubmit={applyFilters}>
            <div className="space-y-2 xl:col-span-3">
              <Label htmlFor="audit-from">Início do período</Label>
              <Input id="audit-from" type="datetime-local" value={draft.from} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))} />
            </div>
            <div className="space-y-2 xl:col-span-3">
              <Label htmlFor="audit-to">Fim do período</Label>
              <Input id="audit-to" type="datetime-local" value={draft.to} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} />
            </div>
            <div className="space-y-2 xl:col-span-3">
              <Label htmlFor="audit-action">Ação exata</Label>
              <Input id="audit-action" maxLength={160} placeholder="admin.update_user" value={draft.action} onChange={(event) => setDraft((current) => ({ ...current, action: event.target.value }))} />
            </div>
            <div className="space-y-2 xl:col-span-3">
              <Label htmlFor="audit-outcome">Resultado</Label>
              <Select value={draft.outcome} onValueChange={(value) => setDraft((current) => ({ ...current, outcome: (value || "all") as FilterDraft["outcome"] }))}>
                <SelectTrigger id="audit-outcome" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os resultados</SelectItem>
                  <SelectItem value="success">Sucesso</SelectItem>
                  <SelectItem value="failure">Falha</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2 xl:col-span-8">
              <Label htmlFor="audit-correlation">Correlation ID</Label>
              <div className="relative">
                <Fingerprint aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="audit-correlation" className="pl-9 font-mono text-xs" placeholder="00000000-0000-0000-0000-000000000000" value={draft.correlationId} onChange={(event) => setDraft((current) => ({ ...current, correlationId: event.target.value }))} />
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end md:col-span-2 xl:col-span-4 xl:justify-end">
              <Button type="button" variant="ghost" className="gap-2" onClick={clearFilters} disabled={isLoading && !logs.length}>
                <RotateCcw aria-hidden="true" className="size-4" /> Limpar
              </Button>
              <Button type="submit" className="gap-2" disabled={isLoading}>
                <FileSearch aria-hidden="true" className="size-4" /> Aplicar filtros
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section aria-labelledby="audit-history-heading" className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:px-5">
          <div>
            <h2 id="audit-history-heading" className="font-semibold">Histórico de eventos</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {isLoading ? "Consultando registros…" : `${logs.length} registro${logs.length === 1 ? "" : "s"} carregado${logs.length === 1 ? "" : "s"}`}
              {hasFilters ? " com os filtros atuais" : ""}.
            </p>
          </div>
          {!isLoading && logs.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Resumo dos registros carregados">
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-700 dark:text-emerald-300">{loadedSuccesses} sucesso{loadedSuccesses === 1 ? "" : "s"}</Badge>
              <Badge variant="outline" className="border-red-500/30 text-red-700 dark:text-red-300">{loadedFailures} falha{loadedFailures === 1 ? "" : "s"}</Badge>
            </div>
          )}
        </div>

        <div aria-live="polite" className="sr-only">{isLoading ? "Carregando auditoria" : error || `${logs.length} registros carregados`}</div>

        {error && (
          <div role="alert" className="m-4 flex flex-col gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-red-600" />
              <div><p className="font-medium">Não foi possível exibir a auditoria</p><p className="mt-1 text-sm text-muted-foreground">{error}</p></div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setRefreshKey((value) => value + 1)}>Tentar novamente</Button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3 p-4 sm:p-5" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}
          </div>
        ) : !error && logs.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
            <div className="rounded-full border bg-muted/30 p-4"><CalendarDays aria-hidden="true" className="size-7 text-muted-foreground" /></div>
            <h3 className="mt-4 font-semibold">Nenhum evento encontrado</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">Não há registros reais para os filtros aplicados. Ajuste o período ou remova algum filtro.</p>
            {hasFilters && <Button type="button" variant="outline" className="mt-5" onClick={clearFilters}>Limpar filtros</Button>}
          </div>
        ) : logs.length > 0 ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-40">Data e hora</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead className="min-w-48">Ação</TableHead>
                    <TableHead className="min-w-40">Recurso</TableHead>
                    <TableHead className="min-w-48">Ator</TableHead>
                    <TableHead className="w-20 text-right"><span className="sr-only">Abrir detalhes</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(log.createdAt)}</TableCell>
                      <TableCell><OutcomeBadge outcome={log.outcome} /></TableCell>
                      <TableCell><span className="break-all font-mono text-xs font-medium">{log.action}</span></TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{log.resource}</p>
                        {log.resourceId && <p className="mt-0.5 font-mono text-xs text-muted-foreground" title={log.resourceId}>#{shortId(log.resourceId)}</p>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2"><UserRound aria-hidden="true" className="size-3.5 text-muted-foreground" /><span className="max-w-48 truncate text-sm" title={actorLabel(log)}>{actorLabel(log)}</span></div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button type="button" variant="ghost" size="icon" aria-label={`Ver detalhes de ${log.action}`} onClick={() => setSelectedLog(log)}><ChevronRight aria-hidden="true" className="size-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="divide-y md:hidden">
              {logs.map((log) => (
                <button key={log.id} type="button" className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset" onClick={() => setSelectedLog(log)}>
                  <div className={`mt-1 rounded-full p-1.5 ${log.outcome === "success" ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}>
                    {log.outcome === "success" ? <CheckCircle2 aria-hidden="true" className="size-4" /> : <CircleX aria-hidden="true" className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3"><p className="break-all font-mono text-xs font-semibold">{log.action}</p><ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /></div>
                    <p className="mt-1 text-sm text-muted-foreground">{log.resource}{log.resourceId ? ` · #${shortId(log.resourceId)}` : ""}</p>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{formatDate(log.createdAt)}</span><span>{actorLabel(log)}</span></div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex flex-col items-center gap-2 border-t px-4 py-4">
              {nextCursor ? (
                <Button type="button" variant="outline" className="min-w-40 gap-2" disabled={isLoadingMore} onClick={() => void fetchLogs(nextCursor, true)}>
                  {isLoadingMore && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
                  {isLoadingMore ? "Carregando…" : "Carregar mais"}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">Fim dos registros para os filtros atuais.</p>
              )}
            </div>
          </>
        ) : null}
      </section>

      <Sheet open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
          <SheetHeader className="border-b px-5 py-5 text-left sm:px-6">
            <SheetTitle>Detalhes do evento</SheetTitle>
            <SheetDescription>Somente campos permitidos e valores redigidos pelo servidor são exibidos.</SheetDescription>
          </SheetHeader>
          {selectedLog && <DetailsContent log={selectedLog} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}

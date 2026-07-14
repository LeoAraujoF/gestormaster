"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock3,
  History,
  Info,
  KeyRound,
  Loader2,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { useAdminCriticalAction } from "@/components/admin-critical-action-provider"
import { useConfirm } from "@/components/providers/confirm-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"

type Severity = "critical" | "warning" | "info"
type Priority = "high" | "medium" | "low"
type Distribution = "synced" | "failed" | "unverified"

type SecurityData = {
  settings: {
    id: string
    hmac_configured: boolean
    require_signature: boolean
    rotated_at: string | null
    rotation_grace_until: string | null
    created_at: string
    updated_at: string
  }
  posture: "strong" | "attention" | "critical"
  rotation_age_days: number | null
  coverage: {
    total: number
    ready: number
    synced: number
    failed: number
    unverified: number
    verified_at: string | null
    instances: Array<{
      name: string
      mode: "external" | "managed"
      ready: boolean
      distribution: Distribution
      failure_code: string | null
    }>
  }
  alerts: Array<{
    id: string
    severity: Severity
    title: string
    description: string
  }>
  recommendations: Array<{
    id: string
    priority: Priority
    title: string
    description: string
  }>
  events: Array<{
    id: string
    action: string
    details: Record<string, unknown> | null
    outcome: "success" | "failure"
    reason: string | null
    correlation_id: string | null
    created_at: string
  }>
}
type SecurityResponse = { data: SecurityData; meta: { generated_at: string } }

const postureCopy = {
  strong: { label: "Postura forte", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", icon: ShieldCheck },
  attention: { label: "Requer atenção", className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300", icon: AlertTriangle },
  critical: { label: "Postura crítica", className: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300", icon: ShieldAlert },
} as const

const eventLabels: Record<string, string> = {
  "admin.security.rotate_hmac": "Secret HMAC rotacionado",
  "admin.security.enable_hmac": "Validação HMAC ativada",
  "admin.security.disable_hmac": "Validação HMAC desativada",
  "admin.security.update": "Política HMAC alterada",
}

function formatDate(value: string | null) {
  if (!value) return "Sem registro"
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "Data inválida"
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)
}

function errorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback
  const error = (payload as { error?: unknown }).error
  if (typeof error === "string") return error
  if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message
  }
  return fallback
}

async function requestSecurityData() {
  const res = await fetch("/api/admin/security", { cache: "no-store" })
  const payload: unknown = await res.json()
  if (!res.ok || !payload || typeof payload !== "object" || !("data" in payload)) {
    throw new Error(errorMessage(payload, "Não foi possível carregar o centro de segurança"))
  }
  return payload as SecurityResponse
}

function AlertIcon({ severity }: { severity: Severity }) {
  if (severity === "critical") return <ShieldAlert className="size-4 text-red-600" />
  if (severity === "warning") return <AlertTriangle className="size-4 text-amber-600" />
  return <Info className="size-4 text-blue-600" />
}

function DistributionBadge({ status }: { status: Distribution }) {
  if (status === "synced") {
    return <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-3" /> Sincronizada</Badge>
  }
  if (status === "failed") {
    return <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"><XCircle className="size-3" /> Falhou</Badge>
  }
  return <Badge variant="outline" className="text-muted-foreground"><CircleDashed className="size-3" /> Não verificada</Badge>
}

export default function SecurityPage() {
  const confirm = useConfirm()
  const confirmCritical = useAdminCriticalAction()
  const [response, setResponse] = useState<SecurityResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isRotating, setIsRotating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [requireSignature, setRequireSignature] = useState(false)

  const fetchSecurity = useCallback(async () => {
    try {
      const nextResponse = await requestSecurityData()
      setResponse(nextResponse)
      setRequireSignature(nextResponse.data.settings.require_signature)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o centro de segurança")
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    void requestSecurityData()
      .then((nextResponse) => {
        if (!active) return
        setResponse(nextResponse)
        setRequireSignature(nextResponse.data.settings.require_signature)
      })
      .catch((error: unknown) => {
        if (active) toast.error(error instanceof Error ? error.message : "Não foi possível carregar o centro de segurança")
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => { active = false }
  }, [])

  const data = response?.data ?? null
  const hasPolicyChanges = Boolean(data && requireSignature !== data.settings.require_signature)
  const posture = data ? postureCopy[data.posture] : postureCopy.attention
  const PostureIcon = posture.icon

  const orderedAlerts = useMemo(() => {
    const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }
    return [...(data?.alerts ?? [])].sort((a, b) => order[a.severity] - order[b.severity])
  }, [data?.alerts])

  const handleRotateSecret = async () => {
    const accepted = await confirm({
      title: "Rotacionar secret HMAC",
      description: "O secret será substituído e distribuído diretamente pelo servidor. O valor nunca será enviado ao navegador; o secret anterior ficará válido por até 24 horas durante a transição.",
      variant: "warning",
      confirmText: "Continuar",
    })
    if (!accepted) return

    const critical = await confirmCritical({
      title: "Autorizar rotação HMAC",
      description: "Informe o motivo, digite a confirmação exata e reautentique sua sessão.",
      confirmationText: "ROTACIONAR HMAC",
    })
    if (!critical) return

    setIsRotating(true)
    try {
      const res = await fetch("/api/admin/security/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(critical),
      })
      const payload: unknown = await res.json()
      if (!res.ok || !payload || typeof payload !== "object" || !("data" in payload)) {
        throw new Error(errorMessage(payload, "Não foi possível rotacionar o secret"))
      }

      const result = payload as { data: { distribution: { failed: number } } }
      const failed = result.data.distribution.failed
      if (failed > 0) toast.warning(`Secret rotacionado no servidor; ${failed} instância(s) exigem correção durante a janela de 24 horas.`)
      else toast.success("Secret rotacionado e distribuído pelo servidor para todas as instâncias elegíveis.")
      setIsRefreshing(true)
      await fetchSecurity()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível rotacionar o secret")
    } finally {
      setIsRotating(false)
    }
  }

  const handleSavePolicy = async () => {
    if (!data || !hasPolicyChanges) return
    const confirmationText = requireSignature ? "ATIVAR HMAC" : "DESATIVAR HMAC"
    const critical = await confirmCritical({
      title: requireSignature ? "Ativar validação HMAC" : "Desativar validação HMAC",
      description: requireSignature
        ? "A política passará a rejeitar callbacks da Evolution sem o secret ou assinatura válidos."
        : "Callbacks sem a validação HMAC obrigatória poderão alcançar o endpoint.",
      confirmationText,
    })
    if (!critical) return

    setIsSaving(true)
    try {
      const res = await fetch("/api/admin/security", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ require_signature: requireSignature, ...critical }),
      })
      const payload: unknown = await res.json()
      if (!res.ok) throw new Error(errorMessage(payload, "Não foi possível atualizar a política"))
      toast.success(requireSignature ? "Validação HMAC ativada." : "Validação HMAC desativada.")
      setIsRefreshing(true)
      await fetchSecurity()
    } catch (error) {
      setRequireSignature(data.settings.require_signature)
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a política")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading && !data) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="space-y-2"><Skeleton className="h-7 w-56" /><Skeleton className="h-4 w-[34rem] max-w-full" /></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]"><Skeleton className="h-[430px] rounded-xl" /><Skeleton className="h-[430px] rounded-xl" /></div>
      </div>
    )
  }

  if (!data) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
          <ShieldAlert className="size-9 text-muted-foreground" />
          <div><p className="font-medium">Centro de segurança indisponível</p><p className="text-sm text-muted-foreground">A configuração não pôde ser carregada.</p></div>
          <Button variant="outline" onClick={() => void fetchSecurity()}><RefreshCw className="size-4" /> Tentar novamente</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Centro de segurança</h2>
            <Badge variant="outline" className={posture.className}><PostureIcon className="size-3.5" /> {posture.label}</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Postura HMAC, cobertura auditada das instâncias e operações críticas de rotação.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">Atualizado em {formatDate(response?.meta.generated_at ?? null)}</span>
          <Button variant="outline" size="sm" onClick={() => { setIsRefreshing(true); void fetchSecurity() }} disabled={isRefreshing}>
            <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div><p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Secret HMAC</p><p className="mt-2 text-xl font-semibold">{data.settings.hmac_configured ? "Configurado" : "Ausente"}</p><p className="mt-1 text-xs text-muted-foreground">Nunca retornado pelo inventário</p></div>
            <div className={`rounded-lg p-2 ${data.settings.hmac_configured ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}><KeyRound className="size-5" /></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div><p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Validação</p><p className="mt-2 text-xl font-semibold">{data.settings.require_signature ? "Obrigatória" : "Desativada"}</p><p className="mt-1 text-xs text-muted-foreground">Callbacks Evolution</p></div>
            <div className={`rounded-lg p-2 ${data.settings.require_signature ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}><LockKeyhole className="size-5" /></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div><p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Última rotação</p><p className="mt-2 text-xl font-semibold">{data.rotation_age_days === null ? "Sem registro" : `${data.rotation_age_days} dia(s)`}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(data.settings.rotated_at)}</p></div>
            <div className="rounded-lg bg-secondary p-2 text-muted-foreground"><Clock3 className="size-5" /></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div><p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Cobertura vigente</p><p className="mt-2 text-xl font-semibold">{data.coverage.total === 0 ? "Sem instâncias" : `${data.coverage.synced} / ${data.coverage.total}`}</p><p className="mt-1 text-xs text-muted-foreground">Sincronizadas na rotação atual</p></div>
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600"><Server className="size-5" /></div>
          </CardContent>
        </Card>
      </div>

      {orderedAlerts.length > 0 && (
        <Card className="border-amber-500/20 bg-amber-500/[0.025]">
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><ShieldAlert className="size-4" /> Alertas ativos</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {orderedAlerts.map((alert) => (
              <div key={alert.id} className="flex gap-3 rounded-lg border bg-background/80 p-3">
                <div className="mt-0.5"><AlertIcon severity={alert.severity} /></div>
                <div><p className="text-sm font-medium">{alert.title}</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{alert.description}</p></div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data.settings.rotation_grace_until && (
        <Card className="border-blue-500/30 bg-blue-500/[0.035]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4 text-blue-600" /> Rotação em período de transição</CardTitle>
            <CardDescription className="mt-1">O secret anterior será aceito somente pelo servidor até {formatDate(data.settings.rotation_grace_until)}. O novo secret não foi exposto ao navegador.</CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4" /> Política HMAC</CardTitle>
              <CardDescription>Controle a exigência criptográfica e a rotação do secret compartilhado com a Evolution.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <Label htmlFor="require-signature" className="font-medium">Exigir validação em todos os callbacks</Label>
                  <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">Ao ativar, requisições sem secret estático válido ou assinatura HMAC SHA-256 são rejeitadas.</p>
                  {!data.settings.hmac_configured && !data.settings.require_signature && <p className="text-xs font-medium text-red-600">Rotacione um secret antes de ativar esta política.</p>}
                </div>
                <Switch id="require-signature" checked={requireSignature} onCheckedChange={setRequireSignature} disabled={!data.settings.hmac_configured && !data.settings.require_signature} />
              </div>
              <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-sm font-medium">Rotação controlada</p><p className="text-xs text-muted-foreground">Requer motivo, frase exata, senha recente e chave idempotente.</p></div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={handleRotateSecret} disabled={isRotating || isSaving}>
                    {isRotating ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Rotacionar secret
                  </Button>
                  <Button onClick={handleSavePolicy} disabled={!hasPolicyChanges || isSaving || isRotating} variant={requireSignature ? "default" : "destructive"}>
                    {isSaving ? <Loader2 className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}
                    {requireSignature ? "Ativar política" : "Desativar política"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div><CardTitle className="flex items-center gap-2 text-base"><Server className="size-4" /> Cobertura das instâncias</CardTitle><CardDescription className="mt-1">Evidência registrada durante a rotação correspondente ao secret vigente.</CardDescription></div>
                {data.coverage.verified_at && <Badge variant="outline" className="w-fit text-muted-foreground">Verificada em {formatDate(data.coverage.verified_at)}</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              {data.coverage.instances.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center"><Server className="mx-auto size-7 text-muted-foreground" /><p className="mt-2 text-sm font-medium">Nenhuma instância ativa</p><p className="text-xs text-muted-foreground">Não há distribuição HMAC pendente no inventário atual.</p></div>
              ) : (
                <div className="divide-y rounded-lg border">
                  {data.coverage.instances.map((instance, index) => (
                    <div key={`${instance.name}-${index}`} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{instance.name}</p><p className="text-xs text-muted-foreground">{instance.mode === "external" ? "Evolution externa" : "Evolution gerenciada"} · {instance.ready ? "pronta para rotação" : "configuração incompleta"}</p></div>
                      <DistributionBadge status={instance.distribution} />
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">“Não verificada” significa ausência de evidência para o secret atual; não é tratada como protegida nem como falha.</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Recomendações</CardTitle><CardDescription>Derivadas deterministicamente da configuração e da cobertura atuais.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {data.recommendations.map((recommendation) => (
                <div key={recommendation.id} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2"><Badge variant="outline" className={recommendation.priority === "high" ? "border-red-500/30 text-red-700 dark:text-red-300" : recommendation.priority === "medium" ? "border-amber-500/30 text-amber-700 dark:text-amber-300" : "text-muted-foreground"}>{recommendation.priority === "high" ? "Alta" : recommendation.priority === "medium" ? "Média" : "Baixa"}</Badge><p className="text-sm font-medium">{recommendation.title}</p></div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{recommendation.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="size-4" /> Eventos de segurança</CardTitle><CardDescription>Últimas ações administrativas registradas em auditoria.</CardDescription></CardHeader>
            <CardContent>
              {data.events.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum evento administrativo de segurança registrado.</div>
              ) : (
                <div className="space-y-4">
                  {data.events.slice(0, 8).map((event, index) => {
                    const updated = typeof event.details?.instances_updated === "number" ? event.details.instances_updated : null
                    const failed = typeof event.details?.instances_failed === "number" ? event.details.instances_failed : null
                    return (
                      <div key={event.id} className="relative flex gap-3">
                        {index < Math.min(data.events.length, 8) - 1 && <span className="absolute left-[7px] top-5 h-[calc(100%+4px)] w-px bg-border" />}
                        <span className={`relative mt-1.5 size-3.5 shrink-0 rounded-full border-2 border-background ${event.outcome === "success" ? "bg-emerald-500" : "bg-red-500"}`} />
                        <div className="min-w-0 pb-1"><p className="text-sm font-medium">{eventLabels[event.action] ?? event.action}</p><p className="text-xs text-muted-foreground">{formatDate(event.created_at)}</p>{event.reason && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">Motivo: {event.reason}</p>}{updated !== null && failed !== null && <p className="mt-1 text-xs text-muted-foreground">Distribuição: {updated} concluída(s), {failed} com falha.</p>}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

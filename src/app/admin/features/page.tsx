"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Globe2,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { useAdminCriticalAction } from "@/components/admin-critical-action-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"

type Feature = {
  key: string
  name: string
  category: string
  is_enabled: boolean
  updated_at: string | null
}
type FeaturesResponse = {
  data?: Feature[] | Feature
  error?: { code?: string; message?: string }
}

type StatusFilter = "all" | "enabled" | "disabled"

function getImpact(category: string) {
  const normalizedCategory = category.trim().toLocaleLowerCase("pt-BR")

  if (normalizedCategory === "página" || normalizedCategory === "pagina") return "Acesso à página"
  if (normalizedCategory === "ação" || normalizedCategory === "acao") return "Disponibilidade da ação"
  if (normalizedCategory === "integração" || normalizedCategory === "integracao") return "Acesso à integração"
  return "Disponibilidade do recurso"
}

function formatUpdatedAt(value: string | null) {
  if (!value) return "Sem registro"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Data indisponível"

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)
}

async function requestFeatures() {
  const response = await fetch("/api/admin/features", { cache: "no-store" })
  const result = (await response.json()) as FeaturesResponse

  if (!response.ok) {
    throw new Error(result.error?.message || "Não foi possível carregar os recursos globais.")
  }

  return Array.isArray(result.data) ? result.data : []
}

function FeatureSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-6 w-10 rounded-full" />
      </div>
    </div>
  )
}

export default function FeaturesAdminPage() {
  const confirmCritical = useAdminCriticalAction()
  const [features, setFeatures] = useState<Feature[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("all")
  const [status, setStatus] = useState<StatusFilter>("all")

  const fetchFeatures = useCallback(async () => {
    setIsLoading(true)
    setLoadError("")

    try {
      setFeatures(await requestFeatures())
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível carregar os recursos globais."
      setLoadError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    void requestFeatures()
      .then((data) => {
        if (active) setFeatures(data)
      })
      .catch((error: unknown) => {
        if (!active) return
        const message = error instanceof Error ? error.message : "Não foi possível carregar os recursos globais."
        setLoadError(message)
        toast.error(message)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const categories = useMemo(
    () => [...new Set(features.map((feature) => feature.category))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [features],
  )

  const filteredFeatures = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR")

    return features.filter((feature) => {
      const matchesSearch = !term || [feature.name, feature.key, feature.category]
        .some((value) => value.toLocaleLowerCase("pt-BR").includes(term))
      const matchesCategory = category === "all" || feature.category === category
      const matchesStatus = status === "all"
        || (status === "enabled" && feature.is_enabled)
        || (status === "disabled" && !feature.is_enabled)

      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [category, features, search, status])

  const enabledCount = features.filter((feature) => feature.is_enabled).length
  const disabledCount = features.length - enabledCount
  const hasFilters = Boolean(search.trim()) || category !== "all" || status !== "all"

  const clearFilters = () => {
    setSearch("")
    setCategory("all")
    setStatus("all")
  }

  const toggleFeature = async (feature: Feature) => {
    const nextState = !feature.is_enabled
    const actionLabel = nextState ? "ativar" : "desativar"
    const confirmationText = `ALTERAR ${feature.key}`
    const critical = await confirmCritical({
      title: `${nextState ? "Ativar" : "Desativar"} recurso global`,
      description: `Você vai ${actionLabel} “${feature.name}” para toda a plataforma. A mudança é global e pode afetar todos os usuários imediatamente.`,
      confirmationText,
    })

    if (!critical) return

    setPendingKeys((current) => new Set(current).add(feature.key))

    try {
      const response = await fetch("/api/admin/features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: feature.key,
          isEnabled: nextState,
          ...critical,
        }),
      })
      const result = (await response.json()) as FeaturesResponse

      if (!response.ok || !result.data || Array.isArray(result.data)) {
        throw new Error(result.error?.message || "Não foi possível alterar o recurso global.")
      }

      const updatedFeature = result.data
      setFeatures((current) => current.map((item) => item.key === feature.key ? updatedFeature : item))
      toast.success(`${feature.name} foi ${nextState ? "ativado" : "desativado"} globalmente.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível alterar o recurso global."
      toast.error(message)
    } finally {
      setPendingKeys((current) => {
        const next = new Set(current)
        next.delete(feature.key)
        return next
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Globe2 className="size-5 text-interactive" />
            <h1 className="text-[17px] font-semibold tracking-[-0.02em]">Recursos globais</h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Controle recursos que valem para toda a plataforma. Não há segmentação por organização nem rollout parcial.
          </p>
        </div>
        <Button variant="outline" onClick={() => void fetchFeatures()} disabled={isLoading || pendingKeys.size > 0}>
          <RefreshCw className={isLoading ? "animate-spin" : ""} />
          Atualizar estado
        </Button>
      </div>

      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-sm font-semibold">Escopo global e efeito imediato</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Toda alteração exige motivo, confirmação textual e reautenticação. O evento é registrado na auditoria administrativa.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="gap-1 pb-3">
            <CardDescription>Recursos cadastrados</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{isLoading ? "—" : features.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1 pb-3">
            <CardDescription className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-emerald-500" />Ativos globalmente</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{isLoading ? "—" : enabledCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1 pb-3">
            <CardDescription className="flex items-center gap-1.5"><XCircle className="size-3.5 text-destructive" />Desativados globalmente</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{isLoading ? "—" : disabledCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-base"><SlidersHorizontal className="size-4" />Inventário de recursos</CardTitle>
          <CardDescription>Busque pelo nome, chave ou categoria e filtre pelo estado persistido.</CardDescription>
          <div className="flex flex-col gap-2 pt-2 md:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar recurso ou chave…"
                className="pl-9"
                aria-label="Buscar recursos globais"
              />
            </div>
            <Select value={category} onValueChange={(value) => setCategory(value ?? "all")}>
              <SelectTrigger className="w-full md:w-48" aria-label="Filtrar por categoria">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {categories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(value) => setStatus((value ?? "all") as StatusFilter)}>
              <SelectTrigger className="w-full md:w-44" aria-label="Filtrar por estado">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os estados</SelectItem>
                <SelectItem value="enabled">Ativos</SelectItem>
                <SelectItem value="disabled">Desativados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-4">
              <FeatureSkeleton />
              <FeatureSkeleton />
              <FeatureSkeleton />
            </div>
          ) : loadError ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
              <XCircle className="size-8 text-destructive" />
              <div>
                <p className="font-medium">Falha ao carregar recursos</p>
                <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
              </div>
              <Button variant="outline" onClick={() => void fetchFeatures()}>Tentar novamente</Button>
            </div>
          ) : filteredFeatures.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
              <Search className="size-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Nenhum recurso encontrado</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {features.length === 0 ? "Não há recursos cadastrados no banco." : "Ajuste os termos ou remova os filtros."}
                </p>
              </div>
              {hasFilters && <Button variant="outline" onClick={clearFilters}>Limpar filtros</Button>}
            </div>
          ) : (
            <div className="divide-y">
              {filteredFeatures.map((feature) => {
                const isPending = pendingKeys.has(feature.key)

                return (
                  <article key={feature.key} className="grid gap-4 p-5 transition-colors hover:bg-muted/20 lg:grid-cols-[minmax(0,1fr)_220px_180px_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold">{feature.name}</h2>
                        <Badge variant="outline">{feature.category}</Badge>
                        <Badge className={feature.is_enabled
                          ? "border-0 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "border-0 bg-destructive/10 text-destructive"
                        }>
                          {feature.is_enabled ? "Ativo" : "Desativado"}
                        </Badge>
                      </div>
                      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Descrição</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Recurso global “{feature.name}”, cadastrado na categoria {feature.category}.
                      </p>
                      <code className="mt-2 inline-block rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{feature.key}</code>
                    </div>

                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Impacto</p>
                      <p className="mt-1 text-sm">{getImpact(feature.category)}</p>
                      <p className="text-xs text-muted-foreground">Todos os usuários</p>
                    </div>

                    <div>
                      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <Clock3 className="size-3.5" />Última alteração
                      </p>
                      <p className="mt-1 text-sm tabular-nums">{formatUpdatedAt(feature.updated_at)}</p>
                    </div>

                    <div className="flex items-center justify-between gap-3 lg:justify-end">
                      <span className="text-sm font-medium lg:sr-only">{feature.is_enabled ? "Ativo" : "Desativado"}</span>
                      {isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Salvando alteração" />}
                      <Switch
                        checked={feature.is_enabled}
                        onCheckedChange={() => void toggleFeature(feature)}
                        disabled={isPending}
                        aria-label={`${feature.is_enabled ? "Desativar" : "Ativar"} ${feature.name} globalmente`}
                      />
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

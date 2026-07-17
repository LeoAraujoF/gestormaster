'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Database,
  Gauge,
  LifeBuoy,
  MessageSquareText,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  Users,
  WifiOff,
  Zap,
  type LucideIcon,
} from 'lucide-react'

import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatCurrency } from '@/lib/utils'

type NullableNumber = number | null

type SourceCoverage = {
  status: 'available' | 'unavailable'
  rows: number | null
  truncated: boolean
}

type AdminMetrics = {
  generatedAt: string
  saasMrr: NullableNumber
  managedRevenue: NullableNumber
  registeredSaasCustomers: NullableNumber
  activeSaasCustomers: NullableNumber
  accessAccounts: NullableNumber
  managedEndClients: NullableNumber
  totalUsers: NullableNumber
  totalOrganizations: NullableNumber
  activeSubscriptions: NullableNumber
  totalActiveClients: NullableNumber
  totalInstances: NullableNumber
  connectedInstances: NullableNumber
  disconnectedInstances: NullableNumber
  totalMessagesMonth: NullableNumber
  failedMessagesMonth: NullableNumber
  openTickets: NullableNumber
  criticalTickets: NullableNumber
  expiringSubscriptions: NullableNumber
  organizationsWithoutSubscription: NullableNumber
  unpricedSubscriptions: NullableNumber
  subscriptionsByPlan: Array<{
    plan: string
    label: string
    subscriptions: NullableNumber
    monthlyPrice: NullableNumber
    mrr: NullableNumber
  }>
  trend: Array<{
    month: string
    label: string
    newOrganizations: NullableNumber
    newAccessAccounts: NullableNumber
    newClients: NullableNumber
    deliveredMessages: NullableNumber
  }>
  coverage: {
    status: 'complete' | 'partial' | 'unavailable'
    availableSources: number
    totalSources: number
    truncatedSources: number
    organizationsWithActiveSubscription: NullableNumber
    organizationsWithoutActiveSubscription: NullableNumber
    pricedActiveSubscriptions: NullableNumber
    unpricedActiveSubscriptions: NullableNumber
    sources: Record<string, SourceCoverage>
    trendWindow: { from: string; to: string; months: number }
  }
}

type ServiceId = 'database' | 'redis' | 'evolution' | 'application'
type ServiceStatus = 'online' | 'degraded' | 'offline' | 'unconfigured'
type OverallHealthStatus = 'operational' | 'degraded' | 'outage'

type ServiceHealth = {
  id: ServiceId
  status: ServiceStatus
  latencyMs: number | null
  httpStatus?: number | null
  memoryRssMb?: number
  uptimeSeconds?: number
}

type AdminHealth = {
  checkedAt: string
  durationMs: number
  services: ServiceHealth[]
}

type CockpitAlert = {
  id: string
  title: string
  description: string
  href: string
  label: string
  severity: 'critical' | 'warning' | 'info'
}

const integerFormatter = new Intl.NumberFormat('pt-BR')
const compactFormatter = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})
const trendDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'medium',
  timeZone: 'UTC',
})

const sourceLabels: Record<string, string> = {
  authUsers: 'Contas de acesso',
  organizations: 'Clientes SaaS (organizações)',
  clients: 'Clientes finais gerenciados',
  instances: 'Instâncias',
  messages: 'Mensagens',
  subscriptions: 'Assinaturas',
  planCatalog: 'Catálogo de planos',
  tickets: 'Chamados',
}

async function fetchAdminPayload<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal })
  const payload = await response.json().catch(() => null) as {
    data?: unknown
    error?: { message?: string } | string
  } | null

  if (!response.ok) {
    const apiMessage = typeof payload?.error === 'string'
      ? payload.error
      : payload?.error?.message
    throw new Error(apiMessage || `Falha ao consultar ${url}`)
  }

  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data as T
  }

  return payload as T
}

function formatNumber(value: NullableNumber) {
  return value === null ? 'Indisponível' : integerFormatter.format(value)
}

function formatMoney(value: NullableNumber) {
  return value === null ? 'Indisponível' : formatCurrency(value)
}

function statusLabel(status: OverallHealthStatus) {
  if (status === 'operational') return 'Operação normal'
  if (status === 'degraded') return 'Operação degradada'
  return 'Indisponibilidade detectada'
}

function getOverallHealthStatus(health: AdminHealth): OverallHealthStatus {
  const dependencies = health.services.filter((service) => service.id !== 'application')
  if (dependencies.some((service) => service.status === 'offline')) return 'outage'
  if (dependencies.some((service) => service.status === 'degraded' || service.status === 'unconfigured')) return 'degraded'
  return 'operational'
}

function getHealthService(health: AdminHealth | null, id: ServiceId) {
  return health?.services.find((service) => service.id === id)
}

function formatUptime(seconds?: number) {
  if (seconds === undefined) return '—'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${minutes}min`
}

function MetricTile({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string
  value: string
  detail: string
  icon: LucideIcon
}) {
  return (
    <article className="rounded-xl border bg-card p-4 shadow-sm shadow-black/[0.02]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="microlabel">{label}</p>
          <p className="num mt-2 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <span className="rounded-lg border bg-muted/70 p-2 text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </article>
  )
}

function RevenueCard({
  eyebrow,
  title,
  value,
  description,
  primary = false,
}: {
  eyebrow: string
  title: string
  value: NullableNumber
  description: string
  primary?: boolean
}) {
  return (
    <article className={cn(
      'relative overflow-hidden rounded-2xl border p-5 shadow-sm sm:p-6',
      primary
        ? 'border-success-fg/20 bg-[linear-gradient(135deg,var(--card),var(--success-bg))]'
        : 'bg-card',
    )}>
      <div className="relative z-10">
        <p className="microlabel">{eyebrow}</p>
        <div className="mt-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <CircleDollarSign aria-hidden="true" className={cn('size-4', primary && 'text-money')} />
          {title}
        </div>
        <p className={cn(
          'num mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl',
          primary && 'text-money',
        )}>
          {formatMoney(value)}
        </p>
        <p className="mt-3 max-w-xl text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      {primary ? (
        <div aria-hidden="true" className="absolute -right-16 -top-16 size-48 rounded-full border-[28px] border-money/5" />
      ) : null}
    </article>
  )
}

function TrendSeries({
  label,
  values,
  colorClass,
}: {
  label: string
  values: Array<{ month: string; label: string; value: NullableNumber }>
  colorClass: string
}) {
  const availableValues = values.flatMap((item) => item.value === null ? [] : [item.value])
  const max = Math.max(...availableValues, 0)

  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <p className="microlabel">6 meses</p>
      </div>
      {availableValues.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">Fonte indisponível</p>
      ) : (
        <ol className="grid h-32 grid-cols-6 items-end gap-2" aria-label={`${label} nos últimos seis meses`}>
          {values.map((item) => {
            const height = item.value === null || max === 0 ? 4 : Math.max(8, (item.value / max) * 88)
            return (
              <li key={item.month} className="flex h-full min-w-0 flex-col items-center justify-end gap-2">
                <span className="num text-[10px] text-muted-foreground">
                  {item.value === null ? '—' : compactFormatter.format(item.value)}
                </span>
                <span
                  aria-hidden="true"
                  className={cn('w-full max-w-8 rounded-t-sm transition-[height]', colorClass)}
                  style={{ height: `${height}%` }}
                />
                <span className="truncate text-[10px] capitalize text-muted-foreground">{item.label}</span>
                <span className="sr-only">{item.label}: {formatNumber(item.value)}</span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function ServiceRow({
  name,
  service,
  icon: Icon,
  detail,
}: {
  name: string
  service?: ServiceHealth
  icon: LucideIcon
  detail: string
}) {
  const status = service?.status ?? 'unconfigured'
  const isOnline = status === 'online'
  const isWarning = status === 'degraded' || status === 'unconfigured'
  const label = status === 'online'
    ? 'Online'
    : status === 'degraded'
      ? 'Degradado'
      : status === 'unconfigured'
        ? 'Não configurado'
        : 'Offline'
  return (
    <li className="flex items-center justify-between gap-4 border-b py-3 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <span className="rounded-lg bg-muted p-2 text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
      <span className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium',
        isOnline
          ? 'border-success-fg/20 bg-success-bg text-success-fg'
          : isWarning
            ? 'border-warning-border bg-warning-bg text-warning-fg'
            : 'border-danger-border bg-danger-bg text-danger-fg',
      )}>
        <span aria-hidden="true" className={cn('status-dot', isOnline ? 'bg-success-fg' : isWarning ? 'bg-warning' : 'bg-danger')} />
        {label}
      </span>
    </li>
  )
}

function CockpitSkeleton() {
  return (
    <div aria-label="Carregando cockpit executivo" aria-live="polite" className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-9 w-72 max-w-[70vw]" />
          <Skeleton className="h-4 w-[30rem] max-w-[85vw]" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-52 rounded-2xl" />
        <Skeleton className="h-52 rounded-2xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-32 rounded-xl" key={index} />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  )
}

export function AdminCockpit() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [health, setHealth] = useState<AdminHealth | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestController = useRef<AbortController | null>(null)

  const loadDashboard = useCallback(async (initial = false) => {
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    const timeoutId = window.setTimeout(() => controller.abort(), 15_000)

    if (initial) setIsLoading(true)
    else setIsRefreshing(true)
    setError(null)

    const [metricsResult, healthResult] = await Promise.allSettled([
      fetchAdminPayload<AdminMetrics>('/api/admin/metrics', controller.signal),
      fetchAdminPayload<AdminHealth>('/api/admin/health', controller.signal),
    ])
    window.clearTimeout(timeoutId)

    if (controller.signal.aborted && requestController.current !== controller) return

    const errors: string[] = []
    if (metricsResult.status === 'fulfilled') setMetrics(metricsResult.value)
    else errors.push(metricsResult.reason instanceof Error ? metricsResult.reason.message : 'Métricas indisponíveis')

    if (healthResult.status === 'fulfilled') setHealth(healthResult.value)
    else errors.push(healthResult.reason instanceof Error ? healthResult.reason.message : 'Saúde operacional indisponível')

    setError(errors.length > 0 ? errors.join(' · ') : null)
    setIsLoading(false)
    setIsRefreshing(false)
  }, [])

  useEffect(() => {
    const task = window.setTimeout(() => void loadDashboard(true), 0)
    return () => {
      window.clearTimeout(task)
      requestController.current?.abort()
    }
  }, [loadDashboard])

  const alerts = useMemo<CockpitAlert[]>(() => {
    const nextAlerts: CockpitAlert[] = []

    if (health) {
      const offlineServices = health.services
        .filter((service) => service.id !== 'application' && service.status === 'offline')
        .map((service) => ({
          database: 'Banco de dados',
          redis: 'Redis',
          evolution: 'Evolution API',
          application: 'Aplicação',
        } satisfies Record<ServiceId, string>)[service.id])
      if (offlineServices.length > 0) {
        nextAlerts.push({
          id: 'offline-services',
          title: `${offlineServices.length} serviço${offlineServices.length > 1 ? 's' : ''} offline`,
          description: offlineServices.join(', '),
          href: '/admin/system',
          label: 'Abrir saúde',
          severity: 'critical',
        })
      }
    }

    if (metrics?.criticalTickets && metrics.criticalTickets > 0) {
      nextAlerts.push({
        id: 'critical-tickets',
        title: `${formatNumber(metrics.criticalTickets)} chamado${metrics.criticalTickets > 1 ? 's' : ''} crítico${metrics.criticalTickets > 1 ? 's' : ''}`,
        description: 'Chamados críticos ainda não foram resolvidos.',
        href: '/admin/tickets',
        label: 'Priorizar chamados',
        severity: 'critical',
      })
    }

    const otherOpenTickets = metrics?.openTickets !== null && metrics?.openTickets !== undefined
      ? metrics.openTickets - (metrics.criticalTickets ?? 0)
      : null
    if (otherOpenTickets && otherOpenTickets > 0) {
      nextAlerts.push({
        id: 'open-tickets',
        title: `${formatNumber(otherOpenTickets)} ${otherOpenTickets === 1 ? 'chamado aberto' : 'chamados abertos'}`,
        description: 'Chamados não críticos ainda aguardam resolução.',
        href: '/admin/tickets',
        label: 'Abrir chamados',
        severity: 'info',
      })
    }

    if (metrics?.failedMessagesMonth && metrics.failedMessagesMonth > 0) {
      nextAlerts.push({
        id: 'failed-messages',
        title: `${formatNumber(metrics.failedMessagesMonth)} envio${metrics.failedMessagesMonth > 1 ? 's' : ''} com falha no mês`,
        description: 'Falhas registradas no histórico de alertas.',
        href: '/admin/queues',
        label: 'Inspecionar filas',
        severity: 'warning',
      })
    }

    if (metrics?.disconnectedInstances && metrics.disconnectedInstances > 0) {
      nextAlerts.push({
        id: 'disconnected-instances',
        title: `${formatNumber(metrics.disconnectedInstances)} instância${metrics.disconnectedInstances > 1 ? 's' : ''} sem conexão`,
        description: 'Instâncias ativas que não estão no estado connected.',
        href: '/admin/instances',
        label: 'Ver instâncias',
        severity: 'warning',
      })
    }

    if (metrics?.expiringSubscriptions && metrics.expiringSubscriptions > 0) {
      nextAlerts.push({
        id: 'expiring-subscriptions',
        title: `${formatNumber(metrics.expiringSubscriptions)} assinatura${metrics.expiringSubscriptions > 1 ? 's' : ''} expira${metrics.expiringSubscriptions === 1 ? '' : 'm'} em 14 dias`,
        description: 'Assinaturas ativas com vencimento próximo.',
        href: '/admin/users',
        label: 'Revisar assinaturas',
        severity: 'warning',
      })
    }

    if (metrics?.organizationsWithoutSubscription && metrics.organizationsWithoutSubscription > 0) {
      nextAlerts.push({
        id: 'organizations-without-subscription',
        title: `${formatNumber(metrics.organizationsWithoutSubscription)} ${metrics.organizationsWithoutSubscription === 1 ? 'organização' : 'organizações'} sem assinatura ativa`,
        description: 'Organizações existentes sem entitlement ativo e válido.',
        href: '/admin/users',
        label: 'Revisar organizações',
        severity: 'info',
      })
    }

    if (metrics?.unpricedSubscriptions && metrics.unpricedSubscriptions > 0) {
      nextAlerts.push({
        id: 'unpriced-subscriptions',
        title: `${formatNumber(metrics.unpricedSubscriptions)} assinatura${metrics.unpricedSubscriptions > 1 ? 's' : ''} sem preço vigente`,
        description: 'O MRR SaaS fica indisponível até o catálogo cobrir essas assinaturas.',
        href: '/admin/users',
        label: 'Revisar planos',
        severity: 'critical',
      })
    }

    return nextAlerts
  }, [health, metrics])

  const lastUpdatedAt = useMemo(() => {
    const dates = [metrics?.generatedAt, health?.checkedAt]
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()))
    return dates.length > 0 ? new Date(Math.max(...dates.map((date) => date.getTime()))) : null
  }, [health?.checkedAt, metrics?.generatedAt])

  if (isLoading && !metrics && !health) return <CockpitSkeleton />

  if (!metrics && !health) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center text-center" aria-labelledby="cockpit-error-title">
        <span className="rounded-2xl border border-danger-border bg-danger-bg p-4 text-danger-fg">
          <AlertTriangle aria-hidden="true" className="size-7" />
        </span>
        <h1 id="cockpit-error-title" className="mt-5 text-2xl font-semibold tracking-tight">Cockpit indisponível</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{error || 'Não foi possível consultar as fontes administrativas.'}</p>
        <Button className="mt-6" onClick={() => void loadDashboard(true)}>
          <RefreshCw aria-hidden="true" />
          Tentar novamente
        </Button>
      </section>
    )
  }

  const planMax = Math.max(...(metrics?.subscriptionsByPlan.map((plan) => plan.subscriptions ?? 0) ?? []), 0)
  const hasPlatformActivity = metrics && [
    metrics.totalOrganizations,
    metrics.activeSubscriptions,
    metrics.totalActiveClients,
    metrics.totalMessagesMonth,
  ].every((value) => value === 0)
  const healthStatus = health ? getOverallHealthStatus(health) : null
  const onlineServices = health?.services.filter((service) => service.status === 'online').length ?? 0
  const databaseHealth = getHealthService(health, 'database')
  const redisHealth = getHealthService(health, 'redis')
  const evolutionHealth = getHealthService(health, 'evolution')
  const applicationHealth = getHealthService(health, 'application')

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="microlabel flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-3.5 text-danger" />
            Master control · visão executiva
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Cockpit executivo</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Receita do SaaS, operação dos tenants e infraestrutura em uma leitura auditável.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          <div className="text-left sm:text-right" aria-live="polite">
            <p className="microlabel">Última atualização</p>
            <p className="num mt-1 text-xs text-muted-foreground">
              {lastUpdatedAt ? dateTimeFormatter.format(lastUpdatedAt) : 'Sem atualização confirmada'}
            </p>
          </div>
          <Button variant="outline" onClick={() => void loadDashboard(false)} disabled={isRefreshing} aria-label="Atualizar dados do cockpit">
            <RefreshCw aria-hidden="true" className={cn(isRefreshing && 'animate-spin')} />
            {isRefreshing ? 'Atualizando' : 'Atualizar'}
          </Button>
        </div>
      </header>

      {error ? (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-warning-fg">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="text-sm font-medium">Atualização parcial</p>
            <p className="mt-0.5 text-xs leading-5">{error}. Os dados confirmados anteriormente continuam visíveis.</p>
          </div>
        </div>
      ) : null}

      {hasPlatformActivity ? (
        <div className="rounded-xl border border-dashed bg-muted/30 px-5 py-6 text-center">
          <p className="text-sm font-medium">Nenhuma atividade registrada</p>
          <p className="mt-1 text-xs text-muted-foreground">As fontes estão disponíveis, mas ainda não há organizações, assinaturas, clientes ou envios.</p>
        </div>
      ) : null}

      <section aria-labelledby="revenue-heading">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="microlabel">Receita</p>
            <h2 id="revenue-heading" className="mt-1 text-lg font-semibold tracking-tight">Duas economias, sem mistura</h2>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <RevenueCard
            eyebrow="Receita própria"
            title="MRR SaaS"
            value={metrics?.saasMrr ?? null}
            description="Soma dos preços vigentes no catálogo para assinaturas ativas. Se houver assinatura sem preço, o valor não é estimado."
            primary
          />
          <RevenueCard
            eyebrow="Volume dos tenants"
            title="Receita gerenciada"
            value={metrics?.managedRevenue ?? null}
            description={`Mensalidades de ${formatNumber(metrics?.managedEndClients ?? null)} clientes finais ativos administrados pelos tenants. Não são clientes SaaS e não compõem a receita da Lembrado.`}
          />
        </div>
      </section>

      <section aria-label="Indicadores principais" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile icon={Building2} label="Clientes SaaS" value={formatNumber(metrics?.registeredSaasCustomers ?? null)} detail={`${formatNumber(metrics?.activeSaasCustomers ?? null)} com plano ativo`} />
        <MetricTile icon={Users} label="Contas de acesso" value={formatNumber(metrics?.accessAccounts ?? null)} detail="Gestores e membros cadastrados no Auth" />
        <MetricTile icon={Smartphone} label="WhatsApp" value={formatNumber(metrics?.connectedInstances ?? null)} detail={`${formatNumber(metrics?.totalInstances ?? null)} instâncias ativas no total`} />
        <MetricTile icon={MessageSquareText} label="Entregas no mês" value={formatNumber(metrics?.totalMessagesMonth ?? null)} detail={`${formatNumber(metrics?.failedMessagesMonth ?? null)} falhas registradas`} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <section aria-labelledby="plans-heading" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="microlabel">Portfólio</p>
              <h2 id="plans-heading" className="mt-1 text-lg font-semibold tracking-tight">Assinaturas por plano</h2>
              <p className="mt-1 text-xs text-muted-foreground">Somente entitlements ativos e ainda válidos.</p>
            </div>
            <Gauge aria-hidden="true" className="size-5 text-muted-foreground" />
          </div>

          {!metrics || metrics.subscriptionsByPlan.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed px-4 py-10 text-center">
              <p className="text-sm font-medium">Sem planos mensuráveis</p>
              <p className="mt-1 text-xs text-muted-foreground">O catálogo ou as assinaturas não retornaram dados.</p>
            </div>
          ) : (
            <ul className="mt-6 space-y-5">
              {metrics.subscriptionsByPlan.map((plan) => {
                const width = plan.subscriptions === null || planMax === 0 ? 0 : (plan.subscriptions / planMax) * 100
                return (
                  <li key={plan.plan}>
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">{plan.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {plan.monthlyPrice === null ? 'Preço não configurado' : `${formatMoney(plan.monthlyPrice)} / mês`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="num text-sm font-semibold">{formatNumber(plan.subscriptions)}</p>
                        <p className="num mt-0.5 text-xs text-money">{formatMoney(plan.mrr)}</p>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div className="h-full rounded-full bg-interactive" style={{ width: `${width}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="mt-6 grid grid-cols-2 gap-3 border-t pt-4">
            <div>
              <p className="microlabel">Com assinatura</p>
              <p className="num mt-1 text-lg font-semibold">{formatNumber(metrics?.coverage.organizationsWithActiveSubscription ?? null)}</p>
            </div>
            <div>
              <p className="microlabel">Sem assinatura</p>
              <p className="num mt-1 text-lg font-semibold">{formatNumber(metrics?.coverage.organizationsWithoutActiveSubscription ?? null)}</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="health-heading" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="microlabel">Infraestrutura</p>
              <h2 id="health-heading" className="mt-1 text-lg font-semibold tracking-tight">Saúde operacional</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {health ? `${onlineServices}/${health.services.length} serviços online` : 'Verificação indisponível'}
              </p>
            </div>
            {health ? (
              <span className={cn(
                'rounded-full border px-2.5 py-1 text-[11px] font-medium',
                healthStatus === 'operational'
                  ? 'border-success-fg/20 bg-success-bg text-success-fg'
                  : healthStatus === 'degraded'
                    ? 'border-warning-border bg-warning-bg text-warning-fg'
                    : 'border-danger-border bg-danger-bg text-danger-fg',
              )}>
                {statusLabel(healthStatus ?? 'outage')}
              </span>
            ) : null}
          </div>

          {health ? (
            <ul className="mt-4">
              <ServiceRow name="Supabase PostgreSQL" service={databaseHealth} icon={Database} detail={`${databaseHealth?.latencyMs ?? '—'} ms de latência`} />
              <ServiceRow name="Redis / BullMQ" service={redisHealth} icon={Activity} detail={`${redisHealth?.latencyMs ?? '—'} ms de latência`} />
              <ServiceRow name="Evolution API" service={evolutionHealth} icon={Zap} detail={`${evolutionHealth?.latencyMs ?? '—'} ms de latência`} />
              <ServiceRow name="Processo Node.js" service={applicationHealth} icon={Server} detail={`${applicationHealth?.memoryRssMb ?? '—'} MB RSS · uptime ${formatUptime(applicationHealth?.uptimeSeconds)}`} />
            </ul>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed px-4 py-10 text-center text-xs text-muted-foreground">Saúde operacional indisponível.</div>
          )}
          <Link className={cn(buttonVariants({ variant: 'outline' }), 'mt-4 w-full')} href="/admin/system">
            Abrir diagnóstico detalhado
            <ArrowRight aria-hidden="true" />
          </Link>
        </section>
      </div>

      <section aria-labelledby="trend-heading" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="microlabel">Tendências reais</p>
            <h2 id="trend-heading" className="mt-1 text-lg font-semibold tracking-tight">Aquisição e entrega</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Séries derivadas das datas registradas nas fontes; sem projeções ou preenchimento artificial.</p>
          </div>
          {metrics ? (
            <p className="num text-xs text-muted-foreground">
              {trendDateFormatter.format(new Date(metrics.coverage.trendWindow.from))} — {trendDateFormatter.format(new Date(metrics.coverage.trendWindow.to))}
            </p>
          ) : null}
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <TrendSeries label="Novas organizações" colorClass="bg-interactive" values={metrics?.trend.map((item) => ({ ...item, value: item.newOrganizations })) ?? []} />
          <TrendSeries label="Novas contas de acesso" colorClass="bg-money" values={metrics?.trend.map((item) => ({ ...item, value: item.newAccessAccounts })) ?? []} />
          <TrendSeries label="Mensagens entregues" colorClass="bg-warning" values={metrics?.trend.map((item) => ({ ...item, value: item.deliveredMessages })) ?? []} />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section aria-labelledby="alerts-heading" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="microlabel">Fila executiva</p>
              <h2 id="alerts-heading" className="mt-1 text-lg font-semibold tracking-tight">Alertas acionáveis</h2>
            </div>
            <span className="num rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{alerts.length}</span>
          </div>
          {alerts.length === 0 ? (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-success-fg/20 bg-success-bg px-4 py-4 text-success-fg">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Nenhuma intervenção indicada</p>
                <p className="mt-1 text-xs leading-5">As fontes disponíveis não registram alertas nos critérios atuais.</p>
              </div>
            </div>
          ) : (
            <ul className="mt-4 divide-y">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex flex-col gap-3 py-4 first:pt-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={cn(
                      'mt-0.5 rounded-lg border p-2',
                      alert.severity === 'critical'
                        ? 'border-danger-border bg-danger-bg text-danger-fg'
                        : alert.severity === 'warning'
                          ? 'border-warning-border bg-warning-bg text-warning-fg'
                          : 'border-border bg-interactive-bg text-interactive-fg',
                    )}>
                      {alert.severity === 'critical' ? <WifiOff aria-hidden="true" className="size-4" /> : <AlertTriangle aria-hidden="true" className="size-4" />}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{alert.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{alert.description}</p>
                    </div>
                  </div>
                  <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={alert.href}>
                    {alert.label}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="coverage-heading" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="microlabel">Confiabilidade</p>
              <h2 id="coverage-heading" className="mt-1 text-lg font-semibold tracking-tight">Cobertura dos dados</h2>
            </div>
            <span className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] font-medium',
              metrics?.coverage.status === 'complete'
                ? 'border-success-fg/20 bg-success-bg text-success-fg'
                : 'border-warning-border bg-warning-bg text-warning-fg',
            )}>
              {metrics?.coverage.status === 'complete' ? 'Completa' : metrics?.coverage.status === 'partial' ? 'Parcial' : 'Indisponível'}
            </span>
          </div>

          {metrics ? (
            <>
              <div className="mt-5 grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted/60 p-3">
                  <p className="microlabel">Fontes</p>
                  <p className="num mt-1 text-lg font-semibold">{metrics.coverage.availableSources}/{metrics.coverage.totalSources}</p>
                </div>
                <div className="rounded-lg bg-muted/60 p-3">
                  <p className="microlabel">Assin. precificadas</p>
                  <p className="num mt-1 text-lg font-semibold">{formatNumber(metrics.coverage.pricedActiveSubscriptions)}</p>
                </div>
                <div className="rounded-lg bg-muted/60 p-3">
                  <p className="microlabel">Truncadas</p>
                  <p className="num mt-1 text-lg font-semibold">{metrics.coverage.truncatedSources}</p>
                </div>
              </div>
              <ul className="mt-4 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                {Object.entries(metrics.coverage.sources).map(([name, source]) => (
                  <li className="flex items-center justify-between gap-3 border-b py-2.5" key={name}>
                    <span className="truncate text-xs text-muted-foreground">{sourceLabels[name] ?? name}</span>
                    <span className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium',
                      source.status === 'available' && !source.truncated ? 'text-success-fg' : 'text-warning-fg',
                    )}>
                      <span aria-hidden="true" className={cn('status-dot', source.status === 'available' && !source.truncated ? 'bg-success-fg' : 'bg-warning')} />
                      {source.status === 'unavailable' ? 'Indisponível' : source.truncated ? 'Parcial' : 'Disponível'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">Métricas indisponíveis para avaliar cobertura.</p>
          )}
        </section>
      </div>

      <nav aria-label="Atalhos administrativos seguros" className="rounded-2xl border bg-muted/25 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="microlabel">Atalhos seguros</p>
            <p className="mt-1 text-sm font-medium">Acesse diagnósticos e filas; nenhuma ação crítica é executada pelo cockpit.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className={buttonVariants({ variant: 'outline' })} href="/admin/users"><Users aria-hidden="true" /> Organizações</Link>
            <Link className={buttonVariants({ variant: 'outline' })} href="/admin/tickets"><LifeBuoy aria-hidden="true" /> Chamados</Link>
            <Link className={buttonVariants({ variant: 'outline' })} href="/admin/queues"><Activity aria-hidden="true" /> Filas</Link>
            <Link className={buttonVariants({ variant: 'outline' })} href="/admin/audit"><Clock3 aria-hidden="true" /> Auditoria</Link>
          </div>
        </div>
      </nav>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  Building2,
  CheckCircle2,
  Eye,
  FilterX,
  KeyRound,
  Loader2,
  MessageCircleMore,
  Power,
  QrCode,
  RefreshCw,
  RotateCw,
  Search,
  Server,
  ShieldCheck,
  Star,
  ThermometerSun,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'

import { useAdminCriticalAction } from '@/components/admin-critical-action-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { phoneMask } from '@/lib/utils'

type InstanceStatus = 'connected' | 'connecting' | 'disconnected' | 'error' | 'unknown'
type InstanceMode = 'integrated' | 'external'
type FleetAction = 'set_primary' | 'restart' | 'disconnect'

type FleetInstance = {
  id: string
  organizationId: string | null
  organizationName: string | null
  ownerEmail: string | null
  instanceName: string
  phoneNumber: string | null
  mode: InstanceMode
  status: InstanceStatus
  isPrimary: boolean
  isWarmingUp: boolean
  hasQrCode: boolean
  credentialsConfigured: boolean
  createdAt: string
  lastRecordedActivityAt: string
  lastFailure: { action: string; at: string } | null
  signalCount: number
}

type FleetResponse = {
  data: {
    instances: FleetInstance[]
    summary: {
      total: number
      organizations: number
      connected: number
      disconnected: number
      otherStatuses: number
      withOperationalSignals: number
    }
  }
  meta: {
    generatedAt: string
    statusSource: string
    activitySource: string
    failureSource: string
  }
}

const emptySummary: FleetResponse['data']['summary'] = {
  total: 0,
  organizations: 0,
  connected: 0,
  disconnected: 0,
  otherStatuses: 0,
  withOperationalSignals: 0,
}

const statusLabels: Record<InstanceStatus, string> = {
  connected: 'Conectada',
  connecting: 'Conectando',
  disconnected: 'Desconectada',
  error: 'Erro reportado',
  unknown: 'Status desconhecido',
}

const auditActionLabels: Record<string, string> = {
  'admin.instance.set_primary': 'Falha ao definir como principal',
  'admin.instance.restart': 'Falha ao reiniciar',
  'admin.instance.disconnect': 'Falha ao desconectar',
}

function formatDateTime(value: string | null) {
  if (!value) return 'Sem registro'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return 'Sem registro'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function StatusBadge({ status }: { status: InstanceStatus }) {
  const variants: Record<InstanceStatus, string> = {
    connected: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    connecting: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    disconnected: 'border-border bg-muted text-muted-foreground',
    error: 'border-destructive/20 bg-destructive/10 text-destructive',
    unknown: 'border-border bg-muted text-muted-foreground',
  }

  return (
    <Badge variant="outline" className={variants[status]}>
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${status === 'connected' ? 'bg-emerald-500' : status === 'connecting' ? 'bg-amber-500' : status === 'error' ? 'bg-destructive' : 'bg-muted-foreground'}`}
      />
      {statusLabels[status]}
    </Badge>
  )
}

function ModeBadge({ mode }: { mode: InstanceMode }) {
  return (
    <Badge variant="outline" className="font-normal">
      {mode === 'integrated' ? 'Nuvem gerenciada' : 'API própria'}
    </Badge>
  )
}

function LoadingState() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando frota de instâncias">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2"><Skeleton className="h-7 w-64" /><Skeleton className="h-4 w-80 max-w-full" /></div>
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
      </div>
      <Skeleton className="h-20 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
      <span className="sr-only" role="status">Carregando instâncias do WhatsApp</span>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string
  value: number
  detail: string
  icon: typeof Server
}) {
  return (
    <Card className="relative min-h-28 overflow-hidden">
      <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-primary/5" />
      <CardContent className="relative flex h-full items-start justify-between gap-4 pt-1">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className="rounded-xl border bg-background p-2.5 text-muted-foreground shadow-sm"><Icon className="size-4" /></div>
      </CardContent>
    </Card>
  )
}

function InstanceSignals({ instance, compact = false }: { instance: FleetInstance; compact?: boolean }) {
  const signals = [
    !instance.credentialsConfigured ? { label: 'Credenciais ausentes', icon: KeyRound, tone: 'text-destructive' } : null,
    instance.hasQrCode ? { label: 'QR disponível', icon: QrCode, tone: 'text-amber-700 dark:text-amber-300' } : null,
    instance.isWarmingUp ? { label: 'Aquecimento ativo', icon: ThermometerSun, tone: 'text-orange-700 dark:text-orange-300' } : null,
    instance.lastFailure ? { label: auditActionLabels[instance.lastFailure.action] || 'Falha administrativa registrada', icon: AlertCircle, tone: 'text-destructive' } : null,
  ].filter((signal): signal is NonNullable<typeof signal> => Boolean(signal))

  if (signals.length === 0) {
    return <span className="text-xs text-muted-foreground">Sem sinal adicional disponível</span>
  }

  if (compact) {
    return <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300">{signals.length} {signals.length === 1 ? 'sinal' : 'sinais'}</Badge>
  }

  return (
    <div className="space-y-2">
      {signals.map(({ label, icon: Icon, tone }) => (
        <div key={label} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
          <Icon className={`size-4 shrink-0 ${tone}`} aria-hidden="true" />
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}

export function InstancesFleet() {
  const confirmCritical = useAdminCriticalAction()
  const [instances, setInstances] = useState<FleetInstance[]>([])
  const [summary, setSummary] = useState(emptySummary)
  const [meta, setMeta] = useState<FleetResponse['meta'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<FleetInstance | null>(null)
  const [pendingAction, setPendingAction] = useState<FleetAction | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | InstanceStatus>('all')
  const [mode, setMode] = useState<'all' | InstanceMode>('all')
  const [organization, setOrganization] = useState('all')
  const [primaryOnly, setPrimaryOnly] = useState(false)

  const loadFleet = useCallback(async (background = false) => {
    if (background) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/instances', { cache: 'no-store' })
      const payload = await response.json().catch(() => null) as FleetResponse | { error?: { message?: string } } | null
      if (!response.ok || !payload || !('data' in payload)) {
        throw new Error(payload && 'error' in payload ? payload.error?.message : 'Não foi possível carregar a frota')
      }
      setInstances(payload.data.instances)
      setSummary(payload.data.summary)
      setMeta(payload.meta)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a frota')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadFleet(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadFleet])

  const organizations = useMemo(() => {
    const map = new Map<string, string>()
    for (const instance of instances) {
      const key = instance.organizationId || `unassigned:${instance.ownerEmail || instance.id}`
      map.set(key, instance.organizationName || 'Sem organização vinculada')
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [instances])

  const filteredInstances = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR')
    return instances.filter((instance) => {
      const organizationKey = instance.organizationId || `unassigned:${instance.ownerEmail || instance.id}`
      const matchesTerm = !term || [instance.instanceName, instance.organizationName, instance.ownerEmail, instance.phoneNumber]
        .some((value) => value?.toLocaleLowerCase('pt-BR').includes(term))
      return matchesTerm
        && (status === 'all' || instance.status === status)
        && (mode === 'all' || instance.mode === mode)
        && (organization === 'all' || organizationKey === organization)
        && (!primaryOnly || instance.isPrimary)
    })
  }, [instances, mode, organization, primaryOnly, search, status])

  const groupedInstances = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; instances: FleetInstance[] }>()
    for (const instance of filteredInstances) {
      const id = instance.organizationId || `unassigned:${instance.ownerEmail || instance.id}`
      const group = groups.get(id) || { id, name: instance.organizationName || 'Sem organização vinculada', instances: [] }
      group.instances.push(instance)
      groups.set(id, group)
    }
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [filteredInstances])

  const hasFilters = Boolean(search || status !== 'all' || mode !== 'all' || organization !== 'all' || primaryOnly)

  const clearFilters = () => {
    setSearch('')
    setStatus('all')
    setMode('all')
    setOrganization('all')
    setPrimaryOnly(false)
  }

  const runAction = async (action: FleetAction, instance: FleetInstance) => {
    const options = action === 'set_primary'
      ? { title: 'Definir instância principal', description: 'Esta instância passará a receber os fluxos que exigem o número principal da organização.', confirmationText: `PRINCIPAL ${instance.instanceName}` }
      : action === 'restart'
        ? { title: 'Reiniciar instância', description: 'A Evolution API receberá uma solicitação de reinicialização da instância.', confirmationText: `REINICIAR ${instance.instanceName}` }
        : { title: 'Desconectar instância', description: 'A sessão do WhatsApp será encerrada na Evolution API e o status local só será alterado após sucesso remoto.', confirmationText: `DESCONECTAR ${instance.instanceName}` }

    const critical = await confirmCritical(options)
    if (!critical) return
    setPendingAction(action)

    try {
      const response = await fetch('/api/admin/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, instanceId: instance.id, ...critical }),
      })
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null
      if (!response.ok) throw new Error(payload?.error?.message || 'A ação não pôde ser concluída')
      toast.success(action === 'set_primary' ? 'Instância definida como principal' : action === 'restart' ? 'Reinicialização solicitada' : 'Instância desconectada')
      setSelected(null)
      await loadFleet(true)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'A ação não pôde ser concluída')
    } finally {
      setPendingAction(null)
    }
  }

  if (loading) return <LoadingState />

  if (error && instances.length === 0) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center" role="alert">
        <Card className="w-full max-w-lg border-destructive/20">
          <CardContent className="flex flex-col items-center px-8 py-10 text-center">
            <div className="mb-4 rounded-full bg-destructive/10 p-3 text-destructive"><AlertCircle className="size-6" /></div>
            <h1 className="text-lg font-semibold">Não foi possível carregar as instâncias</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Button className="mt-6" onClick={() => void loadFleet()}><RefreshCw />Tentar novamente</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="max-w-3xl">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            <MessageCircleMore className="size-4 text-emerald-500" aria-hidden="true" /> Operações WhatsApp
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Frota de instâncias</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Estado persistido, organização responsável e sinais operacionais disponíveis — sem estimativas de uptime ou conectividade inferida.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          {meta && <span className="text-xs text-muted-foreground">Atualizado em {formatDateTime(meta.generatedAt)}</span>}
          <Button variant="outline" onClick={() => void loadFleet(true)} disabled={refreshing} aria-label="Atualizar frota de instâncias">
            <RefreshCw className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Atualizando…' : 'Atualizar'}
          </Button>
        </div>
      </header>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm" role="alert">
          <span className="flex items-center gap-2"><AlertCircle className="size-4 text-destructive" />{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void loadFleet(true)}>Tentar novamente</Button>
        </div>
      )}

      <section aria-label="Resumo da frota" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Instâncias" value={summary.total} detail="registros na frota" icon={Server} />
        <SummaryCard label="Organizações" value={summary.organizations} detail="com instância registrada" icon={Building2} />
        <SummaryCard label="Conectadas" value={summary.connected} detail="status reportado no banco" icon={Wifi} />
        <SummaryCard label="Sinais disponíveis" value={summary.withOperationalSignals} detail="credencial, QR, aquecimento ou auditoria" icon={Activity} />
      </section>

      {instances.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 rounded-full border bg-muted/40 p-4 text-muted-foreground"><Server className="size-7" /></div>
            <h2 className="text-lg font-semibold">Nenhuma instância registrada</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">A frota aparecerá aqui quando uma organização registrar uma instância real do WhatsApp.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="space-y-4 pt-1">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.5fr)_repeat(3,minmax(150px,0.7fr))_auto]">
                <div className="space-y-1.5">
                  <label htmlFor="instance-search" className="text-xs font-medium text-muted-foreground">Buscar</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input id="instance-search" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Instância, organização, e-mail ou telefone" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="status-filter" className="text-xs font-medium text-muted-foreground">Status</label>
                  <select id="status-filter" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                    <option value="all">Todos</option>
                    <option value="connected">Conectada</option>
                    <option value="connecting">Conectando</option>
                    <option value="disconnected">Desconectada</option>
                    <option value="error">Erro reportado</option>
                    <option value="unknown">Desconhecido</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="mode-filter" className="text-xs font-medium text-muted-foreground">Modo</label>
                  <select id="mode-filter" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                    <option value="all">Todos</option>
                    <option value="integrated">Nuvem gerenciada</option>
                    <option value="external">API própria</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="organization-filter" className="text-xs font-medium text-muted-foreground">Organização</label>
                  <select id="organization-filter" value={organization} onChange={(event) => setOrganization(event.target.value)} className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                    <option value="all">Todas</option>
                    {organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm whitespace-nowrap">
                    <input type="checkbox" checked={primaryOnly} onChange={(event) => setPrimaryOnly(event.target.checked)} className="size-4 accent-primary" /> Principais
                  </label>
                  {hasFilters && <Button variant="ghost" size="icon" onClick={clearFilters} aria-label="Limpar filtros"><FilterX /></Button>}
                </div>
              </div>
              <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground" aria-live="polite">
                <span>{filteredInstances.length} de {instances.length} {instances.length === 1 ? 'instância' : 'instâncias'}</span>
                <span>Status é o último valor persistido, não uma sondagem ao vivo.</span>
              </div>
            </CardContent>
          </Card>

          {groupedInstances.length === 0 ? (
            <Card>
              <CardContent className="flex min-h-52 flex-col items-center justify-center text-center">
                <Search className="mb-3 size-6 text-muted-foreground" />
                <h2 className="font-semibold">Nenhuma correspondência</h2>
                <p className="mt-1 text-sm text-muted-foreground">Ajuste os filtros para consultar outra parte da frota.</p>
                <Button variant="outline" className="mt-4" onClick={clearFilters}><FilterX />Limpar filtros</Button>
              </CardContent>
            </Card>
          ) : groupedInstances.map((group) => {
            const connected = group.instances.filter((instance) => instance.status === 'connected').length
            return (
              <Card key={group.id}>
                <CardHeader className="border-b">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="rounded-xl border bg-background p-2.5 text-muted-foreground"><Building2 className="size-4" /></div>
                      <div className="min-w-0">
                        <h2 className="truncate font-semibold">{group.name}</h2>
                        <p className="text-xs text-muted-foreground">{group.instances.length} {group.instances.length === 1 ? 'instância' : 'instâncias'} · {connected} com status conectado</p>
                      </div>
                    </div>
                    {!group.id.startsWith('unassigned:') && <span className="max-w-full truncate font-mono text-[11px] text-muted-foreground">{group.id}</span>}
                  </div>
                </CardHeader>
                <CardContent className="px-0">
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader><TableRow><TableHead className="pl-4">Instância</TableHead><TableHead>Status</TableHead><TableHead>Telefone</TableHead><TableHead>Modo</TableHead><TableHead>Última atividade registrada</TableHead><TableHead>Sinais</TableHead><TableHead className="pr-4 text-right">Detalhes</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {group.instances.map((instance) => (
                          <TableRow key={instance.id}>
                            <TableCell className="pl-4">
                              <div className="flex items-center gap-2 font-medium">{instance.instanceName}{instance.isPrimary && <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300"><Star className="fill-current" />Principal</Badge>}</div>
                              <div className="mt-1 text-xs text-muted-foreground">{instance.ownerEmail || 'Proprietário não disponível'}</div>
                            </TableCell>
                            <TableCell><StatusBadge status={instance.status} /></TableCell>
                            <TableCell>{instance.phoneNumber ? phoneMask(instance.phoneNumber) : <span className="text-muted-foreground">Não informado</span>}</TableCell>
                            <TableCell><ModeBadge mode={instance.mode} /></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{formatDateTime(instance.lastRecordedActivityAt)}</TableCell>
                            <TableCell><InstanceSignals instance={instance} compact /></TableCell>
                            <TableCell className="pr-4 text-right"><Button variant="ghost" size="icon" onClick={() => setSelected(instance)} aria-label={`Ver detalhes de ${instance.instanceName}`}><Eye /></Button></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="divide-y md:hidden">
                    {group.instances.map((instance) => (
                      <article key={instance.id} className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0"><h3 className="truncate font-medium">{instance.instanceName}</h3><p className="mt-1 truncate text-xs text-muted-foreground">{instance.ownerEmail || 'Proprietário não disponível'}</p></div>
                          <StatusBadge status={instance.status} />
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs"><div><p className="text-muted-foreground">Telefone</p><p className="mt-1 font-medium">{instance.phoneNumber ? phoneMask(instance.phoneNumber) : 'Não informado'}</p></div><div><p className="text-muted-foreground">Atividade registrada</p><p className="mt-1 font-medium">{formatDateTime(instance.lastRecordedActivityAt)}</p></div></div>
                        <div className="flex items-center justify-between gap-3"><div className="flex flex-wrap gap-2"><ModeBadge mode={instance.mode} />{instance.isPrimary && <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300"><Star className="fill-current" />Principal</Badge>}</div><Button variant="outline" size="sm" onClick={() => setSelected(instance)}><Eye />Detalhes</Button></div>
                      </article>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </>
      )}

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
          {selected && (
            <>
              <SheetHeader className="border-b px-6 py-5 pr-14 text-left">
                <div className="mb-3 flex flex-wrap items-center gap-2"><StatusBadge status={selected.status} />{selected.isPrimary && <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300"><Star className="fill-current" />Principal</Badge>}</div>
                <SheetTitle className="break-all text-xl">{selected.instanceName}</SheetTitle>
                <SheetDescription>{selected.organizationName || 'Sem organização vinculada'} · {selected.ownerEmail || 'Proprietário não disponível'}</SheetDescription>
              </SheetHeader>

              <div className="space-y-7 px-6 py-5">
                <section aria-labelledby="instance-details-title">
                  <h3 id="instance-details-title" className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Identificação</h3>
                  <dl className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">
                    {[
                      ['Telefone', selected.phoneNumber ? phoneMask(selected.phoneNumber) : 'Não informado'],
                      ['Modo', selected.mode === 'integrated' ? 'Nuvem gerenciada' : 'API própria'],
                      ['Criada em', formatDateTime(selected.createdAt)],
                      ['Última atividade registrada', formatDateTime(selected.lastRecordedActivityAt)],
                    ].map(([label, value]) => <div key={label} className="bg-card p-3.5"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}
                  </dl>
                </section>

                <section aria-labelledby="operational-reading-title">
                  <h3 id="operational-reading-title" className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Leitura operacional</h3>
                  <div className="rounded-xl border bg-muted/25 p-4">
                    <div className="flex items-start gap-3">
                      {selected.status === 'connected' ? <Wifi className="mt-0.5 size-5 shrink-0 text-emerald-500" /> : <WifiOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
                      <div><p className="font-medium">{statusLabels[selected.status]}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Este é o último estado salvo por webhooks ou rotinas existentes. A página não calcula uptime nem presume conexão ao vivo.</p></div>
                    </div>
                  </div>
                </section>

                <section aria-labelledby="instance-signals-title">
                  <div className="mb-3 flex items-center justify-between gap-3"><h3 id="instance-signals-title" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Sinais disponíveis</h3>{selected.credentialsConfigured && <span className="flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5 text-emerald-500" />Credenciais configuradas</span>}</div>
                  <InstanceSignals instance={selected} />
                  {selected.lastFailure && <p className="mt-2 text-xs text-muted-foreground">Última falha associada: {formatDateTime(selected.lastFailure.at)}</p>}
                </section>

                <section aria-labelledby="protected-actions-title" className="border-t pt-6">
                  <div className="mb-4 flex items-start gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><ShieldCheck className="size-4" /></div><div><h3 id="protected-actions-title" className="font-semibold">Ações protegidas</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Exigem senha recente, motivo, confirmação exata e chave idempotente. Toda tentativa é auditada.</p></div></div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button variant="outline" disabled={Boolean(pendingAction) || selected.isPrimary || selected.status !== 'connected'} onClick={() => void runAction('set_primary', selected)}>{pendingAction === 'set_primary' ? <Loader2 className="animate-spin" /> : <Star />}Tornar principal</Button>
                    <Button variant="outline" disabled={Boolean(pendingAction) || !selected.credentialsConfigured} onClick={() => void runAction('restart', selected)}>{pendingAction === 'restart' ? <Loader2 className="animate-spin" /> : <RotateCw />}Reiniciar</Button>
                    <Button variant="destructive" className="sm:col-span-2" disabled={Boolean(pendingAction) || !selected.credentialsConfigured || selected.status === 'disconnected'} onClick={() => void runAction('disconnect', selected)}>{pendingAction === 'disconnect' ? <Loader2 className="animate-spin" /> : <Power />}Desconectar sessão</Button>
                  </div>
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

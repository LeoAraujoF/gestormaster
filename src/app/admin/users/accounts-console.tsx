"use client"

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  Ban,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  CreditCard,
  KeyRound,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAdminCriticalAction } from '@/components/admin-critical-action-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

type PlanId = 'starter' | 'pro' | 'master'
type BillingState = 'active' | 'expired' | 'inactive' | 'missing'
type AccountState = 'active' | 'blocked' | 'pending_deletion' | 'unconfirmed'
type OrganizationRole = 'owner' | 'admin' | 'member'

type PlanCatalogItem = {
  id: PlanId
  name: string
  description: string
  monthlyPriceCents: number | null
  clientLimit: number | null
  whatsappInstanceLimit: number
  capabilities: string[]
  isPublic: boolean
  isPurchasable: boolean
}

type OrganizationEntitlement = {
  planId: PlanId
  planName: string
  isActive: boolean
  state: BillingState
  expiresAt: string | null
  source: string
  updatedAt: string | null
  providerCustomerConfigured: boolean
  providerSubscriptionConfigured: boolean
  limits: { clients: number | null; whatsappInstances: number } | null
  capabilities: string[]
}

type OrganizationMember = {
  userId: string
  email: string | null
  name: string
  role: OrganizationRole
  blocked: boolean
  joinedAt: string
}

type AccountOrganization = {
  id: string
  name: string
  role: OrganizationRole
  createdAt: string | null
  updatedAt: string | null
  memberCount: number
  members: OrganizationMember[]
  entitlement: OrganizationEntitlement | null
}

type Account = {
  id: string
  email: string | null
  name: string
  phone: string
  createdAt: string
  lastSignInAt: string | null
  emailConfirmedAt: string | null
  accountState: AccountState
  blocked: boolean
  deletion: { requestedAt: string; purgeAfter: string; blockedReason: string | null } | null
  organizations: AccountOrganization[]
}

type AccountsResponse = {
  data: { accounts: Account[]; catalog: PlanCatalogItem[] }
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

type Filters = {
  plan: 'all' | PlanId
  billing: 'all' | BillingState
  account: 'all' | AccountState
  role: 'all' | OrganizationRole
  sort: 'created_desc' | 'last_sign_in_desc' | 'email_asc'
}

const DEFAULT_FILTERS: Filters = {
  plan: 'all',
  billing: 'all',
  account: 'all',
  role: 'all',
  sort: 'created_desc',
}

const ACCOUNT_LABELS: Record<AccountState, string> = {
  active: 'Ativa',
  blocked: 'Bloqueada',
  pending_deletion: 'Exclusão pendente',
  unconfirmed: 'E-mail não confirmado',
}

const BILLING_LABELS: Record<BillingState, string> = {
  active: 'Ativo',
  expired: 'Expirado',
  inactive: 'Inativo',
  missing: 'Sem entitlement',
}

const ROLE_LABELS: Record<OrganizationRole, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  member: 'Membro',
}

const SOURCE_LABELS: Record<string, string> = {
  admin: 'Admin',
  stripe: 'Stripe',
  pixgo: 'PixGo',
  affiliate: 'Afiliados',
  migration: 'Migração',
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return withTime ? dateTimeFormatter.format(date) : dateFormatter.format(date)
}

function dateInputValue(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

function toExpiration(value: string) {
  return value ? new Date(`${value}T23:59:59.999Z`).toISOString() : null
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0] || ''}` : parts[0]?.slice(0, 2) || '??').toUpperCase()
}

function humanizeCapability(value: string) {
  return value.replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase())
}

async function apiError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { error?: string | { message?: string } } | null
  if (typeof payload?.error === 'string') return payload.error
  return payload?.error?.message || fallback
}

function AccountStatusBadge({ state }: { state: AccountState }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 whitespace-nowrap border-0',
        state === 'active' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        state === 'blocked' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
        state === 'pending_deletion' && 'bg-red-500/10 text-red-600 dark:text-red-400',
        state === 'unconfirmed' && 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
      )}
    >
      <span className={cn('size-1.5 rounded-full', state === 'active' ? 'bg-emerald-500' : state === 'pending_deletion' ? 'bg-red-500' : state === 'blocked' ? 'bg-amber-500' : 'bg-sky-500')} />
      {ACCOUNT_LABELS[state]}
    </Badge>
  )
}

function BillingStatusBadge({ state }: { state: BillingState }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'whitespace-nowrap',
        state === 'active' && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        state === 'expired' && 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400',
        state === 'inactive' && 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400',
        state === 'missing' && 'text-muted-foreground',
      )}
    >
      {BILLING_LABELS[state]}
    </Badge>
  )
}

function LoadingState() {
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between"><Skeleton className="h-8 w-64" /><Skeleton className="h-8 w-28" /></div>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-9" />)}</div>
      <div className="space-y-2 pt-2">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>
    </div>
  )
}

export function AdminAccountsConsole() {
  const confirmCritical = useAdminCriticalAction()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [catalog, setCatalog] = useState<PlanCatalogItem[]>([])
  const [meta, setMeta] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 })
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [actionBusy, setActionBusy] = useState<string | null>(null)

  const selectedAccount = accounts.find((account) => account.id === selectedId) || null
  const activeOrganization = selectedAccount?.organizations.find((organization) => organization.id === activeOrganizationId)
    || selectedAccount?.organizations[0]
    || null

  const requestAccounts = useCallback(async (signal?: AbortSignal) => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(meta.pageSize),
      q: debouncedQuery,
      plan: filters.plan,
      billing: filters.billing,
      account: filters.account,
      role: filters.role,
      sort: filters.sort,
    })

    const response = await fetch(`/api/admin/users?${params}`, { cache: 'no-store', signal })
    if (!response.ok) throw new Error(await apiError(response, 'Não foi possível carregar as contas'))
    return await response.json() as AccountsResponse
  }, [debouncedQuery, filters, meta.pageSize, page])

  const loadAccounts = useCallback(async (mode: 'load' | 'refresh' = 'load') => {
    if (mode === 'refresh') setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const payload = await requestAccounts()
      setAccounts(payload.data.accounts)
      setCatalog(payload.data.catalog)
      setMeta(payload.meta)
      if (payload.meta.page !== page) setPage(payload.meta.page)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as contas')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [page, requestAccounts])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true)
      setDebouncedQuery(query.trim())
    }, 350)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const controller = new AbortController()
    requestAccounts(controller.signal).then((payload) => {
      setAccounts(payload.data.accounts)
      setCatalog(payload.data.catalog)
      setMeta(payload.meta)
      if (payload.meta.page !== page) setPage(payload.meta.page)
      setError('')
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as contas')
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [page, requestAccounts])

  const setFilter = <Key extends keyof Filters>(key: Key, value: Filters[Key]) => {
    setLoading(true)
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }

  const clearFilters = () => {
    setLoading(true)
    setFilters(DEFAULT_FILTERS)
    setQuery('')
    setDebouncedQuery('')
    setPage(1)
  }

  const performAccountAction = async (kind: 'block' | 'unblock' | 'delete' | 'restore', account: Account) => {
    const config = {
      block: { title: 'Bloquear conta', description: 'O acesso será interrompido e as sessões atuais serão revogadas.', confirmation: `BLOQUEAR ${account.id}`, method: 'POST', endpoint: '/api/admin/users/block', body: { userId: account.id, isBlocked: true }, success: 'Conta bloqueada com sucesso.' },
      unblock: { title: 'Desbloquear conta', description: 'A conta poderá voltar a autenticar e usar os recursos autorizados.', confirmation: `DESBLOQUEAR ${account.id}`, method: 'POST', endpoint: '/api/admin/users/block', body: { userId: account.id, isBlocked: false }, success: 'Conta desbloqueada com sucesso.' },
      delete: { title: 'Agendar exclusão', description: 'A conta será bloqueada agora e permanecerá recuperável por 30 dias.', confirmation: `EXCLUIR ${account.id}`, method: 'POST', endpoint: '/api/admin/users/delete', body: { userId: account.id }, success: 'Exclusão agendada; a conta pode ser restaurada durante a retenção.' },
      restore: { title: 'Restaurar conta', description: 'O pedido de exclusão será cancelado e o acesso da conta será restaurado.', confirmation: `RESTAURAR ${account.id}`, method: 'DELETE', endpoint: '/api/admin/users/delete', body: { userId: account.id }, success: 'Conta restaurada com sucesso.' },
    }[kind]

    const critical = await confirmCritical({ title: config.title, description: config.description, confirmationText: config.confirmation })
    if (!critical) return
    setActionBusy(`${kind}:${account.id}`)
    try {
      const response = await fetch(config.endpoint, {
        method: config.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config.body, ...critical }),
      })
      if (!response.ok) throw new Error(await apiError(response, 'A ação não pôde ser concluída'))
      toast.success(config.success)
      await loadAccounts('refresh')
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'A ação não pôde ser concluída')
    } finally {
      setActionBusy(null)
    }
  }

  const hasFilters = query.trim() || Object.entries(filters).some(([key, value]) => value !== DEFAULT_FILTERS[key as keyof Filters])

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-500">
      <section className="relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <ShieldCheck className="size-3.5 text-primary" /> Administração segura
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Contas e organizações</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
                Consulte identidades, vínculos, planos e entitlements oficiais. Alterações críticas exigem motivo, confirmação e nova autenticação.
              </p>
            </div>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => void loadAccounts('refresh')} disabled={refreshing}>
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} /> Atualizar
            </Button>
            <Button className="flex-1 sm:flex-none" onClick={() => setCreateOpen(true)} disabled={!catalog.length}>
              <Plus className="size-4" /> Nova conta
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-card shadow-sm">
        <div className="border-b p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => { setQuery(event.target.value); setPage(1) }}
                className="h-10 pl-9"
                placeholder="Buscar por nome, e-mail, telefone ou organização"
                aria-label="Buscar contas"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:flex">
              <Select value={filters.plan} onValueChange={(value) => setFilter('plan', (value || 'all') as Filters['plan'])}>
                <SelectTrigger className="h-10 w-full xl:w-36"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todos os planos</SelectItem>{catalog.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={filters.billing} onValueChange={(value) => setFilter('billing', (value || 'all') as Filters['billing'])}>
                <SelectTrigger className="h-10 w-full xl:w-40"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Toda cobrança</SelectItem><SelectItem value="active">Entitlement ativo</SelectItem><SelectItem value="expired">Expirado</SelectItem><SelectItem value="inactive">Inativo</SelectItem><SelectItem value="missing">Sem entitlement</SelectItem></SelectContent>
              </Select>
              <Select value={filters.account} onValueChange={(value) => setFilter('account', (value || 'all') as Filters['account'])}>
                <SelectTrigger className="h-10 w-full xl:w-40"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todo acesso</SelectItem><SelectItem value="active">Conta ativa</SelectItem><SelectItem value="blocked">Bloqueada</SelectItem><SelectItem value="pending_deletion">Exclusão pendente</SelectItem><SelectItem value="unconfirmed">Não confirmada</SelectItem></SelectContent>
              </Select>
              <Select value={filters.role} onValueChange={(value) => setFilter('role', (value || 'all') as Filters['role'])}>
                <SelectTrigger className="h-10 w-full xl:w-36"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todos os papéis</SelectItem><SelectItem value="owner">Proprietário</SelectItem><SelectItem value="admin">Administrador</SelectItem><SelectItem value="member">Membro</SelectItem></SelectContent>
              </Select>
              <Select value={filters.sort} onValueChange={(value) => setFilter('sort', (value || 'created_desc') as Filters['sort'])}>
                <SelectTrigger className="col-span-2 h-10 w-full sm:col-span-1 xl:w-44"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="created_desc">Mais recentes</SelectItem><SelectItem value="last_sign_in_desc">Último acesso</SelectItem><SelectItem value="email_asc">E-mail A–Z</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-3 flex min-h-7 items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{loading ? 'Consultando…' : `${meta.total} ${meta.total === 1 ? 'conta encontrada' : 'contas encontradas'}`}</span>
            {hasFilters ? <Button variant="ghost" size="sm" onClick={clearFilters}><SlidersHorizontal className="size-3.5" /> Limpar filtros</Button> : null}
          </div>
        </div>

        {loading && !accounts.length ? <div className="p-4 sm:p-5"><LoadingState /></div> : error ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"><CircleAlert className="size-6" /></div>
            <h2 className="font-semibold">Não foi possível abrir a central</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" className="mt-5" onClick={() => void loadAccounts()}><RefreshCw className="size-4" /> Tentar novamente</Button>
          </div>
        ) : !accounts.length ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Users className="size-6" /></div>
            <h2 className="font-semibold">Nenhuma conta corresponde à consulta</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">Ajuste a busca ou remova filtros para ampliar os resultados.</p>
            {hasFilters ? <Button variant="outline" className="mt-5" onClick={clearFilters}>Limpar filtros</Button> : null}
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <Table>
                <TableHeader><TableRow className="bg-muted/30"><TableHead>Conta</TableHead><TableHead>Organização</TableHead><TableHead>Plano oficial</TableHead><TableHead>Cobrança</TableHead><TableHead>Acesso</TableHead><TableHead>Última atividade</TableHead><TableHead className="w-20" /></TableRow></TableHeader>
                <TableBody>
                  {accounts.map((account) => {
                    const organization = account.organizations[0]
                    const entitlement = organization?.entitlement
                    return (
                      <TableRow key={account.id} className="cursor-pointer" onClick={() => setSelectedId(account.id)}>
                        <TableCell><AccountIdentity account={account} /></TableCell>
                        <TableCell>{organization ? <div><p className="max-w-48 truncate font-medium">{organization.name}</p><p className="text-xs text-muted-foreground">{ROLE_LABELS[organization.role]} · {organization.memberCount} {organization.memberCount === 1 ? 'membro' : 'membros'}{account.organizations.length > 1 ? ` · +${account.organizations.length - 1} org.` : ''}</p></div> : <span className="text-sm text-muted-foreground">Sem organização</span>}</TableCell>
                        <TableCell>{entitlement ? <div><Badge variant="secondary">{entitlement.planName}</Badge><p className="mt-1 text-xs text-muted-foreground">Fonte: {SOURCE_LABELS[entitlement.source] || entitlement.source}</p></div> : <span className="text-sm text-muted-foreground">Não definido</span>}</TableCell>
                        <TableCell><BillingStatusBadge state={entitlement?.state || 'missing'} /></TableCell>
                        <TableCell><AccountStatusBadge state={account.accountState} /></TableCell>
                        <TableCell><p className="text-sm">{formatDate(account.lastSignInAt, true)}</p><p className="text-xs text-muted-foreground">Criada {formatDate(account.createdAt)}</p></TableCell>
                        <TableCell><Button variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); setSelectedId(account.id) }}>Detalhes</Button></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="divide-y lg:hidden">
              {accounts.map((account) => {
                const organization = account.organizations[0]
                const entitlement = organization?.entitlement
                return (
                  <button key={account.id} type="button" className="w-full p-4 text-left transition-colors hover:bg-muted/30" onClick={() => setSelectedId(account.id)}>
                    <div className="flex items-start justify-between gap-3"><AccountIdentity account={account} /><AccountStatusBadge state={account.accountState} /></div>
                    <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border bg-muted/20 p-3 text-sm">
                      <div><p className="text-xs text-muted-foreground">Organização</p><p className="mt-0.5 truncate font-medium">{organization?.name || 'Sem organização'}</p></div>
                      <div><p className="text-xs text-muted-foreground">Plano</p><p className="mt-0.5 font-medium">{entitlement?.planName || 'Não definido'}</p></div>
                      <div><p className="text-xs text-muted-foreground">Cobrança</p><div className="mt-1"><BillingStatusBadge state={entitlement?.state || 'missing'} /></div></div>
                      <div><p className="text-xs text-muted-foreground">Último acesso</p><p className="mt-0.5">{formatDate(account.lastSignInAt, true)}</p></div>
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {!error && meta.total > 0 ? (
          <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <span>Página {meta.page} de {meta.totalPages} · até {meta.pageSize} contas por página</span>
            <div className="flex gap-2"><Button variant="outline" size="sm" disabled={loading || meta.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft className="size-4" /> Anterior</Button><Button variant="outline" size="sm" disabled={loading || meta.page >= meta.totalPages} onClick={() => setPage((current) => current + 1)}>Próxima <ChevronRight className="size-4" /></Button></div>
          </div>
        ) : null}
      </section>

      <CreateAccountDialog open={createOpen} onOpenChange={setCreateOpen} catalog={catalog} confirmCritical={confirmCritical} onCreated={() => loadAccounts('refresh')} />
      <AccountDetailSheet
        key={`${selectedAccount?.id || 'closed'}:${activeOrganization?.id || 'none'}:${selectedAccount?.name || ''}:${selectedAccount?.phone || ''}:${activeOrganization?.updatedAt || ''}:${activeOrganization?.entitlement?.updatedAt || ''}`}
        account={selectedAccount}
        activeOrganization={activeOrganization}
        activeOrganizationId={activeOrganization?.id || null}
        onOrganizationChange={setActiveOrganizationId}
        catalog={catalog}
        onClose={() => setSelectedId(null)}
        onRefresh={() => loadAccounts('refresh')}
        onAction={performAccountAction}
        actionBusy={actionBusy}
        confirmCritical={confirmCritical}
      />
    </div>
  )
}

function AccountIdentity({ account }: { account: Account }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-br from-primary/10 to-primary/5 text-xs font-semibold text-primary">{initials(account.name)}</div>
      <div className="min-w-0"><p className="truncate font-medium">{account.name}</p><p className="truncate text-xs text-muted-foreground">{account.email || 'Sem e-mail'}</p></div>
    </div>
  )
}

type CriticalConfirmation = (options: { title: string; description: string; confirmationText: string }) => Promise<{ reason: string; confirmation: string; idempotencyKey: string } | null>

function CreateAccountDialog({
  open,
  onOpenChange,
  catalog,
  confirmCritical,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalog: PlanCatalogItem[]
  confirmCritical: CriticalConfirmation
  onCreated: () => Promise<void>
}) {
  const firstPlanId = catalog[0]?.id || 'starter'
  const [form, setForm] = useState({ email: '', password: '', name: '', organizationName: '', phone: '', planId: firstPlanId as PlanId, entitlementActive: 'inactive', expiresAt: '' })
  const [submitting, setSubmitting] = useState(false)
  const effectivePlanId = catalog.some((plan) => plan.id === form.planId) ? form.planId : firstPlanId

  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const email = form.email.trim().toLowerCase()
    if (!email || !form.name.trim() || !form.organizationName.trim() || form.password.length < 8) {
      toast.error('Preencha nome, organização, e-mail e uma senha de ao menos 8 caracteres.')
      return
    }
    const critical = await confirmCritical({
      title: 'Criar conta e organização',
      description: 'A identidade será confirmada e um entitlement oficial será criado para a nova organização.',
      confirmationText: `CRIAR ${email}`,
    })
    if (!critical) return

    setSubmitting(true)
    try {
      const response = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          planId: effectivePlanId,
          email,
          entitlementActive: form.entitlementActive === 'active',
          expiresAt: toExpiration(form.expiresAt),
          ...critical,
        }),
      })
      if (!response.ok) throw new Error(await apiError(response, 'Não foi possível criar a conta'))
      toast.success('Conta, organização e entitlement criados com sucesso.')
      setForm({ email: '', password: '', name: '', organizationName: '', phone: '', planId: firstPlanId, entitlementActive: 'inactive', expiresAt: '' })
      onOpenChange(false)
      await onCreated()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível criar a conta')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Plus className="size-5" /></div>
          <DialogTitle>Nova conta</DialogTitle>
          <DialogDescription>Crie a identidade e sua organização com plano e entitlement registrados na fonte oficial.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome da pessoa"><Input value={form.name} onChange={(event) => update('name', event.target.value)} maxLength={120} autoComplete="name" /></Field>
            <Field label="Nome da organização"><Input value={form.organizationName} onChange={(event) => update('organizationName', event.target.value)} maxLength={120} /></Field>
            <Field label="E-mail"><Input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} maxLength={254} autoComplete="email" /></Field>
            <Field label="Telefone de contato" hint="Opcional; usado apenas como dado de contato."><Input value={form.phone} onChange={(event) => update('phone', event.target.value)} maxLength={30} autoComplete="tel" /></Field>
            <Field label="Senha provisória" hint="Mínimo de 8 caracteres."><Input type="password" value={form.password} onChange={(event) => update('password', event.target.value)} minLength={8} maxLength={72} autoComplete="new-password" /></Field>
            <Field label="Plano oficial"><Select value={effectivePlanId} onValueChange={(value) => update('planId', value || firstPlanId)}><SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger><SelectContent>{catalog.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Estado do entitlement"><Select value={form.entitlementActive} onValueChange={(value) => update('entitlementActive', value || 'inactive')}><SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inactive">Inativo</SelectItem><SelectItem value="active">Ativo</SelectItem></SelectContent></Select></Field>
            <Field label="Expira em" hint="Opcional; sem data significa sem expiração definida."><Input type="date" value={form.expiresAt} onChange={(event) => update('expiresAt', event.target.value)} /></Field>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-muted-foreground">
            A criação não dispara mensagens nem cobranças. Credenciais devem ser entregues por um canal operacional aprovado.
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button><Button type="submit" disabled={submitting}>{submitting ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}{submitting ? 'Criando…' : 'Confirmar e criar'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AccountDetailSheet({
  account,
  activeOrganization,
  activeOrganizationId,
  onOrganizationChange,
  catalog,
  onClose,
  onRefresh,
  onAction,
  actionBusy,
  confirmCritical,
}: {
  account: Account | null
  activeOrganization: AccountOrganization | null
  activeOrganizationId: string | null
  onOrganizationChange: (id: string | null) => void
  catalog: PlanCatalogItem[]
  onClose: () => void
  onRefresh: () => Promise<void>
  onAction: (kind: 'block' | 'unblock' | 'delete' | 'restore', account: Account) => Promise<void>
  actionBusy: string | null
  confirmCritical: CriticalConfirmation
}) {
  const [name, setName] = useState(account?.name || '')
  const [phone, setPhone] = useState(account?.phone || '')
  const [organizationName, setOrganizationName] = useState(activeOrganization?.name || '')
  const [planId, setPlanId] = useState<PlanId>(activeOrganization?.entitlement?.planId || catalog[0]?.id || 'starter')
  const [entitlementState, setEntitlementState] = useState(activeOrganization?.entitlement?.isActive ? 'active' : 'inactive')
  const [expiresAt, setExpiresAt] = useState(dateInputValue(activeOrganization?.entitlement?.expiresAt))
  const [saving, setSaving] = useState(false)

  const entitlement = activeOrganization?.entitlement
  const stripeManaged = entitlement?.source === 'stripe'
  const busy = Boolean(actionBusy?.endsWith(`:${account?.id}`))

  const save = async () => {
    if (!account || !name.trim()) return
    const critical = await confirmCritical({
      title: 'Atualizar conta e organização',
      description: stripeManaged ? 'Dados de contato e nome da organização serão atualizados; o entitlement Stripe permanece somente leitura.' : 'O plano e o estado do entitlement oficial serão atualizados.',
      confirmationText: `ALTERAR ${account.id}`,
    })
    if (!critical) return
    setSaving(true)
    try {
      const response = await fetch('/api/admin/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: account.id,
          name: name.trim(),
          phone: phone.trim(),
          organization: activeOrganization ? {
            id: activeOrganization.id,
            name: organizationName.trim(),
            planId,
            entitlementActive: entitlementState === 'active',
            expiresAt: stripeManaged ? entitlement?.expiresAt || null : toExpiration(expiresAt),
          } : null,
          ...critical,
        }),
      })
      if (!response.ok) throw new Error(await apiError(response, 'Não foi possível atualizar a conta'))
      toast.success('Conta atualizada e auditoria registrada.')
      await onRefresh()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível atualizar a conta')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={Boolean(account)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-hidden p-0 sm:max-w-2xl lg:max-w-3xl">
        {account ? (
          <>
            <SheetHeader className="border-b bg-muted/20 p-5 pr-14 sm:p-6 sm:pr-14">
              <div className="flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border bg-background text-sm font-semibold text-primary shadow-sm">{initials(account.name)}</div>
                <div className="min-w-0 flex-1"><SheetTitle className="truncate text-xl">{account.name}</SheetTitle><SheetDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1"><span className="flex items-center gap-1"><Mail className="size-3.5" />{account.email || 'Sem e-mail'}</span><span className="font-mono text-xs">{account.id}</span></SheetDescription><div className="mt-3"><AccountStatusBadge state={account.accountState} /></div></div>
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
              <section className="grid gap-3 sm:grid-cols-3">
                <InfoCard icon={CalendarDays} label="Conta criada" value={formatDate(account.createdAt)} />
                <InfoCard icon={Clock3} label="Último acesso" value={formatDate(account.lastSignInAt, true)} />
                <InfoCard icon={Building2} label="Organizações" value={String(account.organizations.length)} />
              </section>

              <section className="space-y-4 rounded-2xl border p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><h3 className="font-semibold">Identidade e vínculo</h3><p className="mt-1 text-xs text-muted-foreground">Nome e telefone são dados de contato; não participam da autorização.</p></div>
                  {account.organizations.length > 1 ? <Select value={activeOrganizationId || account.organizations[0].id} onValueChange={(value) => onOrganizationChange(value || null)}><SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger><SelectContent>{account.organizations.map((organization) => <SelectItem key={organization.id} value={organization.id}>{organization.name}</SelectItem>)}</SelectContent></Select> : null}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nome de exibição"><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} /></Field>
                  <Field label="Telefone de contato"><Input value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={30} /></Field>
                  {activeOrganization ? <><Field label="Nome da organização"><Input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} maxLength={120} /></Field><Field label="Papel desta conta"><Input value={ROLE_LABELS[activeOrganization.role]} disabled /></Field></> : null}
                </div>
              </section>

              {activeOrganization ? (
                <section className="space-y-4 rounded-2xl border p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><div className="flex items-center gap-2"><CreditCard className="size-4 text-primary" /><h3 className="font-semibold">Entitlement oficial</h3></div><p className="mt-1 text-xs text-muted-foreground">Fonte: {entitlement ? SOURCE_LABELS[entitlement.source] || entitlement.source : 'não registrado'}</p></div>
                    <BillingStatusBadge state={entitlement?.state || 'missing'} />
                  </div>
                  {stripeManaged ? <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs leading-5 text-muted-foreground">Plano, estado e expiração são gerenciados pela Stripe e permanecem somente leitura nesta central para evitar divergência com a assinatura.</div> : null}
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Plano"><Select value={planId} disabled={stripeManaged} onValueChange={(value) => setPlanId((value || planId) as PlanId)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{catalog.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}</SelectContent></Select></Field>
                    <Field label="Estado"><Select value={entitlementState} disabled={stripeManaged} onValueChange={(value) => setEntitlementState(value || 'inactive')}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Ativo</SelectItem><SelectItem value="inactive">Inativo</SelectItem></SelectContent></Select></Field>
                    <Field label="Expira em"><Input type="date" value={expiresAt} disabled={stripeManaged} onChange={(event) => setExpiresAt(event.target.value)} /></Field>
                  </div>
                  {entitlement?.limits ? <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Limite de clientes</p><p className="mt-1 font-semibold">{entitlement.limits.clients == null ? 'Ilimitado' : entitlement.limits.clients}</p></div><div className="rounded-xl bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Instâncias WhatsApp</p><p className="mt-1 font-semibold">{entitlement.limits.whatsappInstances}</p></div></div> : null}
                  {entitlement?.capabilities.length ? <div><p className="mb-2 text-xs font-medium text-muted-foreground">Capabilities liberadas</p><div className="flex flex-wrap gap-1.5">{entitlement.capabilities.map((capability) => <Badge key={capability} variant="secondary" className="font-normal">{humanizeCapability(capability)}</Badge>)}</div></div> : null}
                  <div className="flex justify-end"><Button onClick={() => void save()} disabled={saving || !organizationName.trim()}>{saving ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}{saving ? 'Salvando…' : 'Salvar com confirmação'}</Button></div>
                </section>
              ) : (
                <section className="rounded-2xl border border-dashed p-5 text-center"><Building2 className="mx-auto size-6 text-muted-foreground" /><h3 className="mt-2 font-medium">Conta sem organização</h3><p className="mt-1 text-sm text-muted-foreground">Não há vínculo oficial para editar plano ou entitlement.</p><Button className="mt-4" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : null}Salvar dados de contato</Button></section>
              )}

              {activeOrganization ? (
                <section className="space-y-3">
                  <div className="flex items-center justify-between"><div><h3 className="font-semibold">Membros da organização</h3><p className="mt-1 text-xs text-muted-foreground">Vínculos reais em organization_members.</p></div><Badge variant="secondary">{activeOrganization.memberCount}</Badge></div>
                  <div className="divide-y rounded-2xl border">
                    {activeOrganization.members.map((member) => <div key={member.userId} className="flex items-center justify-between gap-3 p-3"><div className="flex min-w-0 items-center gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold">{initials(member.name)}</div><div className="min-w-0"><p className="truncate text-sm font-medium">{member.name}</p><p className="truncate text-xs text-muted-foreground">{member.email || member.userId}</p></div></div><div className="flex items-center gap-2"><Badge variant="outline">{ROLE_LABELS[member.role]}</Badge>{member.blocked ? <Ban className="size-4 text-amber-500" aria-label="Bloqueado" /> : null}</div></div>)}
                  </div>
                </section>
              ) : null}

              {account.deletion ? <section className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4"><div className="flex gap-3"><CircleAlert className="mt-0.5 size-5 shrink-0 text-red-500" /><div><h3 className="font-semibold text-red-600 dark:text-red-400">Exclusão pendente</h3><p className="mt-1 text-sm text-muted-foreground">Solicitada em {formatDate(account.deletion.requestedAt, true)}. Purga prevista após {formatDate(account.deletion.purgeAfter, true)}.</p>{account.deletion.blockedReason ? <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">Purga pausada para revisão: {account.deletion.blockedReason === 'OWNER_TRANSFER_REQUIRED' ? 'transfira a propriedade da organização' : 'intervenção administrativa necessária'}.</p> : null}</div></div></section> : null}

              <section className="rounded-2xl border border-destructive/20 p-4 sm:p-5">
                <div><h3 className="font-semibold">Ações críticas</h3><p className="mt-1 text-xs text-muted-foreground">Cada ação exige motivo, frase de confirmação e senha atual do Admin Master.</p></div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {account.deletion ? <Button variant="outline" disabled><Ban className="size-4" />Bloqueada pela retenção</Button> : <Button variant="outline" disabled={busy} onClick={() => void onAction(account.blocked ? 'unblock' : 'block', account)}>{busy && actionBusy?.startsWith(account.blocked ? 'unblock' : 'block') ? <Loader2 className="size-4 animate-spin" /> : account.blocked ? <CheckCircle2 className="size-4" /> : <Ban className="size-4" />}{account.blocked ? 'Desbloquear conta' : 'Bloquear conta'}</Button>}
                  {account.deletion ? <Button variant="outline" disabled={busy} onClick={() => void onAction('restore', account)}>{busy && actionBusy?.startsWith('restore') ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}Restaurar conta</Button> : <Button variant="destructive" disabled={busy} onClick={() => void onAction('delete', account)}>{busy && actionBusy?.startsWith('delete') ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}Agendar exclusão</Button>}
                </div>
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}{hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}</div>
}

function InfoCard({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return <div className="rounded-xl border bg-muted/20 p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-3.5" />{label}</div><p className="mt-2 truncate text-sm font-medium">{value}</p></div>
}

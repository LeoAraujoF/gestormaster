'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Inbox,
  Loader2,
  Mail,
  MessageSquareText,
  MoreHorizontal,
  Phone,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
type TicketPriority = 'low' | 'medium' | 'high' | 'critical'

type TicketSummary = {
  id: string
  userId: string
  organizationId: string | null
  subject: string
  description: string
  pageUrl: string | null
  status: string
  priority: string
  createdAt: string | null
  updatedAt: string | null
  organization: { id: string; name: string } | null
  requester: {
    id: string
    email: string | null
    name: string | null
    phone: string | null
    createdAt: string
    lastSignInAt: string | null
    role: string | null
  } | null
  entitlement: {
    plan: string | null
    isActive: boolean
    expiresAt: string | null
    source: string | null
  } | null
}

type TicketMessage = {
  id: string
  ticket_id: string
  user_id: string
  content: string
  is_from_admin: boolean
  created_at: string | null
}

type OrganizationOption = { id: string; name: string }
type QueueMeta = { page: number; pageSize: number; total: number; totalPages: number }
type ApiErrorPayload = { error?: { code?: string; message?: string } }
type QueuePayload = ApiErrorPayload & {
  data?: { tickets?: TicketSummary[]; organizations?: OrganizationOption[] }
  meta?: QueueMeta
}
type MessagesPayload = ApiErrorPayload & { data?: TicketMessage[] }
type StatusMutationPayload = ApiErrorPayload & { data?: { status?: TicketStatus; updated_at?: string | null } }
type ReplyMutationPayload = ApiErrorPayload & {
  data?: TicketMessage
  meta?: {
    ticketStatus?: TicketStatus
    ticketUpdatedAt?: string | null
    ticketTouchSucceeded?: boolean
  }
}

const statusLabels: Record<TicketStatus, string> = {
  open: 'Aberto',
  in_progress: 'Em análise',
  resolved: 'Resolvido',
  closed: 'Encerrado',
}

const priorityLabels: Record<TicketPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  critical: 'Crítica',
}

const statusTransitions: Record<TicketStatus, TicketStatus[]> = {
  open: ['in_progress', 'resolved', 'closed'],
  in_progress: ['open', 'resolved', 'closed'],
  resolved: ['open', 'in_progress', 'closed'],
  closed: ['open', 'in_progress'],
}

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' })

function formatDateTime(value: string | null) {
  if (!value) return 'Não informado'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Não informado' : dateTimeFormatter.format(date)
}

function formatDate(value: string | null) {
  if (!value) return 'Não informado'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Não informado' : dateFormatter.format(date)
}

function requesterLabel(ticket: TicketSummary) {
  return ticket.requester?.name?.trim() || ticket.requester?.email || `Usuário ${ticket.userId.slice(0, 8)}`
}

function isTicketStatus(value: string): value is TicketStatus {
  return value in statusLabels
}

function isTicketPriority(value: string): value is TicketPriority {
  return value in priorityLabels
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-0 font-medium',
        status === 'open' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
        status === 'in_progress' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
        status === 'resolved' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        status === 'closed' && 'bg-muted text-muted-foreground',
      )}
    >
      {isTicketStatus(status) ? statusLabels[status] : status || 'Não informado'}
    </Badge>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-medium',
        priority === 'critical' && 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
        priority === 'high' && 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400',
      )}
    >
      {isTicketPriority(priority) ? priorityLabels[priority] : priority || 'Não informada'}
    </Badge>
  )
}

async function readApiPayload<T>(response: Response) {
  return response.json().catch(() => null) as Promise<T | null>
}

function apiMessage(payload: ApiErrorPayload | null, fallback: string) {
  return typeof payload?.error?.message === 'string' ? payload.error.message : fallback
}

export function TicketWorkspace() {
  const [tickets, setTickets] = useState<TicketSummary[]>([])
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([])
  const [selectedTicket, setSelectedTicket] = useState<TicketSummary | null>(null)
  const [messages, setMessages] = useState<TicketMessage[]>([])
  const [meta, setMeta] = useState<QueueMeta>({ page: 1, pageSize: 20, total: 0, totalPages: 0 })

  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<TicketStatus | ''>('')
  const [priority, setPriority] = useState<TicketPriority | ''>('')
  const [organizationId, setOrganizationId] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [queueLoading, setQueueLoading] = useState(true)
  const [queueError, setQueueError] = useState('')
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState('')
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)
  const replyAttempt = useRef<{ content: string; key: string } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchDraft.trim())
      setPage(1)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [searchDraft])

  const loadQueue = useCallback(async (signal?: AbortSignal) => {
    if (signal?.aborted) return
    setQueueLoading(true)
    setQueueError('')

    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (search) params.set('search', search)
      if (status) params.set('status', status)
      if (priority) params.set('priority', priority)
      if (organizationId) params.set('organizationId', organizationId)

      const response = await fetch(`/api/admin/tickets?${params.toString()}`, { cache: 'no-store', signal })
      const payload = await readApiPayload<QueuePayload>(response)
      if (!response.ok) throw new Error(apiMessage(payload, 'Não foi possível carregar a fila'))

      const nextTickets = payload?.data?.tickets || []
      setTickets(nextTickets)
      setOrganizations(payload?.data?.organizations || [])
      const nextMeta = payload?.meta || { page, pageSize, total: 0, totalPages: 0 }
      setMeta(nextMeta)
      if (nextMeta.totalPages > 0 && nextMeta.page > nextMeta.totalPages) setPage(nextMeta.totalPages)
      setSelectedTicket((current) => {
        if (!nextTickets.length) return null
        if (!current) return nextTickets[0]
        return nextTickets.find((ticket) => ticket.id === current.id) || nextTickets[0]
      })
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setQueueError(error instanceof Error ? error.message : 'Não foi possível carregar a fila')
      }
    } finally {
      if (!signal?.aborted) setQueueLoading(false)
    }
  }, [organizationId, page, pageSize, priority, search, status])

  useEffect(() => {
    const controller = new AbortController()
    queueMicrotask(() => void loadQueue(controller.signal))
    return () => controller.abort()
  }, [loadQueue])

  const loadMessages = useCallback(async (ticketId: string, signal?: AbortSignal) => {
    if (signal?.aborted) return
    setMessagesLoading(true)
    setMessagesError('')
    try {
      const response = await fetch(`/api/admin/tickets/${ticketId}/messages`, { cache: 'no-store', signal })
      const payload = await readApiPayload<MessagesPayload>(response)
      if (!response.ok) throw new Error(apiMessage(payload, 'Não foi possível carregar a conversa'))
      setMessages(payload?.data || [])
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setMessages([])
        setMessagesError(error instanceof Error ? error.message : 'Não foi possível carregar a conversa')
      }
    } finally {
      if (!signal?.aborted) setMessagesLoading(false)
    }
  }, [])

  const selectedTicketId = selectedTicket?.id

  useEffect(() => {
    if (!selectedTicketId) return
    const controller = new AbortController()
    queueMicrotask(() => void loadMessages(selectedTicketId, controller.signal))
    return () => controller.abort()
  }, [loadMessages, selectedTicketId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const selectStatus = (value: string | null) => {
    setStatus(value === 'all' || !value ? '' : value as TicketStatus)
    setPage(1)
  }

  const selectPriority = (value: string | null) => {
    setPriority(value === 'all' || !value ? '' : value as TicketPriority)
    setPage(1)
  }

  const selectOrganization = (value: string | null) => {
    setOrganizationId(value === 'all' || !value ? '' : value)
    setPage(1)
  }

  const changeStatus = async (nextStatus: TicketStatus) => {
    if (!selectedTicket || nextStatus === selectedTicket.status) return
    setChangingStatus(true)
    try {
      const response = await fetch(`/api/admin/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, idempotencyKey: crypto.randomUUID() }),
      })
      const payload = await readApiPayload<StatusMutationPayload>(response)
      if (!response.ok) throw new Error(apiMessage(payload, 'Não foi possível atualizar o status'))

      const updatedAt = payload?.data?.updated_at || selectedTicket.updatedAt
      setTickets((current) => current.map((ticket) => ticket.id === selectedTicket.id
        ? { ...ticket, status: nextStatus, updatedAt }
        : ticket))
      setSelectedTicket((current) => current?.id === selectedTicket.id
        ? { ...current, status: nextStatus, updatedAt }
        : current)
      toast.success(`Chamado marcado como ${statusLabels[nextStatus].toLowerCase()}.`)
      void loadQueue()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar o status')
    } finally {
      setChangingStatus(false)
    }
  }

  const sendReply = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedTicket || !reply.trim() || sending) return

    const content = reply.trim()
    const attempt = replyAttempt.current?.content === content
      ? replyAttempt.current
      : { content, key: crypto.randomUUID() }
    replyAttempt.current = attempt
    setSending(true)

    try {
      const response = await fetch(`/api/admin/tickets/${selectedTicket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, idempotencyKey: attempt.key }),
      })
      const payload = await readApiPayload<ReplyMutationPayload>(response)

      if (response.status === 409 && payload?.error?.code === 'ADMIN_DUPLICATE_ACTION') {
        await loadMessages(selectedTicket.id)
        setReply('')
        replyAttempt.current = null
        toast.info('A resposta já havia sido processada; a conversa foi atualizada.')
        return
      }
      if (!response.ok) throw new Error(apiMessage(payload, 'Não foi possível enviar a resposta'))

      const created = payload?.data
      if (!created) throw new Error('A API não retornou a resposta criada')
      const nextStatus = (payload?.meta?.ticketStatus || selectedTicket.status) as TicketStatus
      const updatedAt = payload?.meta?.ticketUpdatedAt || selectedTicket.updatedAt
      setMessages((current) => current.some((message) => message.id === created.id) ? current : [...current, created])
      setTickets((current) => current.map((ticket) => ticket.id === selectedTicket.id
        ? { ...ticket, status: nextStatus, updatedAt }
        : ticket))
      setSelectedTicket((current) => current?.id === selectedTicket.id
        ? { ...current, status: nextStatus, updatedAt }
        : current)
      setReply('')
      replyAttempt.current = null

      if (payload?.meta?.ticketTouchSucceeded === false) {
        toast.warning('Resposta enviada, mas a fila não pôde ser reordenada automaticamente.')
      } else {
        toast.success('Resposta enviada com segurança.')
      }
      void loadQueue()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar a resposta')
    } finally {
      setSending(false)
    }
  }

  const selectedStatus = selectedTicket && isTicketStatus(selectedTicket.status) ? selectedTicket.status : null
  const replyLocked = selectedTicket
    ? !selectedStatus || selectedStatus === 'closed' || selectedStatus === 'resolved'
    : true

  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <ShieldCheck className="size-4 text-amber-500" />
            Admin Master
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Central de chamados</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fila operacional, conversa e contexto da conta no mesmo workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-8 px-3 text-muted-foreground">
            {meta.total} {meta.total === 1 ? 'chamado' : 'chamados'}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => void loadQueue()} disabled={queueLoading}>
            <RefreshCw className={cn('size-4', queueLoading && 'animate-spin')} />
            Atualizar
          </Button>
        </div>
      </header>

      <section className="rounded-2xl border bg-card p-3 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_170px_170px_220px_110px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              maxLength={120}
              placeholder="Buscar por assunto ou ID exato"
              className="w-full pl-9"
              aria-label="Buscar chamados"
            />
          </div>
          <Select value={status || 'all'} onValueChange={selectStatus}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priority || 'all'} onValueChange={selectPriority}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Prioridade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as prioridades</SelectItem>
              {Object.entries(priorityLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={organizationId || 'all'} onValueChange={selectOrganization}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Organização" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as organizações</SelectItem>
              {organizations.map((organization) => (
                <SelectItem key={organization.id} value={organization.id}>{organization.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value || 20)); setPage(1) }}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="20">20 / página</SelectItem>
              <SelectItem value="30">30 / página</SelectItem>
              <SelectItem value="50">50 / página</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {queueError && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <span className="flex items-center gap-2"><AlertCircle className="size-4" />{queueError}</span>
          <Button variant="outline" size="sm" onClick={() => void loadQueue()}>Tentar novamente</Button>
        </div>
      )}

      <section className="grid overflow-hidden rounded-2xl border bg-card shadow-sm xl:h-[calc(100vh-250px)] xl:min-h-[700px] xl:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="flex min-h-[560px] flex-col border-b xl:min-h-0 xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Fila de atendimento</h2>
              <p className="text-xs text-muted-foreground">Página {meta.totalPages ? meta.page : 0} de {meta.totalPages}</p>
            </div>
            {queueLoading && tickets.length > 0 && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>

          <ScrollArea className="h-[500px] flex-1 xl:h-auto">
            {queueLoading && tickets.length === 0 ? (
              <div className="space-y-3 p-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="space-y-3 rounded-xl border p-4">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex min-h-[440px] flex-col items-center justify-center px-8 text-center">
                <span className="mb-4 rounded-2xl bg-muted p-4"><Inbox className="size-7 text-muted-foreground" /></span>
                <h3 className="font-medium">Nenhum chamado encontrado</h3>
                <p className="mt-1 text-sm text-muted-foreground">Ajuste os filtros ou atualize a fila.</p>
              </div>
            ) : (
              <div className="divide-y">
                {tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => setSelectedTicket(ticket)}
                    aria-pressed={selectedTicket?.id === ticket.id}
                    className={cn(
                      'w-full px-4 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      selectedTicket?.id === ticket.id && 'bg-muted/70',
                    )}
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <span className="line-clamp-2 text-sm font-semibold leading-5">{ticket.subject}</span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">#{ticket.id.slice(0, 6).toUpperCase()}</span>
                    </div>
                    <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{ticket.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={ticket.status} />
                      <PriorityBadge priority={ticket.priority} />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                      <span className="min-w-0 truncate">{requesterLabel(ticket)}</span>
                      <span className="flex shrink-0 items-center gap-1"><Clock3 className="size-3" />{formatDateTime(ticket.updatedAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="flex items-center justify-between border-t px-3 py-3">
            <Button variant="outline" size="sm" disabled={queueLoading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
              <ChevronLeft className="size-4" /> Anterior
            </Button>
            <span className="text-xs text-muted-foreground">{meta.total ? `${(meta.page - 1) * meta.pageSize + 1}–${Math.min(meta.page * meta.pageSize, meta.total)} de ${meta.total}` : '0 resultados'}</span>
            <Button variant="outline" size="sm" disabled={queueLoading || meta.totalPages === 0 || page >= meta.totalPages} onClick={() => setPage((current) => current + 1)}>
              Próxima <ChevronRight className="size-4" />
            </Button>
          </div>
        </aside>

        {!selectedTicket ? (
          <div className="flex min-h-[620px] flex-col items-center justify-center p-8 text-center">
            <span className="mb-4 rounded-2xl bg-muted p-4"><MessageSquareText className="size-8 text-muted-foreground" /></span>
            <h2 className="font-semibold">Selecione um chamado</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">A conversa e o contexto real da conta aparecerão aqui.</p>
          </div>
        ) : (
          <div className="grid min-h-[720px] min-w-0 lg:grid-cols-[minmax(0,1fr)_280px] xl:min-h-0">
            <main className="flex min-h-[620px] min-w-0 flex-col border-b lg:border-b-0 lg:border-r xl:min-h-0">
              <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">#{selectedTicket.id.slice(0, 8).toUpperCase()}</span>
                    <StatusBadge status={selectedTicket.status} />
                    <PriorityBadge priority={selectedTicket.priority} />
                  </div>
                  <h2 className="truncate text-lg font-semibold">{selectedTicket.subject}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Atualizado em {formatDateTime(selectedTicket.updatedAt)}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={
                    <Button variant="outline" size="sm" disabled={changingStatus || !selectedStatus}>
                      {changingStatus ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
                      Alterar status
                    </Button>
                  } />
                  <DropdownMenuContent align="end">
                    {selectedStatus && statusTransitions[selectedStatus].map((nextStatus) => (
                      <DropdownMenuItem key={nextStatus} onClick={() => void changeStatus(nextStatus)}>
                        Marcar como {statusLabels[nextStatus].toLowerCase()}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <ScrollArea className="h-[430px] flex-1 xl:h-auto">
                <div className="space-y-5 p-5">
                  {messagesLoading ? (
                    <div className="space-y-5">
                      <Skeleton className="h-20 w-4/5 rounded-2xl" />
                      <Skeleton className="ml-auto h-24 w-3/4 rounded-2xl" />
                      <Skeleton className="h-16 w-2/3 rounded-2xl" />
                    </div>
                  ) : messagesError ? (
                    <div role="alert" className="flex min-h-[300px] flex-col items-center justify-center text-center">
                      <AlertCircle className="mb-3 size-7 text-red-500" />
                      <p className="text-sm font-medium">{messagesError}</p>
                      <Button className="mt-4" variant="outline" size="sm" onClick={() => void loadMessages(selectedTicket.id)}>Tentar novamente</Button>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
                      <MessageSquareText className="mb-3 size-7 text-muted-foreground" />
                      <p className="text-sm font-medium">Conversa sem mensagens</p>
                      <p className="mt-1 text-xs text-muted-foreground">A descrição original permanece disponível no contexto.</p>
                    </div>
                  ) : messages.map((message) => {
                    const fromAdmin = message.is_from_admin
                    return (
                      <article key={message.id} className={cn('flex gap-3', fromAdmin && 'flex-row-reverse')}>
                        <span className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-full border bg-background',
                          fromAdmin && 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
                        )}>
                          {fromAdmin ? <ShieldCheck className="size-4" /> : <UserRound className="size-4" />}
                        </span>
                        <div className={cn('max-w-[82%]', fromAdmin && 'text-right')}>
                          <div className={cn('mb-1 flex items-center gap-2 text-[11px] text-muted-foreground', fromAdmin && 'justify-end')}>
                            <span>{fromAdmin ? 'Equipe de suporte' : requesterLabel(selectedTicket)}</span>
                            <span>{formatDateTime(message.created_at)}</span>
                          </div>
                          <div className={cn(
                            'rounded-2xl border bg-background px-4 py-3 text-left text-sm leading-6 shadow-sm',
                            fromAdmin && 'border-amber-500/20 bg-amber-500/10',
                          )}>
                            <p className="whitespace-pre-wrap break-words">{message.content}</p>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              <form onSubmit={sendReply} className="border-t bg-background/80 p-4">
                {replyLocked ? (
                  <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/40 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="size-4" />
                      {selectedStatus ? 'Reabra o chamado para enviar uma nova resposta.' : 'O status atual não permite novas respostas.'}
                    </div>
                    {selectedStatus && (selectedStatus === 'closed' || selectedStatus === 'resolved') && (
                      <Button type="button" variant="outline" size="sm" disabled={changingStatus} onClick={() => void changeStatus('in_progress')}>
                        Reabrir
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Textarea
                      value={reply}
                      onChange={(event) => {
                        setReply(event.target.value)
                        if (replyAttempt.current?.content !== event.target.value.trim()) replyAttempt.current = null
                      }}
                      maxLength={5000}
                      placeholder="Escreva uma resposta objetiva e segura…"
                      className="min-h-24 resize-none bg-background"
                      aria-label="Resposta ao chamado"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">{reply.length}/5000 caracteres</span>
                      <Button type="submit" disabled={sending || !reply.trim()}>
                        {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                        Enviar resposta
                      </Button>
                    </div>
                  </div>
                )}
              </form>
            </main>

            <aside className="min-w-0 bg-muted/20 p-5">
              <div className="space-y-6">
                <section>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Solicitante</h3>
                  <div className="space-y-3 rounded-xl border bg-background p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted"><UserRound className="size-4" /></span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{requesterLabel(selectedTicket)}</p>
                        <p className="truncate text-xs text-muted-foreground">{selectedTicket.requester?.role || 'Função não informada'}</p>
                      </div>
                    </div>
                    <div className="space-y-2 border-t pt-3 text-xs text-muted-foreground">
                      <p className="flex items-center gap-2"><Mail className="size-3.5" /><span className="truncate">{selectedTicket.requester?.email || 'E-mail não informado'}</span></p>
                      <p className="flex items-center gap-2"><Phone className="size-3.5" /><span className="truncate">{selectedTicket.requester?.phone || 'Telefone não informado'}</span></p>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Organização e acesso</h3>
                  <div className="space-y-3 rounded-xl border bg-background p-4 text-sm">
                    <div className="flex items-start gap-2">
                      <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{selectedTicket.organization?.name || 'Organização não vinculada'}</p>
                        {selectedTicket.organizationId && <p className="truncate font-mono text-[10px] text-muted-foreground">{selectedTicket.organizationId}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 border-t pt-3 text-xs">
                      <div>
                        <p className="text-muted-foreground">Plano</p>
                        <p className="mt-0.5 font-medium">{selectedTicket.entitlement?.plan || 'Não informado'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Acesso</p>
                        <p className={cn('mt-0.5 font-medium', selectedTicket.entitlement?.isActive ? 'text-emerald-600' : 'text-muted-foreground')}>
                          {selectedTicket.entitlement ? (selectedTicket.entitlement.isActive ? 'Ativo' : 'Inativo') : 'Não informado'}
                        </p>
                      </div>
                    </div>
                    {selectedTicket.entitlement?.expiresAt && (
                      <p className="border-t pt-3 text-xs text-muted-foreground">Expira em {formatDate(selectedTicket.entitlement.expiresAt)}</p>
                    )}
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Contexto do chamado</h3>
                  <div className="space-y-3 rounded-xl border bg-background p-4 text-xs">
                    <div>
                      <p className="text-muted-foreground">Aberto em</p>
                      <p className="mt-0.5 font-medium">{formatDateTime(selectedTicket.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Página informada</p>
                      <p className="mt-0.5 break-all font-mono">{selectedTicket.pageUrl || 'Não informada'}</p>
                    </div>
                    <div className="border-t pt-3">
                      <p className="text-muted-foreground">Descrição original</p>
                      <p className="mt-1 whitespace-pre-wrap break-words leading-5">{selectedTicket.description}</p>
                    </div>
                  </div>
                </section>

                <section className="text-xs text-muted-foreground">
                  <p>Conta criada em {formatDate(selectedTicket.requester?.createdAt || null)}</p>
                  <p className="mt-1">Último acesso: {formatDateTime(selectedTicket.requester?.lastSignInAt || null)}</p>
                </section>
              </div>
            </aside>
          </div>
        )}
      </section>
    </div>
  )
}

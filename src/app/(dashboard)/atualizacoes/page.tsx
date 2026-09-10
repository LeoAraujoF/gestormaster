"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Archive,
  BellRing,
  Calendar,
  Check,
  CheckCircle2,
  Loader2,
  Megaphone,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Wallet,
  X,
} from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { logAuditClient } from "@/lib/audit-client"
import { cn, formatCurrency } from "@/lib/utils"
import { usePrivacy } from "@/hooks/use-privacy"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { PageHeader, PageShell } from "@/components/page-layout"
import { toast } from "sonner"

type NotifType = "overdue" | "due" | "failure" | "system"
type NotifStatus = "all" | "unread" | "archived"
type NotifSeverity = "critical" | "attention" | "info"

type SystemUpdateRow = {
  id: string
  title: string
  content: string
  update_type: string
  created_at: string
}

type AlertItem = {
  id: string
  type: Exclude<NotifType, "system">
  severity: Extract<NotifSeverity, "critical" | "attention">
  title: string
  body: string
  amount: number
  actionLabel: string
  actionHref: string
  time: Date
}

type RenderItem = {
  id: string
  kind: "alert" | "update"
  type: NotifType
  severity: NotifSeverity
  title: string
  body: string
  time: Date
  amount: number
  unread: boolean
  archived: boolean
  selectable: boolean
  actionLabel?: string
  onAction?: () => void
}

const TYPE_META: Record<NotifType, { label: string; icon: typeof AlertTriangle; iconBg: string; iconFg: string }> = {
  overdue: { label: "Vencidos", icon: AlertTriangle, iconBg: "bg-danger-bg", iconFg: "text-danger-fg" },
  due: { label: "Vencendo", icon: Calendar, iconBg: "bg-warning-bg", iconFg: "text-warning-fg" },
  failure: { label: "Conexão", icon: ShieldAlert, iconBg: "bg-danger-bg", iconFg: "text-danger-fg" },
  system: { label: "Novidades", icon: Megaphone, iconBg: "bg-secondary", iconFg: "text-secondary-foreground" },
}

const SEVERITY_META: Record<NotifSeverity, { label: string; className: string }> = {
  critical: { label: "crítico", className: "bg-danger-bg text-danger-fg" },
  attention: { label: "atenção", className: "bg-warning-bg text-warning-fg" },
  info: { label: "info", className: "bg-secondary text-secondary-foreground" },
}

const UPDATE_TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  feature: { label: "NOVO", cls: "bg-success-bg text-success-fg" },
  improvement: { label: "MELHORIA", cls: "bg-accent text-accent-foreground" },
  bugfix: { label: "CORREÇÃO", cls: "bg-secondary text-secondary-foreground" },
  maintenance: { label: "MANUTENÇÃO", cls: "bg-warning-bg text-warning-fg" },
}

const GROUP_ORDER = ["Hoje", "Ontem", "Esta semana", "Mais antigas"] as const

const READ_KEY = "atualizacoes_read_ids"
const ARCHIVED_KEY = "atualizacoes_archived_ids"
const RESOLVED_LOG_KEY = "atualizacoes_resolved_log"

function loadIdSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(key)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveIdSet(key: string, ids: Set<string>) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(key, JSON.stringify(Array.from(ids)))
}

function loadLog(key: string): Record<string, string> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function saveLog(key: string, log: Record<string, string>) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(key, JSON.stringify(log))
}

function todayKey(d: Date) {
  return d.toISOString().slice(0, 10)
}

function relativeTime(d: Date) {
  const diffMin = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000))
  if (diffMin < 1) return "agora"
  if (diffMin < 60) return `há ${diffMin} min`
  const h = Math.round(diffMin / 60)
  if (h < 24) return `há ${h} h`
  const days = Math.round(h / 24)
  return days === 1 ? "ontem" : `há ${days} dias`
}

function groupLabel(d: Date): (typeof GROUP_ORDER)[number] {
  const diffH = (Date.now() - d.getTime()) / 3600000
  if (diffH < 24) return "Hoje"
  if (diffH < 48) return "Ontem"
  if (diffH < 168) return "Esta semana"
  return "Mais antigas"
}

function plainText(markdown: string) {
  return markdown
    .replace(/[*_`#>-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export default function AtualizacoesPage() {
  const [updates, setUpdates] = useState<SystemUpdateRow[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [preReadUpdateIds, setPreReadUpdateIds] = useState<Set<string>>(new Set())
  const [allUpdatesMarkedRead, setAllUpdatesMarkedRead] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set())
  const [resolvedLog, setResolvedLog] = useState<Record<string, string>>({})

  const [statusFilter, setStatusFilter] = useState<NotifStatus>("all")
  const [typeFilter, setTypeFilter] = useState<"all" | NotifType>("all")
  const [search, setSearch] = useState("")
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({})

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [newUpdate, setNewUpdate] = useState({ title: "", content: "", type: "feature" })

  const router = useRouter()
  const supabase = createClient()
  const { displayValue } = usePrivacy()

  useEffect(() => {
    setReadIds(loadIdSet(READ_KEY))
    setArchivedIds(loadIdSet(ARCHIVED_KEY))
    setResolvedLog(loadLog(RESOLVED_LOG_KEY))
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setIsLoading(false)
      return
    }

    try {
      const res = await fetch("/api/admin/check")
      const data = await res.json()
      setIsAdmin(Boolean(data.isAdmin))
    } catch {
      setIsAdmin(false)
    }

    const { data: updatesData } = await supabase
      .from("system_updates")
      .select("*")
      .eq("is_published", true)
      .order("created_at", { ascending: false })

    if (updatesData && updatesData.length > 0) {
      const { data: readsData } = await supabase
        .from("user_update_reads")
        .select("update_id")
        .eq("user_id", user.id)
      setPreReadUpdateIds(new Set((readsData || []).map((r: any) => r.update_id as string)))
      fetch("/api/updates/read", { method: "POST" }).catch(() => {})
    } else {
      setPreReadUpdateIds(new Set())
    }
    setUpdates(updatesData || [])

    const now = new Date()
    const newAlerts: AlertItem[] = []

    const { data: wppDataArray } = await supabase
      .from("evolution_instances")
      .select("status")
      .eq("user_id", user.id)
      .limit(1)
    const wppData = wppDataArray?.[0]
    if (wppData && wppData.status !== "connected") {
      newAlerts.push({
        id: "wpp",
        type: "failure",
        severity: "critical",
        title: "Instância desconectada",
        body: "O número de WhatsApp configurado perdeu a conexão. Suas automações estão pausadas.",
        amount: 0,
        actionLabel: "Resolver agora",
        actionHref: "/automacao",
        time: now,
      })
    }

    const todayIso = now.toISOString().split("T")[0]
    const fiveDaysFromNow = new Date()
    fiveDaysFromNow.setDate(now.getDate() + 5)
    const { data: clientsData } = await supabase
      .from("clients")
      .select("id, name, due_date, plan_value")
      .eq("user_id", user.id)
      .eq("status", "active")
      .gte("due_date", todayIso)
      .lte("due_date", fiveDaysFromNow.toISOString().split("T")[0])
      .order("due_date", { ascending: true })
    if (clientsData && clientsData.length > 0) {
      const total = clientsData.reduce((sum: number, c: any) => sum + Number(c.plan_value || 0), 0)
      newAlerts.push({
        id: "clients",
        type: "due",
        severity: "attention",
        title: `${clientsData.length} cliente${clientsData.length === 1 ? "" : "s"} vencendo`,
        body: "Existem mensalidades que vencem nos próximos 5 dias. Monitore os pagamentos para evitar inadimplência.",
        amount: total,
        actionLabel: "Ver clientes",
        actionHref: "/clientes",
        time: now,
      })
    }

    const { data: vencidosData } = await supabase
      .from("clients")
      .select("plan_value")
      .eq("user_id", user.id)
      .eq("status", "vencido")
    if (vencidosData && vencidosData.length > 0) {
      const total = vencidosData.reduce((sum: number, c: any) => sum + Number(c.plan_value || 0), 0)
      newAlerts.push({
        id: "vencidos",
        type: "overdue",
        severity: "critical",
        title: `${vencidosData.length} cliente${vencidosData.length === 1 ? "" : "s"} vencido${vencidosData.length === 1 ? "" : "s"}`,
        body: "Existem clientes com a mensalidade atrasada. Recomendamos enviar uma cobrança ou suspender o serviço.",
        amount: total,
        actionLabel: "Cobrar agora",
        actionHref: "/automacao",
        time: now,
      })
    }

    setAlerts(newAlerts)
    setIsLoading(false)
  }

  const persistRead = (ids: Set<string>) => {
    setReadIds(ids)
    saveIdSet(READ_KEY, ids)
  }
  const persistArchived = (ids: Set<string>) => {
    setArchivedIds(ids)
    saveIdSet(ARCHIVED_KEY, ids)
  }
  const persistLog = (log: Record<string, string>) => {
    setResolvedLog(log)
    saveLog(RESOLVED_LOG_KEY, log)
  }

  const baseItems: RenderItem[] = useMemo(() => {
    const alertItems: RenderItem[] = alerts.map((a) => ({
      id: a.id,
      kind: "alert",
      type: a.type,
      severity: a.severity,
      title: a.title,
      body: a.body,
      time: a.time,
      amount: a.amount,
      unread: !archivedIds.has(a.id) && !readIds.has(a.id),
      archived: archivedIds.has(a.id),
      selectable: true,
      actionLabel: a.actionLabel,
      onAction: () => router.push(a.actionHref),
    }))

    const updateItems: RenderItem[] = updates.map((u) => ({
      id: u.id,
      kind: "update",
      type: "system",
      severity: "info",
      title: u.title,
      body: plainText(u.content || ""),
      time: new Date(u.created_at),
      amount: 0,
      unread: allUpdatesMarkedRead ? false : !preReadUpdateIds.has(u.id),
      archived: false,
      selectable: false,
    }))

    return [...alertItems, ...updateItems].sort((a, b) => b.time.getTime() - a.time.getTime())
  }, [alerts, updates, readIds, archivedIds, preReadUpdateIds, allUpdatesMarkedRead, router])

  const activeItems = baseItems.filter((i) => !i.archived)
  const archivedItems = baseItems.filter((i) => i.archived)

  const unreadCount = activeItems.filter((i) => i.unread).length
  const criticalCount = activeItems.filter((i) => i.severity === "critical").length
  const pendingAmount = activeItems
    .filter((i) => i.type === "overdue" || i.type === "due")
    .reduce((sum, i) => sum + i.amount, 0)

  const todayStr = todayKey(new Date())
  const resolvedToday = Object.values(resolvedLog).filter((d) => d === todayStr).length
  const totalToday = activeItems.filter((i) => groupLabel(i.time) === "Hoje").length + resolvedToday

  const pool = statusFilter === "archived" ? archivedItems : activeItems

  const statusDefs: { key: NotifStatus; label: string; count: number }[] = [
    { key: "all", label: "Todas", count: activeItems.length },
    { key: "unread", label: "Não lidas", count: unreadCount },
    { key: "archived", label: "Arquivadas", count: archivedItems.length },
  ]

  const typeDefs: { key: "all" | NotifType; label: string; count: number }[] = [
    { key: "all", label: "Todos os tipos", count: pool.length },
    ...(Object.keys(TYPE_META) as NotifType[]).map((key) => ({
      key,
      label: TYPE_META[key].label,
      count: pool.filter((i) => i.type === key).length,
    })),
  ]

  const q = search.trim().toLowerCase()
  const filtered = pool
    .filter((i) => statusFilter !== "unread" || i.unread)
    .filter((i) => typeFilter === "all" || i.type === typeFilter)
    .filter((i) => !q || i.title.toLowerCase().includes(q) || i.body.toLowerCase().includes(q))
    .sort((a, b) => b.time.getTime() - a.time.getTime())

  const visibleSelectableIds = filtered.filter((i) => i.selectable).map((i) => i.id)
  const selectedCount = visibleSelectableIds.filter((id) => selectedIds[id]).length
  const allVisibleSelected = visibleSelectableIds.length > 0 && selectedCount === visibleSelectableIds.length

  const groups = GROUP_ORDER.map((label) => ({
    label,
    items: filtered.filter((i) => groupLabel(i.time) === label),
  })).filter((g) => g.items.length > 0)

  const emptyMeta = q
    ? { title: "Nenhum resultado", subtitle: `Nada encontrado para "${search.trim()}".` }
    : statusFilter === "unread"
      ? { title: "Nenhum aviso não lido", subtitle: "Você está em dia com tudo que exigia atenção." }
      : statusFilter === "archived"
        ? { title: "Nada arquivado", subtitle: "Avisos arquivados aparecem aqui para consulta." }
        : { title: "Caixa de avisos vazia", subtitle: "Novos vencimentos, conexão do WhatsApp e novidades aparecem aqui automaticamente." }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = { ...prev }
      if (next[id]) delete next[id]
      else next[id] = true
      return next
    })
  }
  const toggleSelectAllVisible = () => {
    if (visibleSelectableIds.length === 0) return
    setSelectedIds(allVisibleSelected ? {} : Object.fromEntries(visibleSelectableIds.map((id) => [id, true])))
  }
  const clearSelection = () => setSelectedIds({})

  const toggleRead = (id: string) => {
    const next = new Set(readIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    persistRead(next)
  }

  const archiveOne = (id: string) => {
    const next = new Set(archivedIds)
    next.add(id)
    persistArchived(next)
    const log = { ...resolvedLog, [id]: todayKey(new Date()) }
    persistLog(log)
    toast("Aviso arquivado.", {
      action: {
        label: "Desfazer",
        onClick: () => {
          const cur = loadIdSet(ARCHIVED_KEY)
          cur.delete(id)
          persistArchived(cur)
          const curLog = loadLog(RESOLVED_LOG_KEY)
          delete curLog[id]
          persistLog(curLog)
        },
      },
    })
  }

  const markAllRead = () => {
    const unreadAlertIds = activeItems.filter((i) => i.kind === "alert" && i.unread).map((i) => i.id)
    if (unreadAlertIds.length > 0) {
      const next = new Set(readIds)
      unreadAlertIds.forEach((id) => next.add(id))
      persistRead(next)
    }
    if (updates.length > 0) {
      setAllUpdatesMarkedRead(true)
      fetch("/api/updates/read", { method: "POST" }).catch(() => {})
    }
    toast.success(`${unreadCount} ${unreadCount === 1 ? "aviso marcado" : "avisos marcados"} como lido.`)
  }

  const markSelectionRead = () => {
    const ids = Object.keys(selectedIds)
    const next = new Set(readIds)
    ids.forEach((id) => next.add(id))
    persistRead(next)
    setSelectedIds({})
    toast.success(`${ids.length} ${ids.length === 1 ? "aviso marcado" : "avisos marcados"} como lido.`)
  }

  const archiveSelection = () => {
    const ids = Object.keys(selectedIds)
    const next = new Set(archivedIds)
    const log = { ...resolvedLog }
    const stamp = todayKey(new Date())
    ids.forEach((id) => {
      next.add(id)
      log[id] = stamp
    })
    persistArchived(next)
    persistLog(log)
    setSelectedIds({})
    toast(`${ids.length} ${ids.length === 1 ? "aviso arquivado" : "avisos arquivados"}.`, {
      action: {
        label: "Desfazer",
        onClick: () => {
          const cur = loadIdSet(ARCHIVED_KEY)
          const curLog = loadLog(RESOLVED_LOG_KEY)
          ids.forEach((id) => {
            cur.delete(id)
            delete curLog[id]
          })
          persistArchived(cur)
          persistLog(curLog)
        },
      },
    })
  }

  const handlePostUpdate = async () => {
    if (!newUpdate.title || !newUpdate.content) {
      toast.error("Preencha título e conteúdo.")
      return
    }
    setIsSaving(true)
    try {
      const { error } = await supabase.from("system_updates").insert({
        title: newUpdate.title,
        content: newUpdate.content,
        update_type: newUpdate.type,
        is_published: true,
      })
      if (error) throw error
      logAuditClient({ action: "system.create_update", resource: "system_updates", details: { title: newUpdate.title } })
      toast.success("Atualização publicada com sucesso!")
      setIsModalOpen(false)
      setNewUpdate({ title: "", content: "", type: "feature" })
      loadData()
    } catch {
      toast.error("Erro ao publicar atualização.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <PageShell width="default">
      <PageHeader
        eyebrow="Central de avisos"
        title="Notificações"
        description="Tudo que exige sua atenção — vencimentos, conexão do WhatsApp e novidades do produto, em ordem de prioridade."
        badge={unreadCount > 0 ? `${unreadCount} não lida${unreadCount === 1 ? "" : "s"}` : "tudo lido"}
        actions={
          <>
            <Button variant="outline" className="gap-2" onClick={() => router.push("/configuracoes")}>
              Preferências
            </Button>
            <Button className="gap-2" onClick={markAllRead} disabled={unreadCount === 0}>
              <Check className="size-4" aria-hidden="true" /> Marcar tudo como lido
            </Button>
            {isAdmin && (
              <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogTrigger
                  render={
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
                      <Plus className="size-3.5" aria-hidden="true" /> Nova atualização
                    </Button>
                  }
                />
                <DialogContent className="sm:max-w-[480px]">
                  <DialogHeader>
                    <DialogTitle>Publicar nova atualização</DialogTitle>
                    <DialogDescription>Esta mensagem aparecerá na central de notificações de todos os seus clientes.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label>Tipo de atualização</Label>
                      <Select value={newUpdate.type} onValueChange={(val) => setNewUpdate({ ...newUpdate, type: val || "improvement" })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tipo..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="feature">Nova funcionalidade</SelectItem>
                          <SelectItem value="improvement">Melhoria</SelectItem>
                          <SelectItem value="bugfix">Correção de bug</SelectItem>
                          <SelectItem value="maintenance">Manutenção</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Título</Label>
                      <Input
                        placeholder="Ex: Novo disparo em massa"
                        value={newUpdate.title}
                        onChange={(e) => setNewUpdate({ ...newUpdate, title: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Detalhes da atualização</Label>
                      <Textarea
                        placeholder="Descreva as melhorias ou correções aplicadas..."
                        className="min-h-[120px]"
                        value={newUpdate.content}
                        onChange={(e) => setNewUpdate({ ...newUpdate, content: e.target.value })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                    <Button onClick={handlePostUpdate} disabled={isSaving}>
                      {isSaving && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />} Publicar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className={cn("rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]", unreadCount > 0 ? "border-interactive/25" : "border-border")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="microlabel">Não lidas</p>
                  <p className={cn("mt-2 text-2xl font-semibold tracking-tight", unreadCount > 0 ? "text-interactive" : "text-foreground")}>{unreadCount}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{unreadCount === 0 ? "tudo lido" : unreadCount === 1 ? "1 aviso aguardando" : `${unreadCount} avisos aguardando`}</p>
                </div>
                <span className={cn("relative rounded-lg p-2", unreadCount > 0 ? "bg-interactive-bg text-interactive-fg" : "bg-secondary text-secondary-foreground")}>
                  <BellRing className="size-4" aria-hidden="true" />
                  {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full border border-card bg-danger" />}
                </span>
              </div>
            </div>
            <div className={cn("rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]", criticalCount > 0 ? "border-danger-border" : "border-border")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="microlabel">Exigem ação</p>
                  <p className={cn("mt-2 text-2xl font-semibold tracking-tight", criticalCount > 0 ? "text-danger" : "text-foreground")}>{criticalCount}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{criticalCount === 0 ? "nada crítico agora" : "resolva antes de tudo"}</p>
                </div>
                <span className={cn("rounded-lg p-2", criticalCount > 0 ? "bg-danger-bg text-danger-fg" : "bg-success-bg text-success-fg")}>
                  <AlertTriangle className="size-4" aria-hidden="true" />
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="microlabel">Valor envolvido</p>
                  <p className="num mt-2 text-2xl font-semibold tracking-tight text-foreground">{String(displayValue(formatCurrency(pendingAmount)))}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">em mensalidades vencidas/vencendo</p>
                </div>
                <span className="rounded-lg bg-interactive-bg p-2 text-interactive-fg">
                  <Wallet className="size-4" aria-hidden="true" />
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="microlabel">Resolvidas hoje</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-money">{resolvedToday}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">de {totalToday} recebidas hoje</p>
                </div>
                <span className="rounded-lg bg-success-bg p-2 text-success-fg">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start">
            <nav className="flex flex-col gap-4 lg:sticky lg:top-20">
              <div>
                <p className="microlabel mb-1.5 px-1.5">Caixa</p>
                <div className="flex flex-col gap-0.5">
                  {statusDefs.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => {
                        setStatusFilter(s.key)
                        setSelectedIds({})
                      }}
                      aria-pressed={statusFilter === s.key}
                      className={cn(
                        "flex min-h-8 w-full items-center gap-2 rounded-lg px-2.5 text-[12.5px] transition-colors",
                        statusFilter === s.key
                          ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,.05)]"
                          : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate text-left">{s.label}</span>
                      <span className="num shrink-0 text-[10.5px] font-semibold">{s.count}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="microlabel mb-1.5 px-1.5">Tipo</p>
                <div className="flex flex-col gap-0.5">
                  {typeDefs.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => {
                        setTypeFilter(t.key)
                        setSelectedIds({})
                      }}
                      aria-pressed={typeFilter === t.key}
                      className={cn(
                        "flex min-h-8 w-full items-center gap-2 rounded-lg px-2.5 text-[12.5px] transition-colors",
                        typeFilter === t.key
                          ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,.05)]"
                          : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          t.key === "all" ? "bg-muted-foreground" : TYPE_META[t.key as NotifType].iconFg.replace("text-", "bg-")
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate text-left">{t.label}</span>
                      <span className="num shrink-0 text-[10.5px] font-semibold">{t.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            </nav>

            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border bg-card p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <label
                  className={cn(
                    "flex shrink-0 items-center gap-2",
                    visibleSelectableIds.length === 0 ? "pointer-events-none opacity-40" : "cursor-pointer"
                  )}
                >
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleSelectAllVisible}
                    disabled={visibleSelectableIds.length === 0}
                  />
                  <span className="text-[11.5px] font-medium text-muted-foreground">Selecionar</span>
                </label>
                <div className="h-4 w-px shrink-0 bg-border" />
                <div className="relative min-w-[160px] max-w-[300px] flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar aviso…"
                    className="h-8 rounded-md pl-8 text-xs"
                  />
                </div>
                <div className="flex-1" />
                {selectedCount > 0 ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[11.5px] font-semibold text-interactive-fg">{selectedCount === 1 ? "1 selecionada" : `${selectedCount} selecionadas`}</span>
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={markSelectionRead}>Marcar lida</Button>
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={archiveSelection}>Arquivar</Button>
                    <button type="button" onClick={clearSelection} className="p-1 text-muted-foreground hover:text-foreground">
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <span className="num shrink-0 text-[10.5px] text-muted-foreground">{filtered.length === 1 ? "1 aviso" : `${filtered.length} avisos`}</span>
                )}
              </div>

              {filtered.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card px-6 py-14 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                  <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-success-bg text-success-fg">
                    <CheckCircle2 className="size-5" aria-hidden="true" />
                  </span>
                  <p className="mt-3 text-[13.5px] font-semibold text-foreground">{emptyMeta.title}</p>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">{emptyMeta.subtitle}</p>
                </div>
              ) : (
                groups.map((group) => (
                  <section key={group.label} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 px-0.5">
                      <p className="microlabel">{group.label}</p>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground">{group.items.length}</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                      {group.items.map((item, idx) => {
                        const meta = TYPE_META[item.type]
                        const Icon = meta.icon
                        const sev = SEVERITY_META[item.severity]
                        const selected = !!selectedIds[item.id]
                        const badge = item.kind === "update" ? UPDATE_TYPE_BADGE[updates.find((u) => u.id === item.id)?.update_type || ""] : null
                        return (
                          <div
                            key={item.id}
                            className={cn(
                              "flex items-start gap-3 p-3.5",
                              idx !== group.items.length - 1 && "border-b border-border",
                              selected ? "bg-interactive-bg" : item.unread ? "bg-muted/40" : "bg-transparent"
                            )}
                          >
                            {item.selectable ? (
                              <Checkbox checked={selected} onCheckedChange={() => toggleSelect(item.id)} className="mt-1 shrink-0" />
                            ) : (
                              <span className="mt-1 size-4 shrink-0" />
                            )}
                            <span className={cn("relative flex size-9 shrink-0 items-center justify-center rounded-xl", meta.iconBg, meta.iconFg)}>
                              <Icon className="size-4" aria-hidden="true" />
                              {item.unread && <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full border-2 border-card bg-danger" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className={cn("text-[13px] text-foreground", item.unread ? "font-semibold" : "font-medium")}>{item.title}</p>
                                {badge ? (
                                  <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", badge.cls)}>{badge.label}</span>
                                ) : (
                                  <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", sev.className)}>{sev.label}</span>
                                )}
                              </div>
                              <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">{item.body}</p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                                <span className="num text-[10px] text-muted-foreground">{relativeTime(item.time)}</span>
                                {item.amount > 0 && <span className="num text-[10.5px] font-semibold text-foreground">{String(displayValue(formatCurrency(item.amount)))}</span>}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {item.actionLabel && item.onAction && (
                                <Button size="sm" variant={item.severity === "critical" ? "default" : "secondary"} className="h-7 px-2.5 text-[11px]" onClick={item.onAction}>
                                  {item.actionLabel}
                                </Button>
                              )}
                              {item.selectable && (
                                <>
                                  <button
                                    type="button"
                                    title={item.unread ? "Marcar como lida" : "Marcar como não lida"}
                                    onClick={() => toggleRead(item.id)}
                                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                  >
                                    {item.unread ? <Check className="size-3.5" aria-hidden="true" /> : <RotateCcw className="size-3.5" aria-hidden="true" />}
                                  </button>
                                  {statusFilter !== "archived" && (
                                    <button
                                      type="button"
                                      title="Arquivar"
                                      onClick={() => archiveOne(item.id)}
                                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                    >
                                      <Archive className="size-3.5" aria-hidden="true" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </PageShell>
  )
}

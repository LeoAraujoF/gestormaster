"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Plus, Download, Search, Filter, MoreHorizontal, MessageCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency, phoneMask, cn } from "@/lib/utils"
import type { Service } from "@/types/database"
import { ClientFormDialog } from "@/components/client-form-dialog"
import { RenewDialog, PromoDialog, DeleteDialog, BulkDeleteDialog } from "@/components/client-action-dialogs"
import { Checkbox } from "@/components/ui/checkbox"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useConfirm } from "@/components/providers/confirm-provider"

type QuickFilter = "all" | "today" | "overdue" | "new_week" | "no_phone"

export default function ClientesPage() {
  const [clients, setClients] = useState<any[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [metrics, setMetrics] = useState<any>(null)
  const [isMetricsLoading, setIsMetricsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isRenewDialogOpen, setIsRenewDialogOpen] = useState(false)
  const [isPromoDialogOpen, setIsPromoDialogOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<any | null>(null)
  const [deletingClient, setDeletingClient] = useState<any | null>(null)
  const [selectedClients, setSelectedClients] = useState<string[]>([])
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false)
  const [renewingClient, setRenewingClient] = useState<any | null>(null)
  const [promoClient, setPromoClient] = useState<any | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 10

  // Ficha 360
  const [profileClient, setProfileClient] = useState<any | null>(null)
  const [profilePayments, setProfilePayments] = useState<any[]>([])
  const [isProfileLoading, setIsProfileLoading] = useState(false)

  // Mensagem rápida + regras de cobrança (send-instant)
  const [quickMessage, setQuickMessage] = useState<{ id: string; template: string } | null>(null)
  const [chargeRules, setChargeRules] = useState<{ id: string; alert_type: string }[]>([])
  const [chargingIds, setChargingIds] = useState<Set<string>>(new Set())

  // Filtros avançados
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterService, setFilterService] = useState<string>("all")
  const [filterMinPrice, setFilterMinPrice] = useState<string>("")
  const [filterMaxPrice, setFilterMaxPrice] = useState<string>("")
  const [filterDateFrom, setFilterDateFrom] = useState<string>("")
  const [filterDateTo, setFilterDateTo] = useState<string>("")
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all")

  const supabase = createClient()
  const confirm = useConfirm()

  const loadData = async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Varredura de vencidos antes de carregar
      try { await fetch('/api/clients/update-overdue', { method: 'POST' }) } catch (e) { /* silencia */ }

      const { data: servicesData } = await supabase
        .from('services').select('*').eq('user_id', user.id).order('name')
      if (servicesData) setServices(servicesData)

      // Traz username/password por serviço para a ficha de edição prefilar
      const { data: clientsData, error } = await supabase
        .from('clients')
        .select(`*, client_services ( service_id, username, password, services (id, name, cost, plans) )`)
        .eq('user_id', user.id)
        .order('name')
      if (error) throw error
      setClients(clientsData || [])

      const { data: ruleData } = await supabase
        .from('automations').select('id, message_template')
        .eq('user_id', user.id).eq('alert_type', 'quick_message').eq('is_active', true).maybeSingle()
      setQuickMessage(ruleData ? { id: ruleData.id, template: ruleData.message_template } : null)

      const { data: rulesData } = await supabase
        .from('automations').select('id, alert_type')
        .eq('is_active', true).in('alert_type', ['before_due', 'on_due', 'after_due'])
      if (rulesData) setChargeRules(rulesData)
    } catch (error) {
      console.error("Error loading data:", error)
      toast.error("Erro ao carregar dados.")
    } finally {
      setIsLoading(false)
    }
  }

  const loadMetrics = async () => {
    setIsMetricsLoading(true)
    try {
      const res = await fetch('/api/clients/metrics')
      if (res.ok) {
        const data = await res.json()
        if (data.success) setMetrics(data)
      }
    } catch (e) { console.error(e) } finally { setIsMetricsLoading(false) }
  }

  useEffect(() => { loadData(); loadMetrics() }, [])

  // esc limpa a seleção
  useEffect(() => {
    if (selectedClients.length === 0) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedClients([]) }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [selectedClients.length])

  // --- Datas ---
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diffDays = useCallback((s: string | null) => {
    if (!s) return null
    return Math.round((new Date(s + "T00:00:00").getTime() - today.getTime()) / 86400000)
  }, [today.getTime()])
  const isNew = (c: any) => {
    if (!c.registration_date) return false
    return (today.getTime() - new Date(c.registration_date + "T00:00:00").getTime()) / 86400000 <= 7
  }

  // --- Contagens dos segmentos ---
  const countToday = clients.filter((c) => diffDays(c.due_date) === 0).length
  const countOverdue = clients.filter((c) => (diffDays(c.due_date) ?? 1) < 0).length
  const countNew = clients.filter(isNew).length
  const countNoPhone = clients.filter((c) => !c.phone || c.phone.trim() === "").length

  // --- Filtragem ---
  const filteredClients = clients.filter((c) => {
    const q = searchTerm.toLowerCase()
    const matchesSearch = c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(searchTerm))

    let matchesStatus = true
    if (filterStatus !== 'all') {
      if (filterStatus === 'expiring') { const d = diffDays(c.due_date); matchesStatus = d !== null && d >= 0 && d <= 3 }
      else matchesStatus = c.status === filterStatus
    }
    const matchesService = filterService === 'all' || (c.client_services && c.client_services.some((cs: any) => cs.service_id === filterService))
    const price = c.plan_value || 0
    const matchesMin = !filterMinPrice ? true : price >= parseFloat(filterMinPrice)
    const matchesMax = !filterMaxPrice ? true : price <= parseFloat(filterMaxPrice)
    let matchesDate = true
    if (filterDateFrom || filterDateTo) {
      if (!c.due_date) matchesDate = false
      else { if (filterDateFrom && c.due_date < filterDateFrom) matchesDate = false; if (filterDateTo && c.due_date > filterDateTo) matchesDate = false }
    }
    let matchesQuick = true
    if (quickFilter === 'today') matchesQuick = diffDays(c.due_date) === 0
    else if (quickFilter === 'overdue') matchesQuick = (diffDays(c.due_date) ?? 1) < 0
    else if (quickFilter === 'new_week') matchesQuick = isNew(c)
    else if (quickFilter === 'no_phone') matchesQuick = !c.phone || c.phone.trim() === ''

    return matchesSearch && matchesStatus && matchesService && matchesMin && matchesMax && matchesDate && matchesQuick
  })

  const sortedClients = [...filteredClients].sort((a, b) => {
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    const dA = diffDays(a.due_date)!, dB = diffDays(b.due_date)!
    const expA = dA >= 0 && dA <= 3, expB = dB >= 0 && dB <= 3
    if (expA !== expB) return expA ? -1 : 1
    const recA = dA < 0 && dA >= -15, recB = dB < 0 && dB >= -15
    if (recA !== recB) return recA ? -1 : 1
    return Math.abs(dA) - Math.abs(dB)
  })

  const totalPages = Math.ceil(sortedClients.length / ITEMS_PER_PAGE) || 1
  const paginatedClients = sortedClients.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
  useEffect(() => { setCurrentPage(1) }, [searchTerm, filterStatus, filterService, filterMinPrice, filterMaxPrice, filterDateFrom, filterDateTo, quickFilter])

  const toggleSelectAll = (checked: boolean) => setSelectedClients(checked ? filteredClients.map((c: any) => c.id) : [])
  const toggleSelectClient = (id: string, checked: boolean) => setSelectedClients((prev) => (checked ? [...prev, id] : prev.filter((cid) => cid !== id)))

  const exportCSV = (list: any[]) => {
    if (list.length === 0) return
    const headers = ["Nome", "Telefone", "Vencimento", "Cadastro", "Valor_Plano", "Status"]
    const rows = list.map((c) => [
      `"${c.name}"`, `"${c.phone || ''}"`,
      `"${c.due_date ? new Date(c.due_date + "T00:00:00").toLocaleDateString('pt-BR') : ''}"`,
      `"${c.registration_date ? new Date(c.registration_date + "T00:00:00").toLocaleDateString('pt-BR') : ''}"`,
      c.plan_value, `"${c.status}"`,
    ].join(","))
    const csv = "data:text/csv;charset=utf-8,﻿" + [headers.join(","), ...rows].join("\n")
    const link = document.createElement("a")
    link.setAttribute("href", encodeURI(csv))
    link.setAttribute("download", `carteira_clientes.csv`)
    document.body.appendChild(link); link.click(); document.body.removeChild(link)
  }

  const handleWhatsApp = (client: any) => {
    if (!client.phone) { toast.error("Este cliente não possui telefone cadastrado."); return }
    const numbersOnly = client.phone.replace(/\D/g, '')
    const phoneWithCountry = numbersOnly.startsWith('55') ? numbersOnly : `55${numbersOnly}`
    let rawMsg = `Olá ${client.name}, tudo bem?`
    if (quickMessage?.template) {
      const primeiroNome = client.name ? client.name.split(' ')[0] : ''
      rawMsg = quickMessage.template
        .replace(/\{\{primeiro_nome\}\}/g, primeiroNome)
        .replace(/\{\{client_name\}\}/g, client.name || '')
        .replace(/\{\{plan_value\}\}/g, formatCurrency(client.plan_value || 0))
        .replace(/\{\{due_date\}\}/g, client.due_date ? new Date(client.due_date + "T00:00:00").toLocaleDateString('pt-BR') : 'Sem data')
    }
    window.open(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(rawMsg)}`, '_blank')
  }

  const pickRule = (diff: number | null) => {
    const type = diff !== null && diff < 0 ? "after_due" : diff === 0 ? "on_due" : "before_due"
    return chargeRules.find((r) => r.alert_type === type) || chargeRules[0]
  }
  const handleCobrar = async (client: any) => {
    if (!client.phone) { toast.error(`${client.name} não possui WhatsApp cadastrado.`); return }
    if (chargeRules.length === 0) { toast.error("Nenhuma regra de automação ativa como template."); return }
    setChargingIds((prev) => new Set(prev).add(client.id))
    try {
      const rule = pickRule(diffDays(client.due_date))
      const res = await fetch("/api/evolution/send-instant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id, ruleId: rule.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Falha no envio")
      toast.success(`Cobrança enviada para ${client.name}.`)
    } catch (e: any) {
      toast.error(`Falha ao cobrar ${client.name}: ${e.message}`)
    } finally {
      setChargingIds((prev) => { const n = new Set(prev); n.delete(client.id); return n })
    }
  }

  const handleBulkMessage = async () => {
    const targets = clients.filter((c) => selectedClients.includes(c.id) && c.phone)
    if (targets.length === 0) { toast.info("Nenhum selecionado com WhatsApp."); return }
    if (!quickMessage) { toast.error("Configure uma regra de Mensagem Rápida em Automação primeiro."); return }
    const ok = await confirm({
      title: `Enviar mensagem para ${targets.length} cliente${targets.length > 1 ? "s" : ""}?`,
      description: "Cada um recebe o template de mensagem rápida no WhatsApp.",
    })
    if (!ok) return
    let sent = 0, failed = 0
    for (const client of targets) {
      try {
        const res = await fetch("/api/evolution/send-instant", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: client.id, ruleId: quickMessage.id }),
        })
        if (!res.ok) throw new Error()
        sent++
      } catch { failed++ }
    }
    setSelectedClients([])
    if (failed === 0) toast.success(`${sent} mensagens enviadas.`)
    else toast.warning(`${sent} enviadas · ${failed} falharam.`)
  }

  const openProfile = async (client: any) => {
    setProfileClient(client)
    setIsProfileLoading(true)
    try {
      const { data } = await supabase.from('payments').select('*').eq('client_id', client.id).order('created_at', { ascending: false })
      setProfilePayments(data || [])
    } catch (e) { console.error(e) } finally { setIsProfileLoading(false) }
  }

  // --- Render helpers ---
  const getInitials = (name: string) => {
    const parts = name.trim().split(' ')
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.substring(0, 2).toUpperCase()
  }
  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: "bg-success-bg text-success-fg", pending: "bg-warning-bg text-warning-fg",
      vencido: "bg-danger-bg text-danger-fg", inactive: "bg-secondary text-muted-foreground",
    }
    const label: Record<string, string> = { active: "Ativo", pending: "Pendente", vencido: "Vencido", inactive: "Inativo" }
    return <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", map[status] || "bg-secondary")}>{label[status] || status}</span>
  }
  const prazoLabel = (d: number | null) => d === null ? null : d === -1 ? "ontem" : d < 0 ? `há ${Math.abs(d)} dias` : d === 0 ? "vence hoje" : d === 1 ? "amanhã" : `em ${d} dias`
  const prazoColor = (d: number | null) => d === null ? "text-muted-foreground" : d < 0 ? "text-danger" : d === 0 ? "text-warning-fg" : "text-muted-foreground"
  const needsCharge = (c: any) => { const d = diffDays(c.due_date); return c.status === 'vencido' || c.status === 'pending' || (d !== null && d <= 0) }

  const segments: { key: QuickFilter; label: string; count: number; dot?: string }[] = [
    { key: "all", label: "Todos", count: clients.length },
    { key: "today", label: "Hoje", count: countToday, dot: "bg-warning" },
    { key: "overdue", label: "Vencidos", count: countOverdue, dot: "bg-danger" },
    { key: "new_week", label: "Novos", count: countNew, dot: "bg-money" },
    { key: "no_phone", label: "Sem WhatsApp", count: countNoPhone },
  ]
  const hasAdvanced = filterStatus !== 'all' || filterService !== 'all' || filterMinPrice || filterMaxPrice || filterDateFrom || filterDateTo

  return (
    <div className="space-y-4 pb-10">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-[17px] font-semibold tracking-[-0.02em]">Clientes</h1>
          <span className="num rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">{clients.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV(sortedClients)} className="h-8 gap-1.5 text-xs">
            <Download className="size-3.5" /> Exportar CSV
          </Button>
          <Button size="sm" onClick={() => {
            if (services.length === 0) { toast.warning("Cadastre um Serviço primeiro."); return }
            setEditingClient(null); setIsDialogOpen(true)
          }} className="h-8 gap-1.5 text-xs">
            <Plus className="size-3.5" /> Novo cliente
          </Button>
        </div>
      </div>

      {/* Busca + segmentados + filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Nome, usuário ou telefone…" className="h-8 border-input bg-card pl-8 text-xs" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="flex items-center gap-0.5 overflow-x-auto rounded-md bg-secondary p-0.5">
          {segments.map((s) => (
            <button key={s.key} onClick={() => setQuickFilter(s.key)}
              className={cn("flex shrink-0 items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-xs transition-colors",
                quickFilter === s.key ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,.06)]" : "text-secondary-foreground hover:text-foreground")}>
              {s.dot && <span className={cn("status-dot !h-1.5 !w-1.5", s.dot)} />}
              {s.label} · <span className="num">{s.count}</span>
            </button>
          ))}
        </div>
        <Popover>
          <PopoverTrigger className={buttonVariants({ variant: "outline", size: "sm", className: "h-8 gap-1.5 text-xs relative" })}>
            <Filter className="size-3.5" /> Filtros
            {hasAdvanced && <span className="absolute -right-1 -top-1 size-2 rounded-full bg-interactive" />}
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4" align="end">
            <div className="space-y-4">
              <div className="space-y-1"><h4 className="text-sm font-semibold">Filtros avançados</h4><p className="text-xs text-muted-foreground">Status, serviço, preço e vencimento.</p></div>
              <div className="space-y-2">
                <Label className="text-xs">Status</Label>
                <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? "all")}>
                  <SelectTrigger className="h-8 w-full text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos status</SelectItem>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="expiring">Próx. vencimento</SelectItem>
                    <SelectItem value="vencido">Vencido</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Serviço vinculado</Label>
                <Select value={filterService} onValueChange={(v) => setFilterService(v ?? "all")}>
                  <SelectTrigger className="h-8 w-full text-sm">
                    <SelectValue>{filterService === 'all' ? 'Todos serviços' : services.find((s) => s.id === filterService)?.name}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos serviços</SelectItem>
                    {services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Faixa de preço</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" placeholder="Mín" className="h-8 flex-1 text-sm" value={filterMinPrice} onChange={(e) => setFilterMinPrice(e.target.value)} />
                  <span className="text-muted-foreground">–</span>
                  <Input type="number" placeholder="Máx" className="h-8 flex-1 text-sm" value={filterMaxPrice} onChange={(e) => setFilterMaxPrice(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Vencimento</Label>
                <div className="flex items-center gap-2">
                  <Input type="date" className="h-8 flex-1 px-2 text-sm" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
                  <span className="text-muted-foreground">–</span>
                  <Input type="date" className="h-8 flex-1 px-2 text-sm" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
                </div>
              </div>
              {hasAdvanced && (
                <Button variant="ghost" className="h-8 w-full text-xs text-danger hover:bg-danger-bg hover:text-danger"
                  onClick={() => { setFilterStatus('all'); setFilterService('all'); setFilterMinPrice(''); setFilterMaxPrice(''); setFilterDateFrom(''); setFilterDateTo('') }}>
                  Limpar filtros
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Barra de seleção em massa */}
      {selectedClients.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-md bg-accent px-3 py-2 text-xs">
          <span className="font-semibold text-accent-foreground">{selectedClients.length} selecionado{selectedClients.length > 1 && "s"}</span>
          <button onClick={handleBulkMessage} className="font-medium text-interactive hover:underline">Enviar mensagem</button>
          <button onClick={() => exportCSV(clients.filter((c) => selectedClients.includes(c.id)))} className="font-medium text-interactive hover:underline">Exportar</button>
          <button onClick={() => setIsBulkDeleteDialogOpen(true)} className="font-medium text-danger hover:underline">Excluir</button>
          <span className="ml-auto text-muted-foreground">esc para limpar</span>
        </div>
      )}

      {/* Tabela */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-4 rounded" /><Skeleton className="size-7 rounded-full" />
                <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-3 w-28" /></div>
                <Skeleton className="h-3.5 w-16" /><Skeleton className="h-5 w-14 rounded" />
              </div>
            ))}
          </div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-4 py-16 text-center">
            <p className="microlabel">Nenhum cliente cadastrado</p>
            <p className="text-xs text-muted-foreground">Adicione seu primeiro cliente para começar a gerenciar os vencimentos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[36px] pl-3">
                    <Checkbox checked={selectedClients.length > 0 && selectedClients.length === filteredClients.length} onCheckedChange={toggleSelectAll} aria-label="Selecionar todos" />
                  </TableHead>
                  <TableHead className="microlabel text-[9px]">Cliente</TableHead>
                  <TableHead className="microlabel hidden text-[9px] md:table-cell">Serviços</TableHead>
                  <TableHead className="microlabel text-[9px]">Vencimento</TableHead>
                  <TableHead className="microlabel text-right text-[9px]">Valor</TableHead>
                  <TableHead className="microlabel text-[9px]">Status</TableHead>
                  <TableHead className="microlabel pr-3 text-right text-[9px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedClients.map((client) => {
                  const d = diffDays(client.due_date)
                  return (
                    <TableRow key={client.id} className={cn("hover:bg-muted", selectedClients.includes(client.id) && "bg-[#fafaff] dark:bg-accent/30")}>
                      <TableCell className="pl-3">
                        <Checkbox checked={selectedClients.includes(client.id)} onCheckedChange={(c) => toggleSelectClient(client.id, !!c)} aria-label={`Selecionar ${client.name}`} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground">{getInitials(client.name)}</div>
                          <div className="min-w-0">
                            <button className="block truncate text-[13px] font-semibold text-foreground hover:underline" onClick={() => openProfile(client)} title="Ver ficha">{client.name}</button>
                            <button onClick={() => { if (client.phone) { navigator.clipboard.writeText(client.phone); toast.success("Telefone copiado!") } }}
                              className="num block truncate text-[11px] text-muted-foreground hover:text-foreground" title="Copiar">
                              {client.phone ? phoneMask(client.phone) : 'sem WhatsApp'}
                            </button>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {client.client_services?.map((cs: any) => (
                            <span key={cs.service_id} className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-secondary-foreground">{cs.services?.name}</span>
                          ))}
                          {client.screens > 1 && <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-secondary-foreground">{client.screens} telas</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {client.due_date ? (
                          <>
                            <p className="num text-xs text-foreground">{new Date(client.due_date + "T00:00:00").toLocaleDateString('pt-BR')}</p>
                            <p className={cn("text-[11px] font-medium", prazoColor(d))}>{prazoLabel(d)}</p>
                          </>
                        ) : <p className="text-xs text-muted-foreground">Sem venc.</p>}
                      </TableCell>
                      <TableCell className="text-right"><span className="num whitespace-nowrap text-xs font-medium">{formatCurrency(client.plan_value)}</span></TableCell>
                      <TableCell>{statusBadge(client.status)}</TableCell>
                      <TableCell className="pr-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {needsCharge(client) ? (
                            <Button size="sm" onClick={() => handleCobrar(client)} disabled={chargingIds.has(client.id)} className="h-7 rounded-md px-2.5 text-xs">
                              {chargingIds.has(client.id) ? <Loader2 className="size-3 animate-spin" /> : "Cobrar"}
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => handleWhatsApp(client)} className="h-7 rounded-md px-2.5 text-xs">Msg</Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => { setRenewingClient(client); setIsRenewDialogOpen(true) }} className="h-7 rounded-md px-2.5 text-xs">Renovar</Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setEditingClient(client); setIsDialogOpen(true) }}>Editar</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setPromoClient(client); setIsPromoDialogOpen(true) }}>Ativar promoção</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleWhatsApp(client)}>Conversar no WhatsApp</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openProfile(client)}>Ficha 360º</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onClick={() => { setDeletingClient(client); setIsDeleteDialogOpen(true) }}>Excluir</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
              <p className="text-[11px] text-muted-foreground">{sortedClients.length} cliente{sortedClients.length !== 1 && "s"} · página {currentPage} de {totalPages}</p>
              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>← Anterior</Button>
                  <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Próxima →</Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Métricas */}
      {isMetricsLoading ? (
        <Skeleton className="h-[84px] w-full rounded-lg" />
      ) : metrics ? (
        <>
          <div className="grid grid-cols-2 rounded-lg border border-border bg-card md:grid-cols-3 lg:grid-cols-6 md:divide-x md:divide-border">
            <div className="p-4"><p className="microlabel">MRR (ativos)</p><p className="num mt-1 whitespace-nowrap text-lg font-semibold text-money">{formatCurrency(metrics.metrics.mrr)}</p></div>
            <div className="p-4"><p className="microlabel">Ticket médio</p><p className="num mt-1 whitespace-nowrap text-lg font-semibold">{formatCurrency(metrics.metrics.ticketMedio)}</p></div>
            <div className="p-4"><p className="microlabel">Vencem em 7d</p><p className="num mt-1 text-lg font-semibold text-warning">{metrics.metrics.expiringSoon}</p></div>
            <div className="p-4"><p className="microlabel">Churn</p><p className="num mt-1 text-lg font-semibold text-danger">{metrics.metrics.churnRate}%</p></div>
            <div className="p-4"><p className="microlabel">Ativos</p><p className="num mt-1 text-lg font-semibold">{metrics.metrics.totalActive}</p></div>
            <div className="p-4"><p className="microlabel">Vencidos</p><p className="num mt-1 text-lg font-semibold text-danger">{metrics.metrics.totalOverdue}</p></div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-[13px] font-semibold">Retenção vs ativação</p>
            <p className="mb-4 text-[11px] text-muted-foreground">Últimos 6 meses</p>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                  <Tooltip cursor={{ fill: 'var(--muted)' }} contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px', fontSize: 12 }} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '16px', fontSize: 12 }} />
                  <Bar dataKey="Ativações" fill="var(--money)" radius={[3, 3, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="Renovações" fill="var(--interactive)" radius={[3, 3, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="Vencidos" fill="var(--danger)" radius={[3, 3, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : null}

      {/* Dialogs */}
      <ClientFormDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} client={editingClient} servicesList={services} onSuccess={loadData} />
      <RenewDialog open={isRenewDialogOpen} onOpenChange={setIsRenewDialogOpen} client={renewingClient} onSuccess={loadData} />
      <PromoDialog open={isPromoDialogOpen} onOpenChange={setIsPromoDialogOpen} client={promoClient} onSuccess={loadData} />
      <DeleteDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen} client={deletingClient} onSuccess={loadData} />
      <BulkDeleteDialog open={isBulkDeleteDialogOpen} onOpenChange={(open) => { setIsBulkDeleteDialogOpen(open); if (!open) setSelectedClients([]) }}
        clients={clients.filter((c) => selectedClients.includes(c.id))} onSuccess={() => { loadData(); setSelectedClients([]) }} />

      {/* Ficha 360 */}
      <Sheet open={!!profileClient} onOpenChange={(open) => !open && setProfileClient(null)}>
        <SheetContent className="overflow-y-auto px-6 sm:max-w-[420px]">
          <SheetHeader className="mt-2">
            <SheetTitle className="text-base font-semibold">Ficha do cliente</SheetTitle>
            <SheetDescription className="text-xs">Histórico financeiro completo e LTV.</SheetDescription>
          </SheetHeader>
          {profileClient && (
            <div className="mt-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{profileClient.name}</h3>
                <p className="num text-xs text-muted-foreground">{profileClient.phone ? phoneMask(profileClient.phone) : 'Sem telefone'}</p>
                <div className="mt-2">{statusBadge(profileClient.status)}</div>
              </div>
              <div className="rounded-lg border border-border bg-muted p-4">
                <p className="microlabel">LTV (lifetime value)</p>
                <p className="num mt-1 text-[22px] font-semibold text-money">{formatCurrency(profilePayments.reduce((acc, p) => acc + Number(p.amount_paid || 0), 0))}</p>
              </div>
              <div>
                <p className="microlabel mb-2">Histórico de receita</p>
                {isProfileLoading ? (
                  <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}</div>
                ) : profilePayments.length === 0 ? (
                  <p className="rounded-md border border-dashed border-input px-3 py-6 text-center text-xs text-muted-foreground">Nenhum pagamento registrado.</p>
                ) : (
                  <div className="divide-y divide-border rounded-md border border-border">
                    {profilePayments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                        <div><p className="num text-xs text-foreground">{new Date(p.created_at).toLocaleDateString('pt-BR')}</p><p className="text-[10.5px] text-muted-foreground">{p.amount_paid === 0 ? 'Extensão (promo)' : 'Renovação'}</p></div>
                        <p className="num text-xs font-medium text-money">+{formatCurrency(p.amount_paid)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Button onClick={() => handleWhatsApp(profileClient)} className="w-full gap-2"><MessageCircle className="size-4" />Chamar no WhatsApp</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

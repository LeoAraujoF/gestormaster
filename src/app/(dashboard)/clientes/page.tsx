"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Plus, Download, Search, Filter, MoreHorizontal, MessageCircle, Loader2, Users, UserCheck, UserX, AlertCircle, PhoneOff, Smartphone, CalendarDays, ServerOff, Zap } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency, phoneMask, cn } from "@/lib/utils"
import type { Service, ClientsManagementMetrics, EnrichedClient } from "@/types/database"
import { ClientFormDialog } from "@/components/client-form-dialog"
import { RenewDialog, PromoDialog, DeleteDialog, BulkDeleteDialog } from "@/components/client-action-dialogs"
import { Checkbox } from "@/components/ui/checkbox"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useConfirm } from "@/components/providers/confirm-provider"
import { ClickableKPI, BaseGrowthChart, ClientsByStatusChart, ClientsByPlanChart } from "./components/client-widgets"
import { PixRapidoModal } from "@/components/pix-rapido-modal"

type QuickFilter = "all" | "active" | "overdue" | "today" | "7days" | "new" | "no_whatsapp" | "no_service" | "suspended" | "canceled"

export default function ClientesPage() {
  const [clients, setClients] = useState<EnrichedClient[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [metrics, setMetrics] = useState<ClientsManagementMetrics | null>(null)
  
  // Modals
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isRenewDialogOpen, setIsRenewDialogOpen] = useState(false)
  const [isPromoDialogOpen, setIsPromoDialogOpen] = useState(false)
  
  const [editingClient, setEditingClient] = useState<any | null>(null)
  const [deletingClient, setDeletingClient] = useState<any | null>(null)
  const [renewingClient, setRenewingClient] = useState<any | null>(null)
  const [promoClient, setPromoClient] = useState<any | null>(null)
  
  // Seleção e Bulk
  const [selectedClients, setSelectedClients] = useState<string[]>([])
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false)

  // Filtros e Busca
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 10
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all")
  
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterService, setFilterService] = useState<string>("all")
  const [filterDateFrom, setFilterDateFrom] = useState<string>("")
  const [filterDateTo, setFilterDateTo] = useState<string>("")

  // Ficha 360
  const [profileClient, setProfileClient] = useState<EnrichedClient | null>(null)
  const [profilePayments, setProfilePayments] = useState<any[]>([])
  const [isProfileLoading, setIsProfileLoading] = useState(false)

  // Automação
  const [quickMessage, setQuickMessage] = useState<{ id: string; template: string } | null>(null)
  const [chargeRules, setChargeRules] = useState<{ id: string; alert_type: string }[]>([])
  const [chargingIds, setChargingIds] = useState<Set<string>>(new Set())

  const supabase = createClient()
  const confirm = useConfirm()

  const loadData = async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Varredura de vencidos antes de carregar
      try { await fetch('/api/clients/update-overdue', { method: 'POST' }) } catch (e) { /* silencia */ }

      // Serviços
      const { data: servicesData } = await supabase.from('services').select('*').order('name')
      if (servicesData) setServices(servicesData)

      // Métricas Avançadas
      const { data: metricsData } = await supabase.rpc('get_clients_management_metrics')
      if (metricsData) setMetrics(metricsData as ClientsManagementMetrics)

      // Clientes Enriquecidos via VIEW
      const { data: clientsData, error } = await supabase
        .from('vw_enriched_clients')
        .select('*')
        .order('name')
      if (error) throw error
      setClients(clientsData || [])

      // Regras
      const { data: ruleData } = await supabase
        .from('automations').select('id, message_template')
        .eq('alert_type', 'quick_message').eq('is_active', true).maybeSingle()
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

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (selectedClients.length === 0) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedClients([]) }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [selectedClients.length])

  // --- Filtros e Lógica de Busca ---
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diffDays = useCallback((s: string | null) => {
    if (!s) return null
    return Math.round((new Date(s + "T00:00:00").getTime() - today.getTime()) / 86400000)
  }, [today.getTime()])
  const isNew = (c: EnrichedClient) => {
    if (!c.created_at) return false
    return (today.getTime() - new Date(c.created_at).getTime()) / 86400000 <= 30
  }

  const filteredClients = clients.filter((c) => {
    const q = searchTerm.toLowerCase()
    const matchesSearch = c.name.toLowerCase().includes(q) 
      || (c.phone && c.phone.includes(searchTerm))
      || (c.id.includes(q))
      || (c.observation && c.observation.toLowerCase().includes(q))
      || (c.client_services && c.client_services.some((cs:any) => cs.services?.name.toLowerCase().includes(q)))

    let matchesStatus = true
    if (filterStatus !== 'all') {
      matchesStatus = c.status === filterStatus
    }
    
    const matchesService = filterService === 'all' || (c.client_services && c.client_services.some((cs: any) => cs.service_id === filterService))
    
    let matchesDate = true
    if (filterDateFrom || filterDateTo) {
      if (!c.due_date) matchesDate = false
      else { 
        if (filterDateFrom && c.due_date < filterDateFrom) matchesDate = false
        if (filterDateTo && c.due_date > filterDateTo) matchesDate = false 
      }
    }

    let matchesQuick = true
    const d = diffDays(c.due_date)
    if (quickFilter === 'active') matchesQuick = c.status === 'active'
    else if (quickFilter === 'overdue') matchesQuick = c.status === 'vencido'
    else if (quickFilter === 'suspended') matchesQuick = c.status === 'suspended'
    else if (quickFilter === 'canceled') matchesQuick = c.status === 'canceled' || c.status === 'inactive'
    else if (quickFilter === 'today') matchesQuick = d === 0
    else if (quickFilter === '7days') matchesQuick = d !== null && d > 0 && d <= 7
    else if (quickFilter === 'new') matchesQuick = isNew(c)
    else if (quickFilter === 'no_whatsapp') matchesQuick = !c.phone || c.phone.trim() === ''
    else if (quickFilter === 'no_service') matchesQuick = !c.client_services || c.client_services.length === 0

    return matchesSearch && matchesStatus && matchesService && matchesDate && matchesQuick
  })

  const sortedClients = [...filteredClients].sort((a, b) => {
    // Ordem natural: Vencem em breve primeiro, depois vencidos
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    const dA = diffDays(a.due_date)!, dB = diffDays(b.due_date)!
    return dA - dB
  })

  const totalPages = Math.ceil(sortedClients.length / ITEMS_PER_PAGE) || 1
  const paginatedClients = sortedClients.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
  useEffect(() => { setCurrentPage(1) }, [searchTerm, filterStatus, filterService, filterDateFrom, filterDateTo, quickFilter])

  const toggleSelectAll = (checked: boolean) => setSelectedClients(checked ? filteredClients.map((c) => c.id) : [])
  const toggleSelectClient = (id: string, checked: boolean) => setSelectedClients((prev) => (checked ? [...prev, id] : prev.filter((cid) => cid !== id)))

  const exportCSV = (list: any[]) => {
    if (list.length === 0) return
    const headers = ["Nome", "Telefone", "Vencimento", "Cadastro", "Valor_Plano", "Status", "Renovacoes", "Tempo_Cliente_Dias"]
    const rows = list.map((c) => [
      `"${c.name}"`, `"${c.phone || ''}"`,
      `"${c.due_date ? new Date(c.due_date + "T00:00:00").toLocaleDateString('pt-BR') : ''}"`,
      `"${c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : ''}"`,
      c.plan_value, `"${c.status}"`, c.renewal_count || 0, c.days_as_client || 0
    ].join(","))
    const csv = "data:text/csv;charset=utf-8,﻿" + [headers.join(","), ...rows].join("\n")
    const link = document.createElement("a")
    link.setAttribute("href", encodeURI(csv))
    link.setAttribute("download", `gestao_clientes.csv`)
    document.body.appendChild(link); link.click(); document.body.removeChild(link)
  }

  // --- Ações ---
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
    if (chargeRules.length === 0) { toast.error("Nenhuma regra de automação ativa."); return }
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
      loadData() // Recarrega para atualizar a última cobrança enviada
    } catch (e: any) {
      toast.error(`Falha ao cobrar ${client.name}: ${e.message}`)
    } finally {
      setChargingIds((prev) => { const n = new Set(prev); n.delete(client.id); return n })
    }
  }

  const handleBulkMessage = async () => {
    const targets = clients.filter((c) => selectedClients.includes(c.id) && c.phone)
    if (targets.length === 0) { toast.info("Nenhum selecionado com WhatsApp."); return }
    if (!quickMessage) { toast.error("Configure uma Mensagem Rápida nas Automações."); return }
    const ok = await confirm({
      title: `Enviar mensagem para ${targets.length} cliente(s)?`,
      description: "Eles receberão a sua Mensagem Rápida no WhatsApp.",
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
    loadData()
  }

  const fetchClientServices = async (clientId: string) => {
    const { data } = await supabase.from('client_services').select('*, services(*)').eq('client_id', clientId)
    return data || []
  }

  const openEdit = async (client: EnrichedClient) => {
    const services = await fetchClientServices(client.id)
    setEditingClient({ ...client, client_services: services })
    setIsDialogOpen(true)
  }

  const openRenew = async (client: EnrichedClient) => {
    const services = await fetchClientServices(client.id)
    setRenewingClient({ ...client, client_services: services })
    setIsRenewDialogOpen(true)
  }

  const openPromo = async (client: EnrichedClient) => {
    const services = await fetchClientServices(client.id)
    setPromoClient({ ...client, client_services: services })
    setIsPromoDialogOpen(true)
  }

  const openProfile = async (client: EnrichedClient) => {
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
      suspended: "bg-warning-bg text-warning-fg", canceled: "bg-secondary text-muted-foreground"
    }
    const label: Record<string, string> = { active: "Ativo", pending: "Pendente", vencido: "Vencido", inactive: "Cancelado", suspended: "Suspenso", canceled: "Cancelado" }
    return <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap", map[status] || "bg-secondary")}>{label[status] || status}</span>
  }

  const commStatusBadge = (status: string | null) => {
    if (!status) return <span className="text-[10px] text-muted-foreground">Sem envios</span>
    if (status === 'sent') return <span className="text-[10px] text-success-fg font-medium">✓ Enviada</span>
    if (status === 'failed') return <span className="text-[10px] text-danger font-medium">✗ Falhou</span>
    return <span className="text-[10px] text-warning-fg font-medium">Pendente</span>
  }

  const prazoLabel = (d: number | null) => d === null ? null : d === -1 ? "ontem" : d < 0 ? `há ${Math.abs(d)} dias` : d === 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} d`
  const prazoColor = (d: number | null) => d === null ? "text-muted-foreground" : d < 0 ? "text-danger font-medium" : d === 0 ? "text-warning-fg font-medium" : "text-muted-foreground"

  const hasAdvanced = filterStatus !== 'all' || filterService !== 'all' || filterDateFrom || filterDateTo

  return (
    <div className="space-y-6 pb-10">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-[19px] font-semibold tracking-[-0.02em]">Gestão de Clientes</h1>
          <span className="num rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">{clients.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV(sortedClients)} className="h-8 gap-1.5 text-xs">
            <Download className="size-3.5" /> Exportar
          </Button>
          <Button size="sm" onClick={() => {
            if (services.length === 0) { toast.warning("Cadastre um Serviço primeiro."); return }
            setEditingClient(null); setIsDialogOpen(true)
          }} className="h-8 gap-1.5 text-xs">
            <Plus className="size-3.5" /> Adicionar cliente
          </Button>
        </div>
      </div>

      {/* Seção 1: KPIs Acionáveis */}
      {metrics && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <ClickableKPI icon={Users} label="Total" value={metrics.total_clients} colorClass="text-foreground" onClick={() => setQuickFilter("all")} active={quickFilter === "all"} />
          <ClickableKPI icon={UserCheck} label="Ativos" value={metrics.active_clients} colorClass="text-money" onClick={() => setQuickFilter("active")} active={quickFilter === "active"} />
          <ClickableKPI icon={AlertCircle} label="Vencidos" value={metrics.overdue_clients} colorClass="text-danger" onClick={() => setQuickFilter("overdue")} active={quickFilter === "overdue"} />
          <ClickableKPI icon={CalendarDays} label="Vencem Hoje" value={metrics.due_today_clients} colorClass="text-warning" onClick={() => setQuickFilter("today")} active={quickFilter === "today"} />
          <ClickableKPI icon={PhoneOff} label="Sem WhatsApp" value={metrics.no_whatsapp_clients} colorClass="text-muted-foreground" onClick={() => setQuickFilter("no_whatsapp")} active={quickFilter === "no_whatsapp"} />
          <ClickableKPI icon={ServerOff} label="Sem Serviço" value={metrics.no_service_clients} colorClass="text-muted-foreground" onClick={() => setQuickFilter("no_service")} active={quickFilter === "no_service"} />
        </div>
      )}

      {/* Seção 2: Gráficos da Carteira */}
      {metrics && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
            <BaseGrowthChart data={metrics.chart_base_growth} />
          </div>
          <div className="grid grid-rows-2 gap-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <ClientsByStatusChart data={metrics.chart_clients_by_status} />
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <ClientsByPlanChart data={metrics.chart_clients_by_plan} />
            </div>
          </div>
        </div>
      )}

      {/* Tabela de Gestão */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Carteira de Clientes</h2>
        
        {/* Busca + segmentados + filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por nome, telefone, cpf, obs..." className="h-8 border-input bg-card pl-8 text-xs" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex items-center gap-0.5 overflow-x-auto rounded-md bg-secondary p-0.5">
            {[
              { key: "all", label: "Todos" }, { key: "new", label: "Novos do Mês" }, { key: "7days", label: "Vencem em 7d" }, 
              { key: "suspended", label: "Suspensos" }, { key: "canceled", label: "Cancelados" }
            ].map((s) => (
              <button key={s.key} onClick={() => setQuickFilter(s.key as QuickFilter)}
                className={cn("flex shrink-0 items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-xs transition-colors",
                  quickFilter === s.key ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,.06)]" : "text-secondary-foreground hover:text-foreground")}>
                {s.label}
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
                <div className="space-y-1"><h4 className="text-sm font-semibold">Filtros avançados</h4></div>
                <div className="space-y-2">
                  <Label className="text-xs">Status</Label>
                  <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? "all")}>
                    <SelectTrigger className="h-8 w-full text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos status</SelectItem>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="vencido">Vencido</SelectItem>
                      <SelectItem value="suspended">Suspenso</SelectItem>
                      <SelectItem value="canceled">Cancelado</SelectItem>
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
                {hasAdvanced && (
                  <Button variant="ghost" className="h-8 w-full text-xs text-danger hover:bg-danger-bg hover:text-danger"
                    onClick={() => { setFilterStatus('all'); setFilterService('all'); setFilterDateFrom(''); setFilterDateTo('') }}>
                    Limpar filtros
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Barra de seleção em massa */}
        {selectedClients.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 rounded-md border border-interactive/30 bg-interactive/10 px-3 py-2 text-xs">
            <span className="font-semibold text-interactive-fg">{selectedClients.length} selecionado{selectedClients.length > 1 && "s"}</span>
            <button onClick={handleBulkMessage} className="flex items-center gap-1 font-medium text-interactive hover:underline"><MessageCircle className="size-3.5"/> WhatsApp</button>
            <PixRapidoModal>
              <button className="flex items-center gap-1 font-medium text-interactive hover:underline"><Zap className="size-3.5"/> Gerar PIX</button>
            </PixRapidoModal>
            <button onClick={() => exportCSV(clients.filter((c) => selectedClients.includes(c.id)))} className="flex items-center gap-1 font-medium text-interactive hover:underline"><Download className="size-3.5"/> Exportar</button>
            <button onClick={() => setIsBulkDeleteDialogOpen(true)} className="font-medium text-danger hover:underline ml-auto">Excluir</button>
            <span className="text-muted-foreground ml-2">esc para limpar</span>
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
              <p className="text-xs text-muted-foreground">Adicione seu primeiro cliente para começar a gerenciar.</p>
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
                    <TableHead className="microlabel text-[9px]">Serviço</TableHead>
                    <TableHead className="microlabel text-[9px]">Status</TableHead>
                    <TableHead className="microlabel text-[9px]">Vencimento</TableHead>
                    <TableHead className="microlabel text-[9px]">Renovações</TableHead>
                    <TableHead className="microlabel text-[9px]">Comunicação</TableHead>
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
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            {client.client_services?.slice(0,1).map((cs: any) => (
                              <span key={cs.service_id} className="text-[11px] text-foreground font-medium">{cs.services?.name}</span>
                            ))}
                            {(!client.client_services || client.client_services.length === 0) && <span className="text-[10px] text-muted-foreground">Nenhum</span>}
                            <span className="text-[10px] text-muted-foreground">{client.days_as_client} dias na base</span>
                          </div>
                        </TableCell>
                        <TableCell>{statusBadge(client.status)}</TableCell>
                        <TableCell>
                          {client.due_date ? (
                            <>
                              <p className="num text-xs text-foreground">{new Date(client.due_date + "T00:00:00").toLocaleDateString('pt-BR')}</p>
                              <p className={cn("text-[10px]", prazoColor(d))}>{prazoLabel(d)}</p>
                            </>
                          ) : <p className="text-xs text-muted-foreground">Sem venc.</p>}
                        </TableCell>
                        <TableCell>
                          <p className="num text-xs text-foreground font-medium">{client.renewal_count || 0}</p>
                          <p className="text-[9px] text-muted-foreground max-w-[80px] truncate">
                            {client.last_payment_date ? `Últ. ${new Date(client.last_payment_date).toLocaleDateString('pt-BR')}` : 'Sem pagamentos'}
                          </p>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            {commStatusBadge(client.last_communication_status)}
                            <span className="text-[9px] text-muted-foreground max-w-[90px] truncate" title={client.last_charge_sent_date ? new Date(client.last_charge_sent_date).toLocaleString('pt-BR') : ''}>
                              {client.last_charge_sent_date ? new Date(client.last_charge_sent_date).toLocaleDateString('pt-BR') : ''}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="pr-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button size="sm" onClick={() => handleCobrar(client)} disabled={chargingIds.has(client.id)} className="h-7 rounded-md px-2.5 text-xs">
                              {chargingIds.has(client.id) ? <Loader2 className="size-3 animate-spin" /> : "Cobrar"}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => { setRenewingClient(client); setIsRenewDialogOpen(true) }}>Renovar</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setPromoClient(client); setIsPromoDialogOpen(true) }}>Ativar Promoção</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setEditingClient(client); setIsDialogOpen(true) }}>Editar / Trocar Serviço</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleWhatsApp(client)}>Conversar no WhatsApp</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openProfile(client)}>Ficha do Cliente</DropdownMenuItem>
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
      </div>

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
            <SheetDescription className="text-xs">Histórico completo de relacionamento e interações.</SheetDescription>
          </SheetHeader>
          {profileClient && (
            <div className="mt-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{profileClient.name}</h3>
                <p className="num text-xs text-muted-foreground">{profileClient.phone ? phoneMask(profileClient.phone) : 'Sem telefone'}</p>
                <div className="mt-2 flex gap-2">
                  {statusBadge(profileClient.status)}
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-secondary text-secondary-foreground">{profileClient.days_as_client} dias na base</span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-muted p-3">
                  <p className="microlabel text-[9px]">LTV Acumulado</p>
                  <p className="num mt-1 text-[16px] font-semibold text-money">{formatCurrency(profilePayments.reduce((acc, p) => acc + Number(p.amount_paid || 0), 0))}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted p-3">
                  <p className="microlabel text-[9px]">Nº Renovações</p>
                  <p className="num mt-1 text-[16px] font-semibold text-foreground">{profilePayments.length}</p>
                </div>
              </div>

              <div>
                <p className="microlabel mb-2">Histórico Financeiro</p>
                {isProfileLoading ? (
                  <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}</div>
                ) : profilePayments.length === 0 ? (
                  <p className="rounded-md border border-dashed border-input px-3 py-6 text-center text-xs text-muted-foreground">Nenhum pagamento registrado.</p>
                ) : (
                  <div className="divide-y divide-border rounded-md border border-border max-h-[300px] overflow-y-auto">
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

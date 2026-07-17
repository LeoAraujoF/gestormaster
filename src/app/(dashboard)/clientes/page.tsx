"use client"

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Plus, Download, Search, Filter, MoreHorizontal, MessageCircle, Loader2, Users, UserCheck, AlertCircle, PhoneOff, CalendarDays, ServerOff, Zap, ArrowRight, ShieldCheck, UserMinus, TrendingUp, Lightbulb, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency, phoneMask, cn } from "@/lib/utils"
import type { Service, ClientService, ClientsManagementMetrics, EnrichedClient } from "@/types/database"
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
import { ClickableKPI, ClientGrowthChart, ClientsByStatusChart, ClientsByPlanChart } from "./components/client-widgets"
import { PixRapidoModal } from "@/components/pix-rapido-modal"
import { usePlan } from '@/components/providers/plan-provider'
import { MetricGrid, PageSection, PageShell, ResponsiveDataView } from '@/components/page-layout'

type QuickFilter = "all" | "active" | "overdue" | "today" | "7days" | "new" | "no_whatsapp" | "no_service" | "suspended" | "canceled"

type PortfolioSignalTone = "primary" | "growth" | "healthy" | "loss"

const signalToneClasses: Record<PortfolioSignalTone, { icon: string; value: string }> = {
  primary: { icon: "bg-secondary text-secondary-foreground", value: "text-foreground" },
  growth: { icon: "bg-interactive-bg text-interactive", value: "text-interactive" },
  healthy: { icon: "bg-interactive-bg text-interactive", value: "text-foreground" },
  loss: { icon: "bg-danger-bg text-danger", value: "text-danger" },
}

function PortfolioSignal({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  onClick,
  actionLabel,
}: {
  icon: LucideIcon
  label: string
  value: string
  hint: string
  tone: PortfolioSignalTone
  onClick?: () => void
  actionLabel?: string
}) {
  const content: ReactNode = (
    <>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", signalToneClasses[tone].icon)}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="microlabel block text-[9px]">{label}</span>
        <span className={cn("num mt-1 block text-lg font-semibold tracking-tight", signalToneClasses[tone].value)}>{value}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>
      </span>
      {onClick ? <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" /> : null}
    </>
  )

  const className = "group flex min-h-[104px] w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"

  return onClick ? (
    <button type="button" onClick={onClick} aria-label={actionLabel} className={className}>{content}</button>
  ) : (
    <div className={className}>{content}</div>
  )
}

export default function ClientesPage() {
  const searchParams = useSearchParams()
  const requestedSearch = searchParams.get("q")?.trim() || ""
  const planContext = usePlan()
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
  const portfolioSectionRef = useRef<HTMLDivElement>(null)

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
    if (!requestedSearch || isLoading) return
    const frame = window.requestAnimationFrame(() => {
      setSearchTerm(requestedSearch)
      setQuickFilter("all")
      setCurrentPage(1)
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      portfolioSectionRef.current?.scrollIntoView({ behavior, block: "start" })
      portfolioSectionRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [requestedSearch, isLoading])

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
    const createdAt = new Date(c.created_at)
    return createdAt.getFullYear() === today.getFullYear() && createdAt.getMonth() === today.getMonth()
  }

  const filteredClients = clients.filter((c) => {
    const q = searchTerm.toLowerCase()

    // Helper to sanitize phone for search (only digits)
    const cleanPhone = (p: string) => p.replace(/\D/g, '')
    const qPhone = cleanPhone(searchTerm)
    // Se a busca tiver 55 no começo, tentamos buscar também sem o 55 para ser mais flexível
    const qPhoneLenient = qPhone.startsWith('55') ? qPhone.substring(2) : qPhone
    const cPhone = c.phone ? cleanPhone(c.phone) : ''

    const matchesSearch = c.name.toLowerCase().includes(q)
      || (qPhoneLenient.length > 0 && cPhone.includes(qPhoneLenient))
      || (c.id.includes(q))
      || (c.observation && c.observation.toLowerCase().includes(q))
      || (c.client_services && c.client_services.some((cs:any) =>
            cs.services?.name.toLowerCase().includes(q) ||
            (cs.username && cs.username.toLowerCase().includes(q)) ||
            (cs.password && cs.password.toLowerCase().includes(q))
         ))

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
    const recentContacts: Array<{ client: any; lastContactAt: string | null }> = []
    for (const client of targets) {
      try {
        const res = await fetch("/api/evolution/send-instant", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: client.id, ruleId: quickMessage.id }),
        })
        const data = await res.json()
        if (res.status === 409 && data.requires_confirmation) {
          recentContacts.push({ client, lastContactAt: data.last_contact_at })
          continue
        }
        if (!res.ok) throw new Error()
        sent++
      } catch { failed++ }
    }
    if (recentContacts.length > 0) {
      const latest = recentContacts.map((item) => item.lastContactAt).filter(Boolean).sort().at(-1)
      const override = await confirm({
        title: `${recentContacts.length} cliente(s) contatado(s) recentemente`,
        description: `O contato mais recente foi ${latest ? new Date(latest).toLocaleString('pt-BR') : 'nas últimas 24 horas'}. Deseja enviar mesmo assim?`,
      })
      if (override) {
        for (const item of recentContacts) {
          try {
            const res = await fetch("/api/evolution/send-instant", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ clientId: item.client.id, ruleId: quickMessage.id, confirmRecentContact: true }),
            })
            if (!res.ok) throw new Error()
            sent++
          } catch { failed++ }
        }
      }
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
    setIsProfileLoading(true)
    try {
      const services = await fetchClientServices(client.id)
      setProfileClient({ ...client, client_services: services })
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

  const getClientPrimaryService = (client: EnrichedClient) => {
    const relation = client.client_services?.[0] as (ClientService & { services?: Service }) | undefined
    return relation?.service?.name || relation?.services?.name || "Sem serviço"
  }

  const prazoLabel = (d: number | null) => d === null ? null : d === -1 ? "ontem" : d < 0 ? `há ${Math.abs(d)} dias` : d === 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} d`
  const prazoColor = (d: number | null) => d === null ? "text-muted-foreground" : d < 0 ? "text-danger font-medium" : d === 0 ? "text-warning-fg font-medium" : "text-muted-foreground"

  const hasAdvanced = filterStatus !== 'all' || filterService !== 'all' || filterDateFrom || filterDateTo
  const activePortfolio = clients.filter((client) => client.status === "active")
  const overduePortfolio = clients.filter((client) => client.status === "vencido")
  const dueTodayPortfolio = clients.filter((client) => diffDays(client.due_date) === 0)
  const dueSoonPortfolio = clients.filter((client) => {
    const days = diffDays(client.due_date)
    return client.status === "active" && days !== null && days > 0 && days <= 7
  })
  const noWhatsAppPortfolio = clients.filter((client) => !client.phone?.trim())
  const noServicePortfolio = clients.filter((client) => !client.client_services?.length)
  const suspendedPortfolio = clients.filter((client) => client.status === "suspended")
  const canceledPortfolio = clients.filter((client) => client.status === "canceled" || client.status === "inactive")
  const newPortfolio = clients.filter(isNew)
  const activeRate = clients.length > 0 ? (activePortfolio.length / clients.length) * 100 : 0
  const lossRate = clients.length > 0 ? (canceledPortfolio.length / clients.length) * 100 : 0
  const riskPortfolio = [...overduePortfolio, ...suspendedPortfolio]
  const qualityGaps = noWhatsAppPortfolio.length + noServicePortfolio.length
  let cumulativeNewClients = 0
  const clientGrowthSeries = Array.from({ length: 6 }, (_, index) => {
    const monthStart = new Date(today.getFullYear(), today.getMonth() - (5 - index), 1)
    const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
    const newClients = clients.filter((client) => {
      const createdAt = new Date(client.created_at)
      return createdAt >= monthStart && createdAt < nextMonth
    }).length
    cumulativeNewClients += newClients
    return {
      month: monthStart.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      new_clients: newClients,
      cumulative: cumulativeNewClients,
    }
  })
  const currentMonthNewClients = clientGrowthSeries.at(-1)?.new_clients || 0
  const previousMonthNewClients = clientGrowthSeries.at(-2)?.new_clients || 0
  const monthlyGrowthDelta = currentMonthNewClients - previousMonthNewClients
  const monthlyGrowthRate = previousMonthNewClients > 0 ? (monthlyGrowthDelta / previousMonthNewClients) * 100 : null
  const growthOrientation = monthlyGrowthDelta > 0
    ? `A aquisição acelerou: ${monthlyGrowthDelta} cliente${monthlyGrowthDelta === 1 ? "" : "s"} a mais que no mês anterior.`
    : monthlyGrowthDelta < 0
      ? `A aquisição desacelerou: ${Math.abs(monthlyGrowthDelta)} cliente${Math.abs(monthlyGrowthDelta) === 1 ? "" : "s"} a menos que no mês anterior.`
      : currentMonthNewClients > 0
        ? "A aquisição está estável em relação ao mês anterior."
        : "Ainda não houve aquisição de clientes neste mês."

  const revealPortfolio = (filter: QuickFilter) => {
    setQuickFilter(filter)
    requestAnimationFrame(() => {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      portfolioSectionRef.current?.scrollIntoView({ behavior, block: "start" })
      portfolioSectionRef.current?.focus({ preventScroll: true })
    })
  }

  const clearAllFilters = () => {
    setSearchTerm("")
    setQuickFilter("all")
    setFilterStatus("all")
    setFilterService("all")
    setFilterDateFrom("")
    setFilterDateTo("")
  }

  const openCreateClient = () => {
    if (services.length === 0) { toast.warning("Cadastre um Serviço primeiro."); return }
    if (planContext.limits.clients !== null && clients.length >= planContext.limits.clients) {
      toast.error(`Limite de ${planContext.limits.clients} clientes atingido no plano ${planContext.plan}.`)
      return
    }
    setEditingClient(null)
    setIsDialogOpen(true)
  }

  const hasAnyFilter = quickFilter !== "all" || hasAdvanced || searchTerm.trim().length > 0

  return (
    <PageShell>
      <section aria-labelledby="clients-page-title" className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="microlabel">Carteira operacional</p>
            <div className="mt-1 flex flex-wrap items-center gap-2.5">
              <h1 id="clients-page-title" className="text-2xl font-semibold tracking-[-0.035em] text-foreground sm:text-3xl">Clientes</h1>
              <span className="num rounded-md bg-interactive-bg px-2 py-0.5 text-[10px] font-semibold text-interactive">
                {clients.length}{planContext.limits.clients === null ? "" : ` / ${planContext.limits.clients}`}
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
              Crescimento, retenção, perdas e qualidade da base em uma visão focada exclusivamente nos clientes.
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
            <Button variant="outline" onClick={() => exportCSV(sortedClients)} className="min-h-10 flex-1 gap-2 sm:flex-none">
              <Download className="size-4" /> Exportar
            </Button>
            <Button onClick={openCreateClient} disabled={planContext.limits.clients !== null && clients.length >= planContext.limits.clients} className="min-h-10 flex-1 gap-2 sm:flex-none">
              <Plus className="size-4" /> Novo cliente
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid border-t border-border sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex min-h-[104px] items-center gap-3 border-b border-border px-5 py-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0">
                <Skeleton className="size-9 rounded-xl" />
                <div className="flex-1 space-y-2"><Skeleton className="h-2.5 w-24" /><Skeleton className="h-5 w-28" /><Skeleton className="h-2.5 w-32" /></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid border-t border-border sm:grid-cols-2 xl:grid-cols-4 [&>*]:border-b [&>*]:border-border sm:[&>*:nth-child(odd)]:border-r xl:[&>*]:border-b-0 xl:[&>*]:border-r xl:[&>*:last-child]:border-r-0">
            <PortfolioSignal icon={Users} label="Total de clientes" value={String(clients.length)} hint={`${activePortfolio.length} ativos na base atual`} tone="primary" onClick={clients.length > 0 ? () => revealPortfolio("all") : undefined} actionLabel="Ver todos os clientes" />
            <PortfolioSignal icon={TrendingUp} label="Novos neste mês" value={String(currentMonthNewClients)} hint={previousMonthNewClients > 0 && monthlyGrowthRate !== null ? `${monthlyGrowthRate >= 0 ? "+" : ""}${monthlyGrowthRate.toFixed(1)}% vs. mês anterior` : `${previousMonthNewClients} no mês anterior`} tone="growth" onClick={currentMonthNewClients > 0 ? () => revealPortfolio("new") : undefined} actionLabel="Ver novos clientes deste mês" />
            <PortfolioSignal icon={ShieldCheck} label="Base ativa" value={`${activeRate.toFixed(1)}%`} hint={`${activePortfolio.length} de ${clients.length} clientes ativos`} tone="healthy" onClick={clients.length > 0 ? () => revealPortfolio("active") : undefined} actionLabel="Ver clientes ativos da base" />
            <PortfolioSignal icon={UserMinus} label="Perdas registradas" value={String(canceledPortfolio.length)} hint={`${lossRate.toFixed(1)}% da base com status cancelado`} tone="loss" onClick={canceledPortfolio.length > 0 ? () => revealPortfolio("canceled") : undefined} actionLabel="Ver clientes cancelados ou inativos" />
          </div>
        )}
      </section>

      <PageSection title="Diagnóstico da base" description="Indicadores de retenção, risco e qualidade cadastral; selecione para abrir o segmento.">
        <MetricGrid columns={6}>
          <ClickableKPI icon={UserCheck} label="Ativos" value={activePortfolio.length} hint={`${activeRate.toFixed(1)}% da base`} colorClass="text-success-fg" onClick={() => revealPortfolio("active")} active={quickFilter === "active"} />
          <ClickableKPI icon={AlertCircle} label="Vencidos" value={overduePortfolio.length} hint="em risco de perda" colorClass="text-danger" onClick={() => revealPortfolio("overdue")} active={quickFilter === "overdue"} />
          <ClickableKPI icon={UserMinus} label="Cancelados" value={canceledPortfolio.length} hint="perdas registradas" colorClass="text-danger" onClick={() => revealPortfolio("canceled")} active={quickFilter === "canceled"} />
          <ClickableKPI icon={UserCheck} label="Suspensos" value={suspendedPortfolio.length} hint="revisar retenção" colorClass="text-warning-fg" onClick={() => revealPortfolio("suspended")} active={quickFilter === "suspended"} />
          <ClickableKPI icon={PhoneOff} label="Sem WhatsApp" value={noWhatsAppPortfolio.length} hint="contato incompleto" colorClass="text-muted-foreground" onClick={() => revealPortfolio("no_whatsapp")} active={quickFilter === "no_whatsapp"} />
          <ClickableKPI icon={ServerOff} label="Sem serviço" value={noServicePortfolio.length} hint="cadastro incompleto" colorClass="text-muted-foreground" onClick={() => revealPortfolio("no_service")} active={quickFilter === "no_service"} />
        </MetricGrid>
      </PageSection>

      {/* Tabela de Gestão */}
      <div ref={portfolioSectionRef} tabIndex={-1} className="scroll-mt-20 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
      <PageSection title="Fila da carteira" description="Encontre o cliente, entenda a prioridade e execute a próxima ação.">

        {/* Busca + segmentos + filtros */}
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input aria-label="Buscar clientes" placeholder="Buscar por nome, telefone, serviço ou acesso" className="h-11 border-input bg-background pl-9 text-sm lg:h-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger className={buttonVariants({ variant: "outline", className: "relative h-11 flex-1 gap-2 lg:h-10 lg:flex-none" })}>
                  <Filter className="size-4" /> Filtros
                  {hasAdvanced && <span className="absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-card bg-interactive" />}
                </PopoverTrigger>
                <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-4" align="end">
                  <div className="space-y-4">
                    <div><h3 className="text-sm font-semibold">Filtros avançados</h3><p className="mt-1 text-xs text-muted-foreground">Combine status, serviço e intervalo de vencimento.</p></div>
                    <div className="space-y-2">
                      <Label className="text-xs">Status</Label>
                      <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? "all")}>
                        <SelectTrigger className="h-9 w-full text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os status</SelectItem>
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
                        <SelectTrigger className="h-9 w-full text-sm">
                          <SelectValue>{filterService === 'all' ? 'Todos os serviços' : services.find((s) => s.id === filterService)?.name}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os serviços</SelectItem>
                          {services.map((service) => <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2"><Label htmlFor="client-due-from" className="text-xs">Vence a partir de</Label><Input id="client-due-from" type="date" className="h-9 text-xs" value={filterDateFrom} onChange={(event) => setFilterDateFrom(event.target.value)} /></div>
                      <div className="space-y-2"><Label htmlFor="client-due-to" className="text-xs">Vence até</Label><Input id="client-due-to" type="date" className="h-9 text-xs" value={filterDateTo} onChange={(event) => setFilterDateTo(event.target.value)} /></div>
                    </div>
                    {hasAdvanced ? <Button variant="ghost" className="h-9 w-full text-xs text-danger hover:bg-danger-bg hover:text-danger" onClick={() => { setFilterStatus('all'); setFilterService('all'); setFilterDateFrom(''); setFilterDateTo('') }}>Limpar filtros avançados</Button> : null}
                  </div>
                </PopoverContent>
              </Popover>
              {hasAnyFilter ? <Button variant="ghost" onClick={clearAllFilters} className="h-11 flex-1 text-xs text-muted-foreground lg:h-10 lg:flex-none">Limpar tudo</Button> : null}
            </div>
          </div>

          <div className="mt-3 flex max-w-full items-center gap-1 overflow-x-auto pb-1" role="group" aria-label="Segmentos rápidos da carteira">
            {[
              { key: "all", label: "Todos", count: clients.length },
              { key: "overdue", label: "Vencidos", count: overduePortfolio.length },
              { key: "today", label: "Hoje", count: dueTodayPortfolio.length },
              { key: "7days", label: "Próximos 7 dias", count: dueSoonPortfolio.length },
              { key: "new", label: "Novos", count: newPortfolio.length },
              { key: "suspended", label: "Suspensos", count: suspendedPortfolio.length },
              { key: "canceled", label: "Cancelados", count: canceledPortfolio.length },
            ].map((segment) => (
              <button key={segment.key} type="button" onClick={() => setQuickFilter(segment.key as QuickFilter)} aria-pressed={quickFilter === segment.key}
                className={cn("flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  quickFilter === segment.key ? "border-foreground bg-foreground font-semibold text-background" : "border-transparent bg-secondary text-secondary-foreground hover:border-border hover:bg-muted")}>
                {segment.label}<span className={cn("num text-[10px]", quickFilter === segment.key ? "text-background/70" : "text-muted-foreground")}>{segment.count}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground" aria-live="polite">
            Exibindo <strong className="font-semibold text-foreground">{sortedClients.length}</strong> de {clients.length} clientes, ordenados pelo vencimento mais urgente.
          </p>
        </div>

        {/* Barra de seleção em massa */}
        {selectedClients.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-interactive/30 bg-interactive-bg px-3 py-3 text-xs" role="status">
            <span className="mr-1 font-semibold text-interactive-fg">{selectedClients.length} selecionado{selectedClients.length > 1 && "s"}</span>
            <button onClick={handleBulkMessage} className="flex min-h-9 items-center gap-1.5 rounded-md px-2.5 font-medium text-interactive transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><MessageCircle className="size-3.5"/> WhatsApp</button>
            <PixRapidoModal>
              <button className="flex min-h-9 items-center gap-1.5 rounded-md px-2.5 font-medium text-interactive transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Zap className="size-3.5"/> Gerar PIX</button>
            </PixRapidoModal>
            <button onClick={() => exportCSV(clients.filter((client) => selectedClients.includes(client.id)))} className="flex min-h-9 items-center gap-1.5 rounded-md px-2.5 font-medium text-interactive transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Download className="size-3.5"/> Exportar</button>
            <button onClick={() => setIsBulkDeleteDialogOpen(true)} className="ml-auto min-h-9 rounded-md px-2.5 font-medium text-danger transition-colors hover:bg-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Excluir</button>
            <button type="button" onClick={() => setSelectedClients([])} className="min-h-9 rounded-md px-2.5 text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Limpar seleção</button>
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
              <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground"><Users className="size-5" /></span>
              <p className="mt-2 text-sm font-semibold text-foreground">Sua carteira ainda está vazia</p>
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">Adicione o primeiro cliente para acompanhar vencimentos, receita e relacionamento.</p>
              <Button className="mt-3 gap-2" onClick={openCreateClient} disabled={planContext.limits.clients !== null && clients.length >= planContext.limits.clients}><Plus className="size-4" />Adicionar cliente</Button>
            </div>
          ) : sortedClients.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-4 py-16 text-center">
              <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground"><Search className="size-5" /></span>
              <p className="mt-2 text-sm font-semibold text-foreground">Nenhum cliente encontrado</p>
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">Revise a busca ou remova os filtros para visualizar novamente a carteira.</p>
              <Button variant="outline" className="mt-3" onClick={clearAllFilters}>Limpar busca e filtros</Button>
            </div>
          ) : (
            <>
              <ResponsiveDataView
                desktopFrom="lg"
                mobile={
                  <div className="divide-y divide-border">
                    {paginatedClients.map((client) => {
                      const d = diffDays(client.due_date)
                      const service = getClientPrimaryService(client)
                      return (
                        <article key={client.id} className={cn("space-y-4 p-4 transition-colors", d !== null && d < 0 && "bg-danger-bg/35", d === 0 && "bg-warning-bg/35", selectedClients.includes(client.id) && "bg-interactive-bg")}>
                          {d !== null && d <= 7 ? (
                            <div className="flex items-center justify-between gap-3">
                              <span className={cn("microlabel rounded-md px-2 py-1 text-[9px]", d < 0 ? "bg-danger-bg text-danger" : d === 0 ? "bg-warning-bg text-warning-fg" : "bg-secondary text-secondary-foreground")}>
                                {d < 0 ? "Ação necessária" : d === 0 ? "Vence hoje" : "Próxima renovação"}
                              </span>
                              <span className={cn("text-[11px]", prazoColor(d))}>{prazoLabel(d)}</span>
                            </div>
                          ) : null}
                          <div className="flex items-start gap-3">
                            <Checkbox checked={selectedClients.includes(client.id)} onCheckedChange={(checked) => toggleSelectClient(client.id, !!checked)} aria-label={`Selecionar ${client.name}`} className="mt-1" />
                            <button type="button" onClick={() => openProfile(client)} aria-label={`Abrir ficha de ${client.name}`} className="group flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">{getInitials(client.name)}</div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="truncate text-sm font-semibold text-foreground">{client.name}</h3>
                                  {statusBadge(client.status)}
                                </div>
                                <p className="mt-1 truncate text-xs text-muted-foreground">{client.phone ? phoneMask(client.phone) : "Sem WhatsApp"}</p>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">{service}{client.screens ? ` · ${client.screens} tela${client.screens > 1 ? "s" : ""}` : ""}</p>
                              </div>
                              <ArrowRight className="mt-2 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-3 text-xs">
                            <div>
                              <p className="microlabel text-[9px]">Vencimento</p>
                              <p className="num mt-1 font-medium text-foreground">{client.due_date ? new Date(`${client.due_date}T00:00:00`).toLocaleDateString("pt-BR") : "Sem vencimento"}</p>
                              {client.due_date ? <p className={cn("mt-0.5 text-[10px]", prazoColor(d))}>{prazoLabel(d)}</p> : null}
                            </div>
                            <div>
                              <p className="microlabel text-[9px]">Relacionamento</p>
                              <p className="num mt-1 font-medium text-foreground">{client.days_as_client} dias na base</p>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">{client.renewal_count || 0} renovações</p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <div><p className="microlabel mb-1 text-[8px]">Última comunicação</p>{commStatusBadge(client.last_communication_status)}</div>
                            <div className="flex items-center gap-2">
                              <Button size="sm" onClick={() => handleCobrar(client)} disabled={chargingIds.has(client.id)} className="h-9 px-4 text-xs">
                                {chargingIds.has(client.id) ? <Loader2 className="size-3 animate-spin" /> : "Cobrar"}
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger className="flex size-9 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" aria-label={`Mais ações para ${client.name}`}><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
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
                          </div>
                        </article>
                      )
                    })}
                  </div>
                }
                desktop={
              <Table>
                <TableHeader className="bg-muted/80">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[36px] pl-3">
                      <Checkbox checked={selectedClients.length > 0 && selectedClients.length === filteredClients.length} onCheckedChange={toggleSelectAll} aria-label="Selecionar todos" />
                    </TableHead>
                    <TableHead className="microlabel text-[9px]">Cliente</TableHead>
                    <TableHead className="microlabel text-[9px]">Serviço</TableHead>
                    <TableHead className="microlabel text-[9px]">Status</TableHead>
                    <TableHead className="microlabel text-[9px]">Vencimento</TableHead>
                    <TableHead className="microlabel text-[9px]">Relacionamento</TableHead>
                    <TableHead className="microlabel text-[9px]">Comunicação</TableHead>
                    <TableHead className="microlabel pr-3 text-right text-[9px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedClients.map((client) => {
                    const d = diffDays(client.due_date)
                    return (
                      <TableRow key={client.id} className={cn("transition-colors hover:bg-muted/70", d !== null && d < 0 && "bg-danger-bg/30", d === 0 && "bg-warning-bg/30", selectedClients.includes(client.id) && "bg-interactive-bg")}>
                        <TableCell className="pl-3">
                          <Checkbox checked={selectedClients.includes(client.id)} onCheckedChange={(c) => toggleSelectClient(client.id, !!c)} aria-label={`Selecionar ${client.name}`} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground">{getInitials(client.name)}</div>
                            <div className="min-w-0">
                              <button className="block truncate rounded-sm text-[13px] font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => openProfile(client)} aria-label={`Abrir ficha de ${client.name}`}>{client.name}</button>
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
                              <span key={cs.service_id} className="text-[11px] text-foreground font-medium">
                                {cs.services?.name} {client.screens ? ` · ${client.screens} tela${client.screens > 1 ? 's' : ''}` : ''}
                              </span>
                            ))}
                            {(!client.client_services || client.client_services.length === 0) && <span className="text-[10px] text-muted-foreground">Nenhum {client.screens ? ` · ${client.screens} tela${client.screens > 1 ? 's' : ''}` : ''}</span>}
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
                          <p className="num text-xs font-semibold text-foreground">{client.days_as_client} dias</p>
                          <p className="max-w-[90px] truncate text-[9px] text-muted-foreground">{client.renewal_count || 0} renovações</p>
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
                              <DropdownMenuTrigger className="flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" aria-label={`Mais ações para ${client.name}`}><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
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
                }
              />
              <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] text-muted-foreground">{sortedClients.length} cliente{sortedClients.length !== 1 && "s"} · página {currentPage} de {totalPages}</p>
                {totalPages > 1 && (
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                    <Button variant="outline" size="sm" className="h-9 px-3 text-xs" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>← Anterior</Button>
                    <Button variant="outline" size="sm" className="h-9 px-3 text-xs" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages}>Próxima →</Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </PageSection>
      </div>

      <PageSection title="Crescimento de clientes" description="Aquisição mensal real, comparação com o mês anterior e evolução acumulada nos últimos seis meses.">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-h-[390px] rounded-2xl border border-border bg-card p-4 sm:p-5">
            <ClientGrowthChart data={clientGrowthSeries} currentMonth={currentMonthNewClients} previousMonth={previousMonthNewClients} />
          </div>
          <aside className="rounded-2xl border border-border bg-card p-4 sm:p-5" aria-labelledby="client-guidance-title">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-interactive-bg text-interactive"><Lightbulb className="size-4" aria-hidden="true" /></span>
              <div><h3 id="client-guidance-title" className="text-sm font-semibold text-foreground">Leitura e orientações</h3><p className="mt-1 text-xs text-muted-foreground">Próximas decisões sugeridas pelos dados atuais.</p></div>
            </div>
            <div className="mt-5 space-y-3">
              <div className="rounded-xl border border-border bg-muted/50 p-3.5">
                <p className="microlabel text-[9px]">Aquisição mensal</p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-foreground">{growthOrientation}</p>
              </div>
              <button type="button" onClick={canceledPortfolio.length > 0 ? () => revealPortfolio("canceled") : undefined} disabled={canceledPortfolio.length === 0} className="group w-full rounded-xl border border-border bg-muted/50 p-3.5 text-left transition-colors enabled:hover:border-danger-border enabled:hover:bg-danger-bg/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default">
                <span className="flex items-center justify-between gap-3"><span className="microlabel text-[9px]">Perdas da base</span>{canceledPortfolio.length > 0 ? <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /> : null}</span>
                <span className="mt-2 block text-sm font-medium leading-relaxed text-foreground">{canceledPortfolio.length > 0 ? `${canceledPortfolio.length} cliente${canceledPortfolio.length === 1 ? " está" : "s estão"} cancelado${canceledPortfolio.length === 1 ? "" : "s"} ou inativo${canceledPortfolio.length === 1 ? "" : "s"}. Revise os motivos e oportunidades de recuperação.` : "Nenhum cliente está cancelado ou inativo na base atual."}</span>
              </button>
              <button type="button" onClick={riskPortfolio.length > 0 ? () => revealPortfolio(overduePortfolio.length > 0 ? "overdue" : "suspended") : undefined} disabled={riskPortfolio.length === 0} className="group w-full rounded-xl border border-border bg-muted/50 p-3.5 text-left transition-colors enabled:hover:border-warning-border enabled:hover:bg-warning-bg/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default">
                <span className="flex items-center justify-between gap-3"><span className="microlabel text-[9px]">Risco de perda</span>{riskPortfolio.length > 0 ? <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /> : null}</span>
                <span className="mt-2 block text-sm font-medium leading-relaxed text-foreground">{riskPortfolio.length > 0 ? `${riskPortfolio.length} cliente${riskPortfolio.length === 1 ? " exige" : "s exigem"} atenção por vencimento ou suspensão. Priorize contato e recuperação.` : "Nenhum cliente vencido ou suspenso exige recuperação agora."}</span>
              </button>
              <button type="button" onClick={qualityGaps > 0 ? () => revealPortfolio(noWhatsAppPortfolio.length > 0 ? "no_whatsapp" : "no_service") : undefined} disabled={qualityGaps === 0} className="group w-full rounded-xl border border-border bg-muted/50 p-3.5 text-left transition-colors enabled:hover:border-foreground/20 enabled:hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default">
                <span className="flex items-center justify-between gap-3"><span className="microlabel text-[9px]">Qualidade cadastral</span>{qualityGaps > 0 ? <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /> : null}</span>
                <span className="mt-2 block text-sm font-medium leading-relaxed text-foreground">{qualityGaps > 0 ? `${qualityGaps} pendência${qualityGaps === 1 ? "" : "s"} de WhatsApp ou serviço podem prejudicar o relacionamento.` : "Todos os clientes possuem WhatsApp e serviço vinculados."}</span>
              </button>
            </div>
            <p className="mt-4 border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground"><strong className="font-semibold text-foreground">Limite dos dados:</strong> aquisições possuem histórico mensal; perdas representam o status atual porque a base não informa a data do cancelamento.</p>
          </aside>
        </div>
      </PageSection>

      {metrics && (
        <PageSection title="Composição da base" description="Distribuição atual dos clientes por status e serviço contratado.">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <ClientsByStatusChart data={metrics.chart_clients_by_status} />
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <ClientsByPlanChart data={metrics.chart_clients_by_plan} />
            </div>
          </div>
        </PageSection>
      )}

      {/* Dialogs */}
      <ClientFormDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} client={editingClient} servicesList={services} onSuccess={loadData} />
      <RenewDialog open={isRenewDialogOpen} onOpenChange={setIsRenewDialogOpen} client={renewingClient} onSuccess={loadData} />
      <PromoDialog open={isPromoDialogOpen} onOpenChange={setIsPromoDialogOpen} client={promoClient} onSuccess={loadData} />
      <DeleteDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen} client={deletingClient} onSuccess={loadData} />
      <BulkDeleteDialog open={isBulkDeleteDialogOpen} onOpenChange={(open) => { setIsBulkDeleteDialogOpen(open); if (!open) setSelectedClients([]) }}
        clients={clients.filter((c) => selectedClients.includes(c.id))} onSuccess={() => { loadData(); setSelectedClients([]) }} />

      {/* Ficha 360 */}
      <Sheet open={!!profileClient} onOpenChange={(open) => !open && setProfileClient(null)}>
        <SheetContent className="w-full overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-[460px] sm:px-6">
          <SheetHeader className="mt-2 border-b border-border pb-4">
            <SheetTitle className="text-base font-semibold">Ficha 360 do cliente</SheetTitle>
            <SheetDescription className="text-xs">Situação atual, serviço, acessos e histórico financeiro.</SheetDescription>
          </SheetHeader>
          {profileClient && (
            <div className="mt-5 space-y-6">
              <div className={cn("rounded-xl border p-4", profileClient.status === "vencido" ? "border-danger-border bg-danger-bg/40" : "border-border bg-card")}>
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">{getInitials(profileClient.name)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-semibold text-foreground">{profileClient.name}</h3>
                      {statusBadge(profileClient.status)}
                    </div>
                    <p className="num mt-1 text-xs text-muted-foreground">{profileClient.phone ? phoneMask(profileClient.phone) : 'Sem telefone cadastrado'}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{profileClient.days_as_client} dias na base</p>
                  </div>
                </div>
                {profileClient.status === "vencido" ? (
                  <div className="mt-4 flex items-start gap-2 rounded-lg bg-card/80 p-3 text-xs text-danger-fg">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <p><strong className="font-semibold">Ação recomendada:</strong> revisar o vencimento e entrar em contato com o cliente.</p>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-muted/60 p-3">
                  <p className="microlabel text-[9px]">Tempo na base</p>
                  <p className="num mt-1 text-base font-semibold text-foreground">{profileClient.days_as_client} dias</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/60 p-3">
                  <p className="microlabel text-[9px]">Vencimento</p>
                  <p className="num mt-1 text-base font-semibold text-foreground">{profileClient.due_date ? new Date(`${profileClient.due_date}T00:00:00`).toLocaleDateString("pt-BR") : "Sem data"}</p>
                  {profileClient.due_date ? <p className={cn("mt-0.5 text-[10px]", prazoColor(diffDays(profileClient.due_date)))}>{prazoLabel(diffDays(profileClient.due_date))}</p> : null}
                </div>
                <div className="rounded-xl border border-border bg-muted/60 p-3">
                  <p className="microlabel text-[9px]">Serviços</p>
                  <p className="num mt-1 text-base font-semibold text-foreground">{profileClient.client_services?.length || 0}</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/60 p-3">
                  <p className="microlabel text-[9px]">Renovações</p>
                  <p className="num mt-1 text-base font-semibold text-foreground">{profilePayments.length}</p>
                </div>
              </div>

              {/* Serviços e Acessos */}
              {profileClient.client_services && profileClient.client_services.length > 0 && (
                <div className="rounded-lg border border-border bg-card p-3 space-y-3 mt-4">
                  <p className="microlabel mb-1">Serviços Contratados</p>
                  {profileClient.client_services.map((cs: any, idx: number) => (
                    <div key={idx} className="flex flex-col gap-1 text-sm border-b border-border pb-2 last:border-0 last:pb-0">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-foreground">{cs.services?.name || 'Serviço'}</span>
                        <span className="text-xs text-muted-foreground">{profileClient.screens || 1} {profileClient.screens === 1 ? 'tela' : 'telas'}</span>
                      </div>
                      <div className="mt-1 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Usuário</p>
                          <p className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-foreground inline-block mt-0.5 select-all">{cs.username || '-'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Senha</p>
                          <p className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-foreground inline-block mt-0.5 select-all">{cs.password || '-'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

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
              <div className="sticky bottom-0 grid grid-cols-2 gap-2 border-t border-border bg-background py-3">
                <Button variant="outline" onClick={() => handleWhatsApp(profileClient)} className="min-h-10 gap-2"><MessageCircle className="size-4" />WhatsApp</Button>
                <Button onClick={() => handleCobrar(profileClient)} disabled={chargingIds.has(profileClient.id)} className="min-h-10 gap-2">
                  {chargingIds.has(profileClient.id) ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}Cobrar
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </PageShell>
  )
}

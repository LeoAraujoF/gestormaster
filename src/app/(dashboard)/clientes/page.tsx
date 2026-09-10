"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Plus, Download, Search, Filter, MoreHorizontal, MessageCircle, Loader2, Users, AlertCircle, CalendarDays, Zap, ArrowRight, TrendingUp, FileText } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency, phoneMask, cn } from "@/lib/utils"
import { normalizePhoneE164, normalizeWhatsAppNumber } from "@/lib/phone"
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
import { ClientGrowthChart, ClientRegistrationRhythmChart, ClientsByStatusChart } from "./components/client-widgets"
import { PixRapidoModal } from "@/components/pix-rapido-modal"
import { usePlan } from '@/components/providers/plan-provider'
import { PageHeaderCard, PageShell, ResponsiveDataView } from '@/components/page-layout'

type QuickFilter = "all" | "active" | "overdue" | "today" | "7days" | "attention" | "no_whatsapp" | "no_service" | "suspended" | "canceled"

type RegistrationPeriod = "all" | "today" | "last7" | "month" | "custom"

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
  const [registrationPeriod, setRegistrationPeriod] = useState<RegistrationPeriod>("all")
  const [registeredFrom, setRegisteredFrom] = useState<string>("")
  const [registeredTo, setRegisteredTo] = useState<string>("")

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
  const toDateKey = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }
  const todayKey = toDateKey(today)
  const currentMonthStartKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`
  const clientCreatedKey = (client: EnrichedClient) => client.created_at ? toDateKey(new Date(client.created_at)) : ""
  const diffDays = useCallback((s: string | null) => {
    if (!s) return null
    return Math.round((new Date(s + "T00:00:00").getTime() - today.getTime()) / 86400000)
  }, [today.getTime()])
  const filteredClients = clients.filter((c) => {
    const q = searchTerm.toLowerCase()

    // Helper to sanitize phone for search (only digits)
    const cleanPhone = (p: string) => p.replace(/\D/g, '')
    const qPhone = cleanPhone(searchTerm)
    // Se a busca tiver 55 no começo, tentamos buscar também sem o 55 para ser mais flexível
    const qPhoneLenient = qPhone.startsWith('55') ? qPhone.substring(2) : qPhone
    const cPhone = c.phone_e164 || c.phone ? cleanPhone(c.phone_e164 || c.phone || '') : ''

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

    const createdKey = clientCreatedKey(c)
    let matchesRegistration = true
    if (registeredFrom || registeredTo) {
      if (!createdKey) matchesRegistration = false
      else {
        if (registeredFrom && createdKey < registeredFrom) matchesRegistration = false
        if (registeredTo && createdKey > registeredTo) matchesRegistration = false
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
    else if (quickFilter === 'attention') matchesQuick = c.status === 'vencido' || d === 0
    else if (quickFilter === 'no_whatsapp') matchesQuick = !normalizePhoneE164(c.phone_e164 || c.phone || '')
    else if (quickFilter === 'no_service') matchesQuick = !c.client_services || c.client_services.length === 0

    return matchesSearch && matchesStatus && matchesService && matchesDate && matchesRegistration && matchesQuick
  })

  const getQueueBucket = (days: number | null) => {
    if (days === null) return 3
    if (days <= -3) return 2
    if (days <= 0) return 0
    return 1
  }

  const sortedClients = [...filteredClients].sort((a, b) => {
    const dA = diffDays(a.due_date)
    const dB = diffDays(b.due_date)
    const bucketA = getQueueBucket(dA)
    const bucketB = getQueueBucket(dB)

    if (bucketA !== bucketB) return bucketA - bucketB

    // Dentro dos atrasos antigos, o mais recente continua sendo a próxima recuperação possível.
    if (bucketA === 2 && dA !== dB) return (dB ?? 0) - (dA ?? 0)
    if (bucketA !== 3 && dA !== dB) return (dA ?? 0) - (dB ?? 0)

    return a.name.localeCompare(b.name, "pt-BR")
  })

  const totalPages = Math.ceil(sortedClients.length / ITEMS_PER_PAGE) || 1
  const paginatedClients = sortedClients.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
  useEffect(() => { setCurrentPage(1) }, [searchTerm, filterStatus, filterService, filterDateFrom, filterDateTo, registeredFrom, registeredTo, quickFilter])

  const toggleSelectAll = (checked: boolean) => setSelectedClients(checked ? filteredClients.map((c) => c.id) : [])
  const toggleSelectClient = (id: string, checked: boolean) => setSelectedClients((prev) => (checked ? [...prev, id] : prev.filter((cid) => cid !== id)))

  const exportCSV = (list: EnrichedClient[], fileName = "relatorio-clientes-completo") => {
    if (list.length === 0) {
      toast.info("Não há clientes nesse período para gerar o relatório.")
      return
    }
    const headers = ["Nome", "Telefone", "Vencimento", "Cadastro", "Valor_Plano", "Status", "Renovacoes", "Tempo_Cliente_Dias"]
    const rows = list.map((c) => [
      `"${c.name.replaceAll('"', '""')}"`, `"${c.phone_e164 || c.phone || ''}"`,
      `"${c.due_date ? new Date(c.due_date + "T00:00:00").toLocaleDateString('pt-BR') : ''}"`,
      `"${c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : ''}"`,
      c.plan_value, `"${c.status}"`, c.renewal_count || 0, c.days_as_client || 0
    ].join(","))
    const blob = new Blob(["\uFEFF", [headers.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.href = url
    link.download = `${fileName}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success(`Relatório gerado com ${list.length} cliente${list.length === 1 ? "" : "s"}.`)
  }

  const downloadReport = (period: "day" | "month" | "complete") => {
    const reportClients = period === "complete"
      ? clients
      : clients.filter((client) => {
          const createdKey = clientCreatedKey(client)
          return period === "day"
            ? createdKey === todayKey
            : createdKey >= currentMonthStartKey && createdKey <= todayKey
        })
    const fileName = period === "day"
      ? `relatorio-clientes-dia-${todayKey}`
      : period === "month"
        ? `relatorio-clientes-mes-${todayKey.slice(0, 7)}`
        : `relatorio-clientes-completo-${todayKey}`
    exportCSV(reportClients, fileName)
  }

  // --- Ações ---
  const handleWhatsApp = (client: any) => {
    const phoneWithCountry = normalizeWhatsAppNumber(client.phone_e164 || client.phone)
    if (!phoneWithCountry) { toast.error("Informe um WhatsApp válido com código do país."); return }
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
    if (!normalizePhoneE164(client.phone_e164 || client.phone || "")) { toast.error(`${client.name} não possui um WhatsApp válido.`); return }
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
    if (['accepted', 'sent', 'delivered', 'read'].includes(status)) return <span className="text-[10px] text-success-fg font-medium">✓ Enviada</span>
    if (['failed', 'cancelled', 'canceled'].includes(status)) return <span className="text-[10px] text-danger font-medium">✗ Falhou</span>
    return <span className="text-[10px] text-warning-fg font-medium">Pendente</span>
  }

  const commSentDate = (date: string | null) => date ? (
    <span className="text-[9px] text-muted-foreground" title={new Date(date).toLocaleString('pt-BR')}>
      {new Date(date).toLocaleDateString('pt-BR')}
    </span>
  ) : null

  const getClientPrimaryService = (client: EnrichedClient) => {
    const relation = client.client_services?.[0] as (ClientService & { services?: Service }) | undefined
    return relation?.service?.name || relation?.services?.name || "Sem serviço"
  }

  const prazoLabel = (d: number | null) => d === null ? null : d === -1 ? "ontem" : d < 0 ? `há ${Math.abs(d)} dias` : d === 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} d`
  const prazoColor = (d: number | null) => d === null ? "text-muted-foreground" : d < 0 ? "text-danger font-medium" : d === 0 ? "text-warning-fg font-medium" : "text-muted-foreground"

  const hasAdvanced = filterStatus !== 'all' || filterService !== 'all' || filterDateFrom || filterDateTo
  const overduePortfolio = clients.filter((client) => client.status === "vencido")
  const dueTodayPortfolio = clients.filter((client) => diffDays(client.due_date) === 0)
  const dueSoonPortfolio = clients.filter((client) => {
    const days = diffDays(client.due_date)
    return days !== null && days > 0 && days <= 7
  })
  const suspendedPortfolio = clients.filter((client) => client.status === "suspended")
  const canceledPortfolio = clients.filter((client) => client.status === "canceled" || client.status === "inactive")
  const noWhatsappPortfolio = clients.filter((client) => !normalizePhoneE164(client.phone_e164 || client.phone || ""))
  const noServicePortfolio = clients.filter((client) => !client.client_services || client.client_services.length === 0)
  const monthlyRegistrationCounts = Array.from({ length: 6 }, (_, index) => {
    const monthStart = new Date(today.getFullYear(), today.getMonth() - (5 - index), 1)
    const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
    return {
      month: monthStart.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      new_clients: clients.filter((client) => {
        const createdAt = new Date(client.created_at)
        return createdAt >= monthStart && createdAt < nextMonth
      }).length,
    }
  })
  const clientGrowthSeries = monthlyRegistrationCounts.map((item, index) => ({
    ...item,
    cumulative: monthlyRegistrationCounts.slice(0, index + 1).reduce((sum, month) => sum + month.new_clients, 0),
  }))
  const currentMonthNewClients = clientGrowthSeries.at(-1)?.new_clients || 0
  const dailyRegistrationSeries = Array.from({ length: today.getDate() }, (_, index) => {
    const day = index + 1
    const date = new Date(today.getFullYear(), today.getMonth(), day)
    const dateKey = toDateKey(date)
    return {
      day: String(day).padStart(2, "0"),
      fullDate: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", ""),
      registrations: clients.filter((client) => clientCreatedKey(client) === dateKey).length,
    }
  })
  const dateKeyDaysAgo = (days: number) => {
    const date = new Date(today)
    date.setDate(date.getDate() - days)
    return toDateKey(date)
  }
  const registrationHistory = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setDate(date.getDate() - index)
    const dateKey = toDateKey(date)
    return {
      dateKey,
      label: index === 0 ? "Hoje" : date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
      date: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      count: clients.filter((client) => clientCreatedKey(client) === dateKey).length,
    }
  })
  const selectedRegistrationDate = registeredFrom && registeredFrom === registeredTo ? registeredFrom : null
  const previousMonthNewClients = clientGrowthSeries.at(-2)?.new_clients || 0
  const focusPortfolio = () => {
    requestAnimationFrame(() => {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      portfolioSectionRef.current?.scrollIntoView({ behavior, block: "start" })
      portfolioSectionRef.current?.focus({ preventScroll: true })
    })
  }

  const applyRegistrationPeriod = (period: RegistrationPeriod) => {
    setRegistrationPeriod(period)
    setQuickFilter("all")
    if (period === "today") {
      setRegisteredFrom(todayKey)
      setRegisteredTo(todayKey)
    } else if (period === "last7") {
      setRegisteredFrom(dateKeyDaysAgo(6))
      setRegisteredTo(todayKey)
    } else if (period === "month") {
      setRegisteredFrom(currentMonthStartKey)
      setRegisteredTo(todayKey)
    } else if (period === "all") {
      setRegisteredFrom("")
      setRegisteredTo("")
    }
    focusPortfolio()
  }

  const applyRegistrationDate = (dateKey: string) => {
    setRegistrationPeriod("custom")
    setRegisteredFrom(dateKey)
    setRegisteredTo(dateKey)
    setQuickFilter("all")
    focusPortfolio()
  }

  const clearAllFilters = () => {
    setSearchTerm("")
    setQuickFilter("all")
    setFilterStatus("all")
    setFilterService("all")
    setFilterDateFrom("")
    setFilterDateTo("")
    setRegistrationPeriod("all")
    setRegisteredFrom("")
    setRegisteredTo("")
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

  const hasRegistrationFilter = registrationPeriod !== "all" || registeredFrom || registeredTo
  const hasAnyFilter = quickFilter !== "all" || hasAdvanced || hasRegistrationFilter || searchTerm.trim().length > 0
  const activeFilterCount = [
    searchTerm.trim().length > 0,
    quickFilter !== "all",
    filterStatus !== "all",
    filterService !== "all",
    Boolean(filterDateFrom || filterDateTo),
    Boolean(hasRegistrationFilter),
  ].filter(Boolean).length

  return (
    <PageShell>
      <PageHeaderCard
        titleId="clients-page-title"
        icon={Users}
        eyebrow="Carteira operacional"
        badge={`${clients.length}${planContext.limits.clients === null ? "" : ` / ${planContext.limits.clients}`}`}
        title="Clientes"
        description="Consulte cadastros, acompanhe a situação da base e gere relatórios sem complicação."
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger className={buttonVariants({ variant: "outline", className: "h-[38px] gap-1.5 rounded-lg px-4 text-[13px] font-medium" })}>
                <FileText className="size-3.5" aria-hidden="true" /> Relatórios
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onClick={() => downloadReport("day")} className="items-start gap-3 py-2.5">
                  <CalendarDays className="mt-0.5 size-4" aria-hidden="true" />
                  <span><span className="block font-medium">Relatório do dia</span><span className="block text-[11px] text-muted-foreground">Clientes cadastrados hoje</span></span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadReport("month")} className="items-start gap-3 py-2.5">
                  <TrendingUp className="mt-0.5 size-4" aria-hidden="true" />
                  <span><span className="block font-medium">Relatório do mês</span><span className="block text-[11px] text-muted-foreground">Cadastros do mês atual</span></span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => downloadReport("complete")} className="items-start gap-3 py-2.5">
                  <Download className="mt-0.5 size-4" aria-hidden="true" />
                  <span><span className="block font-medium">Relatório completo</span><span className="block text-[11px] text-muted-foreground">Todos os clientes da base</span></span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={openCreateClient} disabled={planContext.limits.clients !== null && clients.length >= planContext.limits.clients} className="h-[38px] gap-1.5 rounded-lg px-4 text-[13px] font-semibold">
              <Plus className="size-3.5" /> Novo cliente
            </Button>
          </>
        }
      />


      {/* Tabela de Gestão */}
      <div ref={portfolioSectionRef} tabIndex={-1} className="flex scroll-mt-20 flex-col gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">

        {/* Busca + segmentos + filtros */}
        <div className="flex flex-col gap-3.5 rounded-lg border border-border bg-card px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input aria-label="Buscar clientes" placeholder="Buscar por nome, telefone ou serviço" className="h-[38px] rounded-[7px] border-input bg-background pl-8 text-[13px]" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger className={buttonVariants({ variant: "outline", className: "relative h-[38px] gap-1.5 rounded-[7px] px-3.5 text-[12.5px] font-medium" })}>
                  <Filter className="size-3.5" /> Filtros
                  {activeFilterCount > 0 && <span className="num inline-flex size-[18px] items-center justify-center rounded-full bg-interactive text-[10px] font-bold text-white">{activeFilterCount}</span>}
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
              {hasAnyFilter ? <Button variant="ghost" onClick={clearAllFilters} className="h-[38px] px-2.5 text-xs font-medium text-muted-foreground">Limpar tudo</Button> : null}
            </div>
          </div>

          {/* Período de cadastro */}
          <div className="flex flex-wrap items-start justify-between gap-3.5 rounded-lg border border-border bg-muted px-3.5 py-3">
            <div>
              <div className="flex items-center gap-1.5">
                <CalendarDays className="size-[13px] text-interactive" aria-hidden="true" />
                <p className="text-[11.5px] font-semibold text-foreground">Filtrar pela data de cadastro</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Período rápido de cadastro">
                {[
                  { key: "all", label: "Todos" },
                  { key: "today", label: "Hoje" },
                  { key: "last7", label: "Últimos 7 dias" },
                  { key: "month", label: "Este mês" },
                ].map((period) => (
                  <button
                    key={period.key}
                    type="button"
                    onClick={() => applyRegistrationPeriod(period.key as RegistrationPeriod)}
                    aria-pressed={registrationPeriod === period.key}
                    className={cn(
                      "min-h-8 rounded-[6px] border px-2.5 text-[11.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                      registrationPeriod === period.key
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-foreground hover:bg-muted"
                    )}
                  >
                    {period.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid min-w-[220px] grid-cols-2 gap-2">
              <div>
                <Label htmlFor="client-created-from" className="text-[10px] font-normal text-muted-foreground">Cadastrado de</Label>
                <Input id="client-created-from" type="date" max={registeredTo || todayKey} className="mt-1 h-8 rounded-[6px] bg-card text-[11px]" value={registeredFrom} onChange={(event) => { setRegisteredFrom(event.target.value); setRegistrationPeriod("custom") }} />
              </div>
              <div>
                <Label htmlFor="client-created-to" className="text-[10px] font-normal text-muted-foreground">Até</Label>
                <Input id="client-created-to" type="date" min={registeredFrom} max={todayKey} className="mt-1 h-8 rounded-[6px] bg-card text-[11px]" value={registeredTo} onChange={(event) => { setRegisteredTo(event.target.value); setRegistrationPeriod("custom") }} />
              </div>
            </div>
          </div>

          {/* Histórico de 7 dias */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-foreground">Histórico recente de cadastros</p>
              <span className="text-[10px] text-muted-foreground">Selecione um dia para filtrar</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-7" role="group" aria-label="Histórico de cadastros dos últimos 7 dias">
              {registrationHistory.map((entry) => {
                const isSelected = selectedRegistrationDate === entry.dateKey
                return (
                  <button
                    key={entry.dateKey}
                    type="button"
                    onClick={() => applyRegistrationDate(entry.dateKey)}
                    aria-pressed={isSelected}
                    className={cn(
                      "flex min-h-[66px] flex-col justify-between rounded-[7px] border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                      isSelected ? "border-interactive bg-interactive-bg" : "border-border bg-card hover:bg-muted"
                    )}
                  >
                    <span className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">{entry.label}</span>
                    <span className="num text-lg font-semibold leading-none text-foreground">{entry.count}</span>
                    <span className="text-[9px] text-muted-foreground">{entry.date}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Situação */}
          <div>
            <p className="microlabel text-[9px]">Situação dos clientes</p>
            <div className="mt-1.5 flex max-w-full items-center gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Situação dos clientes">
              {[
                { key: "all", label: "Todos", count: clients.length },
                { key: "overdue", label: "Vencidos", count: overduePortfolio.length },
                { key: "today", label: "Vence hoje", count: dueTodayPortfolio.length },
                { key: "7days", label: "Próximos 7 dias", count: dueSoonPortfolio.length },
                { key: "suspended", label: "Suspensos", count: suspendedPortfolio.length },
                { key: "canceled", label: "Cancelados", count: canceledPortfolio.length },
                { key: "no_whatsapp", label: "Sem WhatsApp", count: noWhatsappPortfolio.length },
                { key: "no_service", label: "Sem serviço", count: noServicePortfolio.length },
              ].map((segment) => (
                <button key={segment.key} type="button" onClick={() => setQuickFilter(segment.key as QuickFilter)} aria-pressed={quickFilter === segment.key}
                  className={cn("flex min-h-8 shrink-0 items-center gap-1.5 rounded-[6px] border px-2.5 text-[11.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                    quickFilter === segment.key ? "border-foreground bg-foreground font-semibold text-background" : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground")}>
                  {segment.label}<span className={cn("num text-[10px] opacity-70", quickFilter === segment.key && "text-background")}>{segment.count}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground" aria-live="polite">
            Exibindo <strong className="font-semibold text-foreground">{sortedClients.length}</strong> de {clients.length} clientes{registrationPeriod === "today" ? " cadastrados hoje" : registrationPeriod === "last7" ? " cadastrados nos últimos 7 dias" : registrationPeriod === "month" ? " cadastrados neste mês" : registrationPeriod === "custom" ? " no período escolhido" : ""}. Hoje e próximos vencimentos primeiro; atrasos de 3+ dias no fim.
          </p>
        </div>

        {/* Barra de seleção em massa */}
        {selectedClients.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-interactive bg-interactive-bg px-3.5 py-2.5 text-xs" role="status">
            <span className="mr-1 text-[12px] font-semibold text-interactive-fg">{selectedClients.length} selecionado{selectedClients.length > 1 && "s"}</span>
            <button onClick={handleBulkMessage} className="flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-[11.5px] font-semibold text-interactive-fg transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"><MessageCircle className="size-3"/> WhatsApp</button>
            <PixRapidoModal>
              <button className="flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-[11.5px] font-semibold text-interactive-fg transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"><Zap className="size-3"/> Gerar PIX</button>
            </PixRapidoModal>
            <button onClick={() => exportCSV(clients.filter((client) => selectedClients.includes(client.id)))} className="flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-[11.5px] font-semibold text-interactive-fg transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"><Download className="size-3"/> Exportar</button>
            <button onClick={() => setIsBulkDeleteDialogOpen(true)} className="ml-auto h-8 rounded-[6px] px-2.5 text-[11.5px] font-semibold text-danger transition-colors hover:bg-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none">Excluir</button>
            <button type="button" onClick={() => setSelectedClients([])} className="h-8 rounded-[6px] px-2.5 text-[11.5px] font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none">Limpar seleção</button>
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
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">Adicione o primeiro cliente para acompanhar cadastros, vencimentos e contatos em um só lugar.</p>
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
                className="overflow-x-auto"
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
                                <p className="mt-1 truncate text-xs text-muted-foreground">{client.phone_e164 || client.phone ? phoneMask(client.phone_e164 || client.phone || "") : "Sem WhatsApp"}</p>
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
                              <p className="microlabel text-[9px]">Cadastrado em</p>
                              <p className="num mt-1 font-medium text-foreground">{client.created_at ? new Date(client.created_at).toLocaleDateString("pt-BR") : "Sem data"}</p>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">{client.days_as_client} dias na base</p>
                            </div>
                          </div>

                          <div className="flex flex-col gap-3">
                            <div>
                              <p className="microlabel mb-1 text-[8px]">Última comunicação</p>
                              <div className="flex flex-col gap-0.5">
                                {commStatusBadge(client.last_communication_status)}
                                {commSentDate(client.last_charge_sent_date)}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleWhatsApp(client)}
                                aria-label={`Conversar com ${client.name} no WhatsApp`}
                                className="size-[30px] shrink-0 rounded-[6px] bg-card text-money"
                              >
                                <MessageCircle className="size-3.5" aria-hidden="true" />
                              </Button>
                              <Button size="sm" onClick={() => handleCobrar(client)} disabled={chargingIds.has(client.id)} className="h-[30px] flex-1 rounded-[6px] px-2.5 text-[11px] font-semibold">
                                {chargingIds.has(client.id) ? <Loader2 className="size-3 animate-spin motion-reduce:animate-none" /> : "Cobrar"}
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => { setRenewingClient(client); setIsRenewDialogOpen(true) }} className="h-[30px] flex-1 rounded-[6px] bg-card px-2.5 text-[11px] font-medium">
                                Renovar
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger className="flex size-[30px] shrink-0 items-center justify-center rounded-[6px] border border-input bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground motion-reduce:transition-none" aria-label={`Mais ações para ${client.name}`}><MoreHorizontal className="size-3.5" /></DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => { setEditingClient(client); setIsDialogOpen(true) }}>Editar / Trocar Serviço</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openProfile(client)}>Ficha do Cliente</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setPromoClient(client); setIsPromoDialogOpen(true) }}>Ativar promoção</DropdownMenuItem>
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
                    <TableHead className="microlabel text-[9px]">Cadastro</TableHead>
                    <TableHead className="microlabel text-[9px]">Comunicação</TableHead>
                    <TableHead className="microlabel min-w-[292px] pr-3 text-right text-[9px]">Ações</TableHead>
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
                              <button onClick={() => { if (client.phone_e164 || client.phone) { navigator.clipboard.writeText(client.phone_e164 || client.phone || ""); toast.success("Telefone copiado!") } }}
                                className="num block truncate text-[11px] text-muted-foreground hover:text-foreground" title="Copiar">
                                {client.phone_e164 || client.phone ? phoneMask(client.phone_e164 || client.phone || "") : 'sem WhatsApp'}
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
                          <p className="num text-xs font-semibold text-foreground">{client.created_at ? new Date(client.created_at).toLocaleDateString("pt-BR") : "Sem data"}</p>
                          <p className="max-w-[100px] truncate text-[9px] text-muted-foreground">{client.days_as_client} dias na base</p>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            {commStatusBadge(client.last_communication_status)}
                            {commSentDate(client.last_charge_sent_date)}
                          </div>
                        </TableCell>
                        <TableCell className="pr-3 text-right">
                          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleWhatsApp(client)}
                              aria-label={`Conversar com ${client.name} no WhatsApp`}
                              className="size-[30px] shrink-0 rounded-[6px] text-money"
                            >
                              <MessageCircle className="size-3.5" aria-hidden="true" />
                            </Button>
                            <Button size="sm" onClick={() => handleCobrar(client)} disabled={chargingIds.has(client.id)} className="h-[30px] rounded-[6px] px-2.5 text-[11px] font-semibold">
                              {chargingIds.has(client.id) ? <Loader2 className="size-3 animate-spin motion-reduce:animate-none" /> : "Cobrar"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => { setRenewingClient(client); setIsRenewDialogOpen(true) }} className="h-[30px] rounded-[6px] px-2.5 text-[11px] font-medium">
                              Renovar
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger className="flex size-[30px] items-center justify-center rounded-[6px] border border-input text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground motion-reduce:transition-none" aria-label={`Mais ações para ${client.name}`}><MoreHorizontal className="size-3.5" /></DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => { setEditingClient(client); setIsDialogOpen(true) }}>Editar / Trocar Serviço</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openProfile(client)}>Ficha do Cliente</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setPromoClient(client); setIsPromoDialogOpen(true) }}>Ativar promoção</DropdownMenuItem>
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
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <p className="text-[11px] text-muted-foreground">{sortedClients.length} cliente{sortedClients.length !== 1 && "s"} · página {currentPage} de {totalPages}</p>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" className="h-8 rounded-[6px] px-3 text-[11.5px] font-medium" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>← Anterior</Button>
                    <Button variant="outline" size="sm" className="h-8 rounded-[6px] px-3 text-[11.5px] font-medium" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages}>Próxima →</Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="clients-charts-title">
        <div>
          <p className="microlabel">Acompanhamento da base</p>
          <h2 id="clients-charts-title" className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-foreground">
            Cadastros e situação da carteira
          </h2>
        </div>
        {/* Os widgets usam `h-full` + `flex-1` + ResponsiveContainer height="100%":
            sem altura definida no contêiner o gráfico colapsa para 0. Manter os
            `min-h-*` e não usar `items-start` nesta grade. */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.75fr)]">
          <div className="min-h-[420px] min-w-0 rounded-lg border border-border bg-card p-4 sm:p-5">
            <ClientGrowthChart data={clientGrowthSeries} currentMonth={currentMonthNewClients} previousMonth={previousMonthNewClients} />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            {metrics ? (
              <div className="min-h-[240px] min-w-0 rounded-lg border border-border bg-card p-4 sm:p-5">
                <ClientsByStatusChart data={metrics.chart_clients_by_status} />
              </div>
            ) : null}
            <div className="min-h-[260px] min-w-0 rounded-lg border border-border bg-card p-4 sm:p-5">
              <ClientRegistrationRhythmChart data={dailyRegistrationSeries} total={currentMonthNewClients} />
            </div>
          </div>
        </div>
      </section>

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
              <div className={cn("rounded-lg border p-4", profileClient.status === "vencido" ? "border-danger-border bg-danger-bg/40" : "border-border bg-card")}>
                <div className="flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-[13px] font-semibold text-secondary-foreground">{getInitials(profileClient.name)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="max-w-[220px] truncate text-base font-semibold text-foreground">{profileClient.name}</h3>
                      {statusBadge(profileClient.status)}
                    </div>
                    <p className="num mt-[3px] text-[11px] text-muted-foreground">{profileClient.phone_e164 || profileClient.phone ? phoneMask(profileClient.phone_e164 || profileClient.phone || "") : 'Sem telefone cadastrado'}</p>
                    <p className="mt-0.5 text-[10.5px] text-muted-foreground">{profileClient.days_as_client} dias na base</p>
                  </div>
                </div>
                {profileClient.status === "vencido" ? (
                  <div className="mt-2.5 flex items-start gap-2 text-[11.5px] text-danger-fg">
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <p><strong className="font-semibold">Ação recomendada:</strong> revisar o vencimento e entrar em contato com o cliente.</p>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-lg border border-border px-3 py-2.5">
                  <p className="microlabel text-[9px]">Vencimento</p>
                  <p className="num mt-1.5 text-sm font-semibold text-foreground">{profileClient.due_date ? new Date(`${profileClient.due_date}T00:00:00`).toLocaleDateString("pt-BR") : "Sem data"}</p>
                  {profileClient.due_date ? <p className={cn("mt-0.5 text-[10px]", prazoColor(diffDays(profileClient.due_date)))}>{prazoLabel(diffDays(profileClient.due_date))}</p> : null}
                </div>
                <div className="rounded-lg border border-border px-3 py-2.5">
                  <p className="microlabel text-[9px]">Renovações</p>
                  <p className="num mt-1.5 text-sm font-semibold text-foreground">{profilePayments.length}</p>
                </div>
              </div>

              <div>
                <p className="microlabel">Valor do plano</p>
                <p className="num mt-1.5 text-xl font-semibold text-money">{formatCurrency(profileClient.plan_value || 0)}</p>
              </div>

              {/* Serviços e Acessos */}
              {profileClient.client_services && profileClient.client_services.length > 0 && (
                <div className="space-y-3 rounded-lg border border-border bg-card p-3">
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

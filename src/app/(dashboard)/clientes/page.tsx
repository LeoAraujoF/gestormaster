"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Plus, Edit2, Trash2, Loader2, Users, Search, RefreshCw, Calendar as CalendarIcon, Gift, Download, MessageCircle, DollarSign, TrendingDown, CheckCircle2, AlertCircle, Tv, Filter } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency, phoneMask } from "@/lib/utils"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import type { Client, Service } from "@/types/database"
import { ClientFormDialog } from "@/components/client-form-dialog"
import { RenewDialog, PromoDialog, DeleteDialog, BulkDeleteDialog } from "@/components/client-action-dialogs"
import { Checkbox } from "@/components/ui/checkbox"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts"

import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [userPlan, setUserPlan] = useState<string>("Desconhecido")
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 10
  
  // Client Profile 360 state
  const [profileClient, setProfileClient] = useState<any | null>(null)
  const [profilePayments, setProfilePayments] = useState<any[]>([])
  const [isProfileLoading, setIsProfileLoading] = useState(false)
  
  // Custom Quick Message State
  const [quickMessageTemplate, setQuickMessageTemplate] = useState<string | null>(null)
  


  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterService, setFilterService] = useState<string>("all")
  const [filterMinPrice, setFilterMinPrice] = useState<string>("")
  const [filterMaxPrice, setFilterMaxPrice] = useState<string>("")
  const [filterDateFrom, setFilterDateFrom] = useState<string>("")
  const [filterDateTo, setFilterDateTo] = useState<string>("")
  const [quickFilter, setQuickFilter] = useState<string>("all")


  
  const supabase = createClient()

  const loadData = async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Varredura de vencidos: atualiza status no banco ANTES de carregar a lista
      try {
        await fetch('/api/clients/update-overdue', { method: 'POST' })
      } catch (e) {
        // Silencia erro — não impede carregamento da página
      }
      
      setUserPlan(user.user_metadata?.plan_name || "Desconhecido")

      try {
        const res = await fetch('/api/admin/check')
        const adminData = await res.json()
        setIsAdmin(adminData.isAdmin)
      } catch (e) {
        setIsAdmin(false)
      }

      // Load Services
      const { data: servicesData } = await supabase
        .from('services')
        .select('*')
        .eq('user_id', user.id)
        .order('name')
      
      if (servicesData) setServices(servicesData)

      // Load Clients with their services
      const { data: clientsData, error } = await supabase
        .from('clients')
        .select(`
          *,
          client_services (
            service_id,
            services (id, name, cost)
          )
        `)
        .eq('user_id', user.id)
        .order('name')

      if (error) throw error
      setClients(clientsData || [])

      // Load Quick Message Template if exists
      const { data: ruleData } = await supabase
        .from('automations')
        .select('message_template')
        .eq('user_id', user.id)
        .eq('alert_type', 'quick_message')
        .eq('is_active', true)
        .maybeSingle()
        
      if (ruleData) {
        setQuickMessageTemplate(ruleData.message_template)
      } else {
        setQuickMessageTemplate(null)
      }

    } catch (error) {
      console.error("Error loading data:", error)
      toast.error("Erro ao carregar dados.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    loadMetrics()
  }, [])

  const loadMetrics = async () => {
    setIsMetricsLoading(true)
    try {
      const res = await fetch('/api/clients/metrics')
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setMetrics(data)
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsMetricsLoading(false)
    }
  }

  const openCreateDialog = () => {
    if (services.length === 0) {
      toast.warning("Cadastre um Serviço primeiro antes de adicionar um cliente.")
      return
    }
    setEditingClient(null)
    setIsDialogOpen(true)
  }

  const openEditDialog = (client: any) => {
    setEditingClient(client)
    setIsDialogOpen(true)
  }

  /*
  const handleSyncIPTV = async () => {
    setIsSyncing(true)
    toast.loading("Sincronizando clientes do painel IPTV...", { id: "sync-iptv" })
    try {
      const res = await fetch('/api/iptv/sync', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || "Sincronização concluída com sucesso!", { id: "sync-iptv" })
        loadData()
      } else {
        toast.error(data.error || "Erro ao sincronizar. Verifique se configurou a integração TVdeCasa.", { id: "sync-iptv" })
      }
    } catch (error) {
      toast.error("Erro interno ao sincronizar IPTV.", { id: "sync-iptv" })
    } finally {
      setIsSyncing(false)
    }
  }
  */





  const filteredClients = clients.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (c.username && c.username.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.phone && c.phone.includes(searchTerm));
      
    // Filter by Status including "expiring" (next 3 days)
    let matchesStatus = true;
    if (filterStatus !== 'all') {
      if (filterStatus === 'expiring') {
        if (!c.due_date) {
          matchesStatus = false;
        } else {
          const dueDate = new Date(c.due_date + "T00:00:00");
          const today = new Date();
          today.setHours(0,0,0,0);
          const diffTime = dueDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          // Vencendo em até 3 dias (e não vencido)
          matchesStatus = diffDays >= 0 && diffDays <= 3;
        }
      } else {
        matchesStatus = c.status === filterStatus;
      }
    }
        const matchesService = filterService === 'all' || 
      (c.client_services && c.client_services.some((cs: any) => cs.service_id === filterService));
      
    const price = c.plan_value || 0;
    const matchesMin = !filterMinPrice ? true : price >= parseFloat(filterMinPrice);
    const matchesMax = !filterMaxPrice ? true : price <= parseFloat(filterMaxPrice);
    
    // Date Filter
    let matchesDate = true;
    if (filterDateFrom || filterDateTo) {
      if (!c.due_date) {
        matchesDate = false;
      } else {
        if (filterDateFrom && c.due_date < filterDateFrom) matchesDate = false;
        if (filterDateTo && c.due_date > filterDateTo) matchesDate = false;
      }
    }
    
    // Quick Filters
    let matchesQuick = true;
    if (quickFilter !== 'all') {
      const today = new Date();
      today.setHours(0,0,0,0);
      
      if (quickFilter === 'today') {
        if (!c.due_date) matchesQuick = false;
        else {
          const dueDate = new Date(c.due_date + "T00:00:00");
          matchesQuick = dueDate.getTime() === today.getTime();
        }
      } 
      else if (quickFilter === 'overdue_10') {
        if (!c.due_date) matchesQuick = false;
        else {
          const dueDate = new Date(c.due_date + "T00:00:00");
          const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          matchesQuick = diffDays >= 10;
        }
      }
      else if (quickFilter === 'new_week') {
        if (!c.registration_date) matchesQuick = false;
        else {
          const regDate = new Date(c.registration_date + "T00:00:00");
          const diffDays = Math.floor((today.getTime() - regDate.getTime()) / (1000 * 60 * 60 * 24));
          matchesQuick = diffDays <= 7;
        }
      }
      else if (quickFilter === 'no_phone') {
        matchesQuick = !c.phone || c.phone.trim() === '';
      }
    }
    
    return matchesSearch && matchesStatus && matchesService && matchesMin && matchesMax && matchesDate && matchesQuick;
  });

  // Smart Sorting: Prioritize upcoming and recent renewals
  const sortedClients = [...filteredClients].sort((a, b) => {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayTime = today.getTime();
    
    const dateA = new Date(a.due_date + "T00:00:00").getTime();
    const dateB = new Date(b.due_date + "T00:00:00").getTime();
    
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    
    // Group 1: Vencendo em breve (0 a 3 dias)
    const isExpiringA = (dateA - todayTime) >= 0 && (dateA - todayTime) <= 3 * MS_PER_DAY;
    const isExpiringB = (dateB - todayTime) >= 0 && (dateB - todayTime) <= 3 * MS_PER_DAY;
    if (isExpiringA && !isExpiringB) return -1;
    if (!isExpiringA && isExpiringB) return 1;
    
    // Group 2: Vencidos Recentes (1 a 15 dias atrás)
    const isRecentA = (dateA - todayTime) < 0 && (todayTime - dateA) <= 15 * MS_PER_DAY;
    const isRecentB = (dateB - todayTime) < 0 && (todayTime - dateB) <= 15 * MS_PER_DAY;
    if (isRecentA && !isRecentB) return -1;
    if (!isRecentA && isRecentB) return 1;

    // Group 3: Ativos Regulares (mais de 3 dias no futuro)
    const isActiveA = (dateA - todayTime) > 3 * MS_PER_DAY;
    const isActiveB = (dateB - todayTime) > 3 * MS_PER_DAY;
    if (isActiveA && !isActiveB) return -1;
    if (!isActiveA && isActiveB) return 1;
    
    // Se estiverem no mesmo grupo, quem estiver mais perto de hoje fica no topo
    return Math.abs(dateA - todayTime) - Math.abs(dateB - todayTime);
  });

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedClients(filteredClients.map((c: any) => c.id))
    } else {
      setSelectedClients([])
    }
  }

  const toggleSelectClient = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedClients(prev => [...prev, id])
    } else {
      setSelectedClients(prev => prev.filter(clientId => clientId !== id))
    }
  }

  // Pagination logic
  const totalPages = Math.ceil(sortedClients.length / ITEMS_PER_PAGE) || 1;
  const paginatedClients = sortedClients.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterService, filterMinPrice, filterMaxPrice, filterDateFrom, filterDateTo, quickFilter]);

  const handleExportCSV = () => {
    if (sortedClients.length === 0) return

    const headers = ["Nome", "Usuario", "Telefone", "Vencimento", "Cadastro", "Valor_Plano", "Status"]
    
    const rows = sortedClients.map(c => {
      return [
        `"${c.name}"`,
        `"${c.username || ''}"`,
        `"${c.phone || ''}"`,
        `"${new Date(c.due_date + "T00:00:00").toLocaleDateString('pt-BR')}"`,
        `"${new Date(c.registration_date + "T00:00:00").toLocaleDateString('pt-BR')}"`,
        c.plan_value,
        `"${c.status}"`
      ].join(",")
    })

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `carteira_clientes.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleWhatsApp = (client: any) => {
    if (!client.phone) {
       toast.error("Este cliente não possui telefone cadastrado.")
       return
    }
    const numbersOnly = client.phone.replace(/\D/g, '')
    // Force country code if not present (simple check)
    const phoneWithCountry = numbersOnly.startsWith('55') ? numbersOnly : `55${numbersOnly}`
    
    let rawMsg = `Olá ${client.name}, tudo bem?`
    if (quickMessageTemplate) {
      const primeiroNome = client.name ? client.name.split(' ')[0] : ''
      const planValue = formatCurrency(client.plan_value || 0)
      const dueDate = client.due_date ? new Date(client.due_date + "T00:00:00").toLocaleDateString('pt-BR') : 'Sem data'
      rawMsg = quickMessageTemplate
        .replace(/\{\{primeiro_nome\}\}/g, primeiroNome)
        .replace(/\{\{client_name\}\}/g, client.name || '')
        .replace(/\{\{plan_value\}\}/g, planValue)
        .replace(/\{\{due_date\}\}/g, dueDate)
    }

    const msg = encodeURIComponent(rawMsg)
    window.open(`https://wa.me/${phoneWithCountry}?text=${msg}`, '_blank')
  }

  const openProfile = async (client: any) => {
    setProfileClient(client)
    setIsProfileLoading(true)
    try {
      const { data } = await supabase
        .from('payments')
        .select('*')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
      
      setProfilePayments(data || [])
    } catch(e) {
      console.error(e)
    } finally {
      setIsProfileLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'active': return <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-0">Ativo</Badge>
      case 'inactive': return <Badge variant="secondary" className="bg-muted text-muted-foreground border-0">Inativo</Badge>
      case 'pending': return <Badge className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-0">Pendente</Badge>
      case 'vencido': return <Badge variant="destructive" className="border-0">Vencido</Badge>
      default: return <Badge>{status}</Badge>
    }
  }

  const renderDueDate = (dateString: string, timeString?: string | null) => {
    if (!dateString) return <div className="font-medium text-muted-foreground">Sem venc.</div>
    const dueDate = new Date(dateString + "T00:00:00")
    const today = new Date()
    today.setHours(0,0,0,0)

    const isOverdue = dueDate < today
    const isToday = dueDate.getTime() === today.getTime()

    let textColor = "text-foreground"
    if (isOverdue) textColor = "text-red-500 font-bold dark:text-red-400"
    else if (isToday) textColor = "text-amber-500 font-bold dark:text-amber-400"

    const formattedDate = dueDate.toLocaleDateString('pt-BR')
    const timeDisplay = timeString ? ` às ${timeString}` : ''

    return <div className={`font-medium ${textColor}`}>Venc: {formattedDate}{timeDisplay}</div>
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight mb-2">Clientes</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Gerencie seus clientes, planos e vencimentos.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Integração IPTV - Salva para o futuro
          <Button onClick={handleSyncIPTV} disabled={isSyncing} variant="outline" className="gap-2 border-purple-500/30 text-purple-600 hover:bg-purple-500/10">
            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tv className="w-4 h-4" />}
            <span className="hidden sm:inline">Sincronizar IPTV</span>
          </Button>
          */}
          <Button onClick={handleExportCSV} variant="secondary" className="gap-2 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/20">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar CSV</span>
          </Button>
          <Button onClick={openCreateDialog} className="gap-2">
            <Plus className="w-4 h-4" />
            Novo Cliente
          </Button>
        </div>
      </div>



      <div>
        <div className="glass-card rounded-xl overflow-hidden p-4">
          
          {/* Toolbar Mágica */}
          <div className="flex flex-col gap-4 mb-6">
            
            {/* Quick Filters (Chips) */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Filtros Rápidos:</span>
              <Badge 
                variant={quickFilter === 'all' ? 'default' : 'outline'} 
                className={`cursor-pointer transition-colors ${quickFilter === 'all' ? 'bg-primary/90 hover:bg-primary' : 'hover:bg-muted/50'}`}
                onClick={() => setQuickFilter('all')}
              >
                Todos
              </Badge>
              <Badge 
                variant={quickFilter === 'today' ? 'default' : 'outline'} 
                className={`cursor-pointer transition-colors ${quickFilter === 'today' ? 'bg-amber-500 hover:bg-amber-600 border-0' : 'hover:bg-muted/50 text-amber-600 dark:text-amber-500 border-amber-500/30'}`}
                onClick={() => setQuickFilter('today')}
              >
                ⚡ Vencem Hoje
              </Badge>
              <Badge 
                variant={quickFilter === 'overdue_10' ? 'default' : 'outline'} 
                className={`cursor-pointer transition-colors ${quickFilter === 'overdue_10' ? 'bg-rose-500 hover:bg-rose-600 border-0' : 'hover:bg-muted/50 text-rose-600 dark:text-rose-500 border-rose-500/30'}`}
                onClick={() => setQuickFilter('overdue_10')}
              >
                🚨 Vencidos (+10 dias)
              </Badge>
              <Badge 
                variant={quickFilter === 'new_week' ? 'default' : 'outline'} 
                className={`cursor-pointer transition-colors ${quickFilter === 'new_week' ? 'bg-emerald-500 hover:bg-emerald-600 border-0' : 'hover:bg-muted/50 text-emerald-600 dark:text-emerald-500 border-emerald-500/30'}`}
                onClick={() => setQuickFilter('new_week')}
              >
                🆕 Novos (7 dias)
              </Badge>
              <Badge 
                variant={quickFilter === 'no_phone' ? 'default' : 'outline'} 
                className={`cursor-pointer transition-colors ${quickFilter === 'no_phone' ? 'bg-zinc-500 hover:bg-zinc-600 border-0' : 'hover:bg-muted/50 text-zinc-600 dark:text-zinc-400 border-zinc-500/30'}`}
                onClick={() => setQuickFilter('no_phone')}
              >
                📱 Sem WhatsApp
              </Badge>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {selectedClients.length > 0 && (
                <Button 
                  variant="destructive" 
                  onClick={() => setIsBulkDeleteDialogOpen(true)}
                  className="h-10 px-4 shrink-0 shadow-sm animate-in fade-in slide-in-from-left-2 duration-300 gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Excluir ({selectedClients.length})
                </Button>
              )}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisa Mágica: Nome, Usuário ou Telefone..."
                  className="pl-9 bg-background/50 border-primary/20 focus-visible:ring-primary/30 h-10 shadow-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <Popover>
                <PopoverTrigger className={buttonVariants({ variant: "outline", className: "gap-2 h-10 border-primary/20 shadow-sm min-w-[140px] relative" })}>
                  <Filter className="w-4 h-4 text-primary" />
                  <span>Avançados</span>
                  {(filterStatus !== 'all' || filterService !== 'all' || filterMinPrice || filterMaxPrice || filterDateFrom || filterDateTo) && (
                    <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-primary animate-pulse" />
                  )}
                </PopoverTrigger>
                <PopoverContent className="w-80 p-4" align="end">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm leading-none">Filtros Avançados</h4>
                      <p className="text-xs text-muted-foreground">Refine sua busca por critérios específicos.</p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs">Status do Cliente</Label>
                      <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? "all")}>
                        <SelectTrigger className="w-full h-8 text-sm bg-background/50">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos Status</SelectItem>
                          <SelectItem value="active">Ativo</SelectItem>
                          <SelectItem value="expiring">Próx. Vencimento</SelectItem>
                          <SelectItem value="vencido">Vencido</SelectItem>
                          <SelectItem value="pending">Pendente</SelectItem>
                          <SelectItem value="inactive">Inativo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Serviço Vinculado</Label>
                      <Select value={filterService} onValueChange={(v) => setFilterService(v ?? "all")}>
                        <SelectTrigger className="w-full h-8 text-sm bg-background/50">
                          <SelectValue placeholder="Serviço">
                            {filterService === 'all' ? 'Todos Serviços' : services.find(s => s.id === filterService)?.name}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos Serviços</SelectItem>
                          {services.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs">Faixa de Preço (Plano)</Label>
                      <div className="flex items-center gap-2">
                        <Input 
                          type="number" 
                          placeholder="Mín (R$)" 
                          className="flex-1 bg-background/50 h-8 text-sm" 
                          value={filterMinPrice}
                          onChange={e => setFilterMinPrice(e.target.value)}
                        />
                        <span className="text-muted-foreground">-</span>
                        <Input 
                          type="number" 
                          placeholder="Máx (R$)" 
                          className="flex-1 bg-background/50 h-8 text-sm"
                          value={filterMaxPrice}
                          onChange={e => setFilterMaxPrice(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Data de Vencimento</Label>
                      <div className="flex items-center gap-2">
                        <Input 
                          type="date" 
                          className="flex-1 bg-background/50 h-8 text-sm px-2" 
                          value={filterDateFrom}
                          onChange={e => setFilterDateFrom(e.target.value)}
                        />
                        <span className="text-muted-foreground">-</span>
                        <Input 
                          type="date" 
                          className="flex-1 bg-background/50 h-8 text-sm px-2"
                          value={filterDateTo}
                          onChange={e => setFilterDateTo(e.target.value)}
                        />
                      </div>
                    </div>

                    {(filterStatus !== 'all' || filterService !== 'all' || filterMinPrice || filterMaxPrice || filterDateFrom || filterDateTo) && (
                      <Button 
                        variant="ghost" 
                        className="w-full h-8 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 mt-2" 
                        onClick={() => {
                          setFilterStatus('all')
                          setFilterService('all')
                          setFilterMinPrice('')
                          setFilterMaxPrice('')
                          setFilterDateFrom('')
                          setFilterDateTo('')
                        }}
                      >
                        Limpar Avançados
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-12 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-sky-500/10 flex items-center justify-center">
                <Users className="w-8 h-8 text-sky-500" />
              </div>
              <h3 className="text-xl font-semibold">Nenhum cliente cadastrado</h3>
              <p className="text-muted-foreground max-w-sm">
                Adicione seu primeiro cliente para começar a gerenciar os vencimentos.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox 
                        checked={selectedClients.length > 0 && selectedClients.length === filteredClients.length}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Selecionar todos os clientes da lista atual"
                      />
                    </TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Serviços</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Valor Plano</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedClients.map((client) => (
                    <TableRow key={client.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <Checkbox 
                          checked={selectedClients.includes(client.id)}
                          onCheckedChange={(c) => toggleSelectClient(client.id, !!c)}
                          aria-label={`Selecionar cliente ${client.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div 
                          className="font-semibold text-blue-600 dark:text-blue-400 cursor-pointer hover:underline"
                          onClick={() => openProfile(client)}
                          title="Ver Ficha do Cliente"
                        >
                          {client.name}
                        </div>
                        {client.username && (
                          <div 
                            onClick={() => { navigator.clipboard.writeText(client.username); toast.success("Usuário copiado!"); }}
                            className="text-xs text-primary font-medium mt-0.5 cursor-pointer hover:underline"
                            title="Clique para copiar"
                          >
                            @{client.username}
                          </div>
                        )}
                        <div 
                          onClick={() => { if(client.phone) { navigator.clipboard.writeText(client.phone); toast.success("Telefone copiado!"); } }}
                          className="text-xs text-muted-foreground mt-0.5 cursor-pointer hover:text-foreground transition-colors"
                          title="Clique para copiar"
                        >
                          {client.phone ? phoneMask(client.phone) : 'Sem telefone'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {client.client_services.map((cs: any) => (
                            <Badge key={cs.service_id} variant="outline" className="text-[10px] py-0 border-primary/20 text-primary/80">
                              {cs.services?.name}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {renderDueDate(client.due_date, client.due_time)}
                        <div className="text-xs text-muted-foreground">Cad: {new Date(client.registration_date + "T00:00:00").toLocaleDateString('pt-BR')}</div>
                      </TableCell>
                      <TableCell className="text-emerald-400 font-medium">
                        {formatCurrency(client.plan_value)}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(client.status)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleWhatsApp(client)}
                            className="h-8 w-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                            title="Conversar no WhatsApp"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => {
                              setPromoClient(client)
                              setIsPromoDialogOpen(true)
                            }}
                            className="h-8 w-8 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                            title="Ativar Promoção"
                          >
                            <Gift className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => {
                              setRenewingClient(client)
                              setIsRenewDialogOpen(true)
                            }}
                            className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                            title="Renovar Assinatura"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => openEditDialog(client)}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => {
                              setDeletingClient(client)
                              setIsDeleteDialogOpen(true)
                            }}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-4 border-t border-border/50">
                  <div className="text-sm text-muted-foreground">
                    Mostrando <span className="font-medium text-foreground">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> a <span className="font-medium text-foreground">{Math.min(currentPage * ITEMS_PER_PAGE, sortedClients.length)}</span> de <span className="font-medium text-foreground">{sortedClients.length}</span> clientes
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Anterior
                    </Button>
                    <div className="text-sm font-medium">
                      Página {currentPage} de {totalPages}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dashboard de Métricas movido para baixo da tabela */}
      <div className="space-y-6">
        {isMetricsLoading ? (
          <div className="flex flex-col items-center justify-center h-48 bg-card rounded-xl border border-border/50">
            <Loader2 className="w-8 h-8 text-rose-500 animate-spin mb-4" />
            <span className="text-muted-foreground animate-pulse">Calculando métricas avançadas...</span>
          </div>
        ) : metrics ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* MRR Card */}
              <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2 relative overflow-hidden">
                <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-500/5 rounded-bl-full -z-10" />
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-emerald-500/10 rounded-xl">
                    <DollarSign className="w-5 h-5 text-emerald-500" />
                  </div>
                  <h3 className="font-medium text-muted-foreground">MRR (Ativos)</h3>
                </div>
                <p className="text-3xl font-bold mt-2 text-emerald-500">{formatCurrency(metrics.metrics.mrr)}</p>
                <p className="text-xs text-muted-foreground">Receita mensal garantida</p>
              </div>
              
              {/* Ticket Médio */}
              <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2 relative overflow-hidden">
                <div className="absolute right-0 top-0 w-32 h-32 bg-sky-500/5 rounded-bl-full -z-10" />
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-sky-500/10 rounded-xl">
                    <DollarSign className="w-5 h-5 text-sky-500" />
                  </div>
                  <h3 className="font-medium text-muted-foreground">Ticket Médio</h3>
                </div>
                <p className="text-3xl font-bold mt-2">{formatCurrency(metrics.metrics.ticketMedio)}</p>
                <p className="text-xs text-muted-foreground">Por cliente ativo</p>
              </div>

              {/* Vencimentos / Inativos */}
              <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2 relative overflow-hidden">
                <div className="absolute right-0 top-0 w-32 h-32 bg-amber-500/5 rounded-bl-full -z-10" />
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-500/10 rounded-xl">
                    <CalendarIcon className="w-5 h-5 text-amber-500" />
                  </div>
                  <h3 className="font-medium text-muted-foreground">Vencimentos</h3>
                </div>
                <p className="text-3xl font-bold mt-2 text-amber-500">{metrics.metrics.expiringSoon}</p>
                <p className="text-xs text-muted-foreground">Vencem nos próximos 7 dias</p>
              </div>

              {/* Taxa de Churn */}
              <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2 relative overflow-hidden">
                <div className="absolute right-0 top-0 w-32 h-32 bg-rose-500/5 rounded-bl-full -z-10" />
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-rose-500/10 rounded-xl">
                    <TrendingDown className="w-5 h-5 text-rose-500" />
                  </div>
                  <h3 className="font-medium text-muted-foreground">Taxa de Churn</h3>
                </div>
                <p className="text-3xl font-bold mt-2 text-rose-500">{metrics.metrics.churnRate}%</p>
                <p className="text-xs text-muted-foreground">{metrics.metrics.totalInactive} inativos ({formatCurrency(metrics.metrics.lostRevenue)} perdidos)</p>
              </div>

              {/* Total Ativos */}
              <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2 relative overflow-hidden">
                <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-500/5 rounded-bl-full -z-10" />
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-emerald-500/10 rounded-xl">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  </div>
                  <h3 className="font-medium text-muted-foreground">Clientes Ativos</h3>
                </div>
                <p className="text-3xl font-bold mt-2 text-emerald-500">{metrics.metrics.totalActive}</p>
                <p className="text-xs text-muted-foreground">Com pagamento em dia</p>
              </div>

              {/* Total Vencidos */}
              <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2 relative overflow-hidden">
                <div className="absolute right-0 top-0 w-32 h-32 bg-red-500/5 rounded-bl-full -z-10" />
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-red-500/10 rounded-xl">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  </div>
                  <h3 className="font-medium text-muted-foreground">Status Vencidos</h3>
                </div>
                <p className="text-3xl font-bold mt-2 text-red-500">{metrics.metrics.totalOverdue}</p>
                <p className="text-xs text-muted-foreground">Inadimplentes</p>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-card border shadow-sm">
              <h3 className="font-bold text-lg mb-6">Retenção vs Ativação (Últimos 6 meses)</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#888'}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#888'}} />
                    <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px'}} />
                    <Legend iconType="circle" wrapperStyle={{paddingTop: '20px'}} />
                    <Bar dataKey="Ativações" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="Renovações" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="Vencidos" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Create/Edit Dialog using the unified component */}
      <ClientFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        client={editingClient}
        servicesList={services}
        onSuccess={loadData}
      />

      <RenewDialog open={isRenewDialogOpen} onOpenChange={setIsRenewDialogOpen} client={renewingClient} onSuccess={loadData} />
      <PromoDialog open={isPromoDialogOpen} onOpenChange={setIsPromoDialogOpen} client={promoClient} onSuccess={loadData} />
      <DeleteDialog 
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        client={deletingClient}
        onSuccess={loadData}
      />
      <BulkDeleteDialog 
        open={isBulkDeleteDialogOpen}
        onOpenChange={(open) => {
          setIsBulkDeleteDialogOpen(open)
          if (!open) setSelectedClients([])
        }}
        clients={clients.filter(c => selectedClients.includes(c.id))}
        onSuccess={() => {
          loadData()
          setSelectedClients([])
        }}
      />

      {/* Client Profile Sheet */}
      <Sheet open={!!profileClient} onOpenChange={(open) => !open && setProfileClient(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-[450px] px-6 sm:px-8">
          <SheetHeader className="mt-2">
            <SheetTitle className="text-2xl">Ficha do Cliente 360º</SheetTitle>
            <SheetDescription className="text-sm">
              Histórico financeiro completo e índice LTV.
            </SheetDescription>
          </SheetHeader>
          
          {profileClient && (
            <div className="mt-8 space-y-8">
               <div className="space-y-2">
                 <h3 className="text-2xl font-bold text-foreground">{profileClient.name}</h3>
                 <p className="text-sm text-muted-foreground">{profileClient.phone ? phoneMask(profileClient.phone) : 'Sem telefone'}</p>
                 <div className="mt-3">{getStatusBadge(profileClient.status)}</div>
               </div>

               <div className="p-6 rounded-2xl border border-sky-500/20 bg-sky-500/5 flex items-center justify-between shadow-sm">
                 <div className="pr-4">
                   <p className="text-sm font-medium text-sky-500 mb-1">LTV (Lifetime Value)</p>
                   <p className="text-3xl font-bold text-sky-600 dark:text-sky-400">
                     {formatCurrency(profilePayments.reduce((acc, p) => acc + Number(p.amount_paid || 0), 0))}
                   </p>
                 </div>
                 <div className="p-4 bg-sky-500/10 rounded-full shrink-0">
                   <DollarSign className="w-6 h-6 text-sky-500" />
                 </div>
               </div>

               <div>
                 <h4 className="font-semibold text-base mb-4">Histórico de Receita</h4>
                 {isProfileLoading ? (
                   <div className="flex justify-center p-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                 ) : profilePayments.length === 0 ? (
                   <p className="text-sm text-muted-foreground text-center p-6 border border-dashed rounded-xl bg-muted/10">Nenhum pagamento registrado.</p>
                 ) : (
                   <div className="space-y-3">
                     {profilePayments.map(p => (
                       <div key={p.id} className="flex justify-between items-center p-4 px-5 rounded-xl border border-border/50 bg-muted/10 shadow-sm text-sm hover:bg-muted/30 transition-colors">
                         <div>
                           <p className="font-medium text-foreground text-base">{new Date(p.created_at).toLocaleDateString('pt-BR')}</p>
                           <p className="text-xs text-muted-foreground mt-0.5">{p.amount_paid === 0 ? 'Extensão (Promo)' : 'Renovação Mensal'}</p>
                         </div>
                         <p className="font-bold text-emerald-500 text-base">{formatCurrency(p.amount_paid)}</p>
                       </div>
                     ))}
                   </div>
                 )}
               </div>
               
               <div className="pt-6 pb-4 border-t border-border/40">
                  <Button onClick={() => handleWhatsApp(profileClient)} className="w-full py-6 text-base gap-2 bg-[#25D366] hover:bg-[#1DA851] text-white shadow-md hover:shadow-lg transition-all rounded-xl">
                    <MessageCircle className="w-5 h-5" />
                    Chamar no WhatsApp
                  </Button>
               </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

    </div>
  )
}

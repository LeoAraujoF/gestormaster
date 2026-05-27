"use client"

import { useEffect, useState } from "react"
import { Users, DollarSign, TrendingDown, TrendingUp, Loader2, Plus, Briefcase, MessageCircle, Activity, RefreshCw, UserPlus, Phone, Clock, Gift, Edit2, Trash2, Search, Calendar as CalendarIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { formatCurrency, cn } from "@/lib/utils"
import { MetricCard } from "@/components/metric-card"
import { ChartCard, CustomTooltip } from "@/components/chart-card"
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeft, ChevronRight, Filter } from "lucide-react"
import { QuickAddServiceDialog, WhatsAppStatusDialog } from "@/components/quick-add-dialogs"
import { ClientFormDialog } from "@/components/client-form-dialog"
import { RenewDialog, PromoDialog, DeleteDialog } from "@/components/client-action-dialogs"
import type { DashboardMetrics, MonthlyGrowth } from "@/types/database"
import { usePrivacy } from "@/hooks/use-privacy"
import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [userName, setUserName] = useState("")
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [growthData, setGrowthData] = useState<MonthlyGrowth[]>([])
  const [todayMetrics, setTodayMetrics] = useState({ gross: 0, cost: 0, net: 0 })
  
  // Table States
  const [clientsList, setClientsList] = useState<any[]>([])
  const [servicesList, setServicesList] = useState<any[]>([])
  const [recentActivities, setRecentActivities] = useState<any[]>([])
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatus, setFilterStatus] = useState<string>('upcoming') // default: next 15 days
  const [filterMonth, setFilterMonth] = useState<string>('all')
  const [filterService, setFilterService] = useState<string>('all')
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  
  // Dialogs
  const [isAddClientOpen, setIsAddClientOpen] = useState(false)
  const [isAddServiceOpen, setIsAddServiceOpen] = useState(false)
  const [isWhatsAppStatusOpen, setIsWhatsAppStatusOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<any | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isRenewDialogOpen, setIsRenewDialogOpen] = useState(false)
  const [isPromoDialogOpen, setIsPromoDialogOpen] = useState(false)
  const [actionClient, setActionClient] = useState<any | null>(null)
  
  // WhatsApp Status
  const [waStatus, setWaStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading')
  
  const { displayValue } = usePrivacy()
  const supabase = createClient()

  const loadDashboardData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          setUserName(user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário")
        }

        // Fetch main metrics via RPC
        const { data: metricsData, error: metricsErr } = await supabase.rpc('get_dashboard_metrics')
        if (!metricsErr && metricsData && metricsData.length > 0) {
          setMetrics(metricsData[0])
        }

        // Fetch growth data
        const { data: growth, error: growthErr } = await supabase.rpc('get_monthly_growth')
        if (!growthErr && growth) {
          setGrowthData(growth)
        }

        // Fetch clients for the table
        const { data: clientsData, error: clientsErr } = await supabase
          .from('clients')
          .select(`
            id, name, phone, due_date, plan_value, screens, status,
            client_services(services(id, name, cost))
          `)
          .order('due_date', { ascending: true })

        if (!clientsErr && clientsData) setClientsList(clientsData)

        // Fetch services for filter dropdown
        const { data: servicesData } = await supabase.from('services').select('id, name, cost')
        if (servicesData) setServicesList(servicesData)

        // Fetch recent activities (payments)
        const { data: paymentsData } = await supabase
          .from('payments')
          .select(`
            id, amount_paid, months_renewed, created_at,
            clients(id, name, phone, client_services(services(name)))
          `)
          .order('created_at', { ascending: false })
          .limit(10)

        if (paymentsData) {
          // For each payment, determine if it's the first payment (activation) or renewal
          const activitiesWithType = await Promise.all(
            paymentsData.map(async (payment: any) => {
              const { count } = await supabase
                .from('payments')
                .select('id', { count: 'exact', head: true })
                .eq('client_id', payment.clients?.id)
                .lt('created_at', payment.created_at)
              
              return {
                ...payment,
                type: (count === 0) ? 'activation' : 'renewal'
              }
            })
          )
          setRecentActivities(activitiesWithType)
        }

        // Fetch WhatsApp status
        const { data: waData } = await supabase.from('evolution_instances').select('status').eq('status', 'connected').limit(1)
        if (waData && waData.length > 0) setWaStatus('connected')
        else setWaStatus('disconnected')

        // Fetch today's payments for Ganho do Dia card
        const startOfToday = new Date()
        startOfToday.setHours(0, 0, 0, 0)
        const startOfTodayISO = startOfToday.toISOString()

        const { data: todayPayments } = await supabase
          .from('payments')
          .select('amount_paid, net_profit')
          .gte('created_at', startOfTodayISO)

        if (todayPayments) {
          const gross = todayPayments.reduce((acc, p) => acc + (p.amount_paid || 0), 0)
          const net = todayPayments.reduce((acc, p) => acc + (p.net_profit || 0), 0)
          setTodayMetrics({ gross, cost: gross - net, net })
        }

      } catch (error) {
        console.error("Error loading dashboard data:", error)
      } finally {
        setIsLoading(false)
      }
  }

  useEffect(() => {
    loadDashboardData()
  }, [])

  const COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899']

  // --- Formatting Helpers ---
  const getAvatarColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
  }

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ')
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.substring(0, 2).toUpperCase()
  }

  const defaultMetrics: DashboardMetrics = {
    total_active_clients: 0,
    total_inactive_clients: 0,
    total_pending_clients: 0,
    total_clients: 0,
    monthly_revenue: 0,
    monthly_costs: 0,
    monthly_net_revenue: 0,
  }

  const currentMetrics = metrics || defaultMetrics

  // Mock data for initial empty state visualization
  const displayGrowth = growthData.length > 0 ? growthData : [
    { month: 'Jan', total_clients: 10, new_clients: 10 },
    { month: 'Fev', total_clients: 15, new_clients: 5 },
    { month: 'Mar', total_clients: 22, new_clients: 7 },
    { month: 'Abr', total_clients: 30, new_clients: 8 },
    { month: 'Mai', total_clients: 45, new_clients: 15 },
    { month: 'Jun', total_clients: 52, new_clients: 7 },
  ]

  // --- Filtering Logic ---
  let filteredClients = clientsList

  // Search Filter
  if (searchQuery.trim() !== '') {
    const q = searchQuery.toLowerCase()
    filteredClients = filteredClients.filter(c => 
      c.name.toLowerCase().includes(q) || 
      (c.phone && c.phone.includes(q))
    )
  }

  const today = new Date()
  today.setHours(0,0,0,0)
  const todayStr = today.toISOString().split('T')[0]
  
  const in15Days = new Date()
  in15Days.setDate(today.getDate() + 15)
  const in15DaysStr = in15Days.toISOString().split('T')[0]

  // 1. Filter by Status
  if (filterStatus === 'upcoming') {
    filteredClients = filteredClients.filter(c => c.due_date >= todayStr && c.due_date <= in15DaysStr)
  } else if (filterStatus === 'expired') {
    filteredClients = filteredClients.filter(c => c.due_date < todayStr)
  } else if (filterStatus === 'active') {
    filteredClients = filteredClients.filter(c => c.status === 'active')
  }

  // 2. Filter by Month
  if (filterMonth !== 'all') {
    filteredClients = filteredClients.filter(c => {
      if (!c.due_date) return false
      const month = c.due_date.split('-')[1]
      return month === filterMonth
    })
  }

  // 3. Filter by Service
  if (filterService !== 'all') {
    filteredClients = filteredClients.filter(c => 
      c.client_services?.some((cs: any) => cs.services?.id === filterService)
    )
  }

  // Pagination Logic
  const totalPages = Math.ceil(filteredClients.length / itemsPerPage) || 1
  if (currentPage > totalPages) setCurrentPage(1)
  
  const paginatedClients = filteredClients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const months = [
    { value: "01", label: "Janeiro" }, { value: "02", label: "Fevereiro" },
    { value: "03", label: "Março" }, { value: "04", label: "Abril" },
    { value: "05", label: "Maio" }, { value: "06", label: "Junho" },
    { value: "07", label: "Julho" }, { value: "08", label: "Agosto" },
    { value: "09", label: "Setembro" }, { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" }, { value: "12", label: "Dezembro" },
  ]

  const currentDateFormatted = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both pb-10">
      
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          {isLoading ? (
            <Skeleton className="h-10 w-64 mb-2" />
          ) : (
            <h1 className="text-3xl lg:text-4xl font-heading font-bold tracking-tight mb-1 text-foreground flex items-center gap-3">
              Olá, {userName} <span className="animate-wave origin-bottom-right inline-block">👋</span>
            </h1>
          )}
          {isLoading ? (
            <Skeleton className="h-5 w-48" />
          ) : (
            <p className="text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4" /> {currentDateFormatted.charAt(0).toUpperCase() + currentDateFormatted.slice(1)}
            </p>
          )}
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[140px] w-full rounded-xl" />
          ))
        ) : (
          <>
            <MetricCard
              title="Total de Clientes"
              value={currentMetrics.total_active_clients.toString()}
              icon={Users}
              colorVariant="blue"
              description={`${currentMetrics.total_inactive_clients} inativos | ${currentMetrics.total_pending_clients} pendentes`}
            />
            <MetricCard
              title="Receita Mensal Bruta"
              value={displayValue(formatCurrency(currentMetrics.monthly_revenue)) as string}
              icon={DollarSign}
              colorVariant="green"
            />
            <MetricCard
              title="Custo Mensal"
              value={displayValue(formatCurrency(currentMetrics.monthly_costs)) as string}
              icon={TrendingDown}
              colorVariant="red"
            />
            <MetricCard
              title="Lucro Líquido"
              value={displayValue(formatCurrency(currentMetrics.monthly_net_revenue)) as string}
              icon={TrendingUp}
              colorVariant="violet"
              description="Receita - Custo"
            />
            {/* Ganho do Dia Card com efeito Glow */}
            <div className="relative group rounded-xl bg-card text-card-foreground border border-emerald-500/20 overflow-hidden shadow-lg shadow-emerald-500/5 transition-all hover:shadow-emerald-500/10 hover:-translate-y-1">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
              
              <div className="p-6 relative z-10">
                <div className="flex items-center justify-between space-y-0 pb-2">
                  <p className="text-sm font-medium text-muted-foreground">Ganho do Dia</p>
                  <div className="p-2 rounded-lg transition-smooth text-emerald-500 bg-emerald-500/10">
                    <Activity className="h-5 w-5" />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-emerald-500 drop-shadow-sm">
                    {displayValue(formatCurrency(todayMetrics.net))}
                  </h2>
                  <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-border/50 text-xs">
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>Bruto:</span>
                      <span className="font-medium text-foreground">{displayValue(formatCurrency(todayMetrics.gross))}</span>
                    </div>
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>Despesa:</span>
                      <span className="font-medium text-red-400">{displayValue(formatCurrency(todayMetrics.cost))}</span>
                    </div>
                  </div>
                </div>
                <Activity className="absolute -bottom-4 -right-4 w-24 h-24 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-500" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Advanced Clients Table */}
      <div className="glass-card rounded-xl border border-border/50 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border/50">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                Gestão de Vencimentos
                {!isLoading && (
                  <Badge variant="secondary" className="bg-sky-500/10 text-sky-500">{filteredClients.length}</Badge>
                )}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">Monitore e gerencie os vencimentos rapidamente.</p>
            </div>
            
            {/* Search & Filters */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="relative w-full md:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar cliente..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-background/50 border-border/50 focus-visible:ring-sky-500"
                />
              </div>

              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? "all")}>
                <SelectTrigger className="w-[150px] bg-background/50 h-10 border-border/50">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upcoming">Próximos 15 dias</SelectItem>
                  <SelectItem value="expired">Vencidos</SelectItem>
                  <SelectItem value="active">Todos Ativos</SelectItem>
                  <SelectItem value="all">Todos os Status</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterMonth} onValueChange={(v) => setFilterMonth(v ?? "all")}>
                <SelectTrigger className="w-[140px] bg-background/50 h-10 border-border/50">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Qualquer Mês</SelectItem>
                  {months.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto min-h-[300px]">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Cliente</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Serviços</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right pr-6">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <Skeleton className="w-8 h-8 rounded-full" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    </TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                    <TableCell className="text-right pr-6"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : paginatedClients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-48 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Search className="w-8 h-8 text-muted-foreground/30 mb-2" />
                      <p>Nenhum cliente encontrado com estes filtros.</p>
                      {searchQuery && (
                        <Button variant="link" className="text-sky-500" onClick={() => setSearchQuery("")}>
                          Limpar pesquisa
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedClients.map((client) => {
                  const dueDate = new Date(client.due_date + "T00:00:00")
                  const isExpired = dueDate < today
                  const isToday = dueDate.getTime() === today.getTime()
                  const avatarColor = getAvatarColor(client.name)
                  
                  return (
                    <TableRow key={client.id} className="hover:bg-muted/30 group transition-colors">
                      <TableCell className="pl-6">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-sm"
                            style={{ backgroundColor: avatarColor }}
                          >
                            {getInitials(client.name)}
                          </div>
                          <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                            {client.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-muted-foreground">{dueDate.toLocaleDateString('pt-BR')}</span>
                          {isExpired ? (
                            <Badge variant="destructive" className="text-[10px] h-5 shadow-sm">Vencido</Badge>
                          ) : isToday ? (
                            <Badge variant="outline" className="text-[10px] h-5 bg-amber-500/10 text-amber-500 border-amber-500/20">Vence Hoje</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] h-5 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Em dia</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1.5 flex-wrap">
                          {client.client_services?.map((cs: any) => (
                            <Badge key={cs.services?.id} variant="secondary" className="text-[10px] bg-background border border-border/50 text-muted-foreground">
                              {cs.services?.name}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-emerald-500 font-medium">
                        {displayValue(formatCurrency(client.plan_value))}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10" title="Ativar Promoção" onClick={() => { setActionClient(client); setIsPromoDialogOpen(true); }}>
                            <Gift className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10" title="Renovar Assinatura" onClick={() => { setActionClient(client); setIsRenewDialogOpen(true); }}>
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted" title="Editar" onClick={() => { setEditingClient(client); setIsAddClientOpen(true); }}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Excluir" onClick={() => { setActionClient(client); setIsDeleteDialogOpen(true); }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Controls */}
        {!isLoading && totalPages > 1 && (
          <div className="p-4 border-t border-border/50 flex items-center justify-between bg-muted/5 text-sm">
            <p className="text-muted-foreground">
              Mostrando <span className="font-medium text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> a <span className="font-medium text-foreground">{Math.min(currentPage * itemsPerPage, filteredClients.length)}</span> de <span className="font-medium text-foreground">{filteredClients.length}</span> clientes
            </p>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-medium min-w-[80px] text-center">
                Pág {currentPage} de {totalPages}
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Growth Chart */}
        {isLoading ? (
          <Skeleton className="h-[300px] w-full rounded-xl" />
        ) : (
          <ChartCard 
            title="Crescimento de Clientes" 
            description="Evolução do número total de clientes ativos ao longo do tempo."
            className="col-span-1 shadow-sm"
          >
            <div className="h-[220px] w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={displayGrowth} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                  <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area 
                    type="monotone" 
                    dataKey="total_clients" 
                    name="Total de Clientes"
                    stroke="#8B5CF6" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorTotal)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        )}

        {/* Recent Activities */}
        {isLoading ? (
          <Skeleton className="h-[300px] w-full rounded-xl" />
        ) : (
          <div className="glass-card rounded-xl border border-border/50 col-span-1 flex flex-col shadow-sm">
            <div className="p-5 pb-3 border-b border-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Activity className="w-5 h-5 text-sky-500" />
                    Últimas Atividades
                  </h3>
                  <p className="text-sm text-muted-foreground mt-0.5">Renovações e ativações recentes</p>
                </div>
                <Badge variant="secondary" className="bg-sky-500/10 text-sky-500 text-xs shadow-sm">
                  {recentActivities.length} registros
                </Badge>
              </div>
            </div>
            
            <ScrollArea className="flex-1 max-h-[280px]">
              <div className="p-3 space-y-2">
                {recentActivities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                    <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
                      <Activity className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
                  </div>
                ) : (
                  recentActivities.map((activity: any, index: number) => {
                    const createdAt = new Date(activity.created_at)
                    const serviceNames = activity.clients?.client_services
                      ?.map((cs: any) => cs.services?.name)
                      .filter(Boolean)
                      .join(', ') || '—'
                    const isActivation = activity.type === 'activation'
                    
                    return (
                      <div 
                        key={activity.id}
                        className="group flex items-start gap-3 p-3 rounded-xl border border-border/30 bg-background/30 hover:bg-muted/40 hover:border-border/60 transition-all duration-200 animate-in fade-in slide-in-from-right-2"
                        style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
                      >
                        {/* Icon */}
                        <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 ${
                          isActivation 
                            ? 'bg-emerald-500/15 text-emerald-500' 
                            : 'bg-blue-500/15 text-blue-500'
                        }`}>
                          {isActivation 
                            ? <UserPlus className="w-4 h-4" />
                            : <RefreshCw className="w-4 h-4" />
                          }
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-foreground truncate">{activity.clients?.name || 'Cliente removido'}</span>
                            <Badge 
                              variant="outline" 
                              className={`text-[10px] h-[18px] px-1.5 border-0 font-medium ${
                                isActivation 
                                  ? 'bg-emerald-500/10 text-emerald-500' 
                                  : 'bg-blue-500/10 text-blue-500'
                              }`}
                            >
                              {isActivation ? 'Ativação' : 'Renovação'}
                            </Badge>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground font-medium">
                            {activity.clients?.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {activity.clients.phone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')}
                              </span>
                            )}
                            <span className="truncate max-w-[140px]" title={serviceNames}>{serviceNames}</span>
                          </div>
                        </div>
                        
                        {/* Value & Time */}
                        <div className="flex-shrink-0 text-right">
                          <div className="text-sm font-bold text-emerald-500">
                            {displayValue(formatCurrency(activity.amount_paid))}
                          </div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end mt-1 font-medium">
                            <Clock className="w-3 h-3" />
                            {createdAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}{' '}
                            {createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <ClientFormDialog 
        open={isAddClientOpen} 
        onOpenChange={(open) => {
          setIsAddClientOpen(open)
          if (!open) setTimeout(() => setEditingClient(null), 200)
        }} 
        client={editingClient}
        servicesList={servicesList}
        onSuccess={() => {
          loadDashboardData()
        }}
      />
      
      <RenewDialog open={isRenewDialogOpen} onOpenChange={setIsRenewDialogOpen} client={actionClient} onSuccess={loadDashboardData} />
      <PromoDialog open={isPromoDialogOpen} onOpenChange={setIsPromoDialogOpen} client={actionClient} onSuccess={loadDashboardData} />
      <DeleteDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen} client={actionClient} onSuccess={loadDashboardData} />
      
      <QuickAddServiceDialog 
        open={isAddServiceOpen} 
        onOpenChange={setIsAddServiceOpen}
        onSuccess={() => {
          const reload = async () => {
            const { data: servicesData } = await supabase.from('services').select('id, name, cost')
            if (servicesData) setServicesList(servicesData)
          }
          reload()
        }}
      />

      <WhatsAppStatusDialog 
        open={isWhatsAppStatusOpen}
        onOpenChange={setIsWhatsAppStatusOpen}
      />
    </div>
  )
}

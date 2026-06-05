"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Wallet, TrendingUp, TrendingDown, DollarSign, Loader2, ArrowUpRight, ArrowDownRight, Receipt, CalendarIcon, Search, FilterX, Download, AlertTriangle, Activity } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { MetricCard } from "@/components/metric-card"
import type { DashboardMetrics } from "@/types/database"
import { usePrivacy } from "@/hooks/use-privacy"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet"
import { ChartCard, CustomTooltip } from "@/components/chart-card"
import { ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area } from "recharts"
import type { ClientsByService } from "@/types/database"

export default function FinanceiroPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [upcomingPayments, setUpcomingPayments] = useState<any[]>([])
  const [serviceData, setServiceData] = useState<ClientsByService[]>([])
  const [nextMonthProjection, setNextMonthProjection] = useState(0)
  
  // Advanced CFO Metrics
  const [churnRate, setChurnRate] = useState(0)
  const [mrr, setMrr] = useState(0)
  const [overdueAmount, setOverdueAmount] = useState(0)
  const [annualCashflow, setAnnualCashflow] = useState<any[]>([])
  const [detailedCosts, setDetailedCosts] = useState<any[]>([])
  // Report states
  const [reportPayments, setReportPayments] = useState<any[]>([])
  const [filterType, setFilterType] = useState<"month" | "custom">("month")
  const [reportMonth, setReportMonth] = useState<string>((new Date().getMonth() + 1).toString().padStart(2, '0'))
  const [reportYear, setReportYear] = useState<string>(new Date().getFullYear().toString())
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")
  const [isReportLoading, setIsReportLoading] = useState(false)

  const { displayValue } = usePrivacy()
  const supabase = createClient()

  useEffect(() => {
    async function loadFinancials() {
      setIsLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // 1. Get base metrics
        const { data: metricsData } = await supabase.rpc('get_dashboard_metrics')
        if (metricsData && metricsData.length > 0) {
          setMetrics(metricsData[0])
        }

        // 2. Calculate upcoming payments (Next 15 days)
        const today = new Date()
        const todayStr = today.toISOString().split('T')[0]
        
        const in15Days = new Date()
        in15Days.setDate(today.getDate() + 15)
        const in15DaysStr = in15Days.toISOString().split('T')[0]

        const { data: upcomingData } = await supabase
          .from('clients')
          .select('id, name, due_date, plan_value, status')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .gte('due_date', todayStr)
          .lte('due_date', in15DaysStr)
          .order('due_date', { ascending: true })

        if (upcomingData) {
          setUpcomingPayments(upcomingData)
        }

        // 3. Calculate next month projection (smart active clients)
        const { data: allActiveClients } = await supabase
          .from('clients')
          .select(`
            plan_value, screens, due_date,
            client_services ( services ( cost ) )
          `)
          .eq('user_id', user.id)
          .eq('status', 'active')

        if (allActiveClients) {
           let projectedNet = 0
           const todayDate = new Date()
           // Pega o último dia do mês que vem
           const endOfNextMonth = new Date(todayDate.getFullYear(), todayDate.getMonth() + 2, 0)

           allActiveClients.forEach(c => {
              let willPayNextMonth = true
              if (c.due_date) {
                const dueDate = new Date(c.due_date)
                // Se a data de vencimento atual for APÓS o final do mês que vem, 
                // o cliente já está adiantado e não pagará nada no mês que vem.
                if (dueDate > endOfNextMonth) {
                  willPayNextMonth = false
                }
              }

              if (willPayNextMonth) {
                const screens = c.screens || 1
                const servicesCost = c.client_services?.reduce((acc: number, cs: any) => acc + (cs.services?.cost || 0), 0) || 0
                const totalCost = servicesCost * screens
                projectedNet += (c.plan_value - totalCost)
              }
           })
           setNextMonthProjection(projectedNet)
        }

        // 4. Fetch service distribution
        const { data: services, error: servicesErr } = await supabase.rpc('get_clients_by_service')
        if (!servicesErr && services) {
          setServiceData(services)
        }

        // --- ADDED CFO METRICS START ---
        const { data: allClientsForMetrics } = await supabase
          .from('clients')
          .select(`plan_value, screens, due_date, status, created_at, client_services( services( id, name, cost ) )`)
          .eq('user_id', user.id)

        if (allClientsForMetrics) {
           const active = allClientsForMetrics.filter(c => c.status === 'active')
           const inactive = allClientsForMetrics.filter(c => c.status === 'inactive')
           const vencido = allClientsForMetrics.filter(c => c.status === 'vencido')
           
           let currentMrr = 0
           let currentOverdue = 0
           const startOfToday = new Date()
           startOfToday.setHours(0,0,0,0)

           const costsMap: Record<string, {name: string, total: number, qty: number}> = {}

           // MRR apenas de ativos
           active.forEach(c => {
             currentMrr += (c.plan_value || 0)
             // Um cliente 'active' pode estar com data de ontem (se o robô não rodou ainda)
             if (c.due_date) {
               const dueDate = new Date(c.due_date + "T00:00:00")
               if (dueDate < startOfToday) {
                 currentOverdue += c.plan_value || 0
               }
             }
           })

           // Inadimplência soma todos os vencidos
           vencido.forEach(c => {
             currentOverdue += (c.plan_value || 0)
           })

           // Custos operacionais: ativos + vencidos (ainda não foram desativados)
           const activeOrVencido = [...active, ...vencido]
           activeOrVencido.forEach(c => {
             const screens = c.screens || 1
             c.client_services?.forEach((cs: any) => {
               if (cs.services) {
                 const sId = cs.services.id
                 if (!costsMap[sId]) costsMap[sId] = { name: cs.services.name, total: 0, qty: 0 }
                 const cost = cs.services.cost || 0
                 costsMap[sId].total += (cost * screens)
                 costsMap[sId].qty += screens
               }
             })
           })
           
           setMrr(currentMrr)
           setOverdueAmount(currentOverdue)
           setDetailedCosts(Object.values(costsMap).sort((a,b) => b.total - a.total))

           // Taxa de Churn: Inativos / Total da Carteira (Ativos + Vencidos + Inativos)
           const total = active.length + inactive.length + vencido.length
           setChurnRate(total > 0 ? (inactive.length / total) * 100 : 0)
        }

        const firstDayOfYear = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0]
        const { data: allYearPayments } = await supabase
          .from('payments')
          .select('amount_paid, net_profit, created_at')
          .eq('user_id', user.id)
          .gte('created_at', firstDayOfYear + "T00:00:00")
        
        if (allYearPayments) {
           const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
           const monthlyData = months.map(m => ({ name: m, Receita: 0, Lucro: 0 }))
           
           allYearPayments.forEach(p => {
             const date = new Date(p.created_at)
             const mIdx = date.getMonth()
             monthlyData[mIdx].Receita += Number(p.amount_paid || 0)
             monthlyData[mIdx].Lucro += Number(p.net_profit || 0)
           })
           
           const currentMonthIdx = today.getMonth()
           setAnnualCashflow(monthlyData.slice(0, currentMonthIdx + 1))
        }
        // --- ADDED CFO METRICS END ---

        // 5. Default dates for report
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
        setStartDate(firstDay.toISOString().split('T')[0])
        setEndDate(todayStr)

      } catch (error) {
        console.error("Error loading financial data", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadFinancials()
  }, [supabase])

  const loadReport = async () => {
    setIsReportLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      let query = supabase
        .from('payments')
        .select(`
          id, amount_paid, net_profit, created_at, months_renewed,
          clients(name)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (filterType === 'month') {
        const y = Number(reportYear)
        const m = Number(reportMonth)
        const firstDay = new Date(y, m - 1, 1)
        const lastDay = new Date(y, m, 0)
        query = query.gte('created_at', firstDay.toISOString().split('T')[0] + "T00:00:00")
        query = query.lte('created_at', lastDay.toISOString().split('T')[0] + "T23:59:59")
      } else {
        if (startDate) {
          query = query.gte('created_at', startDate + "T00:00:00")
        }
        if (endDate) {
          query = query.lte('created_at', endDate + "T23:59:59")
        }
      }

      const { data } = await query
      if (data) setReportPayments(data)
    } catch (e) {
      console.error(e)
    } finally {
      setIsReportLoading(false)
    }
  }

  const handleClearFilter = () => {
    setFilterType('month')
    const today = new Date()
    setReportMonth((today.getMonth() + 1).toString().padStart(2, '0'))
    setReportYear(today.getFullYear().toString())
    setStartDate(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0])
    setEndDate(today.toISOString().split('T')[0])
    setTimeout(loadReport, 50)
  }

  // Effect to load report when default dates are set initially
  useEffect(() => {
    if (startDate && endDate) {
      loadReport()
    }
  }, [startDate]) // Run only when startDate is set by loadFinancials

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">Calculando balanço financeiro...</p>
      </div>
    )
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

  const m = metrics || defaultMetrics

  // Calculate profit margin
  const marginPercentage = m.monthly_revenue > 0 
    ? ((m.monthly_net_revenue / m.monthly_revenue) * 100).toFixed(1) 
    : 0

  const COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899']
  
  const displayServices = serviceData.length > 0 ? serviceData : [
    { service_name: 'Sem serviços cadastrados', client_count: 1 }
  ]

  // Report Totals
  const reportRevenue = reportPayments.reduce((acc, p) => acc + Number(p.amount_paid || 0), 0)
  const reportNetProfit = reportPayments.reduce((acc, p) => acc + Number(p.net_profit || 0), 0)
  const reportCosts = reportRevenue - reportNetProfit

  // Financial comparison data for bar chart
  const financialData = [
    { name: 'Receita', valor: reportRevenue, fill: '#10B981' },
    { name: 'Custo', valor: reportCosts, fill: '#EF4444' },
    { name: 'Lucro Líquido', valor: reportNetProfit, fill: '#8B5CF6' }
  ]

  const arr = mrr * 12

  const handleExportCSV = () => {
    if (reportPayments.length === 0) return

    const headers = ["Data", "Cliente", "Tipo", "Recebido", "Lucro Liquido"]
    
    const rows = reportPayments.map(p => {
      const date = new Date(p.created_at)
      const dateStr = `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      const clientName = p.clients?.name || 'Desconhecido'
      const type = p.amount_paid === 0 ? 'Promoção' : 'Pagamento'
      return [
        `"${dateStr}"`,
        `"${clientName}"`,
        `"${type}"`,
        p.amount_paid,
        p.net_profit
      ].join(",")
    })

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `relatorio_financeiro.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight mb-2 flex items-center gap-2">
            <Wallet className="w-8 h-8 text-sky-500" />
            Balanço Financeiro
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">Visão detalhada do faturamento, custos e projeções de entrada de caixa.</p>
        </div>

        {/* Global Filters */}
        <div className="flex flex-wrap items-end gap-2 bg-muted/20 p-3 rounded-lg border border-border/50 shadow-sm">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground font-medium">Período de Filtro</Label>
            <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
              <SelectTrigger className="h-9 w-[130px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Mês / Ano</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filterType === 'month' ? (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground font-medium">Mês</Label>
                <Select value={reportMonth} onValueChange={(v) => setReportMonth(v ?? "")}>
                  <SelectTrigger className="h-9 w-[130px] bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="01">Janeiro</SelectItem>
                    <SelectItem value="02">Fevereiro</SelectItem>
                    <SelectItem value="03">Março</SelectItem>
                    <SelectItem value="04">Abril</SelectItem>
                    <SelectItem value="05">Maio</SelectItem>
                    <SelectItem value="06">Junho</SelectItem>
                    <SelectItem value="07">Julho</SelectItem>
                    <SelectItem value="08">Agosto</SelectItem>
                    <SelectItem value="09">Setembro</SelectItem>
                    <SelectItem value="10">Outubro</SelectItem>
                    <SelectItem value="11">Novembro</SelectItem>
                    <SelectItem value="12">Dezembro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground font-medium">Ano</Label>
                <Select value={reportYear} onValueChange={(v) => setReportYear(v ?? "")}>
                  <SelectTrigger className="h-9 w-[90px] bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2024">2024</SelectItem>
                    <SelectItem value="2025">2025</SelectItem>
                    <SelectItem value="2026">2026</SelectItem>
                    <SelectItem value="2027">2027</SelectItem>
                    <SelectItem value="2028">2028</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground font-medium">Início</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 w-[130px] bg-background"/>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground font-medium">Fim</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 w-[130px] bg-background"/>
              </div>
            </>
          )}
          
          <Button onClick={loadReport} disabled={isReportLoading} className="h-9 gap-2 ml-1 bg-primary text-primary-foreground">
            {isReportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Aplicar Filtro
          </Button>
          <Button onClick={handleExportCSV} disabled={reportPayments.length === 0} variant="secondary" className="h-9 gap-2 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/20">
            <Download className="w-4 h-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Growth & Scale KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {/* MRR */}
        <Card className="glass-card overflow-hidden relative group border-sky-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between pb-2">
              <p className="text-sm font-medium text-sky-500">MRR (Recorrente Mensal)</p>
              <div className="p-2 rounded-lg bg-sky-500/10 text-sky-500">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground truncate" title={formatCurrency(mrr)}>
                {displayValue(formatCurrency(mrr))}
              </h2>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                Receita Base Projetada
              </p>
            </div>
            <TrendingUp className="absolute -bottom-4 -right-4 w-32 h-32 opacity-5 pointer-events-none text-sky-500 group-hover:scale-110 transition-transform duration-500" />
          </CardContent>
        </Card>

        {/* ARR */}
        <Card className="glass-card overflow-hidden relative group">
          <CardContent className="p-6">
            <div className="flex items-center justify-between pb-2">
              <p className="text-sm font-medium text-muted-foreground">ARR (Recorrente Anual)</p>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                <Activity className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground truncate" title={formatCurrency(arr)}>
                {displayValue(formatCurrency(arr))}
              </h2>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                Valuation e Escala
              </p>
            </div>
            <Activity className="absolute -bottom-4 -right-4 w-32 h-32 opacity-5 pointer-events-none text-emerald-500 group-hover:scale-110 transition-transform duration-500" />
          </CardContent>
        </Card>

        {/* Overdue */}
        <Card className="glass-card overflow-hidden relative group border-red-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between pb-2">
              <p className="text-sm font-medium text-red-500">Inadimplência (Atrasos)</p>
              <div className="p-2 rounded-lg bg-red-500/10 text-red-500">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground truncate" title={formatCurrency(overdueAmount)}>
                {displayValue(formatCurrency(overdueAmount))}
              </h2>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                Faturas vencidas no passado
              </p>
            </div>
            <AlertTriangle className="absolute -bottom-4 -right-4 w-32 h-32 opacity-5 pointer-events-none text-red-500 group-hover:scale-110 transition-transform duration-500" />
          </CardContent>
        </Card>

        {/* Churn */}
        <Card className="glass-card overflow-hidden relative group">
          <CardContent className="p-6">
            <div className="flex items-center justify-between pb-2">
              <p className="text-sm font-medium text-muted-foreground">Taxa de Churn (Evasão)</p>
              <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500">
                <TrendingDown className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground truncate" title={`${churnRate.toFixed(1)}%`}>
                {displayValue(`${churnRate.toFixed(1)}%`)}
              </h2>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                Proporção de cancelamentos
              </p>
            </div>
            <TrendingDown className="absolute -bottom-4 -right-4 w-32 h-32 opacity-5 pointer-events-none text-orange-500 group-hover:scale-110 transition-transform duration-500" />
          </CardContent>
        </Card>
      </div>

      {/* Operational Financial KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="glass-card overflow-hidden relative group">
          <CardContent className="p-6">
            <div className="flex items-center justify-between pb-2">
              <p className="text-sm font-medium text-muted-foreground">Faturamento Bruto (Filtrado)</p>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                <ArrowUpRight className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground truncate" title={formatCurrency(reportRevenue)}>
                {displayValue(formatCurrency(reportRevenue))}
              </h2>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                De {reportPayments.length} pagamentos no período
              </p>
            </div>
            <ArrowUpRight className="absolute -bottom-4 -right-4 w-32 h-32 opacity-5 pointer-events-none text-emerald-500 group-hover:scale-110 transition-transform duration-500" />
          </CardContent>
        </Card>

        <Card className="glass-card overflow-hidden relative group transition-colors">
          <CardContent className="p-6">
            <div className="flex items-center justify-between pb-2">
              <p className="text-sm font-medium text-muted-foreground">Custos Operacionais (Filtrado)</p>
              <div className="p-2 rounded-lg bg-red-500/10 text-red-500">
                <ArrowDownRight className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground truncate" title={formatCurrency(reportCosts)}>
                {displayValue(formatCurrency(reportCosts))}
              </h2>
              <Sheet>
                <SheetTrigger className="p-0 h-auto text-xs text-red-500 font-medium mt-2 hover:underline bg-transparent border-none cursor-pointer flex items-center">
                  Clique para ver Detalhamento Completo →
                </SheetTrigger>
                <SheetContent className="overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>Detalhamento de Custos Base</SheetTitle>
                    <SheetDescription>
                      Abaixo está a distribuição exata dos seus custos operacionais baseados nos seus clientes ativos. Estes custos refletem a base de cálculo mensal.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-8 space-y-4">
                    {detailedCosts.map((dc, i) => (
                      <div key={i} className="flex justify-between items-center p-3 border border-border/50 bg-muted/20 rounded-lg">
                        <div>
                          <p className="font-medium text-sm text-foreground">{dc.name}</p>
                          <p className="text-xs text-muted-foreground">{dc.qty} pacote(s) ativo(s)</p>
                        </div>
                        <p className="font-bold text-red-500 dark:text-red-400">{formatCurrency(dc.total)}</p>
                      </div>
                    ))}
                    {detailedCosts.length === 0 && (
                      <div className="text-center py-6 text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
                        Nenhum custo base registrado.
                      </div>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            <ArrowDownRight className="absolute -bottom-4 -right-4 w-32 h-32 opacity-5 pointer-events-none text-red-500 group-hover:scale-110 transition-transform duration-500" />
          </CardContent>
        </Card>

        <Card className="glass-card overflow-hidden relative group">
          <CardContent className="p-6">
            <div className="flex items-center justify-between pb-2">
              <p className="text-sm font-medium text-violet-500 dark:text-violet-400">Lucro Líquido (Filtrado)</p>
              <div className="p-2 rounded-lg bg-violet-500/10 text-violet-500 dark:text-violet-400">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground truncate" title={formatCurrency(reportNetProfit)}>
                {displayValue(formatCurrency(reportNetProfit))}
              </h2>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="border-sky-500/50 text-sky-500 bg-sky-500/10">
                  Margem: {reportRevenue > 0 ? ((reportNetProfit / reportRevenue) * 100).toFixed(1) : 0}%
                </Badge>
              </div>
            </div>
            <DollarSign className="absolute -bottom-4 -right-4 w-32 h-32 opacity-5 pointer-events-none text-violet-500 dark:text-violet-400 group-hover:scale-110 transition-transform duration-500" />
          </CardContent>
        </Card>

        <Card className="glass-card overflow-hidden relative group border-blue-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between pb-2">
              <p className="text-sm font-medium text-blue-500">Projeção Líquida (Próx. Mês)</p>
              <div className="p-2 rounded-lg bg-blue-500/20 text-blue-500">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground truncate" title={formatCurrency(nextMonthProjection)}>
                {displayValue(formatCurrency(nextMonthProjection))}
              </h2>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                Baseado nos clientes ativos atuais
              </p>
            </div>
            <TrendingUp className="absolute -bottom-4 -right-4 w-32 h-32 opacity-5 pointer-events-none text-blue-500 group-hover:scale-110 transition-transform duration-500" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Projeção de Entradas - Próximos Vencimentos */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-emerald-500" />
              Entradas Previstas (Próximos 15 dias)
            </CardTitle>
            <CardDescription>
              Faturas de clientes que estão prestes a vencer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingPayments.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                  <TrendingUp className="w-6 h-6 text-emerald-500" />
                </div>
                <p className="text-muted-foreground">Nenhuma fatura pendente para os próximos 15 dias.</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[300px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Valor a Receber</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcomingPayments.map((payment) => {
                      const dueDate = new Date(payment.due_date + "T00:00:00")
                      const today = new Date()
                      today.setHours(0,0,0,0)
                      
                      let badgeText = ""
                      let badgeClass = ""
                      
                      if (dueDate.getTime() === today.getTime()) {
                        badgeText = "Hoje"
                        badgeClass = "bg-amber-500/10 text-amber-500 border-amber-500/20"
                      } else {
                        const diffTime = Math.abs(dueDate.getTime() - today.getTime())
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
                        badgeText = `${diffDays} dia(s)`
                        badgeClass = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                      }

                      return (
                        <TableRow key={payment.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium truncate max-w-[120px]">{payment.name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 flex-wrap">
                              {dueDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                              <Badge variant="outline" className={`text-[10px] h-5 ${badgeClass}`}>{badgeText}</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-emerald-400 font-medium">
                            {displayValue(formatCurrency(payment.plan_value))}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resumo de Metricas Secundarias */}
        <Card className="glass-card flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-red-500" />
              Análise de Saúde do Negócio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Margem de Lucro</span>
                <span className="font-medium text-violet-500 dark:text-violet-400">{marginPercentage}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-violet-500 h-2 rounded-full" style={{ width: `${Math.min(Number(marginPercentage), 100)}%` }}></div>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-border/50">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                  <span className="text-sm font-medium">Lucro Bruto</span>
                </div>
                <span className="font-bold">{displayValue(formatCurrency(reportRevenue))}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span className="text-sm font-medium">Custo Operacional</span>
                </div>
                <span className="font-bold text-red-400">-{displayValue(formatCurrency(reportCosts))}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border/50">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-violet-500"></div>
                  <span className="text-sm font-medium text-violet-500 dark:text-violet-400">Resultado Final</span>
                </div>
                <span className="font-bold text-violet-500 dark:text-violet-400 text-lg">{displayValue(formatCurrency(reportNetProfit))}</span>
              </div>
            </div>
            
            <div className="mt-6 bg-sky-500/10 p-4 rounded-lg border border-sky-500/20">
              <p className="text-xs text-sky-500/80">
                <strong className="text-sky-500 block mb-1">Dica de Gestão:</strong>
                Mantenha sua margem de lucro sempre acima de 30% para garantir a sustentabilidade do negócio a longo prazo. Monitore constantemente clientes inativos.
              </p>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Relatório de Ganhos Detalhado */}
      <Card className="glass-card">
        <CardHeader className="pb-3 border-b border-border/50">
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5 text-emerald-500" />
                Planilha de Ganhos Filtrados
              </CardTitle>
              <CardDescription>
                Abaixo estão todos os pagamentos individuais efetuados no período que você filtrou lá no topo.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
             <div className="p-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium mb-1">Total Recebido</p>
                <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                   {displayValue(formatCurrency(reportRevenue))}
                </h3>
             </div>
             <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/5">
                <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-1">Total de Custos</p>
                <h3 className="text-2xl font-bold text-red-600 dark:text-red-400">
                   -{displayValue(formatCurrency(reportCosts))}
                </h3>
             </div>
             <div className="p-4 rounded-lg border border-violet-500/20 bg-violet-500/5">
                <p className="text-sm text-violet-500 dark:text-violet-400 font-medium mb-1">Lucro Líquido</p>
                <h3 className="text-2xl font-bold text-violet-500 dark:text-violet-400">
                   {displayValue(formatCurrency(reportNetProfit))}
                </h3>
             </div>
          </div>

          {reportPayments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg bg-muted/10">
               Nenhum ganho registrado neste período.
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Recebido</TableHead>
                    <TableHead className="text-right">Lucro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportPayments.map((p) => {
                     const date = new Date(p.created_at)
                     return (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm">
                          {date.toLocaleDateString('pt-BR')} {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                        <TableCell className="font-medium">
                          {p.clients?.name || 'Desconhecido'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {p.amount_paid === 0 ? 'Promoção' : 'Pagamento'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-emerald-500">
                          {displayValue(formatCurrency(p.amount_paid))}
                        </TableCell>
                        <TableCell className="text-right text-violet-500 dark:text-violet-400 font-medium">
                          {displayValue(formatCurrency(p.net_profit))}
                        </TableCell>
                      </TableRow>
                     )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Financial Comparison Chart */}
        <ChartCard 
          title="Evolução de Caixa Anual" 
          description="Acompanhamento mês a mês de Receita Bruta e Lucro Líquido."
        >
          <div className="h-[300px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={annualCashflow} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorLucro" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `R$ ${value}`} />
                <Tooltip content={<CustomTooltip formatter={(val: number) => displayValue(formatCurrency(val))} />} cursor={{ stroke: 'var(--muted)', strokeWidth: 1, strokeDasharray: '3 3' }} />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Area type="monotone" dataKey="Receita" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorReceita)" />
                <Area type="monotone" dataKey="Lucro" stroke="#8B5CF6" strokeWidth={2} fillOpacity={1} fill="url(#colorLucro)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Services Distribution Chart */}
        <ChartCard 
          title="Distribuição por Serviços" 
          description="Quais serviços seus clientes mais contratam."
        >
          <div className="h-[300px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={displayServices}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={110}
                  paddingAngle={5}
                  dataKey="client_count"
                  nameKey="service_name"
                  stroke="none"
                >
                  {displayServices.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
    </div>
  )
}

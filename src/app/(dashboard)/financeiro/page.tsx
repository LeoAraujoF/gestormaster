"use client"

import { useEffect, useState, useCallback, useMemo, type ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import { differenceInCalendarDays, subDays } from "date-fns"
import { createClient } from "@/lib/supabase/client"
import { FileSpreadsheet, FileText, Loader2, WalletCards } from "lucide-react"
import { formatCurrency, cn } from "@/lib/utils"
import type { DashboardMetrics, ClientsByService, PixCharge, PixChargeMetrics } from "@/types/database"
import type { ExecutiveDashboardDTO, ExecutivePeriod } from "@/lib/executive-metrics"
import { usePrivacy } from "@/hooks/use-privacy"
import { FixedCostsSection } from "@/components/fixed-costs-section"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line } from "recharts"
import { usePlanCapability } from "@/components/providers/plan-provider"
import { useOrganization } from "@/components/providers/organization-provider"
import { PageHeaderCard, PageShell, ResponsiveDataView } from "@/components/page-layout"
import { toast } from "sonner"
import { FinancialPlanningOverview } from "./financial-planning-overview"
import { FinancialReportCharts } from "./financial-report-charts"
import { FinancialReportFilters, currentMonthFinancialReportFilters } from "./financial-report-filters"
import { financialReportFiltersSchema } from "./financial-report-schema"
import { FinancialReportsTable } from "./financial-reports-table"
import { exportFinancialReportToExcel, exportFinancialReportToPdf } from "./financial-report-exports"
import {
  filterFinancialReportPayments,
  financialReportPaymentMethods,
  financialReportServiceOptions,
  summarizeFinancialReport,
  type FinancialReportFilters as FinancialReportFiltersValue,
  type FinancialReportPayment,
} from "./financial-report-types"

type AnnualCashflowItem = { name: string; Receita: number; Lucro: number }

function dateFromInput(value: string, endOfDay = false) {
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  if (endOfDay) date.setHours(23, 59, 59, 999)
  else date.setHours(0, 0, 0, 0)
  return date
}

function formatInputDate(value: string) {
  return dateFromInput(value).toLocaleDateString("pt-BR")
}

function filtersFromSearchParams(searchParams: URLSearchParams): FinancialReportFiltersValue {
  const defaults = currentMonthFinancialReportFilters()
  const candidate = {
    from: searchParams.get("from") || defaults.from,
    to: searchParams.get("to") || defaults.to,
    shortcut: searchParams.get("period") || defaults.shortcut,
    status: searchParams.get("status") || defaults.status,
    paymentMethod: searchParams.get("payment") || defaults.paymentMethod,
    service: searchParams.get("service") || defaults.service,
    search: searchParams.get("search") || defaults.search,
  }
  const parsed = financialReportFiltersSchema.safeParse(candidate)
  return parsed.success ? parsed.data : defaults
}

const pixStatusLabels: Record<PixCharge["status"], string> = {
  paid: "Pago",
  pending: "Pendente",
  expired: "Expirado",
  cancelled: "Cancelado",
  failed: "Falhou",
}

export default function FinanceiroPage() {
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(true)
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [upcoming7d, setUpcoming7d] = useState<{ count: number; total: number }>({ count: 0, total: 0 })
  const [serviceData, setServiceData] = useState<ClientsByService[]>([])
  const [basicOverdue, setBasicOverdue] = useState({ count: 0, total: 0 })
  const [annualCashflow, setAnnualCashflow] = useState<AnnualCashflowItem[]>([])
  const [monthlyGoal, setMonthlyGoal] = useState<number | null>(null)
  const [monthlyReceived, setMonthlyReceived] = useState<number | null>(null)
  const [isGoalLoading, setIsGoalLoading] = useState(true)
  const [hasGoalError, setHasGoalError] = useState(false)
  const [isSavingGoal, setIsSavingGoal] = useState(false)
  const [hasFinancialError, setHasFinancialError] = useState(false)

  const [reportFilters, setReportFilters] = useState<FinancialReportFiltersValue>(() => filtersFromSearchParams(searchParams))
  const [reportPayments, setReportPayments] = useState<FinancialReportPayment[]>([])
  const [previousReportPayments, setPreviousReportPayments] = useState<FinancialReportPayment[]>([])
  const [isReportLoading, setIsReportLoading] = useState(false)
  const [hasReportError, setHasReportError] = useState(false)
  const [exportingFormat, setExportingFormat] = useState<"pdf" | "excel" | null>(null)
  const [pixMetrics, setPixMetrics] = useState<PixChargeMetrics | null>(null)
  const [pixCharges, setPixCharges] = useState<PixCharge[]>([])
  const [pixMigrationRequired, setPixMigrationRequired] = useState(false)
  const [, setExecutive] = useState<ExecutiveDashboardDTO | null>(null)
  const executivePeriod: ExecutivePeriod = "month"
  const [upgradeRequired, setUpgradeRequired] = useState(false)

  const { displayValue } = usePrivacy()
  const hasAdvancedFinance = usePlanCapability('finance_advanced')
  const { organizationId, role, isLoading: isOrganizationLoading } = useOrganization()
  const supabase = useMemo(() => createClient(), [])
  const canEditGoal = role === "owner" || role === "admin"

  useEffect(() => {
    if (isOrganizationLoading) return

    if (!organizationId) return

    let active = true
    async function loadMonthlyGoal() {
      setIsGoalLoading(true)
      const { data, error } = await supabase
        .from("organizations")
        .select("monthly_goal")
        .eq("id", organizationId)
        .maybeSingle()

      if (!active) return
      if (error || data?.monthly_goal === null || data?.monthly_goal === undefined) {
        setMonthlyGoal(null)
        setHasGoalError(true)
      } else {
        setMonthlyGoal(Number(data.monthly_goal))
        setHasGoalError(false)
      }
      setIsGoalLoading(false)
    }

    void loadMonthlyGoal()
    return () => { active = false }
  }, [isOrganizationLoading, organizationId, supabase])

  const saveMonthlyGoal = useCallback(async (value: number) => {
    if (!canEditGoal) {
      toast.error("Somente administradores podem alterar a meta mensal.")
      return false
    }

    setIsSavingGoal(true)
    const { error } = await supabase.rpc("update_monthly_goal", { new_goal: value })
    setIsSavingGoal(false)

    if (error) {
      toast.error("Não foi possível atualizar a meta agora.")
      return false
    }

    setMonthlyGoal(value)
    setHasGoalError(false)
    toast.success("Meta mensal atualizada.")
    return true
  }, [canEditGoal, supabase])

  useEffect(() => {
    async function loadFinancials() {
      setIsLoading(true)
      setHasFinancialError(false)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        if (hasAdvancedFinance) {
          const executiveResponse = await fetch(`/api/executive-dashboard?period=${executivePeriod}`)
          const executivePayload = await executiveResponse.json()
          if (executiveResponse.ok) {
            const executiveData = executivePayload as ExecutiveDashboardDTO
            setExecutive(executiveData)
            setUpgradeRequired(false)
          } else if (executiveResponse.status === 403 && executivePayload.upgrade_required) {
            setExecutive(null)
            setUpgradeRequired(true)
          }
        } else {
          setExecutive(null)
          setUpgradeRequired(true)
        }

        const { data: metricsData, error: metricsError } = await supabase.rpc('get_dashboard_metrics')
        if (metricsError) setHasFinancialError(true)
        if (metricsData && metricsData.length > 0) setMetrics(metricsData[0])

        // A receber (7 dias): clientes ativos que vencem na semana
        const today = new Date()
        const todayStr = today.toISOString().split('T')[0]
        const in7 = new Date()
        in7.setDate(today.getDate() + 7)
        const { data: upcomingData } = await supabase
          .from('clients')
          .select('plan_value')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .gte('due_date', todayStr)
          .lte('due_date', in7.toISOString().split('T')[0])
        if (upcomingData) {
          setUpcoming7d({
            count: upcomingData.length,
            total: upcomingData.reduce((acc, c) => acc + (c.plan_value || 0), 0),
          })
        }

        const { data: overdueData } = await supabase
          .from('clients')
          .select('plan_value')
          .eq('user_id', user.id)
          .eq('status', 'vencido')
        if (overdueData) {
          const total = overdueData.reduce((acc, client) => acc + Number(client.plan_value || 0), 0)
          setBasicOverdue({ count: overdueData.length, total })
        }

        // Distribuição por serviços
        if (hasAdvancedFinance) {
          const { data: services } = await supabase.rpc('get_clients_by_service')
          if (services) setServiceData(services)
        }

        // Evolução anual (linha, sem gradiente)
        const firstDayOfYear = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0]
        const { data: allYearPayments } = hasAdvancedFinance ? await supabase
          .from('payments')
          .select('amount_paid, net_profit, created_at')
          .eq('user_id', user.id)
          .gte('created_at', firstDayOfYear + "T00:00:00") : { data: null }
        if (hasAdvancedFinance && allYearPayments) {
          const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
          const monthlyData = months.map((m) => ({ name: m, Receita: 0, Lucro: 0 }))
          allYearPayments.forEach((p) => {
            const mIdx = new Date(p.created_at).getMonth()
            monthlyData[mIdx].Receita += Number(p.amount_paid || 0)
            monthlyData[mIdx].Lucro += Number(p.net_profit || 0)
          })
          setAnnualCashflow(monthlyData.slice(0, today.getMonth() + 1))
        }

        // PIX ledger (Fase 1)
        try {
          const pixRes = await fetch("/api/pix/charges?limit=30&metrics=1")
          if (pixRes.ok) {
            const pixData = await pixRes.json()
            if (pixData.metrics) setPixMetrics(pixData.metrics as PixChargeMetrics)
            if (Array.isArray(pixData.charges)) setPixCharges(pixData.charges as PixCharge[])
            if (pixData.migration_required) setPixMigrationRequired(true)
          }
        } catch {
          /* ignore */
        }
      } catch (error) {
        console.error("Error loading financial data", error)
        setHasFinancialError(true)
      } finally {
        setIsLoading(false)
      }
    }
    loadFinancials()
  }, [supabase, executivePeriod, hasAdvancedFinance])

  // Período segmentado → intervalo de datas
  const loadReport = useCallback(async (
    from: FinancialReportFiltersValue["from"],
    to: FinancialReportFiltersValue["to"],
    shortcut: FinancialReportFiltersValue["shortcut"],
  ) => {
    setIsReportLoading(true)
    setHasReportError(false)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const start = dateFromInput(from)
      const end = dateFromInput(to, true)
      const periodDays = differenceInCalendarDays(dateFromInput(to), start) + 1
      const previousEnd = subDays(start, 1)
      previousEnd.setHours(23, 59, 59, 999)
      const previousStart = subDays(previousEnd, periodDays - 1)
      previousStart.setHours(0, 0, 0, 0)
      const { data, error } = await supabase
        .from('payments')
        .select(hasAdvancedFinance
          ? `id, client_id, amount_paid, net_profit, payment_method, paid_at, created_at, clients(id, name, status, created_at, client_services(services(id, name)))`
          : `id, client_id, amount_paid, payment_method, paid_at, created_at, clients(id, name, status, created_at, client_services(services(id, name)))`)
        .eq('user_id', user.id)
        .gte('created_at', previousStart.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false })
      if (error) {
        setHasReportError(true)
      } else if (data) {
        const allPayments = data as unknown as FinancialReportPayment[]
        const payments = allPayments.filter((payment) => new Date(payment.created_at) >= start)
        const previousPayments = allPayments.filter((payment) => new Date(payment.created_at) < start)
        setReportPayments(payments)
        setPreviousReportPayments(previousPayments)
        if (shortcut === "month") {
          setMonthlyReceived(payments.reduce((total, payment) => total + Number(payment.amount_paid || 0), 0))
        }
      }
    } catch (e) {
      console.error(e)
      setHasReportError(true)
    } finally {
      setIsReportLoading(false)
    }
  }, [supabase, hasAdvancedFinance])

  useEffect(() => {
    // O período aplicado inicia uma nova leitura dos pagamentos persistidos.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadReport(reportFilters.from, reportFilters.to, reportFilters.shortcut)
  }, [reportFilters.from, reportFilters.to, reportFilters.shortcut, loadReport])

  const applyReportFilters = (filters: FinancialReportFiltersValue) => {
    setReportFilters(filters)
    const params = new URLSearchParams(searchParams.toString())
    params.set("from", filters.from)
    params.set("to", filters.to)
    params.set("period", filters.shortcut)
    if (filters.status === "all") params.delete("status")
    else params.set("status", filters.status)
    if (filters.paymentMethod === "all") params.delete("payment")
    else params.set("payment", filters.paymentMethod)
    if (filters.service === "all") params.delete("service")
    else params.set("service", filters.service)
    if (filters.search) params.set("search", filters.search)
    else params.delete("search")
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`)
  }

  const clearReportFilters = () => applyReportFilters(currentMonthFinancialReportFilters())

  // --- Derivados do período ---
  const filteredReportPayments = useMemo(
    () => filterFinancialReportPayments(reportPayments, reportFilters),
    [reportPayments, reportFilters],
  )
  const reportSummary = useMemo(
    () => summarizeFinancialReport(filteredReportPayments),
    [filteredReportPayments],
  )
  const filteredPreviousReportPayments = useMemo(
    () => filterFinancialReportPayments(previousReportPayments, reportFilters),
    [previousReportPayments, reportFilters],
  )
  const previousReportSummary = useMemo(
    () => summarizeFinancialReport(filteredPreviousReportPayments),
    [filteredPreviousReportPayments],
  )
  const reportServiceOptions = useMemo(
    () => financialReportServiceOptions(reportPayments),
    [reportPayments],
  )
  const reportPaymentMethods = useMemo(
    () => financialReportPaymentMethods(reportPayments),
    [reportPayments],
  )
  const reportRevenue = reportSummary.revenue
  const reportNetProfit = reportSummary.netProfit
  const reportCosts = reportSummary.costs
  const reportRevenueGrowth = previousReportSummary.revenue > 0
    ? ((reportRevenue - previousReportSummary.revenue) / previousReportSummary.revenue) * 100
    : null
  const reportRevenueGrowthLabel = reportRevenueGrowth === null
    ? "—"
    : `${reportRevenueGrowth > 0 ? "+" : ""}${reportRevenueGrowth.toFixed(1)}%`

  // Lucro por dia (empilhado: líquido em verde + resto do bruto em cinza)
  const dailyData = (() => {
    const byKey: Record<string, { label: string; liquido: number; resto: number; order: number }> = {}
    for (const p of filteredReportPayments) {
      const d = new Date(p.paid_at || p.created_at)
      const key = reportFilters.shortcut === "year" ? `${d.getFullYear()}-${d.getMonth()}` : d.toDateString()
      const label = reportFilters.shortcut === "year"
        ? d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase()
        : `${d.getDate()} ${d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase()}`
      if (!byKey[key]) byKey[key] = { label, liquido: 0, resto: 0, order: d.getTime() }
      byKey[key].liquido += Number(p.net_profit || 0)
      byKey[key].resto += Number(p.amount_paid || 0) - Number(p.net_profit || 0)
    }
    return Object.values(byKey).sort((a, b) => a.order - b.order)
  })()

  const monthName = new Date().toLocaleDateString("pt-BR", { month: "long" }).replace(/^./, (c) => c.toUpperCase())
  const nextMonthName = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
    .toLocaleDateString("pt-BR", { month: "long" })
    .replace(/^./, (character) => character.toUpperCase())
  const year = new Date().getFullYear().toString()
  const reportPeriodLabel = reportFilters.shortcut === "today"
    ? `Hoje, ${formatInputDate(reportFilters.from)}`
    : `${formatInputDate(reportFilters.from)} a ${formatInputDate(reportFilters.to)}`
  const selectedServiceLabel = reportFilters.service === "all"
    ? "Todos"
    : reportServiceOptions.find((service) => service.id === reportFilters.service)?.name || "Serviço não encontrado"

  const exportReport = async (format: "pdf" | "excel") => {
    if (filteredReportPayments.length === 0 || exportingFormat) return
    setExportingFormat(format)
    try {
      const context = {
        filters: reportFilters,
        periodLabel: reportPeriodLabel,
        serviceLabel: selectedServiceLabel,
        summary: reportSummary,
        payments: filteredReportPayments,
      }
      if (format === "pdf") await exportFinancialReportToPdf(context)
      else await exportFinancialReportToExcel(context)
      toast.success(`Relatório ${format === "pdf" ? "PDF" : "Excel"} gerado com sucesso.`)
    } catch (error) {
      console.error("Error exporting financial report", error)
      toast.error("Não foi possível gerar o relatório agora.")
    } finally {
      setExportingFormat(null)
    }
  }

  const COLORS = ['var(--money)', 'var(--interactive)', 'var(--warning)', 'var(--danger)', 'var(--muted-foreground)', 'var(--secondary-foreground)']
  const nextMonthPotential = metrics ? Number(metrics.monthly_revenue || 0) : null
  const activeClients = metrics ? Number(metrics.total_active_clients || 0) : null
  const hasAnnualCashflow = annualCashflow.some((item) => Number(item.Receita || 0) !== 0 || Number(item.Lucro || 0) !== 0)
  const annualRevenue = annualCashflow.reduce((total, item) => total + Number(item.Receita || 0), 0)
  const annualProfit = annualCashflow.reduce((total, item) => total + Number(item.Lucro || 0), 0)
  const annualMargin = annualRevenue > 0 ? (annualProfit / annualRevenue) * 100 : 0
  const serviceLinks = serviceData.reduce((total, item) => total + Number(item.client_count || 0), 0)
  const maxServiceLinks = Math.max(...serviceData.map((item) => Number(item.client_count || 0)), 0)

  if (isLoading) {
    return (
      <PageShell>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[92px] w-full rounded-lg" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
          <Skeleton className="h-[320px] rounded-lg" />
          <Skeleton className="h-[320px] rounded-lg" />
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeaderCard
        titleId="financial-page-title"
        icon={WalletCards}
        eyebrow="Visão financeira"
        title="Financeiro"
        description="Planeje a receita, acompanhe riscos e confira cada entrada sem perder o contexto."
      />

      {hasFinancialError ? (
        <div className="rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-xs leading-relaxed text-warning-fg" role="status">
          Parte dos dados financeiros não pôde ser atualizada agora. Os valores indisponíveis não serão estimados.
        </div>
      ) : null}

      <FinancialPlanningOverview
        currentMonthReceived={monthlyReceived}
        monthlyGoal={monthlyGoal}
        nextMonthPotential={nextMonthPotential}
        activeClients={activeClients}
        upcoming7d={upcoming7d}
        overdue={basicOverdue}
        monthLabel={monthName}
        nextMonthLabel={nextMonthName}
        canEditGoal={canEditGoal}
        isGoalLoading={isOrganizationLoading || Boolean(organizationId && isGoalLoading)}
        hasGoalError={hasGoalError || (!isOrganizationLoading && !organizationId)}
        isSavingGoal={isSavingGoal}
        displayValue={displayValue}
        onSaveGoal={saveMonthlyGoal}
      />

      {upgradeRequired && !hasAdvancedFinance && (
        <div className="flex flex-col gap-3 rounded-lg border border-accent bg-interactive-bg px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-xs font-semibold text-interactive-fg">Visão financeira básica ativa</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Previsões por ciclo, risco e comparativos históricos estão disponíveis no Pro.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => window.location.assign('/planos')} className="h-8 text-xs">Conhecer o Pro</Button>
        </div>
      )}

      {pixMetrics && (
        <section className="flex flex-col gap-3" aria-labelledby="pix-overview-title">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="microlabel">Recebimentos rápidos</p>
              <h2 id="pix-overview-title" className="mt-1 text-base font-semibold text-foreground">PIX</h2>
            </div>
            <span className="num text-[11px] text-muted-foreground">{pixMetrics.paid_month_count} pagos no mês</span>
          </div>
          <div className="grid gap-3 rounded-lg border border-border bg-muted p-3 sm:grid-cols-3">
            <div className="rounded-lg border border-warning-border bg-warning-bg/65 p-3.5">
              <p className="microlabel text-[9.5px]">PIX pendentes</p>
              <p className="num mt-1 text-[18px] font-semibold text-warning-fg">
                {displayValue(formatCurrency(pixMetrics.pending_amount))}
              </p>
              <p className="mt-0.5 text-[10.5px] text-muted-foreground">{pixMetrics.pending_count} em aberto</p>
            </div>
            <div className="rounded-lg border border-success-border bg-success-bg/65 p-3.5">
              <p className="microlabel text-[9.5px]">PIX pagos hoje</p>
              <p className="num mt-1 text-[18px] font-semibold text-money">
                {displayValue(formatCurrency(pixMetrics.paid_today_amount))}
              </p>
              <p className="mt-0.5 text-[10.5px] text-muted-foreground">{pixMetrics.paid_today_count} confirmações</p>
            </div>
            <div className="rounded-lg border border-interactive/20 bg-interactive-bg/65 p-3.5">
              <p className="microlabel text-[9.5px]">PIX no mês</p>
              <p className="num mt-1 text-[18px] font-semibold text-interactive-fg">
                {displayValue(formatCurrency(pixMetrics.paid_month_amount))}
              </p>
              <p className="mt-0.5 text-[10.5px] text-muted-foreground">{pixMetrics.paid_month_count} pagos</p>
            </div>
          </div>
        </section>
      )}

      {pixMigrationRequired && (
        <div className="rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-xs text-warning-fg" role="status">
          Os dados de recebimentos PIX estão temporariamente indisponíveis. Tente novamente mais tarde.
        </div>
      )}

      {pixCharges.length > 0 && (
        <details className="group overflow-hidden rounded-lg border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-foreground">Histórico de cobranças PIX</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Abra para revisar status, telefone e expiração das últimas cobranças.</p>
            </div>
            <span className="num shrink-0 text-[10px] text-muted-foreground">últimas {pixCharges.length} · <span className="text-interactive-fg group-open:hidden">abrir</span><span className="hidden text-interactive-fg group-open:inline">fechar</span></span>
          </summary>
          <div className="border-t border-border">
          <ResponsiveDataView
            desktopFrom="md"
            mobile={
              <div className="divide-y divide-border">
                {pixCharges.map((charge) => {
                  const statusClass = charge.status === "paid" ? "bg-money/10 text-money" : charge.status === "pending" ? "bg-warning/10 text-warning-fg" : "bg-muted text-muted-foreground"
                  const purpose = charge.purpose === "renewal" ? "Renovação" : charge.purpose === "charge" ? "Cobrança" : "Manual"
                  return (
                    <article key={charge.id} className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className={cn("text-[10px] font-medium", statusClass)}>{pixStatusLabels[charge.status]}</Badge>
                            <span className="text-xs text-foreground">{purpose}</span>
                          </div>
                          <p className="num mt-2 text-[11px] text-muted-foreground">{new Date(charge.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                        <p className="num shrink-0 text-sm font-semibold text-foreground">{displayValue(formatCurrency(Number(charge.amount)))}</p>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                        <span className="font-mono">{charge.phone || "Sem telefone"}</span>
                        <span>{charge.expires_at ? `Expira ${new Date(charge.expires_at).toLocaleDateString("pt-BR")}` : "Sem expiração"}</span>
                      </div>
                    </article>
                  )
                })}
              </div>
            }
            desktop={
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Expira</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pixCharges.map((c) => {
                  const statusCls =
                    c.status === "paid"
                      ? "bg-money/10 text-money"
                      : c.status === "pending"
                        ? "bg-warning/10 text-warning-fg"
                        : "bg-muted text-muted-foreground"
                  const purposeLabel =
                    c.purpose === "renewal" ? "Renovação" : c.purpose === "charge" ? "Cobrança" : "Manual"
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(c.created_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={cn("text-[10px] font-medium", statusCls)}>
                          {pixStatusLabels[c.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{purposeLabel}</TableCell>
                      <TableCell className="font-mono text-xs">{c.phone || "—"}</TableCell>
                      <TableCell className="num text-right text-xs font-semibold">
                        {displayValue(formatCurrency(Number(c.amount)))}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {c.expires_at
                          ? new Date(c.expires_at).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            }
          />
          </div>
        </details>
      )}

      <section className="flex flex-col gap-4" aria-labelledby="financial-report-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="microlabel">Relatório de recebimentos</p>
            <h2 id="financial-report-title" className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-foreground">
              Filtre, confira e exporte
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => exportReport("pdf")}
              disabled={filteredReportPayments.length === 0 || isReportLoading || Boolean(exportingFormat)}
              className="h-9 gap-1.5 rounded-lg px-3.5 text-xs font-medium"
            >
              {exportingFormat === "pdf" ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <FileText className="size-3.5" aria-hidden="true" />}
              Exportar PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => exportReport("excel")}
              disabled={filteredReportPayments.length === 0 || isReportLoading || Boolean(exportingFormat)}
              className="h-9 gap-1.5 rounded-lg px-3.5 text-xs font-medium"
            >
              {exportingFormat === "excel" ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <FileSpreadsheet className="size-3.5" aria-hidden="true" />}
              Exportar Excel
            </Button>
          </div>
        </div>
        <FinancialReportFilters
          key={`${reportFilters.from}-${reportFilters.to}-${reportFilters.shortcut}-${reportFilters.status}-${reportFilters.paymentMethod}-${reportFilters.service}-${reportFilters.search}`}
          values={reportFilters}
          services={reportServiceOptions}
          paymentMethods={reportPaymentMethods}
          isLoading={isReportLoading}
          onApply={applyReportFilters}
          onClear={clearReportFilters}
        />

        {hasReportError ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-xs text-warning-fg sm:flex-row sm:items-center sm:justify-between" role="status">
            <span>Não foi possível carregar as movimentações deste período.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => loadReport(reportFilters.from, reportFilters.to, reportFilters.shortcut)}
            >
              Tentar novamente
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className={cn("grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3", hasAdvancedFinance ? "sm:grid-cols-3 xl:grid-cols-5" : "sm:grid-cols-3")}>
              <PeriodMetric label="Receita recebida" value={displayValue(formatCurrency(reportRevenue))} hint={`${filteredReportPayments.length} pagamento${filteredReportPayments.length === 1 ? "" : "s"}`} tone="success" />
              {hasAdvancedFinance ? (
                <>
                  <PeriodMetric label="Lucro líquido" value={displayValue(formatCurrency(reportNetProfit))} hint={`margem ${reportRevenue > 0 ? ((reportNetProfit / reportRevenue) * 100).toFixed(0) : 0}%`} tone="success" />
                  <PeriodMetric label="Custos operacionais" value={displayValue(formatCurrency(reportCosts))} hint="registrados nos pagamentos" tone="danger" />
                </>
              ) : null}
              <PeriodMetric label="Ticket médio" value={displayValue(formatCurrency(reportSummary.averageTicket))} hint="por pagamento filtrado" />
              <PeriodMetric
                label="Crescimento da receita"
                value={reportRevenueGrowthLabel}
                hint={reportRevenueGrowth === null ? "sem base no período anterior" : "comparado ao período anterior"}
                tone={reportRevenueGrowth === null || reportRevenueGrowth === 0 ? "default" : reportRevenueGrowth > 0 ? "success" : "danger"}
              />
            </div>

            {hasAdvancedFinance ? (
              <div className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,.04)]">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[13px] font-semibold">
                    Entradas, custos e líquido <span className="ml-1 text-[11px] font-normal text-muted-foreground">{reportPeriodLabel.toLowerCase()}</span>
                  </p>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground" aria-label="Legenda do gráfico">
                    <span className="flex items-center gap-1"><span className="size-2 rounded-[2px] bg-money" /> líquido</span>
                    <span className="flex items-center gap-1"><span className="size-2 rounded-[2px] bg-secondary" /> custos</span>
                  </div>
                </div>
                {isReportLoading ? (
                  <Skeleton className="h-[240px] w-full" />
                ) : dailyData.length === 0 ? (
                  <div className="flex h-[240px] flex-col items-center justify-center gap-1.5 text-center">
                    <p className="text-sm font-medium text-foreground">Nenhum pagamento no período</p>
                    <p className="text-xs text-muted-foreground">Os recebimentos aparecerão aqui quando forem registrados.</p>
                  </div>
                ) : (
                  <div className="h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 640, height: 240 }}>
                      <BarChart data={dailyData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
                        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" tick={{ fill: 'var(--muted-foreground)', fontSize: 9, fontFamily: 'var(--font-geist-mono)' }} />
                        <YAxis width={58} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 9 }} tickFormatter={compactCurrency} />
                        <Tooltip
                          cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
                          contentStyle={{ backgroundColor: 'var(--popover)', color: 'var(--popover-foreground)', borderColor: 'var(--border)', borderRadius: 12, boxShadow: '0 12px 28px rgba(0,0,0,.12)', fontSize: 12 }}
                          formatter={(value, name) => [displayValue(formatCurrency(Number(value))), name === "liquido" ? "Líquido" : "Custos"]}
                        />
                        <Bar dataKey="liquido" stackId="a" fill="var(--money)" fillOpacity={0.9} maxBarSize={42} isAnimationActive={false} />
                        <Bar dataKey="resto" stackId="a" fill="var(--secondary-foreground)" fillOpacity={0.22} maxBarSize={42} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ) : null}

            <FinancialReportCharts
              payments={filteredReportPayments}
              displayValue={displayValue}
            />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3.5" aria-labelledby="financial-movements-title">
        <div>
          <p className="microlabel">Movimentações detalhadas</p>
          <h2 id="financial-movements-title" className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-foreground">
            Todos os pagamentos filtrados
          </h2>
        </div>
        {hasReportError ? (
          <div className="rounded-lg border border-warning-border bg-warning-bg px-4 py-10 text-center">
            <p className="text-sm font-medium text-warning-fg">Pagamentos indisponíveis</p>
            <p className="mt-1 text-xs text-muted-foreground">Tente aplicar os filtros novamente.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => loadReport(reportFilters.from, reportFilters.to, reportFilters.shortcut)}
            >
              Tentar novamente
            </Button>
          </div>
        ) : isReportLoading ? (
          <div className="space-y-2 rounded-lg border border-border bg-card p-4">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-11 w-full" />)}
          </div>
        ) : (
          <FinancialReportsTable data={filteredReportPayments} displayValue={displayValue} />
        )}
      </section>

      {hasAdvancedFinance ? (
        <details className="group overflow-hidden rounded-lg border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-foreground">Análises adicionais e custos fixos</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Abra para ver evolução anual, distribuição por serviços e gerenciar os custos fixos mensais.</p>
            </div>
            <span className="num shrink-0 text-[10px] text-muted-foreground"><span className="text-interactive-fg group-open:hidden">abrir</span><span className="hidden text-interactive-fg group-open:inline">fechar</span></span>
          </summary>
          <div className="space-y-4 border-t border-border p-4 sm:p-5">
            <FixedCostsSection />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <section className="overflow-hidden rounded-lg border border-border bg-card" aria-labelledby="annual-cashflow-title">
                <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                  <div>
                    <h2 id="annual-cashflow-title" className="text-sm font-semibold text-foreground">Evolução de caixa</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Receita e lucro confirmados mês a mês em {year}.</p>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground" aria-label="Legenda do gráfico">
                    <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-interactive" /> Receita</span>
                    <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-money" /> Lucro</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 divide-x divide-border border-b border-border bg-muted/20 px-1 py-3">
                  <ChartMetric label="Receita no ano" value={displayValue(formatCurrency(annualRevenue))} />
                  <ChartMetric label="Lucro no ano" value={displayValue(formatCurrency(annualProfit))} tone="success" />
                  <ChartMetric label="Margem" value={`${annualMargin.toFixed(1)}%`} />
                </div>
                <div className="p-3 sm:p-4">
                  {hasAnnualCashflow ? <div className="h-[270px] w-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 520, height: 270 }}>
                      <LineChart data={annualCashflow} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
                        <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 9 }} width={58} tickFormatter={compactCurrency} />
                        <Tooltip
                          cursor={{ stroke: 'var(--border)', strokeDasharray: '4 4' }}
                          contentStyle={{ backgroundColor: 'var(--popover)', color: 'var(--popover-foreground)', borderColor: 'var(--border)', borderRadius: 12, boxShadow: '0 12px 28px rgba(0,0,0,.12)', fontSize: 12 }}
                          formatter={(value, name) => [displayValue(formatCurrency(Number(value))), name]}
                        />
                        <Line type="monotone" dataKey="Receita" stroke="var(--interactive)" strokeWidth={3} dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: 'var(--card)' }} isAnimationActive={false} />
                        <Line type="monotone" dataKey="Lucro" stroke="var(--money)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: 'var(--card)' }} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div> : <ChartEmptyState message="Ainda não há pagamentos registrados neste ano." />}
                </div>
              </section>

              <section className="overflow-hidden rounded-lg border border-border bg-card" aria-labelledby="service-distribution-title">
                <div className="border-b border-border px-4 py-4 sm:px-5">
                  <h2 id="service-distribution-title" className="text-sm font-semibold text-foreground">Distribuição por serviços</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Participação real dos serviços nos vínculos da carteira.</p>
                </div>
                <div className="p-4 sm:p-5">
                  {serviceData.length > 0 ? <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <div className="relative h-[250px] min-w-0">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 420, height: 250 }}>
                        <PieChart>
                          <Pie data={serviceData} cx="50%" cy="50%" innerRadius={67} outerRadius={96} paddingAngle={3} dataKey="client_count" nameKey="service_name" stroke="none">
                            {serviceData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                          </Pie>
                          <Tooltip
                            contentStyle={{ backgroundColor: 'var(--popover)', color: 'var(--popover-foreground)', borderColor: 'var(--border)', borderRadius: 12, boxShadow: '0 12px 28px rgba(0,0,0,.12)', fontSize: 12 }}
                            formatter={(value) => [`${Number(value)} vínculo${Number(value) === 1 ? "" : "s"}`, "Carteira"]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="num text-2xl font-semibold tracking-[-0.04em] text-foreground">{serviceLinks}</span>
                        <span className="mt-0.5 text-[10px] text-muted-foreground">vínculos</span>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {serviceData.slice(0, 5).map((service, index) => {
                        const count = Number(service.client_count || 0)
                        return (
                          <div key={service.service_name}>
                            <div className="flex items-center justify-between gap-3 text-xs">
                              <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
                                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                <span className="truncate">{service.service_name}</span>
                              </span>
                              <span className="num shrink-0 text-muted-foreground">{count}</span>
                            </div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full" style={{ width: `${maxServiceLinks > 0 ? (count / maxServiceLinks) * 100 : 0}%`, backgroundColor: COLORS[index % COLORS.length] }} />
                            </div>
                          </div>
                        )
                      })}
                      {serviceData.length > 5 ? <p className="pt-1 text-[10px] text-muted-foreground">Mais {serviceData.length - 5} serviço{serviceData.length - 5 === 1 ? "" : "s"} no gráfico.</p> : null}
                    </div>
                  </div> : <ChartEmptyState message="Vincule clientes aos serviços para visualizar a distribuição." />}
                </div>
              </section>
            </div>
          </div>
        </details>
      ) : null}
    </PageShell>
  )
}

function PeriodMetric({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string
  value: ReactNode
  hint: string
  tone?: "default" | "success" | "danger"
}) {
  const surfaceClasses = {
    default: "border-interactive/15 bg-interactive-bg/55",
    success: "border-success-border bg-success-bg/65",
    danger: "border-danger-border bg-danger-bg/65",
  }

  return (
    <article className={cn("min-w-0 rounded-lg border p-4 shadow-[0_1px_2px_rgba(0,0,0,.03)]", surfaceClasses[tone])}>
      <p className="microlabel">{label}</p>
      <p className={cn(
        "num mt-1.5 text-lg font-semibold tracking-[-0.025em] text-foreground sm:text-xl",
        tone === "success" && "text-money",
        tone === "danger" && "text-danger"
      )}>
        {value}
      </p>
      <p className="mt-1 text-[10.5px] text-muted-foreground">{hint}</p>
    </article>
  )
}

function ChartMetric({ label, value, tone = "default" }: { label: string; value: ReactNode; tone?: "default" | "success" }) {
  return (
    <div className="min-w-0 px-3 text-center sm:px-4">
      <p className="truncate text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className={cn("num mt-1 truncate text-sm font-semibold text-foreground", tone === "success" && "text-money")}>{value}</p>
    </div>
  )
}

function compactCurrency(value: number) {
  if (Math.abs(value) >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)} mi`
  if (Math.abs(value) >= 1_000) return `R$ ${(value / 1_000).toFixed(1)} mil`
  return `R$ ${Math.round(value)}`
}

function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-border px-6 text-center">
      <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{message}</p>
    </div>
  )
}

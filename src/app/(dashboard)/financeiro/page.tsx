"use client"

import { useEffect, useState, useCallback, useMemo, type ReactNode } from "react"
import { createClient } from "@/lib/supabase/client"
import { CalendarDays, ChevronLeft, ChevronRight, Download } from "lucide-react"
import { formatCurrency, cn } from "@/lib/utils"
import type { DashboardMetrics, ClientsByService, PixCharge, PixChargeMetrics } from "@/types/database"
import type { ExecutiveDashboardDTO, ExecutivePeriod } from "@/lib/executive-metrics"
import { usePrivacy } from "@/hooks/use-privacy"
import { FixedCostsSection } from "@/components/fixed-costs-section"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line } from "recharts"
import { ExecutiveDashboardView } from "@/components/executive-dashboard-view"
import { usePlanCapability } from "@/components/providers/plan-provider"
import { useOrganization } from "@/components/providers/organization-provider"
import { PageHeader, PageSection, PageShell, ResponsiveDataView } from "@/components/page-layout"
import { toast } from "sonner"
import { FinancialPlanningOverview } from "./financial-planning-overview"

type Period = "hoje" | "mes" | "ano" | "custom"
type DateRange = { from: string; to: string }

type ReportPayment = {
  id: string
  amount_paid: number
  net_profit?: number | null
  created_at: string
  clients?: { name: string } | null
}

type AnnualCashflowItem = { name: string; Receita: number; Lucro: number }

function toDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

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

const pixStatusLabels: Record<PixCharge["status"], string> = {
  paid: "Pago",
  pending: "Pendente",
  expired: "Expirado",
  cancelled: "Cancelado",
  failed: "Falhou",
}

export default function FinanceiroPage() {
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

  const [period, setPeriod] = useState<Period>("mes")
  const [customRangeDraft, setCustomRangeDraft] = useState<DateRange>(() => {
    const today = new Date()
    return {
      from: toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: toDateInputValue(today),
    }
  })
  const [appliedCustomRange, setAppliedCustomRange] = useState<DateRange>(() => {
    const today = new Date()
    return {
      from: toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: toDateInputValue(today),
    }
  })
  const [customRangeError, setCustomRangeError] = useState("")
  const [reportPayments, setReportPayments] = useState<ReportPayment[]>([])
  const [isReportLoading, setIsReportLoading] = useState(false)
  const [hasReportError, setHasReportError] = useState(false)
  const [paymentPage, setPaymentPage] = useState(1)
  const [paymentPageSize, setPaymentPageSize] = useState(10)
  const [pixMetrics, setPixMetrics] = useState<PixChargeMetrics | null>(null)
  const [pixCharges, setPixCharges] = useState<PixCharge[]>([])
  const [pixMigrationRequired, setPixMigrationRequired] = useState(false)
  const [executive, setExecutive] = useState<ExecutiveDashboardDTO | null>(null)
  const [executivePeriod, setExecutivePeriod] = useState<ExecutivePeriod>("month")
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
  const periodRange = useCallback((p: Period, customRange?: DateRange) => {
    const now = new Date()
    const start = new Date(now)
    if (p === "hoje") start.setHours(0, 0, 0, 0)
    else if (p === "mes") { start.setDate(1); start.setHours(0, 0, 0, 0) }
    else if (p === "ano") { start.setMonth(0, 1); start.setHours(0, 0, 0, 0) }
    else if (customRange) {
      return {
        start: dateFromInput(customRange.from),
        end: dateFromInput(customRange.to, true),
      }
    }
    return { start, end: now }
  }, [])

  const loadReport = useCallback(async (p: Period, customRange?: DateRange) => {
    setIsReportLoading(true)
    setHasReportError(false)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { start, end } = periodRange(p, customRange)
      const { data, error } = await supabase
        .from('payments')
        .select(hasAdvancedFinance
          ? `id, amount_paid, net_profit, created_at, clients(name)`
          : `id, amount_paid, created_at, clients(name)`)
        .eq('user_id', user.id)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false })
      if (error) {
        setHasReportError(true)
      } else if (data) {
        const payments = data as unknown as ReportPayment[]
        setReportPayments(payments)
        setPaymentPage(1)
        if (p === "mes") {
          setMonthlyReceived(payments.reduce((total, payment) => total + Number(payment.amount_paid || 0), 0))
        }
      }
    } catch (e) {
      console.error(e)
      setHasReportError(true)
    } finally {
      setIsReportLoading(false)
    }
  }, [supabase, periodRange, hasAdvancedFinance])

  useEffect(() => {
    // A troca de período inicia uma nova leitura dos pagamentos persistidos.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadReport(period, period === "custom" ? appliedCustomRange : undefined)
  }, [period, appliedCustomRange, loadReport])

  const applyCustomRange = () => {
    if (!customRangeDraft.from || !customRangeDraft.to) {
      setCustomRangeError("Informe as duas datas do período.")
      return
    }
    if (customRangeDraft.from > customRangeDraft.to) {
      setCustomRangeError("A data inicial deve ser anterior à data final.")
      return
    }

    setCustomRangeError("")
    setPeriod("custom")
    setAppliedCustomRange({ ...customRangeDraft })
  }

  // --- Derivados do período ---
  const reportRevenue = reportPayments.reduce((acc, p) => acc + Number(p.amount_paid || 0), 0)
  const reportNetProfit = reportPayments.reduce((acc, p) => acc + Number(p.net_profit || 0), 0)
  const reportCosts = reportRevenue - reportNetProfit
  const paymentPageCount = Math.max(1, Math.ceil(reportPayments.length / paymentPageSize))
  const currentPaymentPage = Math.min(paymentPage, paymentPageCount)
  const paymentPageStart = (currentPaymentPage - 1) * paymentPageSize
  const paginatedPayments = reportPayments.slice(paymentPageStart, paymentPageStart + paymentPageSize)

  // Lucro por dia (empilhado: líquido em verde + resto do bruto em cinza)
  const dailyData = (() => {
    const byKey: Record<string, { label: string; liquido: number; resto: number; order: number }> = {}
    for (const p of reportPayments) {
      const d = new Date(p.created_at)
      const key = period === "ano" ? `${d.getFullYear()}-${d.getMonth()}` : d.toDateString()
      const label = period === "ano"
        ? d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase()
        : `${d.getDate()} ${d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase()}`
      if (!byKey[key]) byKey[key] = { label, liquido: 0, resto: 0, order: d.getTime() }
      byKey[key].liquido += Number(p.net_profit || 0)
      byKey[key].resto += Number(p.amount_paid || 0) - Number(p.net_profit || 0)
    }
    return Object.values(byKey).sort((a, b) => a.order - b.order)
  })()

  const exportCSV = () => {
    if (reportPayments.length === 0) return
    const headers = ["Data", "Cliente", "Tipo", "Recebido", "Lucro Liquido"]
    const rows = reportPayments.map((p) => {
      const date = new Date(p.created_at)
      return [
        `"${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}"`,
        `"${p.clients?.name || 'Desconhecido'}"`,
        `"${p.amount_paid === 0 ? 'Promoção' : 'Pagamento'}"`,
        p.amount_paid,
        p.net_profit ?? 0,
      ].join(",")
    })
    const csvContent = "data:text/csv;charset=utf-8,﻿" + [headers.join(","), ...rows].join("\n")
    const link = document.createElement("a")
    link.setAttribute("href", encodeURI(csvContent))
    link.setAttribute("download", `relatorio_financeiro.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const monthName = new Date().toLocaleDateString("pt-BR", { month: "long" }).replace(/^./, (c) => c.toUpperCase())
  const nextMonthName = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
    .toLocaleDateString("pt-BR", { month: "long" })
    .replace(/^./, (character) => character.toUpperCase())
  const year = new Date().getFullYear().toString()
  const reportPeriodLabel = period === "hoje"
    ? "Hoje"
    : period === "mes"
      ? monthName
      : period === "ano"
        ? year
        : `${formatInputDate(appliedCustomRange.from)} a ${formatInputDate(appliedCustomRange.to)}`

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
      <PageHeader
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

      {executive && <ExecutiveDashboardView data={executive} period={executivePeriod} onPeriodChange={setExecutivePeriod} compact />}
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
        <div className="grid grid-cols-1 divide-y divide-border rounded-xl border border-border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-4">
            <p className="microlabel">PIX pendentes</p>
            <p className="num mt-1 text-[18px] font-semibold text-warning-fg">
              {displayValue(formatCurrency(pixMetrics.pending_amount))}
            </p>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">{pixMetrics.pending_count} em aberto</p>
          </div>
          <div className="p-4">
            <p className="microlabel">PIX pagos hoje</p>
            <p className="num mt-1 text-[18px] font-semibold text-money">
              {displayValue(formatCurrency(pixMetrics.paid_today_amount))}
            </p>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">{pixMetrics.paid_today_count} confirmações</p>
          </div>
          <div className="p-4">
            <p className="microlabel">PIX no mês</p>
            <p className="num mt-1 text-[18px] font-semibold text-foreground">
              {displayValue(formatCurrency(pixMetrics.paid_month_amount))}
            </p>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">{pixMetrics.paid_month_count} pagos</p>
          </div>
        </div>
      )}

      {pixMigrationRequired && (
        <div className="rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-xs text-warning-fg" role="status">
          Os dados de recebimentos PIX estão temporariamente indisponíveis. Tente novamente mais tarde.
        </div>
      )}

      {pixCharges.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-[13px] font-semibold">Histórico de cobranças PIX</p>
            <span className="text-[10px] text-muted-foreground">últimas {pixCharges.length}</span>
          </div>
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
      )}

      <PageSection
        title="Movimento do período"
        description="Filtre por hoje, mês, ano ou escolha um intervalo entre duas datas."
        actions={
          <>
            <div className="flex items-center gap-0.5 rounded-lg bg-secondary p-1" role="group" aria-label="Período das movimentações">
              {([
                { key: "hoje", label: "Hoje" },
                { key: "mes", label: monthName },
                { key: "ano", label: year },
                { key: "custom", label: "Período" },
              ] as { key: Period; label: string }[]).map((item) => (
                <button
                  type="button"
                  key={item.key}
                  onClick={() => setPeriod(item.key)}
                  aria-pressed={period === item.key}
                  className={cn(
                    "min-h-9 rounded-md px-3 py-1 text-xs transition-colors",
                    period === item.key
                      ? "bg-card font-semibold text-foreground shadow-sm"
                      : "text-secondary-foreground hover:text-foreground"
                  )}
                >
                  {item.key === "custom" ? <CalendarDays className="mr-1 inline size-3.5" aria-hidden="true" /> : null}
                  {item.label}
                </button>
              ))}
            </div>
            {hasAdvancedFinance ? (
              <Button variant="outline" size="lg" onClick={exportCSV} disabled={reportPayments.length === 0 || isReportLoading} className="gap-1.5 text-xs">
                <Download className="size-3.5" aria-hidden="true" /> Exportar
              </Button>
            ) : null}
          </>
        }
      >
        {period === "custom" ? (
          <div className="mb-4 rounded-xl border border-border bg-muted/30 p-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <label className="space-y-1.5 text-xs font-medium text-foreground">
                Data inicial
                <Input
                  type="date"
                  value={customRangeDraft.from}
                  max={customRangeDraft.to}
                  onChange={(event) => setCustomRangeDraft((current) => ({ ...current, from: event.target.value }))}
                  className="h-10 bg-card"
                  aria-invalid={Boolean(customRangeError)}
                />
              </label>
              <label className="space-y-1.5 text-xs font-medium text-foreground">
                Data final
                <Input
                  type="date"
                  value={customRangeDraft.to}
                  min={customRangeDraft.from}
                  max={toDateInputValue(new Date())}
                  onChange={(event) => setCustomRangeDraft((current) => ({ ...current, to: event.target.value }))}
                  className="h-10 bg-card"
                  aria-invalid={Boolean(customRangeError)}
                />
              </label>
              <Button type="button" size="lg" onClick={applyCustomRange} disabled={isReportLoading} className="h-10 px-4">
                Aplicar período
              </Button>
            </div>
            {customRangeError ? <p className="mt-2 text-xs text-danger" role="alert">{customRangeError}</p> : null}
          </div>
        ) : null}

        {hasReportError ? (
          <div className="rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-xs text-warning-fg" role="status">
            Não foi possível carregar as movimentações deste período.
          </div>
        ) : (
          <div className="space-y-4">
            <div className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border", hasAdvancedFinance ? "lg:grid-cols-4" : "sm:grid-cols-2")}>
              <PeriodMetric label="Receita recebida" value={displayValue(formatCurrency(reportRevenue))} hint={`${reportPayments.length} pagamento${reportPayments.length === 1 ? "" : "s"}`} tone="success" />
              <PeriodMetric label="Pagamentos" value={String(reportPayments.length)} hint="registros no período" />
              {hasAdvancedFinance ? (
                <>
                  <PeriodMetric label="Lucro líquido" value={displayValue(formatCurrency(reportNetProfit))} hint={`margem ${reportRevenue > 0 ? ((reportNetProfit / reportRevenue) * 100).toFixed(0) : 0}%`} tone="success" />
                  <PeriodMetric label="Custos operacionais" value={displayValue(formatCurrency(reportCosts))} hint="registrados nos pagamentos" tone="danger" />
                </>
              ) : null}
            </div>

            {hasAdvancedFinance ? (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[13px] font-semibold">
                    Composição dos recebimentos <span className="ml-1 text-[11px] font-normal text-muted-foreground">{reportPeriodLabel.toLowerCase()}</span>
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
                    <ResponsiveContainer width="100%" height="100%">
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
          </div>
        )}
      </PageSection>

      <PageSection title="Pagamentos do período" description="Todos os recebimentos individuais no período selecionado.">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">{reportPeriodLabel}</p>
          <span className="num rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">
            {reportPayments.length}
          </span>
        </div>
        {hasReportError ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-foreground">Pagamentos indisponíveis</p>
            <p className="mt-1 text-xs text-muted-foreground">Tente selecionar o período novamente.</p>
          </div>
        ) : isReportLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}
          </div>
        ) : reportPayments.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-foreground">Nenhum pagamento no período</p>
            <p className="mt-1 text-xs text-muted-foreground">As entradas aparecerão aqui quando forem registradas.</p>
          </div>
        ) : (
          <ResponsiveDataView
            desktopFrom="md"
            mobile={
              <div className="divide-y divide-border">
                {paginatedPayments.map((payment) => {
                  const date = new Date(payment.created_at)
                  return (
                    <article key={payment.id} className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{payment.clients?.name || "Desconhecido"}</p>
                          <p className="num mt-1 text-[11px] text-muted-foreground">{date.toLocaleDateString("pt-BR")} às {date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                        <p className="num shrink-0 text-sm font-semibold text-money">{displayValue(formatCurrency(payment.amount_paid))}</p>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <Badge className={cn("rounded border-0 px-1.5 text-[10px] font-semibold", payment.amount_paid === 0 ? "bg-secondary text-muted-foreground" : "bg-success-bg text-success-fg")}>
                          {payment.amount_paid === 0 ? "Promoção" : "Pagamento"}
                        </Badge>
                        {hasAdvancedFinance ? <span className="num text-[11px] text-muted-foreground">Lucro {displayValue(formatCurrency(Number(payment.net_profit || 0)))}</span> : null}
                      </div>
                    </article>
                  )
                })}
              </div>
            }
            desktop={
            <Table>
              <TableHeader className="bg-muted">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="microlabel pl-4 text-[9px]">Data</TableHead>
                  <TableHead className="microlabel text-[9px]">Cliente</TableHead>
                  <TableHead className="microlabel text-[9px]">Tipo</TableHead>
                  <TableHead className="microlabel text-right text-[9px]">Recebido</TableHead>
                  {hasAdvancedFinance && <TableHead className="microlabel pr-4 text-right text-[9px]">Lucro</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedPayments.map((p) => {
                  const date = new Date(p.created_at)
                  return (
                    <TableRow key={p.id} className="hover:bg-muted">
                      <TableCell className="num pl-4 text-xs text-muted-foreground">
                        {date.toLocaleDateString('pt-BR')} {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="text-[13px] font-medium">{p.clients?.name || 'Desconhecido'}</TableCell>
                      <TableCell>
                        <Badge className={cn(
                          "rounded border-0 px-1.5 text-[10px] font-semibold",
                          p.amount_paid === 0 ? "bg-secondary text-muted-foreground" : "bg-success-bg text-success-fg"
                        )}>
                          {p.amount_paid === 0 ? 'Promoção' : 'Pagamento'}
                        </Badge>
                      </TableCell>
                      <TableCell className="num whitespace-nowrap text-right text-xs font-medium text-money">
                        {displayValue(formatCurrency(p.amount_paid))}
                      </TableCell>
                      {hasAdvancedFinance && <TableCell className="num whitespace-nowrap pr-4 text-right text-xs text-muted-foreground">
                        {displayValue(formatCurrency(Number(p.net_profit || 0)))}
                      </TableCell>}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            }
          />
        )}
        {!hasReportError && !isReportLoading && reportPayments.length > 0 ? (
          <PaymentPagination
            page={currentPaymentPage}
            pageCount={paymentPageCount}
            pageSize={paymentPageSize}
            total={reportPayments.length}
            start={paymentPageStart}
            onPageChange={setPaymentPage}
            onPageSizeChange={(size) => {
              setPaymentPageSize(size)
              setPaymentPage(1)
            }}
          />
        ) : null}
      </div>
      </PageSection>

      {hasAdvancedFinance ? <FixedCostsSection /> : null}

      {hasAdvancedFinance ? <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-labelledby="annual-cashflow-title">
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
              <ResponsiveContainer width="100%" height="100%">
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

        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-labelledby="service-distribution-title">
          <div className="border-b border-border px-4 py-4 sm:px-5">
            <h2 id="service-distribution-title" className="text-sm font-semibold text-foreground">Distribuição por serviços</h2>
            <p className="mt-1 text-xs text-muted-foreground">Participação real dos serviços nos vínculos da carteira.</p>
          </div>
          <div className="p-4 sm:p-5">
            {serviceData.length > 0 ? <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="relative h-[250px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
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
      </div> : null}
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
  return (
    <article className="min-w-0 bg-card p-4">
      <p className="microlabel">{label}</p>
      <p className={cn(
        "num mt-1.5 truncate text-xl font-semibold tracking-[-0.025em] text-foreground",
        tone === "success" && "text-money",
        tone === "danger" && "text-danger"
      )}>
        {value}
      </p>
      <p className="mt-1 text-[10.5px] text-muted-foreground">{hint}</p>
    </article>
  )
}

function PaymentPagination({
  page,
  pageCount,
  pageSize,
  total,
  start,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageCount: number
  pageSize: number
  total: number
  start: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}) {
  const end = Math.min(start + pageSize, total)

  return (
    <div className="flex flex-col gap-3 border-t border-border bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <p aria-live="polite">Mostrando <span className="font-medium text-foreground">{start + 1}–{end}</span> de <span className="font-medium text-foreground">{total}</span></p>
        <label className="flex items-center gap-2">
          Itens por página
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-9 rounded-lg border border-input bg-card px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label="Itens por página"
          >
            {[10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <Button type="button" variant="outline" size="lg" onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="h-9 px-3 text-xs">
          <ChevronLeft className="size-4" aria-hidden="true" /> Anterior
        </Button>
        <span className="num min-w-20 text-center text-xs text-muted-foreground">{page} de {pageCount}</span>
        <Button type="button" variant="outline" size="lg" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount} className="h-9 px-3 text-xs">
          Próxima <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
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

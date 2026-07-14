"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Download } from "lucide-react"
import { formatCurrency, cn } from "@/lib/utils"
import type { DashboardMetrics, ClientsByService, PixCharge, PixChargeMetrics } from "@/types/database"
import type { ExecutiveDashboardDTO, ExecutivePeriod } from "@/lib/executive-metrics"
import { usePrivacy } from "@/hooks/use-privacy"
import { FixedCostsSection } from "@/components/fixed-costs-section"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line } from "recharts"
import { ExecutiveDashboardView } from "@/components/executive-dashboard-view"
import { usePlanCapability } from "@/components/providers/plan-provider"

type Period = "hoje" | "mes" | "ano"

export default function FinanceiroPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [upcoming7d, setUpcoming7d] = useState<{ count: number; total: number }>({ count: 0, total: 0 })
  const [serviceData, setServiceData] = useState<ClientsByService[]>([])
  const [mrr, setMrr] = useState(0)
  const [overdueAmount, setOverdueAmount] = useState(0)
  const [basicOverdue, setBasicOverdue] = useState({ count: 0, total: 0 })
  const [churnRate, setChurnRate] = useState(0)
  const [fixedCostsTotal, setFixedCostsTotal] = useState(0)
  const [annualCashflow, setAnnualCashflow] = useState<any[]>([])

  const [period, setPeriod] = useState<Period>("mes")
  const [reportPayments, setReportPayments] = useState<any[]>([])
  const [isReportLoading, setIsReportLoading] = useState(false)
  const [pixMetrics, setPixMetrics] = useState<PixChargeMetrics | null>(null)
  const [pixCharges, setPixCharges] = useState<PixCharge[]>([])
  const [pixMigrationRequired, setPixMigrationRequired] = useState(false)
  const [executive, setExecutive] = useState<ExecutiveDashboardDTO | null>(null)
  const [executivePeriod, setExecutivePeriod] = useState<ExecutivePeriod>("month")
  const [upgradeRequired, setUpgradeRequired] = useState(false)

  const { displayValue } = usePrivacy()
  const hasAdvancedFinance = usePlanCapability('finance_advanced')
  const supabase = createClient()

  useEffect(() => {
    async function loadFinancials() {
      setIsLoading(true)
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
            setMrr(executiveData.summary.mrr)
            setOverdueAmount(executiveData.summary.at_risk)
            setChurnRate(executiveData.rates.cancellation)
          } else if (executiveResponse.status === 403 && executivePayload.upgrade_required) {
            setExecutive(null)
            setUpgradeRequired(true)
          }
        } else {
          setExecutive(null)
          setUpgradeRequired(true)
        }

        const { data: metricsData } = await supabase.rpc('get_dashboard_metrics')
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
          if (!hasAdvancedFinance) setOverdueAmount(total)
        }

        // Distribuição por serviços
        if (hasAdvancedFinance) {
          const { data: services } = await supabase.rpc('get_clients_by_service')
          if (services) setServiceData(services)
        }

        // Custos fixos ativos (somam no KPI de custos)
        if (hasAdvancedFinance) {
          const { data: fixedData } = await supabase
            .from('fixed_costs')
            .select('amount')
            .eq('active', true)
          if (fixedData) setFixedCostsTotal(fixedData.reduce((acc, f) => acc + Number(f.amount || 0), 0))
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
      } finally {
        setIsLoading(false)
      }
    }
    loadFinancials()
  }, [supabase, executivePeriod, hasAdvancedFinance])

  // Período segmentado → intervalo de datas
  const periodRange = useCallback((p: Period) => {
    const now = new Date()
    const start = new Date(now)
    if (p === "hoje") start.setHours(0, 0, 0, 0)
    else if (p === "mes") { start.setDate(1); start.setHours(0, 0, 0, 0) }
    else { start.setMonth(0, 1); start.setHours(0, 0, 0, 0) }
    return { start, end: now }
  }, [])

  const loadReport = useCallback(async (p: Period) => {
    setIsReportLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { start, end } = periodRange(p)
      const { data } = await supabase
        .from('payments')
        .select(hasAdvancedFinance
          ? `id, amount_paid, net_profit, created_at, clients(name)`
          : `id, amount_paid, created_at, clients(name)`)
        .eq('user_id', user.id)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false })
      if (data) setReportPayments(data)
    } catch (e) {
      console.error(e)
    } finally {
      setIsReportLoading(false)
    }
  }, [supabase, periodRange, hasAdvancedFinance])

  useEffect(() => {
    loadReport(period)
  }, [period, loadReport])

  // --- Derivados do período ---
  const reportRevenue = reportPayments.reduce((acc, p) => acc + Number(p.amount_paid || 0), 0)
  const reportNetProfit = reportPayments.reduce((acc, p) => acc + Number(p.net_profit || 0), 0)
  const reportCosts = reportRevenue - reportNetProfit
  const totalCosts = reportCosts + (period === "hoje" ? 0 : fixedCostsTotal)

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
        p.net_profit,
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
  const year = new Date().getFullYear().toString()

  const COLORS = ['var(--money)', 'var(--interactive)', 'var(--warning)', 'var(--danger)', 'var(--muted-foreground)', 'var(--secondary-foreground)']
  const displayServices = serviceData.length > 0 ? serviceData : [{ service_name: 'Sem serviços cadastrados', client_count: 1 }]

  if (isLoading) {
    return (
      <div className="space-y-4 pb-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[92px] w-full rounded-lg" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
          <Skeleton className="h-[320px] rounded-lg" />
          <Skeleton className="h-[320px] rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-10">
      {/* Cabeçalho: título + período segmentado + ações */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[17px] font-semibold tracking-[-0.02em]">Financeiro</h1>
          <div className="flex items-center gap-0.5 rounded-md bg-secondary p-0.5">
            {([
              { key: "hoje", label: "Hoje" },
              { key: "mes", label: monthName },
              { key: "ano", label: year },
            ] as { key: Period; label: string }[]).map((s) => (
              <button
                key={s.key}
                onClick={() => setPeriod(s.key)}
                className={cn(
                  "rounded-[5px] px-2.5 py-1 text-xs transition-colors",
                  period === s.key
                    ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                    : "text-secondary-foreground hover:text-foreground"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {hasAdvancedFinance && (
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={reportPayments.length === 0} className="h-8 gap-1.5 text-xs">
            <Download className="size-3.5" /> Relatório
          </Button>
        )}
      </div>

      {executive && <ExecutiveDashboardView data={executive} period={executivePeriod} onPeriodChange={setExecutivePeriod} compact />}
      {upgradeRequired && !hasAdvancedFinance && (
        <div className="flex flex-col gap-3 rounded-lg border border-accent bg-interactive-bg px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-xs font-semibold text-interactive-fg">Visão financeira básica ativa</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Previsões, MRR, churn, custos, comparativos e relatórios completos estão disponíveis no Pro.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => window.location.assign('/planos')} className="h-8 text-xs">Conhecer o Pro</Button>
        </div>
      )}

      {/* Régua de KPIs do período */}
      <div className="grid grid-cols-2 rounded-lg border border-border bg-card md:grid-cols-4 md:divide-x md:divide-border">
        {hasAdvancedFinance ? <>
          <div className="p-4">
          <p className="microlabel">Lucro líquido</p>
          <p className="num mt-1 whitespace-nowrap text-[20px] font-semibold tracking-[-0.02em] text-money">
            {displayValue(formatCurrency(reportNetProfit))}
          </p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
            margem {reportRevenue > 0 ? ((reportNetProfit / reportRevenue) * 100).toFixed(0) : 0}%
          </p>
          </div>
          <div className="p-4">
          <p className="microlabel">Receita bruta</p>
          <p className="num mt-1 whitespace-nowrap text-[20px] font-semibold tracking-[-0.02em] text-foreground">
            {displayValue(formatCurrency(reportRevenue))}
          </p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">{reportPayments.length} pagamentos</p>
          </div>
          <div className="p-4">
          <p className="microlabel">Custos</p>
          <p className="num mt-1 whitespace-nowrap text-[20px] font-semibold tracking-[-0.02em] text-danger">
            {displayValue(formatCurrency(totalCosts))}
          </p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">painéis + fixos</p>
          </div>
          <div className="p-4">
          <p className="microlabel">A receber (7d)</p>
          <p className="num mt-1 whitespace-nowrap text-[20px] font-semibold tracking-[-0.02em] text-warning">
            {displayValue(formatCurrency(upcoming7d.total))}
          </p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">{upcoming7d.count} renovações</p>
          </div>
        </> : <>
          <div className="p-4">
            <p className="microlabel">Faturamento</p>
            <p className="num mt-1 whitespace-nowrap text-[20px] font-semibold tracking-[-0.02em] text-money">{displayValue(formatCurrency(reportRevenue))}</p>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">no período selecionado</p>
          </div>
          <div className="p-4">
            <p className="microlabel">Pagamentos</p>
            <p className="num mt-1 text-[20px] font-semibold tracking-[-0.02em]">{reportPayments.length}</p>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">recebimentos registrados</p>
          </div>
          <div className="p-4">
            <p className="microlabel">A receber (7d)</p>
            <p className="num mt-1 whitespace-nowrap text-[20px] font-semibold tracking-[-0.02em] text-warning">{displayValue(formatCurrency(upcoming7d.total))}</p>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">{upcoming7d.count} renovações</p>
          </div>
          <div className="p-4">
            <p className="microlabel">Vencido</p>
            <p className="num mt-1 whitespace-nowrap text-[20px] font-semibold tracking-[-0.02em] text-danger">{displayValue(formatCurrency(basicOverdue.total))}</p>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">{basicOverdue.count} clientes</p>
          </div>
        </>}
      </div>

      {/* Régua secundária: base recorrente */}
      {hasAdvancedFinance && <div className="grid grid-cols-2 rounded-lg border border-border bg-card md:grid-cols-4 md:divide-x md:divide-border">
        <div className="px-4 py-3">
          <p className="microlabel">MRR</p>
          <p className="num mt-0.5 whitespace-nowrap text-sm font-semibold">{displayValue(formatCurrency(mrr))}</p>
        </div>
        <div className="px-4 py-3">
          <p className="microlabel">ARR</p>
          <p className="num mt-0.5 whitespace-nowrap text-sm font-semibold">{displayValue(formatCurrency(mrr * 12))}</p>
        </div>
        <div className="px-4 py-3">
          <p className="microlabel">Inadimplência</p>
          <p className="num mt-0.5 whitespace-nowrap text-sm font-semibold text-danger">{displayValue(formatCurrency(overdueAmount))}</p>
        </div>
        <div className="px-4 py-3">
          <p className="microlabel">Churn (30d)</p>
          <p className="num mt-0.5 text-sm font-semibold">{churnRate.toFixed(1)}%</p>
        </div>
      </div>}

      {/* PIX — Fase 1 */}
      {pixMetrics && (
        <div className="grid grid-cols-2 rounded-lg border border-border bg-card md:grid-cols-4 md:divide-x md:divide-border">
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
          <div className="p-4">
            <p className="microlabel">Inadimplência (base)</p>
            <p className="num mt-1 text-[18px] font-semibold text-danger">
              {displayValue(formatCurrency(overdueAmount))}
            </p>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">clientes em atraso</p>
          </div>
        </div>
      )}

      {pixMigrationRequired && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-xs text-warning-fg">
          Ledger PIX ainda não migrado. Execute <code className="font-mono">supabase/pix_charges.sql</code> no Supabase para ativar histórico e renovação automática.
        </div>
      )}

      {pixCharges.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-[13px] font-semibold">Histórico de cobranças PIX</p>
            <span className="text-[10px] text-muted-foreground">últimas {pixCharges.length}</span>
          </div>
          <div className="overflow-x-auto">
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
                          {c.status}
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
          </div>
        </div>
      )}

      {/* Lucro por dia + Últimos recebimentos */}
      <div className={cn("grid grid-cols-1 gap-4", hasAdvancedFinance && "lg:grid-cols-[1fr_300px]")}>
        {hasAdvancedFinance && <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-semibold">
              Lucro por dia <span className="ml-1 text-[11px] font-normal text-muted-foreground">{period === "mes" ? monthName.toLowerCase() : period === "ano" ? year : "hoje"}</span>
            </p>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="size-2 rounded-[2px] bg-money" /> líquido</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-[2px] bg-secondary" /> bruto</span>
            </div>
          </div>
          {dailyData.length === 0 ? (
            <div className="flex h-[240px] flex-col items-center justify-center gap-1.5">
              <p className="microlabel">Sem pagamentos no período</p>
              <p className="text-xs text-muted-foreground">Os recebimentos aparecem aqui conforme entram.</p>
            </div>
          ) : (
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 9, fontFamily: 'var(--font-geist-mono)' }}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--muted)' }}
                    contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(value: any, name: any) => [
                      displayValue(formatCurrency(Number(value))),
                      name === "liquido" ? "Líquido" : "Custo",
                    ]}
                  />
                  <Bar dataKey="liquido" stackId="a" fill="var(--money)" isAnimationActive={false} />
                  <Bar dataKey="resto" stackId="a" fill="var(--secondary)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>}

        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[13px] font-semibold">Últimos recebimentos</p>
          <div className="mt-3">
            {isReportLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : reportPayments.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Nenhum recebimento no período.</p>
            ) : (
              <div className="divide-y divide-border">
                {reportPayments.slice(0, 8).map((p) => (
                  <div key={p.id} className="flex items-baseline justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-foreground">{p.clients?.name || 'Desconhecido'}</p>
                      <p className="num text-[10px] text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}{' '}
                        {new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <span className="num shrink-0 text-[11px] font-medium text-money">
                      +{displayValue(Number(p.amount_paid).toLocaleString("pt-BR", { minimumFractionDigits: 2 }))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Custos fixos (gestão) */}
      {hasAdvancedFinance && <FixedCostsSection />}

      {/* Planilha de ganhos do período */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold">Pagamentos do período</p>
            <p className="text-[11px] text-muted-foreground">Todos os recebimentos individuais no período filtrado.</p>
          </div>
          <span className="num rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">
            {reportPayments.length}
          </span>
        </div>
        {reportPayments.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="microlabel">Nenhum ganho no período</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
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
                {reportPayments.map((p) => {
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
                        {displayValue(formatCurrency(p.net_profit))}
                      </TableCell>}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Evolução anual + distribuição por serviços */}
      {hasAdvancedFinance && <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[13px] font-semibold">Evolução de caixa</p>
          <p className="mb-4 text-[11px] text-muted-foreground">Receita e lucro mês a mês em {year}</p>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={annualCashflow} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} width={56} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: any, name: any) => [displayValue(formatCurrency(Number(value))), name]}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Line type="monotone" dataKey="Receita" stroke="var(--interactive)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Lucro" stroke="var(--money)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[13px] font-semibold">Distribuição por serviços</p>
          <p className="mb-4 text-[11px] text-muted-foreground">Quais serviços seus clientes mais contratam</p>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={displayServices}
                  cx="50%"
                  cy="50%"
                  innerRadius={64}
                  outerRadius={92}
                  paddingAngle={3}
                  dataKey="client_count"
                  nameKey="service_name"
                  stroke="none"
                >
                  {displayServices.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>}
    </div>
  )
}

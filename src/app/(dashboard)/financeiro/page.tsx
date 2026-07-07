"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Download } from "lucide-react"
import { formatCurrency, cn } from "@/lib/utils"
import type { DashboardMetrics, ClientsByService } from "@/types/database"
import { usePrivacy } from "@/hooks/use-privacy"
import { FixedCostsSection } from "@/components/fixed-costs-section"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line } from "recharts"

type Period = "hoje" | "mes" | "ano"

export default function FinanceiroPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [upcoming7d, setUpcoming7d] = useState<{ count: number; total: number }>({ count: 0, total: 0 })
  const [serviceData, setServiceData] = useState<ClientsByService[]>([])
  const [mrr, setMrr] = useState(0)
  const [overdueAmount, setOverdueAmount] = useState(0)
  const [churnRate, setChurnRate] = useState(0)
  const [fixedCostsTotal, setFixedCostsTotal] = useState(0)
  const [annualCashflow, setAnnualCashflow] = useState<any[]>([])

  const [period, setPeriod] = useState<Period>("mes")
  const [reportPayments, setReportPayments] = useState<any[]>([])
  const [isReportLoading, setIsReportLoading] = useState(false)

  const { displayValue } = usePrivacy()
  const supabase = createClient()

  useEffect(() => {
    async function loadFinancials() {
      setIsLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

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

        // Distribuição por serviços
        const { data: services } = await supabase.rpc('get_clients_by_service')
        if (services) setServiceData(services)

        // Custos fixos ativos (somam no KPI de custos)
        const { data: fixedData } = await supabase
          .from('fixed_costs')
          .select('amount')
          .eq('active', true)
        if (fixedData) setFixedCostsTotal(fixedData.reduce((acc, f) => acc + Number(f.amount || 0), 0))

        // MRR / inadimplência / churn (mesma lógica anterior)
        const { data: allClients } = await supabase
          .from('clients')
          .select(`plan_value, due_date, status, created_at, updated_at`)
          .eq('user_id', user.id)
        if (allClients) {
          const active = allClients.filter((c) => c.status === 'active')
          const inactive = allClients.filter((c) => c.status === 'inactive')
          const vencido = allClients.filter((c) => c.status === 'vencido')
          const startOfToday = new Date()
          startOfToday.setHours(0, 0, 0, 0)

          let currentMrr = 0
          let currentOverdue = 0
          active.forEach((c) => {
            currentMrr += c.plan_value || 0
            if (c.due_date && new Date(c.due_date + "T00:00:00") < startOfToday) currentOverdue += c.plan_value || 0
          })
          vencido.forEach((c) => (currentOverdue += c.plan_value || 0))
          setMrr(currentMrr)
          setOverdueAmount(currentOverdue)

          const thirtyDaysAgo = new Date()
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
          const recentChurns = inactive.filter((c) => {
            const d = c.updated_at ? new Date(c.updated_at) : new Date(c.created_at)
            return d >= thirtyDaysAgo
          })
          setChurnRate(active.length > 0 ? (recentChurns.length / active.length) * 100 : 0)
        }

        // Evolução anual (linha, sem gradiente)
        const firstDayOfYear = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0]
        const { data: allYearPayments } = await supabase
          .from('payments')
          .select('amount_paid, net_profit, created_at')
          .eq('user_id', user.id)
          .gte('created_at', firstDayOfYear + "T00:00:00")
        if (allYearPayments) {
          const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
          const monthlyData = months.map((m) => ({ name: m, Receita: 0, Lucro: 0 }))
          allYearPayments.forEach((p) => {
            const mIdx = new Date(p.created_at).getMonth()
            monthlyData[mIdx].Receita += Number(p.amount_paid || 0)
            monthlyData[mIdx].Lucro += Number(p.net_profit || 0)
          })
          setAnnualCashflow(monthlyData.slice(0, today.getMonth() + 1))
        }
      } catch (error) {
        console.error("Error loading financial data", error)
      } finally {
        setIsLoading(false)
      }
    }
    loadFinancials()
  }, [supabase])

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
        .select(`id, amount_paid, net_profit, created_at, clients(name)`)
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
  }, [supabase, periodRange])

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
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={reportPayments.length === 0} className="h-8 gap-1.5 text-xs">
          <Download className="size-3.5" /> Relatório
        </Button>
      </div>

      {/* Régua de KPIs do período */}
      <div className="grid grid-cols-2 rounded-lg border border-border bg-card md:grid-cols-4 md:divide-x md:divide-border">
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
      </div>

      {/* Régua secundária: base recorrente */}
      <div className="grid grid-cols-2 rounded-lg border border-border bg-card md:grid-cols-4 md:divide-x md:divide-border">
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
      </div>

      {/* Lucro por dia + Últimos recebimentos */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        <div className="rounded-lg border border-border bg-card p-4">
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
        </div>

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
      <FixedCostsSection />

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
                  <TableHead className="microlabel pr-4 text-right text-[9px]">Lucro</TableHead>
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
                      <TableCell className="num whitespace-nowrap pr-4 text-right text-xs text-muted-foreground">
                        {displayValue(formatCurrency(p.net_profit))}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Evolução anual + distribuição por serviços */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
      </div>
    </div>
  )
}

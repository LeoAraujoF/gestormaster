"use client"

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { AlertTriangle, BadgeDollarSign, CircleDollarSign, RefreshCw, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatCurrency, cn } from "@/lib/utils"
import type { ExecutiveDashboardDTO, ExecutivePeriod } from "@/lib/executive-metrics"
import { usePrivacy } from "@/hooks/use-privacy"

const periodLabels: Array<{ value: ExecutivePeriod; label: string }> = [
  { value: "month", label: "Este mês" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "12m", label: "12 meses" },
]

export function ExecutiveDashboardView({ data, period, onPeriodChange, compact = false }: {
  data: ExecutiveDashboardDTO
  period: ExecutivePeriod
  onPeriodChange: (period: ExecutivePeriod) => void
  compact?: boolean
}) {
  const { displayValue } = usePrivacy()
  const money = (value: number) => displayValue(formatCurrency(value))
  const summary = [
    { label: "Receita prevista", value: money(data.summary.forecast), icon: TrendingUp, tone: "text-foreground" },
    { label: "Receita confirmada", value: money(data.summary.confirmed), icon: CircleDollarSign, tone: "text-money" },
    { label: "Receita em risco", value: money(data.summary.at_risk), icon: AlertTriangle, tone: "text-danger" },
    { label: "MRR", value: money(data.summary.mrr), icon: RefreshCw, tone: "text-foreground" },
  ]

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold">Visão executiva</h2>
        <p className="text-xs text-muted-foreground">Dados financeiros reais da organização.</p>
      </div>
      <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {periodLabels.map(item => <button key={item.value} onClick={() => onPeriodChange(item.value)} className={cn("rounded-md px-2.5 py-1.5 text-xs", period === item.value ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>{item.label}</button>)}
      </div>
    </div>

    {data.coverage.partial && <div className="rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning-fg">
      Histórico parcial{data.coverage.starts_at ? ` desde ${new Date(`${data.coverage.starts_at}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}. Os indicadores ganharão precisão conforme novos ciclos forem concluídos.
    </div>}

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {summary.map(item => <div key={item.label} className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2"><item.icon className="size-3.5 text-muted-foreground" /><p className="microlabel">{item.label}</p></div>
        <p className={cn("num mt-2 text-xl font-semibold", item.tone)}>{item.value}</p>
      </div>)}
    </div>

    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <Metric label="Renovação" value={`${data.rates.renewal.toFixed(1)}%`} />
      <Metric label="Ticket médio" value={String(money(data.rates.average_ticket))} />
      <Metric label="Inadimplência" value={`${data.rates.default.toFixed(1)}%`} danger={data.rates.default > 10} />
      <Metric label="Cancelamentos" value={`${data.rates.cancellation.toFixed(1)}%`} />
      <Metric label="Novos clientes" value={String(data.growth.new_clients)} />
    </div>

    {!compact && <div className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
        <h3 className="text-sm font-medium">Prevista × confirmada × risco</h3>
        <div className="mt-4 h-64">
          {data.series.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={data.series} margin={{ left: -12, right: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={value => `R$${value}`} />
            <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
            <Area type="monotone" dataKey="forecast" name="Prevista" stroke="var(--foreground)" fill="var(--muted)" fillOpacity={0.3} />
            <Area type="monotone" dataKey="confirmed" name="Confirmada" stroke="var(--money)" fill="var(--money)" fillOpacity={0.15} />
            <Area type="monotone" dataKey="at_risk" name="Em risco" stroke="var(--danger)" fill="var(--danger)" fillOpacity={0.1} />
          </AreaChart></ResponsiveContainer> : <Empty />}
        </div>
      </div>
      <div className="space-y-4">
        <Breakdown title="Meios de pagamento" rows={data.breakdowns.payment_methods.map(item => ({ label: item.method, value: money(item.value), hint: `${item.count} pagamento${item.count === 1 ? "" : "s"}` }))} />
        <Breakdown title="Receita por serviço" rows={data.breakdowns.services.slice(0, 5).map(item => ({ label: item.service, value: money(item.value), hint: `${item.clients} cliente${item.clients === 1 ? "" : "s"}` }))} />
      </div>
    </div>}
  </div>
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className="rounded-lg border border-border bg-card p-3"><p className="microlabel">{label}</p><p className={cn("num mt-1 text-sm font-semibold", danger && "text-danger")}>{value}</p></div>
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ label: string; value: string | number; hint: string }> }) {
  return <div className="rounded-lg border border-border bg-card p-4"><h3 className="text-sm font-medium">{title}</h3><div className="mt-3 space-y-3">{rows.length ? rows.map(row => <div key={row.label} className="flex items-center justify-between gap-3 text-xs"><div><p className="font-medium">{row.label}</p><p className="text-[10px] text-muted-foreground">{row.hint}</p></div><span className="num">{row.value}</span></div>) : <Empty />}</div></div>
}

function Empty() { return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Sem dados confiáveis neste período.</div> }

export function ExecutiveUpgrade() {
  return <div className="rounded-xl border border-border bg-card p-8 text-center"><BadgeDollarSign className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-3 text-lg font-semibold">Dashboard Executivo</h2><p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">Previsão, receita confirmada, risco e indicadores comparativos estão disponíveis nos planos Pro e Master.</p><Button className="mt-5" onClick={() => window.location.assign('/planos')}>Conhecer o plano Pro</Button></div>
}

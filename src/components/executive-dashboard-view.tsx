"use client"

import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  CalendarRange,
  CircleDollarSign,
  Minus,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  UsersRound,
} from "lucide-react"

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

type SummaryItem = {
  label: string
  value: ReactNode
  current: number
  previous: number
  icon: typeof TrendingUp
  tone: "default" | "success" | "danger" | "interactive"
  inverse?: boolean
  description: string
  onClick?: () => void
  actionLabel?: string
}

export function ExecutiveDashboardView({ data, period, onPeriodChange, onRiskOpen, compact = false }: {
  data: ExecutiveDashboardDTO
  period: ExecutivePeriod
  onPeriodChange: (period: ExecutivePeriod) => void
  onRiskOpen?: () => void
  compact?: boolean
}) {
  const { displayValue } = usePrivacy()
  const [reduceMotion, setReduceMotion] = useState(false)
  const money = (value: number) => displayValue(formatCurrency(value))
  const realizationRate = data.summary.forecast > 0
    ? (data.summary.confirmed / data.summary.forecast) * 100
    : 0
  const riskShare = data.summary.forecast > 0
    ? (data.summary.at_risk / data.summary.forecast) * 100
    : 0
  const dueAmount = data.rates.default > 0
    ? data.summary.at_risk / (data.rates.default / 100)
    : 0

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduceMotion(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  const summary: SummaryItem[] = [
    {
      label: "Receita confirmada",
      value: money(data.summary.confirmed),
      current: data.summary.confirmed,
      previous: data.previous.confirmed,
      icon: CircleDollarSign,
      tone: "success",
      description: "Entradas realizadas no período",
    },
    {
      label: "Receita prevista",
      value: money(data.summary.forecast),
      current: data.summary.forecast,
      previous: data.previous.forecast,
      icon: TrendingUp,
      tone: "interactive",
      description: "Potencial total para o período",
    },
    {
      label: "Receita em risco",
      value: money(data.summary.at_risk),
      current: data.summary.at_risk,
      previous: data.previous.at_risk,
      icon: AlertTriangle,
      tone: "danger",
      inverse: true,
      description: `${riskShare.toFixed(1)}% da receita prevista`,
      onClick: onRiskOpen,
      actionLabel: "Ver clientes vencidos relacionados à receita em risco",
    },
    {
      label: "Receita recorrente",
      value: money(data.summary.mrr),
      current: data.summary.mrr,
      previous: data.previous.mrr,
      icon: RefreshCw,
      tone: "default",
      description: `${data.summary.active_clients} clientes ativos`,
    },
  ]

  return (
    <section className="space-y-4" aria-labelledby="executive-overview-title">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-interactive-bg text-interactive-fg">
              <BadgeDollarSign className="size-4" aria-hidden="true" />
            </span>
            <div>
              <p className="microlabel">{compact ? "Ciclos financeiros" : "Visão financeira"}</p>
              <h2 id="executive-overview-title" className="mt-0.5 text-base font-semibold tracking-tight text-foreground sm:text-lg">
                {compact ? "Previsão e risco" : "Desempenho da operação"}
              </h2>
            </div>
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {compact
              ? "Compare o que os ciclos preveem, o que já entrou e o valor atualmente em risco."
              : "Dados reais de recebimentos, ciclos financeiros e clientes da sua organização."}
          </p>
        </div>

        <div className="max-w-full overflow-x-auto pb-0.5">
          <div className="flex min-w-max gap-1 rounded-xl border border-border bg-muted p-1" role="group" aria-label="Período da visão financeira">
            {periodLabels.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => onPeriodChange(item.value)}
                aria-pressed={period === item.value}
                className={cn(
                  "min-h-9 rounded-lg px-3 text-xs font-medium transition-all duration-200",
                  period === item.value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {data.coverage.partial ? (
        <div className="flex items-start gap-3 rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-xs text-warning-fg" role="status">
          <CalendarRange className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="leading-relaxed">
            <strong>Histórico em formação.</strong>{" "}
            {data.coverage.starts_at
              ? `Dados disponíveis desde ${new Date(`${data.coverage.starts_at}T12:00:00`).toLocaleDateString("pt-BR")}. `
              : ""}
            As comparações ficam mais precisas conforme novos ciclos são concluídos.
          </p>
        </div>
      ) : null}

      <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", compact ? "xl:grid-cols-3" : "xl:grid-cols-4")}>
        {(compact ? summary.slice(0, 3) : summary).map((item, index) => (
          <SummaryCard key={item.label} item={item} index={index} />
        ))}
      </div>

      {!compact ? <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <OperationalMetric
          label="Realização"
          value={`${realizationRate.toFixed(1)}%`}
          hint="confirmado ÷ previsto"
          progress={realizationRate}
          tone="success"
        />
        <OperationalMetric label="Renovação" value={`${data.rates.renewal.toFixed(1)}%`} hint="ciclos pagos" progress={data.rates.renewal} tone="interactive" />
        <OperationalMetric
          label="Inadimplência"
          value={`${data.rates.default.toFixed(1)}%`}
          hint={data.rates.default > 0 ? `${money(data.summary.at_risk)} em risco ÷ ${money(dueAmount)} vencido` : "Sem valor vencido no período"}
          progress={data.rates.default}
          tone={data.rates.default > 10 ? "danger" : "success"}
          onClick={onRiskOpen}
          actionLabel="Ver clientes relacionados à inadimplência"
        />
        <OperationalMetric label="Ticket médio" value={String(money(data.rates.average_ticket))} hint="por recebimento" />
        <OperationalMetric label="Cancelamentos" value={`${data.rates.cancellation.toFixed(1)}%`} hint={`${data.growth.cancellations} no período`} tone={data.rates.cancellation > 5 ? "danger" : "default"} />
        <OperationalMetric label="Novos clientes" value={String(data.growth.new_clients)} hint={growthHint(data.growth.new_clients, data.growth.previous_new_clients)} tone="interactive" />
      </div>

      {data.rates.default > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-danger-border bg-danger-bg/50 px-4 py-3 sm:flex-row sm:items-center">
          <AlertTriangle className="size-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="flex-1 text-xs leading-relaxed text-danger-fg">
            <strong>Como a inadimplência é calculada:</strong> valor dos ciclos vencidos em risco dividido pelo total que já venceu no período. Recebimentos confirmados aparecem separadamente até a conciliação com esses ciclos.
          </p>
          {onRiskOpen ? (
            <Button variant="outline" size="sm" onClick={onRiskOpen} className="h-8 shrink-0 border-danger-border bg-card text-xs text-danger-fg hover:bg-danger-bg">
              Ver clientes <ArrowRight className="ml-1.5 size-3.5" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      ) : null}
      </> : null}

      {!compact ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.7fr)]">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Movimento financeiro</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Previsto, confirmado e valores em risco ao longo do período.</p>
                </div>
                <ChartLegend />
              </div>
              <div className="h-[300px] px-1 py-4 sm:h-[340px] sm:px-4">
                {data.series.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.series} margin={{ top: 8, right: 12, left: -10, bottom: 4 }}>
                      <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        minTickGap={24}
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        tickFormatter={(value) => formatChartDate(String(value), period)}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        width={52}
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        tickFormatter={compactCurrency}
                      />
                      <Tooltip
                        cursor={{ fill: "var(--muted)", opacity: 0.45 }}
                        contentStyle={{
                          borderRadius: "12px",
                          border: "1px solid var(--border)",
                          background: "var(--popover)",
                          color: "var(--popover-foreground)",
                          boxShadow: "0 12px 28px rgba(0,0,0,.12)",
                          fontSize: "12px",
                        }}
                        labelFormatter={(value) => formatChartDate(String(value), period, true)}
                        formatter={(value, name) => [displayValue(formatCurrency(Number(value || 0))), chartLabel(String(name))]}
                      />
                      <Bar
                        dataKey="confirmed"
                        name="confirmed"
                        fill="var(--money)"
                        fillOpacity={0.82}
                        radius={[5, 5, 0, 0]}
                        maxBarSize={30}
                        isAnimationActive={!reduceMotion}
                        animationDuration={650}
                      />
                      <Line
                        type="monotone"
                        dataKey="forecast"
                        name="forecast"
                        stroke="var(--interactive)"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: "var(--card)", strokeWidth: 2 }}
                        activeDot={{ r: 5 }}
                        isAnimationActive={!reduceMotion}
                        animationDuration={750}
                      />
                      <Line
                        type="monotone"
                        dataKey="at_risk"
                        name="at_risk"
                        stroke="var(--danger)"
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={false}
                        isAnimationActive={!reduceMotion}
                        animationDuration={800}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty />
                )}
              </div>
            </div>

            <OperationSignal
              realization={realizationRate}
              risk={riskShare}
              activeClients={data.summary.active_clients}
              newClients={data.growth.new_clients}
              cancellations={data.growth.cancellations}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Breakdown
              title="Meios de pagamento"
              description="Como a receita confirmada entrou no período."
              rows={data.breakdowns.payment_methods.map((item) => ({
                label: item.method,
                value: item.value,
                formattedValue: money(item.value),
                hint: `${item.count} pagamento${item.count === 1 ? "" : "s"}`,
              }))}
            />
            <Breakdown
              title="Receita recorrente por serviço"
              description="Participação dos serviços na base ativa."
              rows={data.breakdowns.services.slice(0, 5).map((item) => ({
                label: item.service,
                value: item.value,
                formattedValue: money(item.value),
                hint: `${item.clients} cliente${item.clients === 1 ? "" : "s"}`,
              }))}
            />
          </div>
        </>
      ) : null}
    </section>
  )
}

function SummaryCard({ item, index }: { item: SummaryItem; index: number }) {
  const toneClasses = {
    default: "bg-secondary text-secondary-foreground",
    success: "bg-success-bg text-success-fg",
    danger: "bg-danger-bg text-danger-fg",
    interactive: "bg-interactive-bg text-interactive-fg",
  }
  const valueClasses = {
    default: "text-foreground",
    success: "text-money",
    danger: "text-danger",
    interactive: "text-interactive-fg",
  }

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("flex size-9 items-center justify-center rounded-xl", toneClasses[item.tone])}>
          <item.icon className="size-4" aria-hidden="true" />
        </span>
        <Trend current={item.current} previous={item.previous} inverse={item.inverse} />
      </div>
      <p className="mt-5 text-xs font-medium text-muted-foreground">{item.label}</p>
      <p className={cn("num mt-1.5 text-2xl font-semibold tracking-[-0.035em] sm:text-[26px]", valueClasses[item.tone])}>{item.value}</p>
      <div className="mt-2 flex items-center gap-2 text-[11px] leading-relaxed text-muted-foreground">
        <span className="min-w-0 flex-1">{item.description}</span>
        {item.onClick ? <ArrowRight className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /> : null}
      </div>
    </>
  )

  const className = "group relative w-full overflow-hidden rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md sm:p-5"
  const style = { animationDelay: `${index * 60}ms` }

  if (item.onClick) {
    return <button type="button" onClick={item.onClick} aria-label={item.actionLabel || item.label} className={className} style={style}>{content}</button>
  }

  return <article className={className} style={style}>{content}</article>
}

function Trend({ current, previous, inverse = false }: { current: number; previous: number; inverse?: boolean }) {
  if (previous <= 0) {
    return <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">Sem base anterior</span>
  }

  const change = ((current - previous) / previous) * 100
  const improved = inverse ? change < 0 : change > 0
  const neutral = Math.abs(change) < 0.05
  const Icon = neutral ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight

  return (
    <span className={cn(
      "num flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold",
      neutral ? "bg-muted text-muted-foreground" : improved ? "bg-success-bg text-success-fg" : "bg-danger-bg text-danger-fg"
    )}>
      <Icon className="size-3" aria-hidden="true" />
      {Math.abs(change).toFixed(1)}%
    </span>
  )
}

function OperationalMetric({ label, value, hint, progress, tone = "default", onClick, actionLabel }: {
  label: string
  value: string
  hint: string
  progress?: number
  tone?: "default" | "success" | "danger" | "interactive"
  onClick?: () => void
  actionLabel?: string
}) {
  const progressClass = {
    default: "bg-foreground/70",
    success: "bg-money",
    danger: "bg-danger",
    interactive: "bg-interactive",
  }

  const content = (
    <>
      <p className="microlabel truncate">{label}</p>
      <p className={cn("num mt-1.5 truncate text-base font-semibold", tone === "danger" && "text-danger", tone === "success" && "text-money")}>{value}</p>
      <div className="mt-1 flex min-h-7 items-start gap-1 text-[10px] leading-snug text-muted-foreground">
        <span className="min-w-0 flex-1 line-clamp-2">{hint}</span>
        {onClick ? <ArrowRight className="mt-0.5 size-3 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /> : null}
      </div>
      {progress !== undefined ? (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted" aria-label={`${Math.max(0, progress).toFixed(1)}%`}>
          <div className={cn("h-full rounded-full transition-[width] duration-700", progressClass[tone])} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      ) : null}
    </>
  )

  const className = "group min-w-0 rounded-xl border border-border bg-card p-3.5 text-left transition-colors"
  if (onClick) {
    return <button type="button" onClick={onClick} aria-label={actionLabel || label} className={cn(className, "hover:border-danger/40 hover:bg-danger-bg/30")}>{content}</button>
  }

  return <div className={className}>{content}</div>
}

function OperationSignal({ realization, risk, activeClients, newClients, cancellations }: {
  realization: number
  risk: number
  activeClients: number
  newClients: number
  cancellations: number
}) {
  const healthy = realization >= 80 && risk <= 10
  const attention = !healthy && (realization >= 50 || risk <= 25)
  const status = healthy ? "Saudável" : attention ? "Atenção" : "Crítico"
  const statusClass = healthy
    ? "bg-success-bg text-success-fg"
    : attention
      ? "bg-warning-bg text-warning-fg"
      : "bg-danger-bg text-danger-fg"

  return (
    <aside className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="microlabel">Leitura do período</p>
          <h3 className="mt-1 text-sm font-semibold text-foreground">Sinais da operação</h3>
        </div>
        <span className={cn("rounded-lg px-2.5 py-1 text-[10px] font-semibold", statusClass)}>{status}</span>
      </div>

      <div className="mt-6 flex items-end gap-2">
        <span className="num text-4xl font-semibold tracking-[-0.05em] text-foreground">{realization.toFixed(0)}%</span>
        <span className="pb-1 text-xs text-muted-foreground">de realização</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Relação entre receita confirmada e prevista para o período selecionado.</p>

      <div className="mt-6 space-y-3 border-t border-border pt-4">
        <SignalRow icon={ShieldCheck} label="Receita em risco" value={`${risk.toFixed(1)}%`} danger={risk > 10} />
        <SignalRow icon={UsersRound} label="Clientes ativos" value={String(activeClients)} />
        <SignalRow icon={ArrowUpRight} label="Entradas no período" value={String(newClients)} />
        <SignalRow icon={ArrowDownRight} label="Cancelamentos" value={String(cancellations)} danger={cancellations > 0} />
      </div>
    </aside>
  )
}

function SignalRow({ icon: Icon, label, value, danger = false }: { icon: typeof ShieldCheck; label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      <span className={cn("num font-semibold text-foreground", danger && "text-danger")}>{value}</span>
    </div>
  )
}

function ChartLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground" aria-label="Legenda do gráfico">
      <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-money" />Confirmado</span>
      <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-interactive" />Previsto</span>
      <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 border-t-2 border-dashed border-danger" />Em risco</span>
    </div>
  )
}

function Breakdown({ title, description, rows }: {
  title: string
  description: string
  rows: Array<{ label: string; value: number; formattedValue: string | number; hint: string }>
}) {
  const max = Math.max(...rows.map((row) => row.value), 0)

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <div className="mt-5 space-y-4">
        {rows.length ? rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-start justify-between gap-3 text-xs">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{row.label}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{row.hint}</p>
              </div>
              <span className="num shrink-0 font-semibold text-foreground">{row.formattedValue}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-interactive transition-[width] duration-700" style={{ width: `${max > 0 ? Math.max(3, (row.value / max) * 100) : 0}%` }} />
            </div>
          </div>
        )) : <Empty />}
      </div>
    </div>
  )
}

function Empty() {
  return <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-border px-4 text-center text-xs text-muted-foreground">Sem dados confiáveis neste período.</div>
}

function compactCurrency(value: number) {
  if (Math.abs(value) >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)} mi`
  if (Math.abs(value) >= 1_000) return `R$ ${(value / 1_000).toFixed(1)} mil`
  return `R$ ${Math.round(value)}`
}

function formatChartDate(value: string, period: ExecutivePeriod, long = false) {
  const normalized = value.length === 7 ? `${value}-01` : value
  const date = new Date(`${normalized}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  if (period === "90d" || period === "12m") {
    return date.toLocaleDateString("pt-BR", { month: long ? "long" : "short", year: long ? "numeric" : undefined })
  }
  return date.toLocaleDateString("pt-BR", long ? { day: "numeric", month: "long", year: "numeric" } : { day: "2-digit", month: "2-digit" })
}

function chartLabel(value: string) {
  if (value === "confirmed") return "Confirmado"
  if (value === "forecast") return "Previsto"
  if (value === "at_risk") return "Em risco"
  return value
}

function growthHint(current: number, previous: number) {
  if (previous === 0) return current > 0 ? "nova base no período" : "sem entradas no período"
  const change = ((current - previous) / previous) * 100
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs. anterior`
}

export function ExecutiveUpgrade() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm sm:p-10">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-interactive-bg text-interactive-fg">
        <BadgeDollarSign className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-semibold">Dashboard Executivo</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">Previsão, receita confirmada, risco e indicadores comparativos estão disponíveis nos planos Pro e Master.</p>
      <Button className="mt-5" onClick={() => window.location.assign("/planos")}>Conhecer o plano Pro</Button>
    </div>
  )
}

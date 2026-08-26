"use client"

import { useEffect, useState } from "react"
import type { LucideIcon } from "lucide-react"
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  CalendarRange,
  ChartColumn,
  ChartPie,
  CircleDollarSign,
  CreditCard,
  Layers3,
  Minus,
  RefreshCw,
  ShieldCheck,
  Target,
  TrendingUp,
  UsersRound,
  WalletCards,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Button } from "@/components/ui/button"
import { usePrivacy } from "@/hooks/use-privacy"
import type { ExecutiveDashboardDTO, ExecutivePeriod } from "@/lib/executive-metrics"
import { cn, formatCurrency } from "@/lib/utils"

const periodLabels: Array<{ value: ExecutivePeriod; label: string }> = [
  { value: "month", label: "Mês atual" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "12m", label: "12 meses" },
]

type Tone = "neutral" | "success" | "danger" | "interactive" | "warning"
type RankingTab = "services" | "payments" | "health"
type SecondaryTab = "growth" | "insights"

type SummaryMetric = {
  label: string
  value: string
  current: number
  previous: number
  description: string
  icon: LucideIcon
  tone: Tone
  inverse?: boolean
  onClick?: () => void
  actionLabel?: string
}

type RankingRow = {
  label: string
  value: number
  count: number
  countLabel: string
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
  const [rankingTab, setRankingTab] = useState<RankingTab>("services")
  const [secondaryTab, setSecondaryTab] = useState<SecondaryTab>("growth")
  const money = (value: number) => String(displayValue(formatCurrency(value)))
  const realizationRate = data.summary.forecast > 0
    ? (data.summary.confirmed / data.summary.forecast) * 100
    : 0
  const riskShare = data.summary.forecast > 0
    ? (data.summary.at_risk / data.summary.forecast) * 100
    : 0
  const totalPayments = data.breakdowns.payment_methods.reduce((sum, item) => sum + item.count, 0)
  const averagePerBucket = data.series.length > 0 ? data.summary.confirmed / data.series.length : 0
  const bestBucket = data.series.reduce<ExecutiveDashboardDTO["series"][number] | null>((best, item) => {
    if (!best || item.confirmed > best.confirmed) return item
    return best
  }, null)

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduceMotion(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  const summary: SummaryMetric[] = [
    {
      label: "Receita confirmada",
      value: money(data.summary.confirmed),
      current: data.summary.confirmed,
      previous: data.previous.confirmed,
      description: "Entradas realizadas",
      icon: CircleDollarSign,
      tone: "success",
    },
    {
      label: "Receita prevista",
      value: money(data.summary.forecast),
      current: data.summary.forecast,
      previous: data.previous.forecast,
      description: "Potencial do período",
      icon: TrendingUp,
      tone: "interactive",
    },
    {
      label: "Receita em risco",
      value: money(data.summary.at_risk),
      current: data.summary.at_risk,
      previous: data.previous.at_risk,
      description: `${riskShare.toFixed(1)}% da previsão`,
      icon: AlertTriangle,
      tone: data.summary.at_risk > 0 ? "danger" : "success",
      inverse: true,
      onClick: onRiskOpen,
      actionLabel: "Abrir clientes relacionados à receita em risco",
    },
    {
      label: "Receita recorrente",
      value: money(data.summary.mrr),
      current: data.summary.mrr,
      previous: data.previous.mrr,
      description: `${data.summary.active_clients} clientes ativos`,
      icon: RefreshCw,
      tone: "neutral",
    },
  ]

  return (
    <section className="space-y-4" aria-labelledby="executive-dashboard-title">
      <div className="overflow-hidden rounded-[24px] border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-interactive-bg text-interactive-fg">
              <BadgeDollarSign className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="microlabel">{compact ? "Visão financeira" : "Análises do negócio"}</p>
                <span className="rounded-md bg-success-bg px-2 py-0.5 text-[9px] font-semibold text-success-fg">DADOS REAIS</span>
              </div>
              <h2 id="executive-dashboard-title" className="mt-1 text-base font-semibold tracking-tight text-foreground sm:text-lg">
                {compact ? "Previsão e risco" : "Desempenho financeiro e crescimento"}
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                Compare clientes, recebimentos, serviços e saúde da operação no período selecionado.
              </p>
            </div>
          </div>

          <PeriodSelector period={period} onPeriodChange={onPeriodChange} />
        </div>

        <div className="grid gap-px border-t border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          {(compact ? summary.slice(0, 3) : summary).map((item) => (
            <ExecutiveMetric key={item.label} item={item} />
          ))}
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
            Os comparativos ganham precisão conforme novos ciclos são concluídos.
          </p>
        </div>
      ) : null}

      {!compact ? (
        <>
          <FinancialActivityPanel
            data={data}
            period={period}
            totalPayments={totalPayments}
            averagePerBucket={averagePerBucket}
            bestBucket={bestBucket}
            reduceMotion={reduceMotion}
            money={money}
          />

          {data.rates.default > 0 ? (
            <div className="flex flex-col gap-3 rounded-xl border border-danger-border bg-danger-bg/45 px-4 py-3 sm:flex-row sm:items-center">
              <AlertTriangle className="size-4 shrink-0 text-danger" aria-hidden="true" />
              <p className="flex-1 text-xs leading-relaxed text-danger-fg">
                <strong>{data.rates.default.toFixed(1)}% de inadimplência.</strong> O indicador compara os ciclos vencidos em risco com o total que já venceu no período.
              </p>
              {onRiskOpen ? (
                <Button variant="outline" size="sm" onClick={onRiskOpen} className="h-8 shrink-0 border-danger-border bg-card text-xs text-danger-fg hover:bg-danger-bg">
                  Ver clientes <ArrowRight className="ml-1.5 size-3.5" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="microlabel">Análises</p>
                <h2 className="mt-1 text-sm font-semibold text-foreground">Aprofunde a leitura</h2>
              </div>
              <div className="flex gap-1 rounded-xl border border-border bg-muted p-1" role="tablist" aria-label="Tipo de análise">
                <SecondaryTabButton icon={UsersRound} label="Crescimento" value="growth" selected={secondaryTab} onSelect={setSecondaryTab} />
                <SecondaryTabButton icon={ChartPie} label="Ranking e indicadores" value="insights" selected={secondaryTab} onSelect={setSecondaryTab} />
              </div>
            </div>

            <div id={`analysis-panel-${secondaryTab}`} role="tabpanel" aria-label={secondaryTab === "growth" ? "Crescimento da carteira" : "Ranking e indicadores"}>
              {secondaryTab === "growth" ? (
                <ClientGrowthPanel
                  current={data.growth.new_clients}
                  previous={data.growth.previous_new_clients}
                  activeClients={data.summary.active_clients}
                  cancellations={data.growth.cancellations}
                  period={period}
                  reduceMotion={reduceMotion}
                />
              ) : (
                <RankingExplorer
                  tab={rankingTab}
                  onTabChange={setRankingTab}
                  data={data}
                  realizationRate={realizationRate}
                  riskShare={riskShare}
                  totalPayments={totalPayments}
                  money={money}
                  reduceMotion={reduceMotion}
                />
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}

function PeriodSelector({ period, onPeriodChange }: {
  period: ExecutivePeriod
  onPeriodChange: (period: ExecutivePeriod) => void
}) {
  return (
    <div className="max-w-full overflow-x-auto pb-0.5">
      <div className="flex min-w-max gap-1 rounded-xl border border-border bg-muted p-1" role="group" aria-label="Período das análises">
        {periodLabels.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => onPeriodChange(item.value)}
            aria-pressed={period === item.value}
            className={cn(
              "min-h-9 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
  )
}

function ExecutiveMetric({ item }: { item: SummaryMetric }) {
  const tone = metricTone(item.tone)
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("flex size-9 items-center justify-center rounded-xl", tone.icon)}>
          <item.icon className="size-4" aria-hidden="true" />
        </span>
        <TrendBadge current={item.current} previous={item.previous} inverse={item.inverse} />
      </div>
      <p className="mt-5 text-xs font-medium text-muted-foreground">{item.label}</p>
      <p className={cn("num mt-1.5 truncate text-xl font-semibold tracking-[-0.035em] sm:text-2xl", tone.value)}>{item.value}</p>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{item.description}</span>
        {item.onClick ? <ArrowRight className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /> : null}
      </div>
    </>
  )
  const className = cn(
    "group min-h-[154px] min-w-0 bg-card p-4 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-5",
    item.onClick && "hover:bg-muted/55"
  )

  if (item.onClick) {
    return <button type="button" onClick={item.onClick} aria-label={item.actionLabel || item.label} className={className}>{content}</button>
  }
  return <article className={className}>{content}</article>
}

function ClientGrowthPanel({ current, previous, activeClients, cancellations, period, reduceMotion }: {
  current: number
  previous: number
  activeClients: number
  cancellations: number
  period: ExecutivePeriod
  reduceMotion: boolean
}) {
  const chartData = [
    { label: "Anterior", clients: previous },
    { label: period === "month" ? "Mês atual" : "Atual", clients: current },
  ]

  return (
    <article className="overflow-hidden rounded-[24px] border border-border bg-card shadow-sm" aria-labelledby="client-growth-title">
      <PanelHeader
        icon={UsersRound}
        title="Crescimento da carteira"
        description="Os números de novos clientes e variação já estão no resumo, acima. Aqui: a comparação visual e o contexto de retenção."
        badge={periodLabel(period)}
        tone="interactive"
        titleId="client-growth-title"
      />

      <div className="h-[290px] bg-muted/20 px-2 py-4 sm:px-5">
        <div className="h-full" role="img" aria-label={`Comparativo de novos clientes: ${previous} no período anterior e ${current} no atual`}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 560, height: 260 }}>
            <BarChart data={chartData} margin={{ top: 14, right: 10, left: -22, bottom: 2 }} barCategoryGap="38%">
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.45 }}
                formatter={(value) => [`${Number(value || 0)} clientes`, "Novos clientes"]}
                contentStyle={tooltipStyle}
              />
              <Bar dataKey="clients" radius={[8, 8, 0, 0]} maxBarSize={92} isAnimationActive={!reduceMotion} animationDuration={650}>
                <Cell fill="var(--chart-3)" />
                <Cell fill="var(--interactive)" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-border bg-border">
        <ContextMetric label="Clientes ativos" value={String(activeClients)} />
        <ContextMetric label="Cancelamentos" value={String(cancellations)} danger={cancellations > 0} />
      </div>
    </article>
  )
}

function FinancialActivityPanel({ data, period, totalPayments, averagePerBucket, bestBucket, reduceMotion, money }: {
  data: ExecutiveDashboardDTO
  period: ExecutivePeriod
  totalPayments: number
  averagePerBucket: number
  bestBucket: ExecutiveDashboardDTO["series"][number] | null
  reduceMotion: boolean
  money: (value: number) => string
}) {
  return (
    <article className="overflow-hidden rounded-[24px] border border-border bg-card shadow-sm" aria-labelledby="payment-activity-title">
      <PanelHeader
        icon={WalletCards}
        title="Pagamentos por período"
        description="Receita confirmada, previsão e risco ao longo do tempo."
        badge={periodLabel(period)}
        tone="warning"
        titleId="payment-activity-title"
      />

      <div className="grid grid-cols-2 gap-2 border-b border-border p-4 sm:grid-cols-4 sm:gap-3 sm:p-5">
        <MiniMetric label="Total confirmado" value={money(data.summary.confirmed)} tone="warning" />
        <MiniMetric label="Pagamentos" value={String(totalPayments)} tone="success" />
        <MiniMetric label="Média por intervalo" value={money(averagePerBucket)} tone="interactive" />
        <MiniMetric label="Melhor intervalo" value={money(bestBucket?.confirmed ?? 0)} tone="neutral" />
      </div>

      <div className="h-[338px] bg-muted/20 px-1 py-4 sm:px-4">
        {data.series.length ? (
          <div className="h-full" role="img" aria-label="Gráfico de receita confirmada, prevista e em risco no período">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 560, height: 300 }}>
              <ComposedChart data={data.series} margin={{ top: 10, right: 12, left: -10, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickFormatter={(value) => formatChartDate(String(value), period)}
                />
                <YAxis axisLine={false} tickLine={false} width={54} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={compactCurrency} />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.45 }}
                  contentStyle={tooltipStyle}
                  labelFormatter={(value) => formatChartDate(String(value), period, true)}
                  formatter={(value, name) => [money(Number(value || 0)), chartLabel(String(name))]}
                />
                <Bar dataKey="confirmed" name="confirmed" fill="var(--money)" fillOpacity={0.82} radius={[5, 5, 0, 0]} maxBarSize={28} isAnimationActive={!reduceMotion} animationDuration={650} />
                <Line type="monotone" dataKey="forecast" name="forecast" stroke="var(--warning)" strokeWidth={2.5} dot={{ r: 2.5, fill: "var(--card)", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={!reduceMotion} animationDuration={750} />
                <Line type="monotone" dataKey="at_risk" name="at_risk" stroke="var(--danger)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={!reduceMotion} animationDuration={800} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : <EmptyState label="Sem movimentação confiável neste período." />}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-[10px] text-muted-foreground" aria-label="Legenda do gráfico financeiro">
        <LegendItem color="bg-money" label="Confirmado" shape="square" />
        <LegendItem color="bg-warning" label="Previsto" />
        <LegendItem color="border-danger" label="Em risco" dashed />
      </div>
    </article>
  )
}

function RankingExplorer({ tab, onTabChange, data, realizationRate, riskShare, totalPayments, money, reduceMotion }: {
  tab: RankingTab
  onTabChange: (tab: RankingTab) => void
  data: ExecutiveDashboardDTO
  realizationRate: number
  riskShare: number
  totalPayments: number
  money: (value: number) => string
  reduceMotion: boolean
}) {
  const services: RankingRow[] = data.breakdowns.services.slice(0, 5).map((item) => ({
    label: item.service,
    value: item.value,
    count: item.clients,
    countLabel: `${item.clients} cliente${item.clients === 1 ? "" : "s"}`,
  }))
  const payments: RankingRow[] = data.breakdowns.payment_methods.slice(0, 5).map((item) => ({
    label: item.method,
    value: item.value,
    count: item.count,
    countLabel: `${item.count} pagamento${item.count === 1 ? "" : "s"}`,
  }))
  const rows = tab === "services" ? services : payments
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  const topShare = total > 0 && rows[0] ? (rows[0].value / total) * 100 : 0

  return (
    <section className="overflow-hidden rounded-[24px] border border-border bg-card shadow-sm" aria-labelledby="ranking-title">
      <div className="border-b border-border px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-interactive-bg text-interactive-fg">
              <ChartPie className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="microlabel">Ranking e composição</p>
              <h2 id="ranking-title" className="mt-1 text-base font-semibold tracking-tight text-foreground">Top 5 da operação</h2>
              <p className="mt-1 text-xs text-muted-foreground">Explore a concentração de receita e os indicadores de saúde.</p>
            </div>
          </div>
          <span className="w-fit rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">Período selecionado</span>
        </div>

        <div className="mt-5 flex max-w-full gap-1 overflow-x-auto" role="tablist" aria-label="Tipo de ranking">
          <RankingTabButton icon={Layers3} label="Serviços" value="services" selected={tab} onSelect={onTabChange} />
          <RankingTabButton icon={CreditCard} label="Pagamentos" value="payments" selected={tab} onSelect={onTabChange} />
          <RankingTabButton icon={ShieldCheck} label="Indicadores" value="health" selected={tab} onSelect={onTabChange} />
        </div>
      </div>

      {tab === "health" ? (
        <HealthPanel data={data} realizationRate={realizationRate} riskShare={riskShare} />
      ) : (
        <>
          <div className="grid gap-px border-b border-border bg-border sm:grid-cols-3">
            {tab === "services" ? (
              <>
                <RankingSummary label="Receita recorrente" value={money(data.summary.mrr)} tone="interactive" />
                <RankingSummary label="Serviços mapeados" value={String(data.breakdowns.services.length)} tone="success" />
                <RankingSummary label="Maior participação" value={`${topShare.toFixed(1)}%`} tone="warning" />
              </>
            ) : (
              <>
                <RankingSummary label="Receita confirmada" value={money(data.summary.confirmed)} tone="success" />
                <RankingSummary label="Total de pagamentos" value={String(totalPayments)} tone="interactive" />
                <RankingSummary label="Ticket médio" value={money(data.rates.average_ticket)} tone="warning" />
              </>
            )}
          </div>

          <div id={`ranking-panel-${tab}`} role="tabpanel" className="grid gap-4 bg-muted/20 p-4 sm:p-5 lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
            <RankingDonut rows={rows} total={total} centerLabel={tab === "services" ? "Receita" : "Confirmado"} centerValue={money(total)} money={money} reduceMotion={reduceMotion} />
            <RankingList rows={rows} total={total} money={money} />
          </div>
        </>
      )}
    </section>
  )
}

function SecondaryTabButton({ icon: Icon, label, value, selected, onSelect }: {
  icon: LucideIcon
  label: string
  value: SecondaryTab
  selected: SecondaryTab
  onSelect: (tab: SecondaryTab) => void
}) {
  const active = selected === value
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={`analysis-panel-${value}`}
      onClick={() => onSelect(value)}
      className={cn(
        "flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </button>
  )
}

function RankingTabButton({ icon: Icon, label, value, selected, onSelect }: {
  icon: LucideIcon
  label: string
  value: RankingTab
  selected: RankingTab
  onSelect: (tab: RankingTab) => void
}) {
  const active = selected === value
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={`ranking-panel-${value}`}
      onClick={() => onSelect(value)}
      className={cn(
        "flex min-h-10 min-w-max items-center gap-2 border-b-2 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        active ? "border-interactive text-interactive-fg" : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </button>
  )
}

function RankingDonut({ rows, total, centerLabel, centerValue, money, reduceMotion }: {
  rows: RankingRow[]
  total: number
  centerLabel: string
  centerValue: string
  money: (value: number) => string
  reduceMotion: boolean
}) {
  const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]
  return (
    <div className="rounded-[18px] border border-border bg-card p-4 sm:p-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Participação no total</h3>
        <p className="mt-1 text-[10px] text-muted-foreground">Distribuição proporcional dos cinco maiores grupos.</p>
      </div>
      {rows.length && total > 0 ? (
        <div className="relative mt-3 h-[300px]" role="img" aria-label={`Gráfico de participação. Total ${centerValue}`}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 420, height: 280 }}>
            <PieChart>
              <Pie data={rows} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={72} outerRadius={110} paddingAngle={3} cornerRadius={7} stroke="none" isAnimationActive={!reduceMotion} animationDuration={700}>
                {rows.map((row, index) => <Cell key={row.label} fill={colors[index % colors.length]} />)}
              </Pie>
              <Tooltip formatter={(value, name) => [money(Number(value || 0)), String(name)]} contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{centerLabel}</span>
            <span className="num mt-1 max-w-32 truncate text-base font-semibold text-foreground">{centerValue}</span>
          </div>
        </div>
      ) : <div className="mt-4"><EmptyState label="Sem distribuição confiável neste período." /></div>}
    </div>
  )
}

function RankingList({ rows, total, money }: { rows: RankingRow[]; total: number; money: (value: number) => string }) {
  const colors = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"]
  const max = Math.max(...rows.map((row) => row.value), 0)
  return (
    <div className="rounded-[18px] border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Ranking detalhado</h3>
          <p className="mt-1 text-[10px] text-muted-foreground">Valor, participação e volume de cada grupo.</p>
        </div>
        <Target className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>

      <div className="mt-5 space-y-3">
        {rows.length ? rows.map((row, index) => {
          const share = total > 0 ? (row.value / total) * 100 : 0
          return (
            <div key={row.label} className="rounded-xl border border-border bg-muted/25 p-3.5">
              <div className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-[10px] font-semibold text-secondary-foreground">{index + 1}</span>
                <span className={cn("size-2.5 shrink-0 rounded-full", colors[index % colors.length])} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">{row.label}</p>
                  <p className="mt-0.5 text-[9px] text-muted-foreground">{row.countLabel}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="num text-xs font-semibold text-foreground">{money(row.value)}</p>
                  <p className="num mt-0.5 text-[9px] text-muted-foreground">{share.toFixed(1)}%</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", colors[index % colors.length])} style={{ width: `${max > 0 ? Math.max(4, (row.value / max) * 100) : 0}%` }} />
              </div>
            </div>
          )
        }) : <EmptyState label="Sem itens para compor este ranking." />}
      </div>
    </div>
  )
}

function HealthPanel({ data, realizationRate, riskShare }: {
  data: ExecutiveDashboardDTO
  realizationRate: number
  riskShare: number
}) {
  const healthy = realizationRate >= 80 && riskShare <= 10
  const attention = !healthy && (realizationRate >= 50 || riskShare <= 25)
  const status = healthy ? "Saudável" : attention ? "Atenção" : "Crítico"
  const statusTone = healthy ? "success" : attention ? "warning" : "danger"

  return (
    <div id="ranking-panel-health" role="tabpanel" className="bg-muted/20 p-4 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-[18px] border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="microlabel">Leitura do período</p>
              <h3 className="mt-1 text-sm font-semibold text-foreground">Saúde da operação</h3>
            </div>
            <ToneBadge tone={statusTone} label={status} />
          </div>
          <div className="mt-7 flex items-end gap-2">
            <span className="num text-5xl font-semibold tracking-[-0.06em] text-foreground">{realizationRate.toFixed(0)}%</span>
            <span className="pb-1.5 text-xs text-muted-foreground">realizado</span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Relação entre o que já entrou e o total previsto para o período selecionado.</p>
          <div className="mt-6 border-t border-border pt-4">
            <ContextRow label="Clientes ativos" value={String(data.summary.active_clients)} />
            <ContextRow label="Novos clientes" value={String(data.growth.new_clients)} />
            <ContextRow label="Cancelamentos" value={String(data.growth.cancellations)} danger={data.growth.cancellations > 0} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <HealthMetric label="Realização" value={realizationRate} description="Confirmado sobre o previsto" tone={realizationRate >= 80 ? "success" : "warning"} />
          <HealthMetric label="Renovação" value={data.rates.renewal} description="Ciclos pagos no período" tone={data.rates.renewal >= 80 ? "success" : "interactive"} />
          <HealthMetric label="Inadimplência" value={data.rates.default} description="Valor vencido em risco" tone={data.rates.default > 10 ? "danger" : "success"} />
          <HealthMetric label="Cancelamentos" value={data.rates.cancellation} description="Perdas registradas no período" tone={data.rates.cancellation > 5 ? "danger" : "neutral"} />
        </div>
      </div>
    </div>
  )
}

function HealthMetric({ label, value, description, tone }: { label: string; value: number; description: string; tone: Tone }) {
  const toneClasses = metricTone(tone)
  return (
    <article className="rounded-[18px] border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <span className={cn("flex size-8 items-center justify-center rounded-lg", toneClasses.icon)}><Target className="size-3.5" aria-hidden="true" /></span>
      </div>
      <p className={cn("num mt-5 text-2xl font-semibold tracking-[-0.04em]", toneClasses.value)}>{value.toFixed(1)}%</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{description}</p>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted" aria-label={`${Math.max(0, value).toFixed(1)}%`}>
        <div className={cn("h-full rounded-full", progressClass(tone))} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </article>
  )
}

function PanelHeader({ icon: Icon, title, description, badge, tone, titleId }: {
  icon: LucideIcon
  title: string
  description: string
  badge: string
  tone: Tone
  titleId: string
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex items-center gap-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", metricTone(tone).icon)}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 id={titleId} className="truncate text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{description}</p>
        </div>
      </div>
      <span className="w-fit rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">{badge}</span>
    </div>
  )
}

function MiniMetric({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className={cn("min-w-0 rounded-xl border p-3 text-center", miniMetricClass(tone))}>
      <p className={cn("num truncate text-sm font-semibold sm:text-base", metricTone(tone).value)}>{value}</p>
      <p className="mt-1 truncate text-[9px] text-muted-foreground">{label}</p>
    </div>
  )
}

function ContextMetric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="bg-card px-4 py-3 text-center">
      <p className={cn("num text-sm font-semibold text-foreground", danger && "text-danger")}>{value}</p>
      <p className="mt-0.5 text-[9px] text-muted-foreground">{label}</p>
    </div>
  )
}

function RankingSummary({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="bg-card p-4 text-center sm:p-5">
      <p className={cn("num text-lg font-semibold sm:text-xl", metricTone(tone).value)}>{value}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}

function ContextRow({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("num font-semibold text-foreground", danger && "text-danger")}>{value}</span>
    </div>
  )
}

function ToneBadge({ tone, label }: { tone: Tone; label: string }) {
  const classes = {
    neutral: "bg-secondary text-secondary-foreground",
    success: "bg-success-bg text-success-fg",
    danger: "bg-danger-bg text-danger-fg",
    interactive: "bg-interactive-bg text-interactive-fg",
    warning: "bg-warning-bg text-warning-fg",
  }[tone]
  return <span className={cn("rounded-lg px-2.5 py-1 text-[10px] font-semibold", classes)}>{label}</span>
}

function TrendBadge({ current, previous, inverse = false }: { current: number; previous: number; inverse?: boolean }) {
  if (previous <= 0) return <span className="rounded-md bg-muted px-2 py-1 text-[9px] font-medium text-muted-foreground">Sem base</span>
  const change = ((current - previous) / previous) * 100
  const neutral = Math.abs(change) < 0.05
  const improved = inverse ? change < 0 : change > 0
  const Icon = neutral ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn(
      "num flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-semibold",
      neutral ? "bg-muted text-muted-foreground" : improved ? "bg-success-bg text-success-fg" : "bg-danger-bg text-danger-fg"
    )}>
      <Icon className="size-3" aria-hidden="true" />
      {Math.abs(change).toFixed(1)}%
    </span>
  )
}

function LegendItem({ color, label, shape = "line", dashed = false }: { color: string; label: string; shape?: "line" | "square"; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn(shape === "square" ? "size-2 rounded-sm" : "h-0.5 w-3", dashed && "border-t-2 border-dashed bg-transparent", color)} />
      {label}
    </span>
  )
}

function EmptyState({ label }: { label: string }) {
  return <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-border px-4 text-center text-xs text-muted-foreground">{label}</div>
}

function metricTone(tone: Tone) {
  return {
    neutral: { icon: "bg-secondary text-secondary-foreground", value: "text-foreground" },
    success: { icon: "bg-success-bg text-success-fg", value: "text-money" },
    danger: { icon: "bg-danger-bg text-danger-fg", value: "text-danger" },
    interactive: { icon: "bg-interactive-bg text-interactive-fg", value: "text-interactive-fg" },
    warning: { icon: "bg-warning-bg text-warning-fg", value: "text-warning-fg" },
  }[tone]
}

function miniMetricClass(tone: Tone) {
  return {
    neutral: "border-border bg-muted/25",
    success: "border-success-border bg-success-bg/35",
    danger: "border-danger-border bg-danger-bg/35",
    interactive: "border-interactive/25 bg-interactive-bg/45",
    warning: "border-warning-border bg-warning-bg/35",
  }[tone]
}

function progressClass(tone: Tone) {
  return {
    neutral: "bg-foreground/60",
    success: "bg-money",
    danger: "bg-danger",
    interactive: "bg-interactive",
    warning: "bg-warning",
  }[tone]
}

function periodLabel(period: ExecutivePeriod) {
  return periodLabels.find((item) => item.value === period)?.label || "Período"
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

const tooltipStyle = {
  borderRadius: "12px",
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  boxShadow: "0 12px 28px rgba(0,0,0,.12)",
  fontSize: "12px",
}

export function ExecutiveUpgrade() {
  return (
    <div className="rounded-[24px] border border-border bg-card p-8 text-center shadow-sm sm:p-10">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-interactive-bg text-interactive-fg">
        <ChartColumn className="size-6" aria-hidden="true" />
      </span>
      <p className="microlabel mt-5">Análises avançadas</p>
      <h2 className="mt-1 text-lg font-semibold text-foreground">Dashboard Executivo</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">Gráficos comparativos, previsão, risco, rankings e indicadores de saúde estão disponíveis nos planos Pro e Master.</p>
      <Button className="mt-5" onClick={() => window.location.assign("/planos")}>Conhecer o plano Pro</Button>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  ChartColumn,
  CreditCard,
  Layers3,
  WalletCards,
} from "lucide-react"
import {
  Bar,
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
import { ComingSoon } from "@/components/page-layout"
import { usePrivacy } from "@/hooks/use-privacy"
import type { ExecutiveDashboardDTO, ExecutivePeriod } from "@/lib/executive-metrics"
import { cn, formatCurrency } from "@/lib/utils"

const periodLabels: Array<{ value: ExecutivePeriod; label: string }> = [
  { value: "month", label: "Mês atual" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "12m", label: "12 meses" },
]

type RankingTab = "services" | "payments"

type RankingRow = {
  label: string
  value: number
  countLabel: string
}

export function ExecutiveDashboardView({ data, period, onRiskOpen }: {
  data: ExecutiveDashboardDTO
  period: ExecutivePeriod
  onRiskOpen?: () => void
}) {
  const { displayValue } = usePrivacy()
  const [reduceMotion, setReduceMotion] = useState(false)
  const [rankingTab, setRankingTab] = useState<RankingTab>("services")
  const money = (value: number) => String(displayValue(formatCurrency(value)))
  const realizationRate = data.summary.forecast > 0 ? (data.summary.confirmed / data.summary.forecast) * 100 : 0
  const riskShare = data.summary.forecast > 0 ? (data.summary.at_risk / data.summary.forecast) * 100 : 0
  const mrrChange = data.previous.mrr > 0 ? ((data.summary.mrr - data.previous.mrr) / data.previous.mrr) * 100 : null

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduceMotion(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  return (
    <>
      {data.coverage.partial ? (
        <div className="flex items-start gap-3 rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-xs text-warning-fg" role="status">
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

      {/* INDICADORES AVANÇADOS */}
      <section className="flex flex-col gap-4" aria-labelledby="executive-indicators-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="microlabel">Indicadores avançados</p>
            <h2 id="executive-indicators-title" className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-foreground">
              Saúde financeira da carteira
            </h2>
          </div>
          <span className="rounded-lg border border-interactive/30 bg-interactive-bg px-2.5 py-[5px] text-[10px] font-semibold text-interactive-fg">
            {data.entitlement.plan === "master" ? "Plano Master" : "Plano Pro"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <IndicatorCard
            label="Receita recorrente (MRR)"
            value={money(data.summary.mrr)}
            hint={mrrChange === null
              ? `${data.summary.active_clients} clientes ativos`
              : `${mrrChange >= 0 ? "+" : ""}${mrrChange.toFixed(1)}% vs período anterior`}
            hintClassName={mrrChange !== null && mrrChange >= 0 ? "text-money" : mrrChange !== null ? "text-danger" : undefined}
          />
          <IndicatorCard
            label="Churn no período"
            value={`${data.rates.cancellation.toFixed(1)}%`}
            hint={`${data.growth.cancellations} cliente${data.growth.cancellations === 1 ? "" : "s"} no período`}
          />
          <IndicatorCard
            label="Receita em risco"
            value={money(data.summary.at_risk)}
            valueClassName={data.summary.at_risk > 0 ? "text-danger" : undefined}
            hint={`${riskShare.toFixed(1)}% da previsão`}
            onClick={onRiskOpen}
            actionLabel="Abrir clientes relacionados à receita em risco"
          />
          <HealthCard realizationRate={realizationRate} riskShare={riskShare} renewalRate={data.rates.renewal} />
        </div>

        <MissingIndicators />
      </section>

      {data.rates.default > 0 ? (
        <div className="flex flex-col gap-3 rounded-lg border border-danger-border bg-danger-bg/45 px-4 py-3 sm:flex-row sm:items-center">
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

      {/* ANÁLISES */}
      <section className="flex flex-col gap-4" aria-labelledby="executive-analytics-title">
        <div>
          <p className="microlabel">Análises</p>
          <h2 id="executive-analytics-title" className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-foreground">
            Desempenho financeiro
          </h2>
        </div>

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.75fr)]">
          <PaymentsPanel data={data} period={period} money={money} reduceMotion={reduceMotion} />
          <RankingPanel data={data} tab={rankingTab} onTabChange={setRankingTab} money={money} reduceMotion={reduceMotion} />
        </div>
      </section>
    </>
  )
}

function IndicatorCard({ label, value, valueClassName, hint, hintClassName, onClick, actionLabel }: {
  label: string
  value: string
  valueClassName?: string
  hint: string
  hintClassName?: string
  onClick?: () => void
  actionLabel?: string
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        {onClick ? <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" /> : null}
      </div>
      <p className={cn("num mt-2 truncate text-[22px] font-semibold tracking-[-0.02em] text-foreground", valueClassName)}>{value}</p>
      <p className={cn("mt-1 text-[10.5px] text-muted-foreground", hintClassName)}>{hint}</p>
    </>
  )
  const className = "rounded-lg border border-border bg-card p-4 text-left"

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={actionLabel}
        className={cn(className, "group transition-colors hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
      >
        {content}
      </button>
    )
  }
  return <article className={className}>{content}</article>
}

/**
 * O protótipo mostra um "índice de saúde" em escala /100 e um "LTV médio", que
 * não têm fonte real hoje. Este cartão ocupa o mesmo lugar usando a taxa de
 * realização real (confirmado ÷ previsto), com o status derivado dela e do risco.
 */
function HealthCard({ realizationRate, riskShare, renewalRate }: {
  realizationRate: number
  riskShare: number
  renewalRate: number
}) {
  const healthy = realizationRate >= 80 && riskShare <= 10
  const attention = !healthy && (realizationRate >= 50 || riskShare <= 25)
  const status = healthy ? "Carteira estável" : attention ? "Requer atenção" : "Situação crítica"

  return (
    <article className={cn(
      "rounded-lg border p-4",
      healthy ? "border-success-fg/25 bg-success-bg/35" : attention ? "border-warning-border bg-warning-bg/35" : "border-danger-border bg-danger-bg/35",
    )}>
      <p className="text-[11px] text-muted-foreground">Índice de saúde</p>
      <p className={cn(
        "num mt-2 text-[22px] font-semibold tracking-[-0.02em]",
        healthy ? "text-success-fg" : attention ? "text-warning-fg" : "text-danger-fg",
      )}>
        {realizationRate.toFixed(0)}% realizado
      </p>
      <p className="mt-1 text-[10.5px] text-muted-foreground">{status} · {renewalRate.toFixed(0)}% de renovação</p>
    </article>
  )
}

function PaymentsPanel({ data, period, money, reduceMotion }: {
  data: ExecutiveDashboardDTO
  period: ExecutivePeriod
  money: (value: number) => string
  reduceMotion: boolean
}) {
  return (
    <article className="min-w-0 overflow-hidden border-t border-foreground" aria-labelledby="payment-activity-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning-bg text-warning-fg">
            <WalletCards className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 id="payment-activity-title" className="text-sm font-semibold text-foreground">Pagamentos por período</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Receita confirmada e prevista ao longo do tempo</p>
          </div>
        </div>
        <span className="rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
          {periodLabels.find((item) => item.value === period)?.label ?? "Período"}
        </span>
      </div>

      <div className="h-[280px] min-w-0 px-1 py-4 sm:px-4">
        {data.series.length ? (
          <div className="h-full min-w-0" role="img" aria-label="Gráfico de receita confirmada, prevista e em risco no período">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 560, height: 260 }}>
              <ComposedChart data={data.series} margin={{ top: 10, right: 12, left: -10, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickFormatter={(value) => formatChartDate(String(value), period)}
                />
                <YAxis axisLine={false} tickLine={false} width={54} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickFormatter={compactCurrency} />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.45 }}
                  contentStyle={tooltipStyle}
                  labelFormatter={(value) => formatChartDate(String(value), period, true)}
                  formatter={(value, name) => [money(Number(value || 0)), chartLabel(String(name))]}
                />
                <Bar
                  dataKey="confirmed"
                  name="confirmed"
                  fill="var(--money)"
                  fillOpacity={0.82}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                  background={{ fill: "var(--muted)", opacity: 0.85, radius: 6 } as never}
                  isAnimationActive={!reduceMotion}
                  animationDuration={650}
                />
                <Line type="monotone" dataKey="forecast" name="forecast" stroke="var(--warning)" strokeWidth={2.5} dot={{ r: 2.5, fill: "var(--card)", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={!reduceMotion} animationDuration={750} />
                <Line type="monotone" dataKey="at_risk" name="at_risk" stroke="var(--danger)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={!reduceMotion} animationDuration={800} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : <EmptyState label="Sem movimentação confiável neste período." />}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-border px-4 py-3 text-[10px] text-muted-foreground" aria-label="Legenda do gráfico financeiro">
        <LegendItem color="bg-money" label="Confirmado" shape="square" />
        <LegendItem color="bg-warning" label="Previsto" />
        <LegendItem color="border-danger" label="Em risco" dashed />
      </div>
    </article>
  )
}

/**
 * Painel "Top serviços" do handoff. O alternador Serviços/Pagamentos é um
 * acréscimo ao protótipo para não perder o ranking real de meios de pagamento,
 * que já existia na página antes deste redesign.
 */
function RankingPanel({ data, tab, onTabChange, money, reduceMotion }: {
  data: ExecutiveDashboardDTO
  tab: RankingTab
  onTabChange: (tab: RankingTab) => void
  money: (value: number) => string
  reduceMotion: boolean
}) {
  const rows: RankingRow[] = tab === "services"
    ? data.breakdowns.services.slice(0, 5).map((item) => ({
        label: item.service,
        value: item.value,
        countLabel: `${item.clients} cliente${item.clients === 1 ? "" : "s"}`,
      }))
    : data.breakdowns.payment_methods.slice(0, 5).map((item) => ({
        label: item.method,
        value: item.value,
        countLabel: `${item.count} pagamento${item.count === 1 ? "" : "s"}`,
      }))

  const total = rows.reduce((sum, row) => sum + row.value, 0)
  const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]

  return (
    <article className="flex min-w-0 flex-col overflow-hidden border-t border-foreground" aria-labelledby="ranking-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h3 id="ranking-title" className="text-sm font-semibold text-foreground">
            {tab === "services" ? "Top serviços" : "Top pagamentos"}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Participação na receita do período</p>
        </div>
        <div className="flex shrink-0 gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Tipo de ranking">
          <RankingTabButton icon={Layers3} label="Serviços" value="services" selected={tab} onSelect={onTabChange} />
          <RankingTabButton icon={CreditCard} label="Pagamentos" value="payments" selected={tab} onSelect={onTabChange} />
        </div>
      </div>

      {rows.length && total > 0 ? (
        <>
          <div className="relative flex justify-center px-5 pb-1.5 pt-5">
            <div className="pointer-events-none absolute inset-x-5 inset-y-5 bottom-1.5 flex flex-col items-center justify-center gap-[3px]">
              <span className="font-mono text-[8.5px] uppercase tracking-[0.04em] text-muted-foreground">Receita total</span>
              <span className="num text-xs font-semibold text-foreground">{money(total)}</span>
            </div>
            <div className="size-40" role="img" aria-label={`Participação na receita. Total ${money(total)}`}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 160, height: 160 }}>
                <PieChart>
                  <Pie data={rows} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={51} outerRadius={73} paddingAngle={2} stroke="none" isAnimationActive={!reduceMotion} animationDuration={700}>
                    {rows.map((row, index) => <Cell key={row.label} fill={colors[index % colors.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value, name) => [money(Number(value || 0)), String(name)]} contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-2.5 px-[18px] pb-[18px] pt-1.5">
            {rows.map((row, index) => {
              const share = total > 0 ? (row.value / total) * 100 : 0
              return (
                <div key={row.label}>
                  <div className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: colors[index % colors.length] }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-foreground">{row.label}</span>
                    <span className="num text-[11px] font-semibold text-foreground">{money(row.value)}</span>
                    <span className="num w-[34px] text-right text-[10px] text-muted-foreground">{share.toFixed(1)}%</span>
                  </div>
                  <div className="mt-[5px] h-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(4, share)}%`, background: colors[index % colors.length] }} />
                  </div>
                  <span className="sr-only">{row.countLabel}</span>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="p-5"><EmptyState label="Sem distribuição confiável neste período." /></div>
      )}
    </article>
  )
}

function RankingTabButton({ icon: Icon, label, value, selected, onSelect }: {
  icon: typeof Layers3
  label: string
  value: RankingTab
  selected: RankingTab
  onSelect: (tab: RankingTab) => void
}) {
  const active = selected === value
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={active}
      className={cn(
        "flex min-h-[30px] items-center gap-1.5 rounded-[6px] px-2.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
        active ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,.06)]" : "font-medium text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </button>
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
  return <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-xs text-muted-foreground">{label}</div>
}

function compactCurrency(value: number) {
  if (Math.abs(value) >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)} mi`
  if (Math.abs(value) >= 1_000) return `R$ ${(value / 1_000).toFixed(1)}k`
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
  borderRadius: "8px",
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  boxShadow: "0 12px 28px rgba(0,0,0,.12)",
  fontSize: "12px",
}

/**
 * Cartões do protótipo que dependem de dado inexistente hoje (LTV médio e a
 * previsão sazonal "Master") ficam como indisponíveis declarados, conforme a
 * política de placeholder visível da Etapa 57.
 */
function MissingIndicators() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <MissingIndicator label="LTV médio" hint="Depende de histórico de permanência ainda não consolidado." />
      <MissingIndicator label="Previsão sazonal" hint="Exige seis ciclos completos de renovação para ser confiável." />
    </div>
  )
}

function MissingIndicator({ label, hint }: { label: string; hint: string }) {
  return (
    <article className="rounded-lg border border-dashed border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <ComingSoon />
      </div>
      <p className="mt-1 text-[10.5px] text-muted-foreground">{hint}</p>
    </article>
  )
}

export function ExecutiveUpgrade() {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center sm:p-10">
      <span className="mx-auto flex size-12 items-center justify-center rounded-lg bg-interactive-bg text-interactive-fg">
        <ChartColumn className="size-6" aria-hidden="true" />
      </span>
      <p className="microlabel mt-5">Análises avançadas</p>
      <h2 className="mt-1 text-lg font-semibold text-foreground">Dashboard Executivo</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">Gráficos comparativos, previsão, risco, rankings e indicadores de saúde estão disponíveis nos planos Pro e Master.</p>
      <Button className="mt-5" onClick={() => window.location.assign("/planos")}>Conhecer o plano Pro</Button>
    </div>
  )
}

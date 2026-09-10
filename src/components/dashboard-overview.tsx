"use client"

import { useState } from "react"
import type { LucideIcon } from "lucide-react"
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Check,
  ChevronDown,
  CircleDollarSign,
  ListFilter,
  Minus,
  UserPlus,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { ExecutivePeriod } from "@/lib/executive-metrics"

/** Distribuição real dos vencimentos em 9 faixas de dias do mês (ver `buildDueDaySpark`). */
export type SparkSeries = number[]

type DashboardOverviewProps = {
  totalClients: number
  activeClients: number
  overdueClients: number
  activeShare: number
  overdueAmount: string
  newClients: number | null
  previousNewClients: number | null
  dueTodayCount: number
  nextSevenDaysCount: number
  dueTodayAmount: string
  nextSevenDaysAmount: string
  confirmedAmount: string
  trackedAmount: string
  advancedFinance: boolean
  period: ExecutivePeriod
  onPeriodChange: (period: ExecutivePeriod) => void
  sparkTotal: SparkSeries
  sparkActive: SparkSeries
  sparkOverdue: SparkSeries
  onOverdueOpen: () => void
  onTodayOpen: () => void
  onNextSevenDaysOpen: () => void
}

const PERIOD_TABS: Array<{ value: ExecutivePeriod; label: string }> = [
  { value: "month", label: "Mês atual" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "12m", label: "12 meses" },
]

type TypeKey = "clientes" | "ativos" | "vencidos" | "novos" | "renovacoes" | "receber"

const TYPE_FILTERS: Array<{ key: TypeKey; label: string; dot: string }> = [
  { key: "clientes", label: "Total de clientes", dot: "bg-secondary-foreground" },
  { key: "ativos", label: "Ativos", dot: "bg-money" },
  { key: "vencidos", label: "Vencidos", dot: "bg-danger" },
  { key: "novos", label: "Novos clientes", dot: "bg-interactive" },
  { key: "renovacoes", label: "Renovações", dot: "bg-warning" },
  { key: "receber", label: "Valores a receber", dot: "bg-money" },
]

const ALL_TYPES: Record<TypeKey, boolean> = {
  clientes: true, ativos: true, vencidos: true, novos: true, renovacoes: true, receber: true,
}

/**
 * Agrupa os dias de vencimento (1–31) em 9 faixas, para a sparkline de cada
 * indicador. É a mesma fonte real do mapa de vencimentos — uma distribuição da
 * carteira por dia do mês, não uma série histórica.
 */
export function buildDueDaySpark(clients: Array<{ due_date: string }>): SparkSeries {
  const buckets = Array.from({ length: 9 }, () => 0)
  for (const client of clients) {
    const day = Number(client.due_date?.slice(8, 10))
    if (!Number.isInteger(day) || day < 1 || day > 31) continue
    buckets[Math.min(8, Math.floor((day - 1) / 3.5))] += 1
  }
  return buckets
}

export function DashboardOverview({
  totalClients,
  activeClients,
  overdueClients,
  activeShare,
  overdueAmount,
  newClients,
  previousNewClients,
  dueTodayCount,
  nextSevenDaysCount,
  dueTodayAmount,
  nextSevenDaysAmount,
  confirmedAmount,
  trackedAmount,
  advancedFinance,
  period,
  onPeriodChange,
  sparkTotal,
  sparkActive,
  sparkOverdue,
  onOverdueOpen,
  onTodayOpen,
  onNextSevenDaysOpen,
}: DashboardOverviewProps) {
  const [types, setTypes] = useState<Record<TypeKey, boolean>>(ALL_TYPES)
  const growth = newClients !== null && previousNewClients !== null
    ? percentageChange(newClients, previousNewClients)
    : null
  const selectedTypes = TYPE_FILTERS.filter((item) => types[item.key]).length
  const periodLabel = PERIOD_TABS.find((item) => item.value === period)?.label ?? "Mês atual"

  return (
    <section className="flex flex-col gap-4" aria-labelledby="dashboard-overview-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="microlabel">Visão geral</p>
          <h2 id="dashboard-overview-title" className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-foreground">
            Carteira e operação
          </h2>
        </div>
        <span className="rounded-lg border border-border bg-card px-2.5 py-[5px] text-[10px] font-medium text-muted-foreground">
          {advancedFinance ? `Período: ${periodLabel}` : "Atualizado agora"}
        </span>
      </div>

      {/* Barra de filtros — período real (drives a API de executivo) + recorte visual dos indicadores */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-border bg-card px-3.5 py-2.5">
        <div className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <ListFilter className="size-[13px]" aria-hidden="true" /> Filtros
        </div>

        {advancedFinance ? (
          <>
            <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
            <div className="flex shrink-0 gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Período das análises">
              {PERIOD_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => onPeriodChange(tab.value)}
                  aria-pressed={period === tab.value}
                  className={cn(
                    "min-h-[30px] rounded-[6px] px-2.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                    period === tab.value
                      ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                      : "font-medium text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </>
        ) : null}

        <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />

        <Popover>
          <PopoverTrigger
            className="flex min-h-[30px] shrink-0 items-center gap-[7px] rounded-[6px] border border-input bg-background px-2.5 text-[11px] font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Escolher quais indicadores destacar"
          >
            Tipos
            <span className="num text-[10px] text-muted-foreground">{selectedTypes}/{TYPE_FILTERS.length}</span>
            <ChevronDown className="size-3" aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[236px] gap-1 p-1.5">
            {TYPE_FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTypes((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                aria-pressed={types[item.key]}
                className="flex w-full items-center gap-2.5 rounded-[6px] p-2 text-left text-xs text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-[4px] border-[1.5px]",
                  types[item.key] ? "border-foreground bg-foreground" : "border-input",
                )}>
                  {types[item.key] ? <Check className="size-2.5 text-background" strokeWidth={3} aria-hidden="true" /> : null}
                </span>
                <span className={cn("size-1.5 shrink-0 rounded-full", item.dot)} aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
              </button>
            ))}
            <div className="mt-1 border-t border-border pt-1">
              <button
                type="button"
                onClick={() => setTypes(ALL_TYPES)}
                className="w-full rounded-[6px] p-1.5 text-center text-[11px] font-semibold text-interactive hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Selecionar todos
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Indicadores primários — grade plana, sem cards (regra tipográfica do handoff v2) */}
      <div className="grid grid-cols-1 border-b border-t border-b-border border-t-foreground sm:grid-cols-3">
        <StatCell
          label="Total de clientes"
          value={String(totalClients)}
          hint={`${activeClients} cliente${activeClients === 1 ? "" : "s"} ativo${activeClients === 1 ? "" : "s"}`}
          spark={sparkTotal}
          sparkClassName="fill-secondary-foreground"
          sparkOpacity="opacity-55"
          dimmed={!types.clientes}
          className="border-b border-border pl-5 sm:border-b-0 sm:border-r sm:pl-0"
        />
        <StatCell
          label="Clientes ativos"
          value={String(activeClients)}
          valueClassName="text-money"
          badge={{ label: "ATIVO", className: "bg-success-bg text-success-fg" }}
          hint={`${activeShare.toFixed(0)}% da carteira em andamento`}
          spark={sparkActive}
          sparkClassName="fill-money"
          sparkOpacity="opacity-70"
          dimmed={!types.ativos}
          className="border-b border-border px-5 sm:border-b-0 sm:border-r"
        />
        <StatCell
          label="Clientes vencidos"
          value={String(overdueClients)}
          valueClassName="text-danger"
          badge={{ label: "VENCIDO", className: "bg-danger-bg text-danger-fg" }}
          hint={`${overdueAmount} em mensalidades`}
          spark={sparkOverdue}
          sparkClassName="fill-danger"
          sparkOpacity="opacity-60"
          dimmed={!types.vencidos}
          className="px-5"
          onClick={onOverdueOpen}
          actionLabel="Abrir clientes vencidos na fila de ação"
        />
      </div>

      {/* Painéis de apoio — mesma grade plana, três colunas */}
      <div className="grid grid-cols-1 border-t border-border lg:grid-cols-3">
        <InsightCell
          icon={UserPlus}
          tone="interactive"
          title="Crescimento da carteira"
          subtitle="Comparativo do período selecionado"
          dimmed={!types.novos}
          className="border-b border-border pl-5 lg:border-b-0 lg:border-r lg:pl-0"
          rows={[
            { label: "Novos clientes", value: newClients === null ? "—" : String(newClients), emphasize: true },
            { label: "Período anterior", value: previousNewClients === null ? "—" : String(previousNewClients) },
          ]}
          footer={growth === null
            ? { label: "Disponível na visão Pro", value: "Histórico" }
            : { label: growth.label, value: growth.value, trend: growth.trend }}
        />

        <InsightCell
          icon={CalendarClock}
          tone="warning"
          title="Renovações e vencimentos"
          subtitle="Prioridades mais próximas"
          dimmed={!types.renovacoes}
          className="border-b border-border px-5 lg:border-b-0 lg:border-r"
          rows={[
            { label: "Vencem hoje", value: String(dueTodayCount), supporting: dueTodayAmount, onClick: onTodayOpen },
            { label: "Próximos 7 dias", value: String(nextSevenDaysCount), supporting: nextSevenDaysAmount, onClick: onNextSevenDaysOpen },
          ]}
          footer={{
            label: overdueClients > 0 ? "Exigem atenção" : "Fila em dia",
            value: `${overdueClients} vencido${overdueClients === 1 ? "" : "s"}`,
            trend: overdueClients > 0 ? "down" : "flat",
          }}
        />

        <InsightCell
          icon={CircleDollarSign}
          tone="money"
          title="Valores a receber"
          subtitle="Movimentação do período"
          dimmed={!types.receber}
          className="px-5"
          rows={[
            { label: "Confirmado", value: confirmedAmount, emphasize: true },
            { label: "Em acompanhamento", value: trackedAmount },
          ]}
          footer={{ label: "Carteira monitorada", value: trackedAmount, trend: "up" }}
        />
      </div>
    </section>
  )
}

function StatCell({ label, value, valueClassName, badge, hint, spark, sparkClassName, sparkOpacity, dimmed, className, onClick, actionLabel }: {
  label: string
  value: string
  valueClassName?: string
  badge?: { label: string; className: string }
  hint: string
  spark: SparkSeries
  sparkClassName: string
  sparkOpacity: string
  dimmed: boolean
  className?: string
  onClick?: () => void
  actionLabel?: string
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
        {onClick ? <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
      </div>
      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <p className={cn("num text-[34px] font-semibold leading-none tracking-[-0.03em] text-foreground", valueClassName)}>{value}</p>
          {badge ? (
            <span className={cn("num rounded-[4px] px-1.5 py-0.5 text-[9.5px] font-semibold tracking-[0.04em]", badge.className)}>
              {badge.label}
            </span>
          ) : null}
        </div>
        <Sparkline values={spark} className={sparkClassName} opacityClassName={sparkOpacity} />
      </div>
      <p className="mt-1.5 text-[11.5px] text-muted-foreground">{hint}</p>
    </>
  )

  const cellClassName = cn(
    "py-[18px] transition-opacity duration-200 motion-reduce:transition-none",
    dimmed && "opacity-[0.32]",
    className,
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={actionLabel}
        className={cn(cellClassName, "text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring")}
      >
        {content}
      </button>
    )
  }
  return <article className={cellClassName}>{content}</article>
}

/**
 * Mini-histograma da distribuição real da carteira por dia de vencimento.
 * Não é série temporal — o rótulo acessível deixa isso explícito.
 */
function Sparkline({ values, className, opacityClassName }: { values: SparkSeries; className: string; opacityClassName: string }) {
  const max = Math.max(...values, 1)
  return (
    <svg
      viewBox="0 0 69 26"
      className={cn("h-[26px] w-full min-w-7 max-w-[72px] shrink-0", opacityClassName)}
      role="img"
      aria-label="Distribuição dos vencimentos por dia do mês"
    >
      {values.map((value, index) => {
        const height = Math.max(3, (value / max) * 26)
        return <rect key={index} x={index * 8} y={26 - height} width={5} height={height} rx={1.5} className={className} />
      })}
    </svg>
  )
}

type InsightRow = {
  label: string
  value: string
  supporting?: string
  emphasize?: boolean
  onClick?: () => void
}

type InsightFooter = {
  label: string
  value: string
  trend?: "up" | "down" | "flat"
}

function InsightCell({ icon: Icon, title, subtitle, tone, rows, footer, dimmed, className }: {
  icon: LucideIcon
  title: string
  subtitle: string
  tone: "interactive" | "warning" | "money"
  rows: InsightRow[]
  footer: InsightFooter
  dimmed: boolean
  className?: string
}) {
  const toneClasses = {
    interactive: "bg-interactive-bg text-interactive-fg",
    warning: "bg-warning-bg text-warning-fg",
    money: "bg-success-bg text-success-fg",
  }[tone]

  return (
    <article className={cn(
      "flex min-h-[224px] flex-col transition-opacity duration-200 motion-reduce:transition-none",
      dimmed && "opacity-[0.32]",
      className,
    )}>
      <div className="flex items-center gap-2.5 border-b border-border py-3.5">
        <span className={cn("flex size-[34px] shrink-0 items-center justify-center rounded-lg", toneClasses)}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="flex-1">
        {rows.map((row, index) => (
          <InsightRowView key={row.label} row={row} withBorder={index < rows.length - 1} />
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border py-3">
        <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
          <TrendIcon trend={footer.trend} />
          <span className="truncate">{footer.label}</span>
        </div>
        <span className="num shrink-0 text-xs font-semibold text-foreground">{footer.value}</span>
      </div>
    </article>
  )
}

function InsightRowView({ row, withBorder }: { row: InsightRow; withBorder: boolean }) {
  const content = (
    <>
      <span className="min-w-0 flex-1 truncate text-left text-xs text-muted-foreground">{row.label}</span>
      {row.supporting ? <span className="num hidden truncate text-[10px] text-muted-foreground sm:block">{row.supporting}</span> : null}
      <span className={cn("num shrink-0 text-sm font-semibold text-foreground", row.emphasize && "text-money")}>{row.value}</span>
      {row.onClick ? <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" /> : null}
    </>
  )
  const rowClassName = cn("flex min-h-14 items-center gap-2", withBorder && "border-b border-border/70")

  if (row.onClick) {
    return (
      <button
        type="button"
        onClick={row.onClick}
        className={cn(rowClassName, "group w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring")}
        aria-label={`Abrir fila: ${row.label.toLowerCase()}, ${row.value}`}
      >
        {content}
      </button>
    )
  }
  return <div className={rowClassName}>{content}</div>
}

function TrendIcon({ trend = "flat" }: { trend?: "up" | "down" | "flat" }) {
  if (trend === "up") return <ArrowUpRight className="size-3.5 shrink-0 text-success-fg" aria-hidden="true" />
  if (trend === "down") return <ArrowDownRight className="size-3.5 shrink-0 text-danger" aria-hidden="true" />
  return <Minus className="size-3.5 shrink-0" aria-hidden="true" />
}

function percentageChange(current: number, previous: number): InsightFooter & { trend: "up" | "down" | "flat" } {
  if (previous === 0) {
    return {
      label: current > 0 ? "Nova base no período" : "Sem novos cadastros",
      value: current > 0 ? `+${current}` : "0",
      trend: current > 0 ? "up" : "flat",
    }
  }

  const change = ((current - previous) / previous) * 100
  return {
    label: "Comparado ao anterior",
    value: `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`,
    trend: Math.abs(change) < 0.05 ? "flat" : change > 0 ? "up" : "down",
  }
}

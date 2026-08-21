"use client"

import type { LucideIcon } from "lucide-react"
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CircleDollarSign,
  Minus,
  UserPlus,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
} from "lucide-react"

import { cn } from "@/lib/utils"

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
  forecastAmount: string
  todayAmount: string
  trackedAmount: string
  advancedFinance: boolean
  onOverdueOpen: () => void
  onTodayOpen: () => void
  onNextSevenDaysOpen: () => void
}

type Tone = "neutral" | "success" | "danger" | "interactive" | "warning" | "money"

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
  forecastAmount,
  todayAmount,
  trackedAmount,
  advancedFinance,
  onOverdueOpen,
  onTodayOpen,
  onNextSevenDaysOpen,
}: DashboardOverviewProps) {
  const growth = newClients !== null && previousNewClients !== null
    ? percentageChange(newClients, previousNewClients)
    : null

  return (
    <section className="space-y-4" aria-labelledby="dashboard-overview-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="microlabel">Visão geral</p>
          <h2 id="dashboard-overview-title" className="mt-1 text-base font-semibold tracking-tight text-foreground sm:text-lg">
            Carteira e operação
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Os números mais importantes para decidir o próximo passo.</p>
        </div>
        <span className="w-fit rounded-lg border border-border bg-card px-2.5 py-1 text-[10px] font-medium text-muted-foreground shadow-sm">
          Atualizado agora
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <PrimaryMetric
          icon={UsersRound}
          label="Total de clientes"
          value={String(totalClients)}
          hint={`${activeClients} cliente${activeClients === 1 ? "" : "s"} ativo${activeClients === 1 ? "" : "s"}`}
          tone="neutral"
        />
        <PrimaryMetric
          icon={UserRoundCheck}
          label="Clientes ativos"
          value={String(activeClients)}
          hint={`${activeShare.toFixed(0)}% da carteira em andamento`}
          tone="success"
        />
        <PrimaryMetric
          icon={UserRoundX}
          label="Clientes vencidos"
          value={String(overdueClients)}
          hint={`${overdueAmount} em mensalidades`}
          tone={overdueClients > 0 ? "danger" : "success"}
          onClick={onOverdueOpen}
          actionLabel="Abrir clientes vencidos na fila de ação"
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <InsightCard
          icon={UserPlus}
          title="Crescimento da carteira"
          subtitle="Comparativo do período selecionado"
          tone="interactive"
          rows={[
            {
              label: "Novos clientes",
              value: newClients === null ? "—" : String(newClients),
              emphasize: true,
            },
            {
              label: "Período anterior",
              value: previousNewClients === null ? "—" : String(previousNewClients),
            },
          ]}
          footer={growth === null
            ? { label: "Disponível na visão Pro", value: "Histórico" }
            : {
                label: growth.label,
                value: growth.value,
                trend: growth.trend,
              }}
        />

        <InsightCard
          icon={CalendarClock}
          title="Renovações e vencimentos"
          subtitle="Prioridades mais próximas"
          tone="warning"
          rows={[
            {
              label: "Vencem hoje",
              value: String(dueTodayCount),
              supporting: dueTodayAmount,
              onClick: onTodayOpen,
            },
            {
              label: "Próximos 7 dias",
              value: String(nextSevenDaysCount),
              supporting: nextSevenDaysAmount,
              onClick: onNextSevenDaysOpen,
            },
          ]}
          footer={{
            label: overdueClients > 0 ? "Exigem atenção" : "Fila em dia",
            value: `${overdueClients} vencido${overdueClients === 1 ? "" : "s"}`,
            trend: overdueClients > 0 ? "down" : "flat",
          }}
        />

        <InsightCard
          icon={CircleDollarSign}
          title="Valores a receber"
          subtitle={advancedFinance ? "Ciclos do período selecionado" : "Movimentação do mês atual"}
          tone="money"
          rows={[
            { label: "Confirmado", value: confirmedAmount, emphasize: true },
            { label: advancedFinance ? "Previsão" : "Em acompanhamento", value: advancedFinance ? forecastAmount : trackedAmount },
          ]}
          footer={{
            label: advancedFinance ? "Confirmado hoje" : "Carteira monitorada",
            value: advancedFinance ? todayAmount : trackedAmount,
            trend: "up",
          }}
        />
      </div>
    </section>
  )
}

function PrimaryMetric({ icon: Icon, label, value, hint, tone, onClick, actionLabel }: {
  icon: LucideIcon
  label: string
  value: string
  hint: string
  tone: "neutral" | "success" | "danger"
  onClick?: () => void
  actionLabel?: string
}) {
  const toneClasses = {
    neutral: {
      surface: "border-border bg-card",
      icon: "bg-interactive-bg text-interactive-fg",
      value: "text-foreground",
      accent: "bg-interactive",
    },
    success: {
      surface: "border-success-border bg-success-bg/45",
      icon: "bg-card/80 text-success-fg",
      value: "text-money",
      accent: "bg-money",
    },
    danger: {
      surface: "border-danger-border bg-danger-bg/50",
      icon: "bg-card/80 text-danger-fg",
      value: "text-danger",
      accent: "bg-danger",
    },
  }[tone]

  const content = (
    <>
      <span className={cn("absolute inset-x-0 top-0 h-1", toneClasses.accent)} />
      <Icon className="absolute -bottom-5 -right-3 size-28 opacity-[0.055]" aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-4">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl shadow-sm", toneClasses.icon)}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        {onClick ? <ArrowRight className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" /> : null}
      </div>
      <div className="relative mt-5">
        <p className={cn("num text-3xl font-semibold tracking-[-0.05em]", toneClasses.value)}>{value}</p>
        <p className="mt-1.5 text-sm font-semibold text-foreground">{label}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      </div>
    </>
  )

  const className = cn(
    "group relative min-h-[160px] w-full overflow-hidden rounded-[22px] border p-5 text-left shadow-sm transition-[transform,box-shadow,border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none sm:p-6",
    onClick && "hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0",
    toneClasses.surface
  )

  if (onClick) {
    return <button type="button" onClick={onClick} aria-label={actionLabel || label} className={className}>{content}</button>
  }

  return <article className={className}>{content}</article>
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

function InsightCard({ icon: Icon, title, subtitle, tone, rows, footer }: {
  icon: LucideIcon
  title: string
  subtitle: string
  tone: Tone
  rows: InsightRow[]
  footer: InsightFooter
}) {
  const toneClasses = {
    neutral: "bg-secondary text-secondary-foreground",
    success: "bg-success-bg text-success-fg",
    danger: "bg-danger-bg text-danger-fg",
    interactive: "bg-interactive-bg text-interactive-fg",
    warning: "bg-warning-bg text-warning-fg",
    money: "bg-success-bg text-success-fg",
  }[tone]

  return (
    <article className="flex min-h-[244px] flex-col overflow-hidden rounded-[22px] border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", toneClasses)}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="flex-1 divide-y divide-border/70 px-5">
        {rows.map((row) => <InsightRowView key={row.label} row={row} />)}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/35 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground">
          <TrendIcon trend={footer.trend} />
          <span className="truncate">{footer.label}</span>
        </div>
        <span className="num shrink-0 text-xs font-semibold text-foreground">{footer.value}</span>
      </div>
    </article>
  )
}

function InsightRowView({ row }: { row: InsightRow }) {
  const content = (
    <>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{row.label}</span>
      {row.supporting ? <span className="num hidden truncate text-[10px] text-muted-foreground sm:block">{row.supporting}</span> : null}
      <span className={cn("num shrink-0 text-sm font-semibold text-foreground", row.emphasize && "text-money")}>{row.value}</span>
      {row.onClick ? <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" /> : null}
    </>
  )

  if (row.onClick) {
    return (
      <button
        type="button"
        onClick={row.onClick}
        className="group flex min-h-14 w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label={`Abrir fila: ${row.label.toLowerCase()}, ${row.value}`}
      >
        {content}
      </button>
    )
  }

  return <div className="flex min-h-14 items-center gap-3">{content}</div>
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

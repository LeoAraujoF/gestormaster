import type { ComponentProps, ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type PageWidth = "compact" | "default" | "wide" | "full"

const pageWidths: Record<PageWidth, string> = {
  compact: "max-w-5xl",
  default: "max-w-6xl",
  wide: "max-w-7xl",
  full: "max-w-none",
}

interface PageShellProps extends ComponentProps<"div"> {
  width?: PageWidth
}

export function PageShell({ width = "wide", className, ...props }: PageShellProps) {
  return (
    <div
      data-slot="page-shell"
      className={cn(
        "mx-auto w-full min-w-0 space-y-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]",
        pageWidths[width],
        className
      )}
      {...props}
    />
  )
}

interface PageHeaderProps extends Omit<ComponentProps<"header">, "title"> {
  title: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  badge?: ReactNode
  actions?: ReactNode
}

export function PageHeader({
  title,
  description,
  eyebrow,
  badge,
  actions,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn("flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}
      {...props}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow ? <div className="microlabel">{eyebrow}</div> : null}
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h1 className="text-xl font-semibold tracking-[-0.025em] text-foreground sm:text-2xl">
            {title}
          </h1>
          {badge ? (
            <span className="num rounded-md bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
              {badge}
            </span>
          ) : null}
        </div>
        {description ? (
          <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end [&>*]:min-h-9 [&>*]:flex-1 sm:[&>*]:flex-none">
          {actions}
        </div>
      ) : null}
    </header>
  )
}

interface PageSectionProps extends Omit<ComponentProps<"section">, "title"> {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  contentClassName?: string
}

export function PageSection({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  ...props
}: PageSectionProps) {
  const hasHeader = title || description || actions

  return (
    <section data-slot="page-section" className={cn("min-w-0 space-y-4", className)} {...props}>
      {hasHeader ? (
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1">
            {title ? <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2> : null}
            {description ? <p className="text-[13px] text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("min-w-0", contentClassName)}>{children}</div>
    </section>
  )
}

interface MetricGridProps extends ComponentProps<"div"> {
  columns?: 2 | 3 | 4 | 6
}

const metricColumns: Record<NonNullable<MetricGridProps["columns"]>, string> = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
}

export function MetricGrid({ columns = 4, className, ...props }: MetricGridProps) {
  return <div data-slot="metric-grid" className={cn("grid gap-3", metricColumns[columns], className)} {...props} />
}

interface ResponsiveDataViewProps extends ComponentProps<"div"> {
  mobile: ReactNode
  desktop: ReactNode
  desktopFrom?: "sm" | "md" | "lg"
}

const dataViewBreakpoints = {
  sm: { mobile: "sm:hidden", desktop: "hidden sm:block" },
  md: { mobile: "md:hidden", desktop: "hidden md:block" },
  lg: { mobile: "lg:hidden", desktop: "hidden lg:block" },
}

export function ResponsiveDataView({
  mobile,
  desktop,
  desktopFrom = "md",
  className,
  ...props
}: ResponsiveDataViewProps) {
  const breakpoint = dataViewBreakpoints[desktopFrom]

  return (
    <div data-slot="responsive-data-view" className={cn("min-w-0", className)} {...props}>
      <div className={breakpoint.mobile}>{mobile}</div>
      <div className={breakpoint.desktop}>{desktop}</div>
    </div>
  )
}

/**
 * Anatomia de card do handoff `design_handoff_v2_redesign` (v2): 16px de raio,
 * borda 1px real, cabeçalho 16/20px com título 14.5px/600 e descrição 11.5px,
 * conteúdo com respiro de 20px, rodapé 14/20px. Usar em vez do `Card` genérico
 * do shadcn ao recriar telas desse handoff, para manter fidelidade visual entre
 * as páginas convertidas.
 */
interface SectionCardProps {
  title: ReactNode
  description?: ReactNode
  headerBadge?: ReactNode
  headerAction?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  contentClassName?: string
  className?: string
}

export function SectionCard({
  title,
  description,
  headerBadge,
  headerAction,
  children,
  footer,
  contentClassName,
  className,
}: SectionCardProps) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[14.5px] font-semibold text-foreground">{title}</h2>
            {headerBadge}
          </div>
          {description ? <p className="mt-[3px] text-[11.5px] text-muted-foreground">{description}</p> : null}
        </div>
        {headerAction}
      </div>
      {children ? <div className={cn("p-5", contentClassName)}>{children}</div> : null}
      {footer ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3.5">{footer}</div> : null}
    </div>
  )
}

/**
 * Cabeçalho-cartão do handoff v2 (seção WORKSPACE HEADER de `Clientes.dc.html`):
 * raio 8px, borda 1px, quadrado de ícone 40px em `interactive`, sobrancelha com
 * selo de contagem ao lado, título 26px e descrição 13px. Diferente do
 * `PageHeader` solto, este é uma superfície de cartão.
 */
interface PageHeaderCardProps {
  icon: LucideIcon
  eyebrow: ReactNode
  badge?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  titleId?: string
}

export function PageHeaderCard({ icon: Icon, eyebrow, badge, title, description, actions, titleId }: PageHeaderCardProps) {
  return (
    <section aria-labelledby={titleId} className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-5 px-5 py-[22px] sm:px-6">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-black/[0.04] bg-interactive-bg text-interactive-fg">
            <Icon className="size-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="microlabel">{eyebrow}</p>
              {badge ? (
                <span className="num rounded-[6px] bg-interactive-bg px-[7px] py-0.5 text-[10px] font-semibold text-interactive-fg">{badge}</span>
              ) : null}
            </div>
            <h1 id={titleId} className="mt-1 text-[26px] font-semibold tracking-[-0.045em] text-foreground">{title}</h1>
            {description ? (
              <p className="mt-2 max-w-[560px] text-[13px] leading-[1.6] text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </section>
  )
}

export function ComingSoon({ label = "Em breve" }: { label?: string }) {
  return (
    <Badge variant="outline" className="shrink-0 rounded-md text-[10px] font-medium text-muted-foreground">
      {label}
    </Badge>
  )
}

import type { ComponentProps, ReactNode } from "react"

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

import type { LucideIcon } from "lucide-react"
import { ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"

export type MetricCardTone = "neutral" | "success" | "danger" | "warning" | "interactive"

interface MetricCardProps {
  icon: LucideIcon
  label: string
  value: string
  hint: string
  tone: MetricCardTone
  onClick?: () => void
  actionLabel?: string
  className?: string
}

const toneClasses: Record<MetricCardTone, { surface: string; icon: string; value: string; accent: string }> = {
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
  warning: {
    surface: "border-warning-border bg-warning-bg/45",
    icon: "bg-card/80 text-warning-fg",
    value: "text-warning",
    accent: "bg-warning",
  },
  interactive: {
    surface: "border-border bg-interactive-bg/45",
    icon: "bg-card/80 text-interactive-fg",
    value: "text-interactive",
    accent: "bg-interactive",
  },
}

export function MetricCard({ icon: Icon, label, value, hint, tone, onClick, actionLabel, className }: MetricCardProps) {
  const tones = toneClasses[tone]

  const content = (
    <>
      <span className={cn("absolute inset-x-0 top-0 h-1", tones.accent)} />
      <Icon className="absolute -bottom-5 -right-3 size-28 opacity-[0.055]" aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-4">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl shadow-sm", tones.icon)}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        {onClick ? <ArrowRight className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" /> : null}
      </div>
      <div className="relative mt-5">
        <p className={cn("num text-3xl font-semibold tracking-[-0.05em]", tones.value)}>{value}</p>
        <p className="mt-1.5 text-sm font-semibold text-foreground">{label}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      </div>
    </>
  )

  const wrapperClassName = cn(
    "group relative min-h-[160px] w-full overflow-hidden rounded-[22px] border p-5 text-left shadow-sm transition-[transform,box-shadow,border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none sm:p-6",
    onClick && "hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0",
    tones.surface,
    className
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={actionLabel || label} className={wrapperClassName}>
        {content}
      </button>
    )
  }

  return <article className={wrapperClassName}>{content}</article>
}

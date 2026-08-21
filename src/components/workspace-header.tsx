import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type WorkspaceHeaderProps = {
  id: string
  icon: LucideIcon
  eyebrow: ReactNode
  title: ReactNode
  description?: ReactNode
  badge?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
  contentClassName?: string
}

export function WorkspaceHeader({
  id,
  icon: Icon,
  eyebrow,
  title,
  description,
  badge,
  actions,
  children,
  className,
  contentClassName,
}: WorkspaceHeaderProps) {
  return (
    <section
      aria-labelledby={id}
      data-slot="workspace-header"
      className={cn(
        "overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_12px_36px_rgba(20,20,24,0.04)]",
        className,
      )}
    >
      <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-start lg:justify-between lg:px-7 lg:py-6">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-[14px] border border-interactive/15 bg-interactive-bg text-interactive-fg shadow-sm">
            <Icon className="size-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="microlabel">{eyebrow}</p>
              {badge ? <span className="num rounded-md bg-interactive-bg px-2 py-1 text-[10px] font-semibold text-interactive-fg">{badge}</span> : null}
            </div>
            <h1 id={id} className="mt-1 text-[26px] font-semibold tracking-[-0.045em] text-foreground sm:text-3xl">{title}</h1>
            {description ? <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground sm:text-sm">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end [&>*]:min-h-10 [&>*]:flex-1 sm:[&>*]:flex-none">{actions}</div> : null}
      </div>
      {children ? <div className={cn("border-t border-border bg-muted/20 p-3 sm:p-4", contentClassName)}>{children}</div> : null}
    </section>
  )
}

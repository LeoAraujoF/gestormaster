import type { ReactNode } from "react"
import { LayoutDashboard } from "lucide-react"

type PainelHeroProps = {
  eyebrow: ReactNode
  badge?: ReactNode
  trackedAmountLabel: string
  overdueCount: number
  overdueAmountLabel: string
  dueTodayCount: number
  dueTodayAmountLabel: string
  confirmedAmountLabel: string
  actions?: ReactNode
}

/**
 * Hero "ink" do Painel (design_handoff v2, seção WORKSPACE HEADER): superfície
 * sempre escura — não inverte com o tema — com o total a receber em destaque e
 * três marcadores de leitura rápida. Raio 8px e os acentos fixos vêm direto do
 * CSS do protótipo. Também usado em `/privacidade/dashboard-preview`.
 */
export function PainelHero({
  eyebrow,
  badge,
  trackedAmountLabel,
  overdueCount,
  overdueAmountLabel,
  dueTodayCount,
  dueTodayAmountLabel,
  confirmedAmountLabel,
  actions,
}: PainelHeroProps) {
  return (
    <section aria-labelledby="dashboard-title" className="overflow-hidden rounded-lg bg-ink text-ink-fg">
      <div className="flex flex-wrap items-start justify-between gap-5 px-5 py-6 sm:px-7">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.14] bg-white/[0.06]">
            <LayoutDashboard className="size-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-white/50">{eyebrow}</p>
              {badge ? <span className="num rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-ink-fg">{badge}</span> : null}
            </div>
            <h1 id="dashboard-title" className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-ink-fg">Dashboard</h1>

            <p className="mt-[18px] font-mono text-[9px] font-medium uppercase tracking-[0.06em] text-white/50">A receber · carteira monitorada</p>
            <p className="num mt-1.5 text-[34px] font-semibold leading-none tracking-[-0.04em] text-ink-fg sm:text-[46px]">
              {trackedAmountLabel}
            </p>

            <div className="mt-4 flex flex-wrap gap-x-[22px] gap-y-3.5">
              {/* Acentos fixos do handoff: o cartão é sempre escuro, então não usam tokens que invertem com o tema */}
              <HeroStat label="Vencidos" value={`${overdueCount} · ${overdueAmountLabel}`} className="text-[#f4a3a3]" divider />
              <HeroStat label="Hoje" value={`${dueTodayCount} · ${dueTodayAmountLabel}`} className="text-[#e5c68a]" divider />
              <HeroStat label="Confirmado no mês" value={confirmedAmountLabel} className="text-[#7ddba9]" />
            </div>
          </div>
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </section>
  )
}

function HeroStat({ label, value, className, divider = false }: {
  label: string
  value: string
  className: string
  divider?: boolean
}) {
  return (
    <div className={divider ? "border-r border-white/[0.14] pr-[22px]" : undefined}>
      <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-white/45">{label}</p>
      <p className={`num mt-[5px] text-sm font-semibold ${className}`}>{value}</p>
    </div>
  )
}

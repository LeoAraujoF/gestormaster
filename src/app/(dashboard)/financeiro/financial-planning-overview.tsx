"use client"

import { useState, type FormEvent, type ReactNode } from "react"
import { CalendarClock, Check, Pencil, Target, TrendingUp, TriangleAlert, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn, formatCurrency } from "@/lib/utils"

type AmountSummary = { count: number; total: number }

type FinancialPlanningOverviewProps = {
  currentMonthReceived: number | null
  monthlyGoal: number | null
  nextMonthPotential: number | null
  activeClients: number | null
  upcoming7d: AmountSummary
  overdue: AmountSummary
  monthLabel: string
  nextMonthLabel: string
  canEditGoal: boolean
  isGoalLoading: boolean
  hasGoalError: boolean
  isSavingGoal: boolean
  displayValue: (value: string | number) => ReactNode
  onSaveGoal: (value: number) => Promise<boolean>
}

export function FinancialPlanningOverview({
  currentMonthReceived,
  monthlyGoal,
  nextMonthPotential,
  activeClients,
  upcoming7d,
  overdue,
  monthLabel,
  nextMonthLabel,
  canEditGoal,
  isGoalLoading,
  hasGoalError,
  isSavingGoal,
  displayValue,
  onSaveGoal,
}: FinancialPlanningOverviewProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [validationError, setValidationError] = useState("")

  const received = currentMonthReceived ?? 0
  const progress = monthlyGoal && monthlyGoal > 0 ? (received / monthlyGoal) * 100 : 0
  const remaining = monthlyGoal === null ? null : Math.max(monthlyGoal - received, 0)
  const exceeded = monthlyGoal === null ? 0 : Math.max(received - monthlyGoal, 0)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = Number(draft.replace(",", "."))
    if (!Number.isFinite(value) || value <= 0) {
      setValidationError("Informe uma meta maior que zero.")
      return
    }

    setValidationError("")
    if (await onSaveGoal(value)) setIsEditing(false)
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-labelledby="financial-planning-title">
      <div className="flex flex-col gap-2 border-b border-border bg-muted/30 px-4 py-4 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-interactive-bg text-interactive-fg">
            <Target className="size-4" aria-hidden="true" />
          </span>
          <div>
            <p className="microlabel">Planejamento financeiro</p>
            <h2 id="financial-planning-title" className="mt-0.5 text-base font-semibold tracking-tight text-foreground">
              Meta e próximas entradas
            </h2>
          </div>
        </div>
        <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
          Acompanhe o realizado de {monthLabel.toLowerCase()} e o potencial da carteira ativa para {nextMonthLabel.toLowerCase()}.
        </p>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
        <div className="p-4 sm:p-5 lg:border-r lg:border-border">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Recebido em {monthLabel}</p>
              {currentMonthReceived === null ? (
                <Skeleton className="mt-2 h-9 w-44" />
              ) : (
                <p className="num mt-1.5 text-3xl font-semibold tracking-[-0.045em] text-money sm:text-4xl">
                  {displayValue(formatCurrency(received))}
                </p>
              )}
            </div>

            <div className="min-w-0 sm:text-right">
              <div className="flex items-center gap-2 sm:justify-end">
                <p className="text-xs font-medium text-muted-foreground">Meta mensal</p>
                {canEditGoal && monthlyGoal !== null && !isGoalLoading && !hasGoalError && !isEditing ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => {
                      setDraft(String(monthlyGoal))
                      setValidationError("")
                      setIsEditing(true)
                    }}
                    aria-label="Editar meta mensal"
                  >
                    <Pencil className="size-3" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>

              {isGoalLoading ? (
                <Skeleton className="mt-2 h-7 w-32 sm:ml-auto" />
              ) : hasGoalError || monthlyGoal === null ? (
                <p className="mt-1.5 text-sm font-medium text-muted-foreground" role="status">Meta indisponível</p>
              ) : isEditing ? (
                <form className="mt-2" onSubmit={handleSubmit}>
                  <div className="flex items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        max="100000000"
                        step="0.01"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        className="h-9 pl-8 sm:w-40"
                        aria-label="Nova meta mensal"
                        aria-invalid={Boolean(validationError)}
                        disabled={isSavingGoal}
                        autoFocus
                      />
                    </div>
                    <Button type="submit" size="icon-lg" disabled={isSavingGoal} aria-label="Salvar meta mensal">
                      <Check className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-lg"
                      disabled={isSavingGoal}
                      onClick={() => {
                        setDraft(String(monthlyGoal))
                        setValidationError("")
                        setIsEditing(false)
                      }}
                      aria-label="Cancelar edição da meta"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                  {validationError ? <p className="mt-1.5 text-xs text-danger" role="alert">{validationError}</p> : null}
                </form>
              ) : (
                <p className="num mt-1.5 text-xl font-semibold tracking-tight text-foreground">
                  {displayValue(formatCurrency(monthlyGoal))}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6">
            <div
              className="h-2.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Progresso da meta mensal"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, Math.max(0, Math.round(progress)))}
            >
              <div
                className="h-full rounded-full bg-money transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>{monthlyGoal === null ? "Cadastre uma meta para acompanhar o progresso." : `${Math.round(progress)}% da meta realizada`}</span>
              {remaining !== null ? (
                <span className="num font-medium text-foreground">
                  {exceeded > 0
                    ? `${displayValue(formatCurrency(exceeded))} acima da meta`
                    : `${displayValue(formatCurrency(remaining))} para atingir`}
                </span>
              ) : null}
            </div>
          </div>

          {!canEditGoal && monthlyGoal !== null ? (
            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">A meta pode ser alterada por administradores da organização.</p>
          ) : null}
        </div>

        <div className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:grid-cols-1 lg:divide-x-0 lg:divide-y">
          <PlanningSignal
            icon={TrendingUp}
            label={`Potencial de ${nextMonthLabel}`}
            value={nextMonthPotential === null ? "Indisponível" : displayValue(formatCurrency(nextMonthPotential))}
            hint={nextMonthPotential === null
              ? "Não foi possível ler a base ativa agora."
              : activeClients !== null && activeClients > 0
              ? `Base atual de ${activeClients} cliente${activeClients === 1 ? "" : "s"} ativo${activeClients === 1 ? "" : "s"}; pode variar com atrasos e cancelamentos.`
              : "Nenhum cliente ativo compõe a projeção neste momento."}
            tone="interactive"
          />
          <PlanningSignal
            icon={CalendarClock}
            label="Próximos 7 dias"
            value={displayValue(formatCurrency(upcoming7d.total))}
            hint={`${upcoming7d.count} renovação${upcoming7d.count === 1 ? "" : "ões"} prevista${upcoming7d.count === 1 ? "" : "s"}`}
            tone="warning"
          />
          <PlanningSignal
            icon={TriangleAlert}
            label="Clientes em atraso"
            value={displayValue(formatCurrency(overdue.total))}
            hint={`${overdue.count} cliente${overdue.count === 1 ? "" : "s"} exige${overdue.count === 1 ? "" : "m"} atenção`}
            tone={overdue.total > 0 ? "danger" : "success"}
          />
        </div>
      </div>
    </section>
  )
}

function PlanningSignal({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof TrendingUp
  label: string
  value: ReactNode
  hint: string
  tone: "interactive" | "warning" | "danger" | "success"
}) {
  const toneClasses = {
    interactive: "bg-interactive-bg text-interactive-fg",
    warning: "bg-warning-bg text-warning-fg",
    danger: "bg-danger-bg text-danger-fg",
    success: "bg-success-bg text-success-fg",
  }

  return (
    <article className="flex min-w-0 gap-3 p-4 sm:flex-col lg:flex-row lg:p-5">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", toneClasses[tone])}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn("num mt-1 text-lg font-semibold tracking-tight text-foreground", tone === "danger" && "text-danger", tone === "success" && "text-money")}>{value}</p>
        <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">{hint}</p>
      </div>
    </article>
  )
}

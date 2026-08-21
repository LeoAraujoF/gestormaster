"use client"

import { CalendarDays, CalendarRange, Trophy } from "lucide-react"

import { usePrivacy } from "@/hooks/use-privacy"
import { cn, formatCurrency } from "@/lib/utils"

type DueDateClient = {
  id: string
  due_date: string
  plan_value: number
}

type DayBucket = {
  day: number
  count: number
  amount: number
}

export function DueDateMap({ clients }: { clients: DueDateClient[] }) {
  const { displayValue } = usePrivacy()
  const buckets = createBuckets(clients)
  const topDays = [...buckets]
    .filter((bucket) => bucket.count > 0)
    .sort((a, b) => b.count - a.count || b.amount - a.amount || a.day - b.day)
    .slice(0, 5)
  const maxCount = Math.max(...buckets.map((bucket) => bucket.count), 1)
  const totalAmount = buckets.reduce((sum, bucket) => sum + bucket.amount, 0)

  return (
    <section className="overflow-hidden rounded-[24px] border border-border bg-card shadow-sm" aria-labelledby="due-date-map-title">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-interactive-bg text-interactive-fg">
            <CalendarDays className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="microlabel">Distribuição da carteira</p>
            <h2 id="due-date-map-title" className="mt-1 text-base font-semibold tracking-tight text-foreground sm:text-lg">Mapa de vencimentos</h2>
            <p className="mt-1 text-xs text-muted-foreground">Concentração dos clientes por dia do mês, usando os vencimentos cadastrados.</p>
          </div>
        </div>
        <div className="flex w-fit items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
          <CalendarRange className="size-4 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-[9px] font-medium uppercase tracking-[0.07em] text-muted-foreground">Carteira mapeada</p>
            <p className="num mt-0.5 text-xs font-semibold text-foreground">{clients.length} clientes</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 bg-muted/20 p-4 sm:p-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-[18px] border border-border bg-card p-4 sm:p-5" aria-labelledby="top-due-days-title">
          <div className="flex items-center gap-2">
            <Trophy className="size-4 text-warning-fg" aria-hidden="true" />
            <h3 id="top-due-days-title" className="text-sm font-semibold text-foreground">Dias mais movimentados</h3>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Top 5 dias com mais vencimentos.</p>

          <div className="mt-5 space-y-2.5">
            {topDays.length ? topDays.map((bucket, index) => (
              <div key={bucket.day} className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold",
                    index === 0 ? "bg-warning-bg text-warning-fg" : "bg-secondary text-secondary-foreground"
                  )}>
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-foreground">Dia {String(bucket.day).padStart(2, "0")}</p>
                      <span className="num text-xs font-semibold text-interactive-fg">{bucket.count}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-interactive" style={{ width: `${Math.max(8, (bucket.count / maxCount) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
                Nenhum vencimento cadastrado.
              </div>
            )}
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <p className="text-[10px] text-muted-foreground">Valor mensal distribuído</p>
            <p className="num mt-1 text-lg font-semibold text-foreground">{displayValue(formatCurrency(totalAmount))}</p>
          </div>
        </aside>

        <div className="rounded-[18px] border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Clientes por dia</h3>
              <p className="mt-1 text-[10px] text-muted-foreground">Quanto mais forte a cor, maior a concentração.</p>
            </div>
            <div className="flex items-center gap-2 text-[9px] text-muted-foreground" aria-label="Escala de concentração">
              <span>Menos</span>
              <span className="size-3 rounded bg-interactive-bg" />
              <span className="size-3 rounded bg-interactive/45" />
              <span className="size-3 rounded bg-interactive/70" />
              <span className="size-3 rounded bg-interactive" />
              <span>Mais</span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-7" role="img" aria-label="Mapa de calor dos vencimentos do dia 1 ao dia 31">
            {buckets.map((bucket) => (
              <div
                key={bucket.day}
                className={cn(
                  "flex min-h-[76px] flex-col justify-between rounded-xl border p-2.5",
                  bucket.count === 0
                    ? "border-border bg-muted/25 text-muted-foreground"
                    : heatClass(bucket.count / maxCount)
                )}
                aria-label={`Dia ${bucket.day}: ${bucket.count} cliente${bucket.count === 1 ? "" : "s"}, ${displayValue(formatCurrency(bucket.amount))}`}
              >
                <span className="num text-[10px] font-semibold opacity-80">{String(bucket.day).padStart(2, "0")}</span>
                <div>
                  <p className="num text-lg font-semibold">{bucket.count}</p>
                  <p className="text-[8px] opacity-75">cliente{bucket.count === 1 ? "" : "s"}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function createBuckets(clients: DueDateClient[]): DayBucket[] {
  const buckets = Array.from({ length: 31 }, (_, index) => ({ day: index + 1, count: 0, amount: 0 }))

  for (const client of clients) {
    const day = Number(client.due_date?.slice(8, 10))
    if (!Number.isInteger(day) || day < 1 || day > 31) continue
    const bucket = buckets[day - 1]
    bucket.count += 1
    bucket.amount += Number(client.plan_value || 0)
  }

  return buckets
}

function heatClass(ratio: number) {
  if (ratio >= 0.76) return "border-interactive bg-interactive text-primary-foreground"
  if (ratio >= 0.51) return "border-interactive/60 bg-interactive/70 text-primary-foreground"
  if (ratio >= 0.26) return "border-interactive/35 bg-interactive/45 text-foreground"
  return "border-interactive/20 bg-interactive-bg text-interactive-fg"
}

"use client"

import { useState } from "react"
import { CalendarDays, CalendarRange, CheckCircle2, Trophy, X } from "lucide-react"

import { usePrivacy } from "@/hooks/use-privacy"
import { cn, formatCurrency } from "@/lib/utils"
import { Dialog, DialogContent } from "@/components/ui/dialog"

type DueDateClient = {
  id: string
  name: string
  phone: string | null
  due_date: string
  plan_value: number
  client_services?: { services: { id: string; name: string; cost: number } | null }[]
}

type DayBucket = {
  day: number
  count: number
  amount: number
  clients: DueDateClient[]
}

type CalendarCell =
  | { kind: "blank"; key: string }
  | { kind: "day"; day: number; bucket: DayBucket }

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

export function DueDateMap({ clients }: { clients: DueDateClient[] }) {
  const { displayValue } = usePrivacy()
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const buckets = createBuckets(clients)
  const topDays = [...buckets]
    .filter((bucket) => bucket.count > 0)
    .sort((a, b) => b.count - a.count || b.amount - a.amount || a.day - b.day)
    .slice(0, 5)
  const maxCount = Math.max(...buckets.map((bucket) => bucket.count), 1)
  const totalAmount = buckets.reduce((sum, bucket) => sum + bucket.amount, 0)

  const today = new Date()
  const monthMeta = getMonthMeta(today)
  const cells = buildCalendarCells(monthMeta, buckets)
  // Dias que não existem no mês corrente (ex.: dia 31 num mês de 30 dias) não
  // ganham célula no grid, mas o cliente é real — precisam continuar visíveis
  // em algum lugar, nunca somem em silêncio.
  const overflowDays = buckets.filter((bucket) => bucket.day > monthMeta.daysInMonth && bucket.count > 0)

  const selectedBucket = selectedDay !== null ? buckets[selectedDay - 1] : null
  const selectedPhoneCount = selectedBucket ? selectedBucket.clients.filter((client) => client.phone).length : 0

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card" aria-labelledby="due-date-map-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-interactive-bg text-interactive-fg">
            <CalendarDays className="size-[18px]" aria-hidden="true" />
          </span>
          <div>
            <p className="microlabel">Distribuição da carteira</p>
            <h2 id="due-date-map-title" className="mt-1 text-base font-semibold tracking-[-0.01em] text-foreground">Mapa de vencimentos</h2>
            <p className="mt-1 text-xs text-muted-foreground">Concentração dos clientes por dia do mês.</p>
          </div>
        </div>
        <div className="flex w-fit items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <CalendarRange className="size-[15px] text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-[9px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Carteira mapeada</p>
            <p className="num mt-0.5 text-xs font-semibold text-foreground">{clients.length} clientes</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 bg-muted/25 p-4 sm:p-5 lg:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.6fr)]">
        <aside className="rounded-lg border border-border bg-card p-[18px]" aria-labelledby="top-due-days-title">
          <div className="flex items-center gap-2">
            <Trophy className="size-[15px] text-money" aria-hidden="true" />
            <h3 id="top-due-days-title" className="text-[13px] font-semibold text-foreground">Dias mais movimentados</h3>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Top 5 dias com mais vencimentos. Toque para ver os clientes.</p>

          <div className="mt-4 flex flex-col gap-2">
            {topDays.length ? topDays.map((bucket, index) => (
              <button
                key={bucket.day}
                type="button"
                onClick={() => setSelectedDay(bucket.day)}
                className="w-full rounded-lg border border-border bg-muted/30 p-2.5 text-left transition-colors hover:border-money/40 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center gap-2.5">
                  <span className={cn(
                    "flex size-[26px] shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold",
                    index === 0 ? "bg-success-bg text-success-fg" : "bg-secondary text-secondary-foreground"
                  )}>
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <p className="text-xs font-semibold text-foreground">Dia {String(bucket.day).padStart(2, "0")}</p>
                      <span className="num text-xs font-semibold text-money">{bucket.count}</span>
                    </div>
                    <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-money" style={{ width: `${Math.max(8, (bucket.count / maxCount) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              </button>
            )) : (
              <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
                Nenhum vencimento cadastrado.
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <p className="text-[10px] text-muted-foreground">Valor mensal distribuído</p>
            <p className="num mt-1 text-base font-semibold text-foreground">{displayValue(formatCurrency(totalAmount))}</p>
          </div>
        </aside>

        <div className="rounded-lg border border-border bg-card p-[18px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-[13px] font-semibold text-foreground">Clientes por dia</h3>
              <p className="mt-1 text-[10px] text-muted-foreground">{monthMeta.label} · quanto mais forte a cor, maior a concentração.</p>
            </div>
            <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground" aria-hidden="true">
              <span>Menos</span>
              <span className="size-3 rounded-[3px] bg-money/10" />
              <span className="size-3 rounded-[3px] bg-money/25" />
              <span className="size-3 rounded-[3px] bg-money/55" />
              <span className="size-3 rounded-[3px] bg-money" />
              <span>Mais</span>
            </div>
          </div>

          {/* Grade real do mês corrente: cabeçalho de dias da semana + células
              alinhadas ao dia 1 pelo weekday certo, com o número exato de dias
              do mês (28 a 31). Cada célula é um botão — clicar abre a lista de
              clientes daquele dia do mês. */}
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[280px]">
              <div className="grid grid-cols-7 gap-1.5 px-0.5 text-center">
                {WEEKDAY_LABELS.map((label) => (
                  <span key={label} className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
                ))}
              </div>
              <div className="mt-1.5 grid grid-cols-7 gap-1.5">
                {cells.map((cell) => cell.kind === "blank" ? (
                  <div key={cell.key} aria-hidden="true" />
                ) : (
                  <button
                    key={cell.day}
                    type="button"
                    onClick={() => setSelectedDay(cell.day)}
                    className={cn(
                      "flex min-h-[64px] flex-col justify-between rounded-lg border p-2 text-left transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      cell.bucket.count === 0
                        ? "border-border bg-muted/30 text-muted-foreground hover:border-money/30"
                        : heatClass(cell.bucket.count / maxCount)
                    )}
                    aria-label={`Dia ${cell.day}: ${cell.bucket.count} cliente${cell.bucket.count === 1 ? "" : "s"}, ${displayValue(formatCurrency(cell.bucket.amount))}. Toque para ver a lista.`}
                  >
                    <span className="num text-[10px] font-semibold opacity-80">{String(cell.day).padStart(2, "0")}</span>
                    <p className="num text-base font-semibold">{cell.bucket.count}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {overflowDays.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
              <span className="text-[9.5px] text-muted-foreground">Fora de {monthMeta.label} ({monthMeta.daysInMonth} dias):</span>
              {overflowDays.map((bucket) => (
                <button
                  key={bucket.day}
                  type="button"
                  onClick={() => setSelectedDay(bucket.day)}
                  className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-secondary-foreground transition-colors hover:border-money/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Dia {String(bucket.day).padStart(2, "0")} · {bucket.count}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={selectedDay !== null} onOpenChange={(open) => { if (!open) setSelectedDay(null) }}>
        <DialogContent
          showCloseButton={false}
          className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 p-0 border-0 bg-transparent shadow-none ring-0 w-[calc(100%-24px)] max-w-[480px] sm:max-w-[480px] focus:outline-none"
        >
          <div className="modal-2a flex flex-col max-h-[85vh]">
            <div className="modal-header-2a flex-shrink-0">
              <span className="w-[34px] h-[34px] rounded-[9px] bg-interactive-bg text-interactive-fg flex items-center justify-center flex-shrink-0">
                <CalendarDays className="w-[16px] h-[16px]" aria-hidden="true" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px] tracking-[-0.01em] text-foreground truncate">
                  Dia {selectedDay !== null ? String(selectedDay).padStart(2, "0") : ""}
                </div>
                <div className="text-muted-foreground text-[11px] mt-[2px] truncate">
                  {selectedBucket?.count || 0} cliente{selectedBucket?.count === 1 ? "" : "s"} vencendo neste dia
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                aria-label="Fechar"
                className="cursor-pointer border-none bg-transparent text-muted-foreground hover:text-secondary-foreground flex-shrink-0"
              >
                <X className="w-[15px] h-[15px]" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {!selectedBucket?.count ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-success-bg text-success-fg">
                    <CheckCircle2 className="size-[18px]" aria-hidden="true" />
                  </span>
                  <p className="text-[13px] font-semibold text-foreground">Nenhum cliente vence neste dia</p>
                </div>
              ) : (
                selectedBucket.clients.map((client) => {
                  const service = client.client_services?.[0]?.services?.name || "Sem serviço"
                  return (
                    <div key={client.id} className="flex items-center gap-3 px-[22px] py-3 border-b border-border last:border-b-0">
                      <span className="w-8 h-8 rounded-full bg-interactive-bg text-interactive-fg flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
                        {initialsOf(client.name)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-semibold text-foreground truncate">{client.name}</p>
                        <p className="mt-[2px] text-[11px] text-muted-foreground truncate">{service}</p>
                      </div>
                      <span className="flex-shrink-0 font-mono text-[12px] font-medium text-foreground whitespace-nowrap">
                        {displayValue(formatCurrency(Number(client.plan_value || 0)))}
                      </span>
                      <span
                        className={cn("flex-shrink-0 w-2 h-2 rounded-full", client.phone ? "bg-money" : "bg-border")}
                        title={client.phone ? "Possui WhatsApp" : "Sem WhatsApp"}
                      />
                    </div>
                  )
                })
              )}
            </div>

            <div className="flex-shrink-0 bg-card border-t border-border px-[22px] py-[14px] flex items-center justify-between gap-[10px]">
              <p className="text-[11px] text-muted-foreground">
                {selectedBucket?.count || 0} no dia · {selectedPhoneCount} com WhatsApp
              </p>
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="border border-input bg-card rounded-[7px] px-[16px] py-[9px] font-medium text-[12px] text-secondary-foreground hover:bg-muted"
              >
                Fechar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function createBuckets(clients: DueDateClient[]): DayBucket[] {
  const buckets = Array.from({ length: 31 }, (_, index) => ({ day: index + 1, count: 0, amount: 0, clients: [] as DueDateClient[] }))

  for (const client of clients) {
    const day = Number(client.due_date?.slice(8, 10))
    if (!Number.isInteger(day) || day < 1 || day > 31) continue
    const bucket = buckets[day - 1]
    bucket.count += 1
    bucket.amount += Number(client.plan_value || 0)
    bucket.clients.push(client)
  }

  return buckets
}

function getMonthMeta(reference: Date) {
  const year = reference.getFullYear()
  const month = reference.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = new Date(year, month, 1).getDay()
  return { year, month, daysInMonth, firstWeekday, label: `${MONTH_NAMES[month]} ${year}` }
}

function buildCalendarCells(meta: ReturnType<typeof getMonthMeta>, buckets: DayBucket[]): CalendarCell[] {
  const cells: CalendarCell[] = []
  for (let i = 0; i < meta.firstWeekday; i++) cells.push({ kind: "blank", key: `lead-${i}` })
  for (let day = 1; day <= meta.daysInMonth; day++) cells.push({ kind: "day", day, bucket: buckets[day - 1] })
  while (cells.length % 7 !== 0) cells.push({ kind: "blank", key: `trail-${cells.length}` })
  return cells
}

function initialsOf(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return "?"
  return trimmed.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
}

function heatClass(ratio: number) {
  if (ratio >= 0.76) return "border-money bg-money text-white"
  if (ratio >= 0.51) return "border-money/45 bg-money/55 text-foreground"
  if (ratio >= 0.26) return "border-money/20 bg-money/25 text-foreground"
  return "border-border bg-money/10 text-secondary-foreground"
}

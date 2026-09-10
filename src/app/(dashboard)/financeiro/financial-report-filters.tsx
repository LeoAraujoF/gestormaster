"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { format, isValid, parseISO, startOfMonth, startOfYear, subDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarDays, Filter, RotateCcw, Search } from "lucide-react"
import { useForm } from "react-hook-form"
import type { DateRange } from "react-day-picker"

import { Button, buttonVariants } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import { financialReportFiltersSchema } from "./financial-report-schema"
import {
  clientStatusLabels,
  financialPaymentMethodLabel,
  type FinancialReportFilters,
  type FinancialReportService,
  type FinancialReportShortcut,
} from "./financial-report-types"

type FinancialReportFiltersProps = {
  values: FinancialReportFilters
  services: FinancialReportService[]
  paymentMethods: string[]
  isLoading: boolean
  onApply: (filters: FinancialReportFilters) => void
  onClear: () => void
}

const shortcutLabels: Array<{ key: Exclude<FinancialReportShortcut, "custom">; label: string }> = [
  { key: "today", label: "Hoje" },
  { key: "7days", label: "7 dias" },
  { key: "30days", label: "30 dias" },
  { key: "month", label: "Mês atual" },
  { key: "year", label: "Ano atual" },
]

function dateKey(date: Date) {
  return format(date, "yyyy-MM-dd")
}

function shortcutRange(shortcut: Exclude<FinancialReportShortcut, "custom">) {
  const today = new Date()
  if (shortcut === "today") return { from: dateKey(today), to: dateKey(today) }
  if (shortcut === "7days") return { from: dateKey(subDays(today, 6)), to: dateKey(today) }
  if (shortcut === "30days") return { from: dateKey(subDays(today, 29)), to: dateKey(today) }
  if (shortcut === "year") return { from: dateKey(startOfYear(today)), to: dateKey(today) }
  return { from: dateKey(startOfMonth(today)), to: dateKey(today) }
}

function selectedRange(from: string, to: string): DateRange | undefined {
  const parsedFrom = parseISO(from)
  const parsedTo = parseISO(to)
  if (!isValid(parsedFrom) || !isValid(parsedTo)) return undefined
  return { from: parsedFrom, to: parsedTo }
}

export function FinancialReportFilters({
  values,
  services,
  paymentMethods,
  isLoading,
  onApply,
  onClear,
}: FinancialReportFiltersProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FinancialReportFilters>({
    resolver: zodResolver(financialReportFiltersSchema),
    defaultValues: values,
  })

  // React Hook Form gerencia as assinaturas internamente; o compilador apenas
  // deixa de memoizar este componente, sem alterar seu comportamento.
  // eslint-disable-next-line react-hooks/incompatible-library
  const from = watch("from")
  const to = watch("to")
  const shortcut = watch("shortcut")
  const range = selectedRange(from, to)
  const rangeLabel = range?.from && range?.to
    ? `${format(range.from, "dd/MM/yyyy")} a ${format(range.to, "dd/MM/yyyy")}`
    : "Escolher período"

  const applyShortcut = (key: Exclude<FinancialReportShortcut, "custom">) => {
    const next = shortcutRange(key)
    setValue("from", next.from, { shouldValidate: true })
    setValue("to", next.to, { shouldValidate: true })
    setValue("shortcut", key)
  }

  const applyCalendarRange = (nextRange: DateRange | undefined) => {
    if (!nextRange?.from) return
    setValue("from", dateKey(nextRange.from), { shouldValidate: true })
    setValue("to", dateKey(nextRange.to || nextRange.from), { shouldValidate: true })
    setValue("shortcut", "custom")
  }

  return (
    <form
      onSubmit={handleSubmit(onApply)}
      className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5"
      aria-label="Filtros do relatório financeiro"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-interactive-bg text-interactive-fg">
              <Filter className="size-4" aria-hidden="true" />
            </span>
            <div>
              <p className="microlabel">Filtros globais</p>
              <h3 className="mt-0.5 text-sm font-semibold text-foreground">Defina o recorte do relatório</h3>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Os filtros controlam o resumo, o gráfico, a tabela e as exportações.</p>
        </div>
      </div>

      <div className="mt-4 flex max-w-full flex-wrap gap-1.5" role="group" aria-label="Atalhos de período">
        {shortcutLabels.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => applyShortcut(item.key)}
            aria-pressed={shortcut === item.key}
            className={cn(
              "min-h-9 shrink-0 rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              shortcut === item.key
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.1fr)_repeat(3,minmax(150px,0.7fr))]">
        <div className="space-y-1.5">
          <span className="text-[11px] font-medium text-foreground">Período</span>
          <Popover>
            <PopoverTrigger
              className={buttonVariants({
                variant: "outline",
                className: "h-10 w-full justify-start gap-2 px-3 text-left text-xs font-normal",
              })}
            >
              <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{rangeLabel}</span>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="range"
                selected={range}
                onSelect={applyCalendarRange}
                numberOfMonths={1}
                locale={ptBR}
                disabled={{ after: new Date() }}
              />
            </PopoverContent>
          </Popover>
          {errors.from?.message || errors.to?.message ? (
            <p className="text-[10px] text-danger" role="alert">{errors.from?.message || errors.to?.message}</p>
          ) : null}
        </div>

        <label className="space-y-1.5 text-[11px] font-medium text-foreground">
          Status do cliente
          <select
            {...register("status")}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <option value="all">Todos os status</option>
            {Object.entries(clientStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>

        <label className="space-y-1.5 text-[11px] font-medium text-foreground">
          Forma de pagamento
          <select
            {...register("paymentMethod")}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <option value="all">Todas as formas</option>
            {paymentMethods.map((method) => <option key={method} value={method}>{financialPaymentMethodLabel(method)}</option>)}
          </select>
        </label>

        <label className="space-y-1.5 text-[11px] font-medium text-foreground">
          Serviço
          <select
            {...register("service")}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <option value="all">Todos os serviços</option>
            {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="min-w-0 flex-1 space-y-1.5 text-[11px] font-medium text-foreground">
          Buscar
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              {...register("search")}
              placeholder="Cliente, serviço ou forma de pagamento"
              className="h-10 pl-9 text-xs"
            />
          </span>
          {errors.search?.message ? <span className="block text-[10px] text-danger">{errors.search.message}</span> : null}
        </label>

        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button type="button" variant="outline" onClick={onClear} disabled={isLoading} className="h-10 gap-2">
            <RotateCcw className="size-4" aria-hidden="true" /> Limpar filtros
          </Button>
          <Button type="submit" disabled={isLoading} className="h-10 gap-2">
            <Filter className="size-4" aria-hidden="true" /> Aplicar filtros
          </Button>
        </div>
      </div>
    </form>
  )
}

export function currentMonthFinancialReportFilters(): FinancialReportFilters {
  const range = shortcutRange("month")
  return {
    ...range,
    shortcut: "month",
    status: "all",
    paymentMethod: "all",
    service: "all",
    search: "",
  }
}

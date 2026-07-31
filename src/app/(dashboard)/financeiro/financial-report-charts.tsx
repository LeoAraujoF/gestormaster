"use client"

import { differenceInCalendarDays, format, parseISO, startOfMonth } from "date-fns"
import { ptBR } from "date-fns/locale"
import type { ReactNode } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatCurrency } from "@/lib/utils"

import {
  financialReportClients,
  financialPaymentServices,
  type FinancialReportFilters,
  type FinancialReportPayment,
} from "./financial-report-types"

type FinancialReportChartsProps = {
  filters: FinancialReportFilters
  payments: FinancialReportPayment[]
  displayValue: (value: string | number) => ReactNode
}

const statusColors = [
  "var(--money)",
  "var(--secondary-foreground)",
  "var(--warning)",
  "var(--danger)",
]

function dateKey(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-")
}

export function FinancialReportCharts({
  filters,
  payments,
  displayValue,
}: FinancialReportChartsProps) {
  const clients = financialReportClients(payments)
  const monthly = differenceInCalendarDays(parseISO(filters.to), parseISO(filters.from)) > 62
  const growthBuckets = new Map<string, {
    label: string
    order: number
    Novos: number
    Ativos: number
    "Inativos/cancelados": number
  }>()

  clients.forEach((client) => {
    const createdAt = new Date(client.created_at)
    const createdKey = dateKey(createdAt)
    if (createdKey < filters.from || createdKey > filters.to) return
    const bucketDate = monthly ? startOfMonth(createdAt) : createdAt
    const bucketKey = monthly ? format(bucketDate, "yyyy-MM") : dateKey(bucketDate)
    const bucket = growthBuckets.get(bucketKey) || {
      label: format(bucketDate, monthly ? "MMM/yy" : "dd/MM", { locale: ptBR }).replace(".", ""),
      order: bucketDate.getTime(),
      Novos: 0,
      Ativos: 0,
      "Inativos/cancelados": 0,
    }
    bucket.Novos += 1
    if (client.status === "active") bucket.Ativos += 1
    else if (["inactive", "suspended", "canceled", "vencido"].includes(client.status)) {
      bucket["Inativos/cancelados"] += 1
    }
    growthBuckets.set(bucketKey, bucket)
  })

  const growthData = [...growthBuckets.values()].sort((a, b) => a.order - b.order)
  const statusData = [
    { name: "Ativos", value: clients.filter((client) => client.status === "active").length },
    { name: "Inativos", value: clients.filter((client) => ["inactive", "suspended", "vencido"].includes(client.status)).length },
    { name: "Pendentes", value: clients.filter((client) => client.status === "pending").length },
    { name: "Cancelados", value: clients.filter((client) => client.status === "canceled").length },
  ].filter((item) => item.value > 0)

  const revenueByService = new Map<string, number>()
  payments.forEach((payment) => {
    const services = financialPaymentServices(payment)
    const names = services.length > 0 ? services.map((service) => service.name) : ["Sem serviço"]
    const allocatedRevenue = Number(payment.amount_paid || 0) / names.length
    names.forEach((name) => {
      revenueByService.set(name, (revenueByService.get(name) || 0) + allocatedRevenue)
    })
  })
  const serviceData = [...revenueByService.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((item) => item.value !== 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ReportChartCard
        title="Novos clientes no recorte"
        description="Cadastros dos clientes com pagamento filtrado, conforme a situação atual."
      >
        {growthData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 480, height: 270 }}>
            <LineChart data={growthData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "var(--popover)", color: "var(--popover-foreground)", borderColor: "var(--border)", borderRadius: 12, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="Novos" stroke="var(--interactive)" strokeWidth={3} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="Ativos" stroke="var(--money)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="Inativos/cancelados" stroke="var(--danger)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ReportChartEmpty message="Nenhum cliente deste resultado foi cadastrado no período selecionado." />
        )}
      </ReportChartCard>

      <ReportChartCard
        title="Clientes por status"
        description="Situação atual dos clientes presentes nos pagamentos filtrados."
      >
        {statusData.length > 0 ? (
          <div className="relative h-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 480, height: 270 }}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={3} stroke="none">
                  {statusData.map((item, index) => <Cell key={item.name} fill={statusColors[index % statusColors.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => [`${Number(value)} cliente${Number(value) === 1 ? "" : "s"}`, "Total"]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-x-0 top-[92px] text-center">
              <p className="num text-2xl font-semibold text-foreground">{clients.length}</p>
              <p className="text-[10px] text-muted-foreground">clientes</p>
            </div>
          </div>
        ) : (
          <ReportChartEmpty message="Nenhum cliente encontrado para compor a distribuição." />
        )}
      </ReportChartCard>

      <ReportChartCard
        title="Receita por serviço"
        description="Receita recebida no recorte; valores são divididos igualmente quando o cliente possui mais de um serviço."
        className="xl:col-span-2"
      >
        {serviceData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 760, height: 270 }}>
            <BarChart data={serviceData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="32%">
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
              <YAxis width={62} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} tickFormatter={compactCurrency} />
              <Tooltip
                contentStyle={{ backgroundColor: "var(--popover)", color: "var(--popover-foreground)", borderColor: "var(--border)", borderRadius: 12, fontSize: 12 }}
                formatter={(value) => [displayValue(formatCurrency(Number(value))), "Receita"]}
              />
              <Legend formatter={() => "Receita"} wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="value" name="Receita" fill="var(--interactive)" radius={[6, 6, 0, 0]} maxBarSize={56} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ReportChartEmpty message="Nenhuma receita por serviço encontrada para este recorte." />
        )}
      </ReportChartCard>
    </div>
  )
}

function ReportChartCard({
  title,
  description,
  className,
  children,
}: {
  title: string
  description: string
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`overflow-hidden rounded-[24px] border border-border bg-card shadow-sm ${className || ""}`}>
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="h-[270px] min-w-0 p-3 sm:p-4">{children}</div>
    </section>
  )
}

function ReportChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border px-6 text-center">
      <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{message}</p>
    </div>
  )
}

function compactCurrency(value: number) {
  if (Math.abs(value) >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)} mi`
  if (Math.abs(value) >= 1_000) return `R$ ${(value / 1_000).toFixed(1)} mil`
  return `R$ ${Math.round(value)}`
}

"use client"

import type { ReactNode } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatCurrency } from "@/lib/utils"

import {
  financialPaymentServices,
  type FinancialReportPayment,
} from "./financial-report-types"

type FinancialReportChartsProps = {
  payments: FinancialReportPayment[]
  displayValue: (value: string | number) => ReactNode
}

export function FinancialReportCharts({
  payments,
  displayValue,
}: FinancialReportChartsProps) {
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
        title="Receita por serviço"
        description="Receita recebida no recorte; valores são divididos igualmente quando há mais de um serviço."
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
    <section className={`overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,.04)] ${className || ""}`}>
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

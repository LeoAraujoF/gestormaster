"use client"

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { formatCurrency } from "@/lib/utils"

type ForecastPoint = {
  label: string
  contractual: number
  expected_cash: number | null
}

export function AnalyticsForecastChart({ data }: { data: ForecastPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => `R$${value}`} />
        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
        <Area type="monotone" dataKey="contractual" name="Contratual" stroke="var(--foreground)" fill="var(--muted)" fillOpacity={0.35} />
        <Area type="monotone" dataKey="expected_cash" name="Realização esperada" stroke="var(--money)" fill="var(--money)" fillOpacity={0.15} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

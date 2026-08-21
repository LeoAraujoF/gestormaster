"use client"

import { useState } from "react"

import { DashboardOverview } from "@/components/dashboard-overview"
import { DueDateMap } from "@/components/due-date-map"
import { ExecutiveDashboardView } from "@/components/executive-dashboard-view"
import { PrivacyProvider } from "@/hooks/use-privacy"
import type { ExecutiveDashboardDTO, ExecutivePeriod } from "@/lib/executive-metrics"

const previewData: ExecutiveDashboardDTO = {
  period: "month",
  entitlement: { plan: "pro" },
  coverage: { starts_at: "2026-01-01", partial: false, cycle_count: 220, snapshot_count: 8 },
  summary: { forecast: 42850, confirmed: 31520, at_risk: 4860, mrr: 39740, active_clients: 286 },
  previous: { forecast: 40100, confirmed: 28750, at_risk: 5220, mrr: 38120 },
  rates: { renewal: 87.4, default: 9.8, cancellation: 2.1, average_ticket: 148.68 },
  growth: { new_clients: 42, previous_new_clients: 31, cancellations: 6 },
  series: Array.from({ length: 18 }, (_, index) => ({
    date: `2026-08-${String(index + 1).padStart(2, "0")}`,
    forecast: [1700, 2200, 1950, 2800, 3400, 3200, 2500, 2100, 4300, 2600, 3100, 2700, 2900, 2400, 3900, 3000, 2800, 1800][index],
    confirmed: [1200, 1800, 1600, 2400, 3000, 2700, 1900, 900, 3600, 2100, 2500, 2200, 2400, 1700, 3300, 2500, 2200, 800][index],
    at_risk: [200, 180, 120, 260, 310, 240, 190, 420, 200, 160, 210, 170, 190, 380, 240, 180, 210, 360][index],
  })),
  breakdowns: {
    payment_methods: [
      { method: "PIX", value: 21800, count: 146 },
      { method: "Cartão", value: 6120, count: 38 },
      { method: "Dinheiro", value: 2600, count: 20 },
      { method: "Não identificado", value: 1000, count: 8 },
    ],
    services: [
      { service: "Plano Premium", value: 17600, clients: 118 },
      { service: "Plano Família", value: 9200, clients: 74 },
      { service: "Plano Essencial", value: 6410, clients: 52 },
      { service: "Aplicativo", value: 3900, clients: 28 },
      { service: "Outros", value: 2630, clients: 14 },
    ],
  },
}

const previewClients = Array.from({ length: 96 }, (_, index) => ({
  id: `preview-${index}`,
  due_date: `2026-08-${String(((index * 7) % 31) + 1).padStart(2, "0")}`,
  plan_value: 79 + (index % 5) * 20,
}))

export default function DashboardPreviewPage() {
  const [period, setPeriod] = useState<ExecutivePeriod>("month")
  return (
    <PrivacyProvider>
      <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1500px] space-y-6">
          <DashboardOverview
          totalClients={312}
          activeClients={286}
          overdueClients={26}
          activeShare={91.7}
          overdueAmount="R$ 4.860,00"
          newClients={42}
          previousNewClients={31}
          dueTodayCount={8}
          nextSevenDaysCount={34}
          dueTodayAmount="R$ 1.240,00"
          nextSevenDaysAmount="R$ 5.680,00"
          confirmedAmount="R$ 31.520,00"
          forecastAmount="R$ 42.850,00"
          todayAmount="R$ 2.180,00"
          trackedAmount="R$ 11.780,00"
          advancedFinance
          onOverdueOpen={() => undefined}
          onTodayOpen={() => undefined}
          onNextSevenDaysOpen={() => undefined}
          />
          <ExecutiveDashboardView data={{ ...previewData, period }} period={period} onPeriodChange={setPeriod} />
          <DueDateMap clients={previewClients} />
        </div>
      </main>
    </PrivacyProvider>
  )
}

import assert from "node:assert/strict"
import test from "node:test"

import { financialReportFiltersSchema } from "../src/app/(dashboard)/financeiro/financial-report-schema"
import {
  filterFinancialReportPayments,
  summarizeFinancialReport,
  summarizeFinancialReportClients,
  type FinancialReportFilters,
  type FinancialReportPayment,
} from "../src/app/(dashboard)/financeiro/financial-report-types"

const payments: FinancialReportPayment[] = [
  {
    id: "payment-1",
    client_id: "client-1",
    amount_paid: 300,
    net_profit: 210,
    payment_method: "pix",
    paid_at: "2026-07-20T10:00:00.000Z",
    created_at: "2026-07-20T10:00:00.000Z",
    clients: {
      id: "client-1",
      name: "Ana Lima",
      status: "active",
      created_at: "2026-01-01T00:00:00.000Z",
      client_services: [{ services: { id: "service-1", name: "Consultoria" } }],
    },
  },
  {
    id: "payment-2",
    client_id: "client-2",
    amount_paid: 200,
    net_profit: 120,
    payment_method: "card",
    paid_at: "2026-07-21T10:00:00.000Z",
    created_at: "2026-07-21T10:00:00.000Z",
    clients: {
      id: "client-2",
      name: "Bruno Souza",
      status: "inactive",
      created_at: "2026-02-01T00:00:00.000Z",
      client_services: [{ services: { id: "service-2", name: "Suporte" } }],
    },
  },
]

const defaultFilters: FinancialReportFilters = {
  from: "2026-07-01",
  to: "2026-07-30",
  shortcut: "month",
  status: "all",
  paymentMethod: "all",
  service: "all",
  search: "",
}

test("combina filtros de status, pagamento, serviço e busca", () => {
  assert.equal(filterFinancialReportPayments(payments, {
    ...defaultFilters,
    status: "active",
    paymentMethod: "pix",
    service: "service-1",
    search: "ana",
  }).length, 1)

  assert.equal(filterFinancialReportPayments(payments, {
    ...defaultFilters,
    status: "active",
    paymentMethod: "card",
  }).length, 0)
})

test("resume valores financeiros sem arredondar os dados", () => {
  assert.deepEqual(summarizeFinancialReport(payments), {
    payments: 2,
    clients: 2,
    revenue: 500,
    costs: 170,
    netProfit: 330,
    averageTicket: 250,
  })
})

test("resume clientes únicos e cadastros dentro do período", () => {
  assert.deepEqual(summarizeFinancialReportClients(payments, defaultFilters), {
    total: 2,
    newClients: 0,
    active: 1,
  })

  assert.deepEqual(summarizeFinancialReportClients(payments, {
    from: "2026-01-01",
    to: "2026-01-31",
  }), {
    total: 2,
    newClients: 1,
    active: 1,
  })
})

test("rejeita intervalo invertido e data futura", () => {
  const inverted = financialReportFiltersSchema.safeParse({
    ...defaultFilters,
    from: "2026-07-20",
    to: "2026-07-01",
  })
  const future = financialReportFiltersSchema.safeParse({
    ...defaultFilters,
    to: "2999-01-01",
  })

  assert.equal(inverted.success, false)
  assert.equal(future.success, false)
})

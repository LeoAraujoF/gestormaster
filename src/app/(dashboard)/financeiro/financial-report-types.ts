import type { ClientStatus } from "@/types/database"

export type FinancialReportShortcut = "today" | "7days" | "30days" | "month" | "year" | "custom"

export type FinancialReportFilters = {
  from: string
  to: string
  shortcut: FinancialReportShortcut
  status: "all" | ClientStatus
  paymentMethod: string
  service: string
  search: string
}

export type FinancialReportService = {
  id: string
  name: string
}

export type FinancialReportClient = {
  id: string
  name: string
  status: ClientStatus
  created_at: string
  client_services?: Array<{
    services?: FinancialReportService | null
  }> | null
}

export type FinancialReportPayment = {
  id: string
  client_id?: string | null
  amount_paid: number
  net_profit?: number | null
  payment_method?: string | null
  paid_at?: string | null
  created_at: string
  clients?: FinancialReportClient | null
}

export type FinancialReportSummary = {
  payments: number
  clients: number
  revenue: number
  costs: number
  netProfit: number
  averageTicket: number
}

export type FinancialReportClientSummary = {
  total: number
  newClients: number
  active: number
}

export const clientStatusLabels: Record<ClientStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
  pending: "Pendente",
  vencido: "Vencido",
  suspended: "Suspenso",
  canceled: "Cancelado",
}

export function financialPaymentDate(payment: FinancialReportPayment) {
  return new Date(payment.paid_at || payment.created_at)
}

export function financialPaymentServices(payment: FinancialReportPayment) {
  return (payment.clients?.client_services || [])
    .map((assignment) => assignment.services)
    .filter((service): service is FinancialReportService => Boolean(service))
}

export function financialPaymentMethodLabel(method?: string | null) {
  const normalized = method?.trim().toLowerCase()
  if (!normalized || normalized === "legacy") return "Não identificado"
  if (normalized === "pix") return "PIX"
  if (normalized === "money") return "Dinheiro"
  if (normalized === "card") return "Cartão"
  return method || "Não identificado"
}

export function financialReportClients(payments: FinancialReportPayment[]) {
  const clients = new Map<string, FinancialReportClient>()
  payments.forEach((payment) => {
    if (payment.clients?.id) clients.set(payment.clients.id, payment.clients)
  })
  return [...clients.values()]
}

function localDateKey(value: string) {
  const date = new Date(value)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

export function summarizeFinancialReportClients(
  payments: FinancialReportPayment[],
  filters: Pick<FinancialReportFilters, "from" | "to">,
): FinancialReportClientSummary {
  const clients = financialReportClients(payments)
  return {
    total: clients.length,
    newClients: clients.filter((client) => {
      const createdAt = localDateKey(client.created_at)
      return createdAt >= filters.from && createdAt <= filters.to
    }).length,
    active: clients.filter((client) => client.status === "active").length,
  }
}

export function filterFinancialReportPayments(
  payments: FinancialReportPayment[],
  filters: FinancialReportFilters,
) {
  const query = filters.search.trim().toLocaleLowerCase("pt-BR")

  return payments.filter((payment) => {
    const client = payment.clients
    const services = financialPaymentServices(payment)
    const matchesStatus = filters.status === "all" || client?.status === filters.status
    const matchesMethod = filters.paymentMethod === "all"
      || (payment.payment_method || "legacy").toLowerCase() === filters.paymentMethod
    const matchesService = filters.service === "all"
      || services.some((service) => service.id === filters.service)
    const matchesSearch = !query
      || client?.name.toLocaleLowerCase("pt-BR").includes(query)
      || services.some((service) => service.name.toLocaleLowerCase("pt-BR").includes(query))
      || financialPaymentMethodLabel(payment.payment_method).toLocaleLowerCase("pt-BR").includes(query)

    return matchesStatus && matchesMethod && matchesService && matchesSearch
  })
}

export function summarizeFinancialReport(payments: FinancialReportPayment[]): FinancialReportSummary {
  const revenue = payments.reduce((total, payment) => total + Number(payment.amount_paid || 0), 0)
  const netProfit = payments.reduce((total, payment) => total + Number(payment.net_profit || 0), 0)
  const clients = new Set(payments.map((payment) => payment.client_id || payment.clients?.id).filter(Boolean)).size

  return {
    payments: payments.length,
    clients,
    revenue,
    costs: revenue - netProfit,
    netProfit,
    averageTicket: payments.length > 0 ? revenue / payments.length : 0,
  }
}

export function financialReportServiceOptions(payments: FinancialReportPayment[]) {
  const services = new Map<string, FinancialReportService>()
  payments.forEach((payment) => {
    financialPaymentServices(payment).forEach((service) => services.set(service.id, service))
  })
  return [...services.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}

export function financialReportPaymentMethods(payments: FinancialReportPayment[]) {
  return [...new Set(payments.map((payment) => (payment.payment_method || "legacy").toLowerCase()))]
    .sort((a, b) => financialPaymentMethodLabel(a).localeCompare(financialPaymentMethodLabel(b), "pt-BR"))
}

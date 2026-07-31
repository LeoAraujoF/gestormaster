import { z } from "zod"

const reportStatuses = ["all", "active", "inactive", "pending", "vencido", "suspended", "canceled"] as const
const reportShortcuts = ["today", "7days", "30days", "month", "year", "custom"] as const

export const financialReportFiltersSchema = z.object({
  from: z.string().min(1, "Informe a data inicial."),
  to: z.string().min(1, "Informe a data final."),
  shortcut: z.enum(reportShortcuts),
  status: z.enum(reportStatuses),
  paymentMethod: z.string(),
  service: z.string(),
  search: z.string().max(100, "A busca deve ter no máximo 100 caracteres."),
}).superRefine((filters, context) => {
  if (filters.from && filters.to && filters.from > filters.to) {
    context.addIssue({
      code: "custom",
      path: ["to"],
      message: "A data final deve ser igual ou posterior à data inicial.",
    })
  }

  const today = new Date()
  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-")

  if (filters.to > todayKey) {
    context.addIssue({
      code: "custom",
      path: ["to"],
      message: "A data final não pode estar no futuro.",
    })
  }
})

export type FinancialReportFiltersInput = z.input<typeof financialReportFiltersSchema>

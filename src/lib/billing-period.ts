export function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(year, month, day, 12, 0, 0, 0)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null
  }

  return date
}

export function formatDateOnly(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function todayDateOnly(now = new Date()): string {
  return formatDateOnly(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12))
}

export function addBillingMonths(dateValue: string, months: number): string {
  const date = parseDateOnly(dateValue)
  if (!date) return dateValue

  const targetMonthStart = new Date(
    date.getFullYear(),
    date.getMonth() + Math.max(0, Math.trunc(months)),
    1,
    12,
  )
  const lastDay = new Date(
    targetMonthStart.getFullYear(),
    targetMonthStart.getMonth() + 1,
    0,
    12,
  ).getDate()

  targetMonthStart.setDate(Math.min(date.getDate(), lastDay))
  return formatDateOnly(targetMonthStart)
}

export function addBillingDays(dateValue: string, days: number): string {
  const date = parseDateOnly(dateValue)
  if (!date) return dateValue

  date.setDate(date.getDate() + Math.trunc(days))
  return formatDateOnly(date)
}

export function billingCreditsBetween(baseValue: string, dueValue: string): number {
  const base = parseDateOnly(baseValue)
  const due = parseDateOnly(dueValue)
  if (!base || !due || due.getTime() <= base.getTime()) return 1

  const calendarMonths =
    (due.getFullYear() - base.getFullYear()) * 12 +
    due.getMonth() -
    base.getMonth()

  return Math.max(1, calendarMonths)
}

/**
 * Calcula os créditos consumidos pelo período contratado.
 *
 * Cada mês consome um crédito e cada tela além da primeira acrescenta
 * somente um crédito ao período. Assim, 12 meses/2 telas = 13 créditos e
 * 1 mês/2 telas = 2 créditos.
 */
export function billingCreditsForPeriod(months: number, screens: number): number {
  const safeMonths = Math.max(1, Math.trunc(Number(months)) || 1)
  const safeScreens = Math.max(1, Math.trunc(Number(screens)) || 1)
  return safeMonths + safeScreens - 1
}

export function renewalBaseDate(currentDueDate: string, now = new Date()): string {
  const today = todayDateOnly(now)
  const due = parseDateOnly(currentDueDate)
  const current = parseDateOnly(today)

  if (!due || !current || due.getTime() < current.getTime()) return today
  return formatDateOnly(due)
}

export function billingMonthsFromPlanName(planName: string): number {
  const normalized = planName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()

  const numericMonths = normalized.match(/\b(\d{1,2})\s*(?:mes|meses)\b/)
  if (numericMonths) return Math.max(1, Number(numericMonths[1]))
  if (normalized.includes("bimestral")) return 2
  if (normalized.includes("trimestral")) return 3
  if (normalized.includes("semestral")) return 6
  if (normalized.includes("anual") || normalized.includes("1 ano")) return 12
  return 1
}

export function calculateBillingTotals(input: {
  amountPaid: number
  monthlyServiceCost: number
  screens: number
  credits: number
}) {
  const amountPaid = Number(input.amountPaid) || 0
  const credits = Math.max(1, Math.trunc(input.credits) || 1)
  const totalCost = (Number(input.monthlyServiceCost) || 0) * credits

  return {
    amountPaid,
    credits,
    totalCost,
    netProfit: amountPaid - totalCost,
  }
}

export function monthlyPlanValueFromPayment(amountPaid: number, credits: number): number {
  const safeAmount = Number(amountPaid) || 0
  const safeCredits = Math.max(1, Math.trunc(credits) || 1)
  return safeAmount / safeCredits
}

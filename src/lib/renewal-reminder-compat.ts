type RenewalReminderFields = {
  renewal_reminder_enabled?: boolean
  renewal_reminder_days_before?: number
  renewal_reminder_last_sent_due_date?: string | null
}

export function isMissingRenewalReminderColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false

  const candidate = error as { code?: unknown; message?: unknown }
  const code = String(candidate.code || "")
  const message = String(candidate.message || "")

  return code === "PGRST204" && /renewal_reminder_(enabled|days_before|last_sent_due_date)/.test(message)
}

export function withoutRenewalReminderFields<T extends RenewalReminderFields>(payload: T): Omit<T, keyof RenewalReminderFields> {
  const fallback = { ...payload } as Record<string, unknown>
  delete fallback.renewal_reminder_enabled
  delete fallback.renewal_reminder_days_before
  delete fallback.renewal_reminder_last_sent_due_date
  return fallback as Omit<T, keyof RenewalReminderFields>
}

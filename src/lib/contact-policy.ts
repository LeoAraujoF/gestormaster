export type ContactCategory = 'billing' | 'operational' | 'promotion' | 'manual'
export type ContactSource = 'intelligent_collection' | 'legacy_automation' | 'mass' | 'manual' | 'system'

export function dateInTimezone(date: Date, timezone = 'America/Sao_Paulo') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function categoryForAlertType(alertType: string): ContactCategory {
  if (['before_due', 'on_due', 'after_due'].includes(alertType)) return 'billing'
  if (alertType === 'promotion') return 'promotion'
  if (alertType === 'quick_message') return 'manual'
  return 'operational'
}

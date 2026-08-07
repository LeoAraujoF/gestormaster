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
  // A confirmação de renovação é uma notificação transacional prioritária.
  // Classificá-la como manual permite que ela substitua a reserva de boas-vindas
  // criada na mesma ativação, sem bloquear o aviso do pagamento confirmado.
  if (['quick_message', 'renewal'].includes(alertType)) return 'manual'
  return 'operational'
}

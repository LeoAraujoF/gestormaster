import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`
  }
  return phone
}

export function phoneMask(value: string): string {
  if (!value) return '';

  // Se começar com +, permite formato internacional
  if (value.startsWith('+')) {
    const cleaned = value.replace(/[^\d+]/g, '');
    
    // Se for +55, aplica a máscara do Brasil após o DDI
    if (cleaned.startsWith('+55') && cleaned.length > 3) {
      const brNumber = cleaned.slice(3);
      const brMasked = formatBRPhone(brNumber);
      return `+55 ${brMasked}`;
    }
    
    // Para outros países, permite digitação livre (apenas números) com limite de 15 dígitos
    return cleaned.slice(0, 16); 
  }

  // Comportamento padrão (sem +), assume Brasil
  return formatBRPhone(value);
}

function formatBRPhone(value: string): string {
  const cleaned = value.replace(/\D/g, '').slice(0, 11);
  if (cleaned.length === 0) return '';
  if (cleaned.length <= 2) return `(${cleaned}`;
  if (cleaned.length <= 7) return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2)}`;
  return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
}

export function getMonthName(monthStr: string): string {
  const [year, month] = monthStr.split('-')
  const date = new Date(parseInt(year), parseInt(month) - 1, 1)
  return date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
}

export function getDaysUntilDue(dueDate: number): number {
  const today = new Date()
  const currentDay = today.getDate()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()
  
  let nextDue = new Date(currentYear, currentMonth, dueDate)
  if (nextDue < today) {
    nextDue = new Date(currentYear, currentMonth + 1, dueDate)
  }
  
  const diffTime = nextDue.getTime() - today.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

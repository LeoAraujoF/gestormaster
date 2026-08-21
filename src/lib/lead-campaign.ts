export interface LeadCampaignRecipient {
  name?: string | null
  phone?: string | null
  email?: string | null
  custom_fields?: Record<string, unknown> | null
}

function applySpintax(text: string): string {
  let result = text
  const spintaxRegex = /\{([^{}]*)\}/
  while (spintaxRegex.test(result)) {
    result = result.replace(spintaxRegex, (_match, contents: string) => {
      const choices = contents.split('|')
      return choices[Math.floor(Math.random() * choices.length)] || ''
    })
  }
  return result
}

export function parseLeadCampaignMessage(template: string, lead: LeadCampaignRecipient): string {
  let message = template
  const firstName = lead.name?.trim().split(/\s+/)[0] || 'Amigo(a)'
  message = message.replace(/\{\{nome\}\}/g, firstName)
  message = message.replace(/\{\{nome_completo\}\}/g, lead.name || 'Amigo(a)')
  message = message.replace(/\{\{email\}\}/g, lead.email || '')
  message = message.replace(/\{\{telefone\}\}/g, lead.phone || '')

  for (const [key, value] of Object.entries(lead.custom_fields || {})) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    message = message.replace(new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g'), String(value ?? ''))
  }

  return applySpintax(message)
}

export function normalizeCampaignPhone(phone: string): string | null {
  return normalizeWhatsAppNumber(phone)
}
import { normalizeWhatsAppNumber } from './phone'

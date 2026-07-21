import type {
  WhatsAppButtonsMessage,
  WhatsAppListMessage,
} from '@/providers/whatsapp/IWhatsAppProvider'

export const BILLING_ACTION_IDS = {
  generatePix: 'billing:generate_pix',
  humanSupport: 'billing:human_support',
  cancelRenewal: 'billing:cancel_renewal',
  confirmCancellation: 'billing:confirm_cancellation',
  keepRenewal: 'billing:keep_renewal',
} as const

export type BillingAction = keyof typeof BILLING_ACTION_IDS

function normalizeCommand(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

export function resolveBillingAction(value: string): BillingAction | null {
  const normalized = normalizeCommand(value)
  const byId = Object.entries(BILLING_ACTION_IDS)
    .find(([, id]) => id === normalized)?.[0] as BillingAction | undefined
  if (byId) return byId
  if (['pix', 'gerar pix', 'renovar', 'quero renovar'].includes(normalized)) return 'generatePix'
  if (['atendente', 'falar com atendente', 'suporte'].includes(normalized)) return 'humanSupport'
  if (['nao renovar', 'nao quero renovar', 'cancelar renovacao', 'parar alertas'].includes(normalized)) return 'cancelRenewal'
  return null
}

export function buildBillingAlertButtons(message: string, thumbnailUrl?: string): WhatsAppButtonsMessage {
  return {
    type: 'buttons',
    title: 'Aviso de vencimento',
    description: message,
    footer: 'Fallback: PIX, ATENDENTE ou NÃO RENOVAR.',
    thumbnailUrl,
    buttons: [
      { id: BILLING_ACTION_IDS.generatePix, displayText: 'Gerar PIX' },
      { id: BILLING_ACTION_IDS.humanSupport, displayText: 'Falar com atendente' },
      { id: BILLING_ACTION_IDS.cancelRenewal, displayText: 'Não quero renovar' },
    ],
  }
}

export function buildMainMenuList(name: string, greeting?: string): WhatsAppListMessage {
  const firstName = name.trim().split(/\s+/)[0] || 'cliente'
  return {
    type: 'list',
    title: 'Autoatendimento',
    description: greeting?.trim() || `Olá ${firstName} 👋 Escolha como podemos ajudar:`,
    footer: 'Se necessário, responda com o número da opção.',
    buttonText: 'Ver opções',
    sections: [{
      title: 'Atendimento',
      rows: [
        { id: '1', title: 'Renovar plano', description: 'Gerar uma nova cobrança PIX' },
        { id: '2', title: 'Segunda via do PIX', description: 'Consultar uma cobrança pendente' },
        { id: '3', title: 'Alterar vencimento', description: 'Enviar uma solicitação ao gestor' },
        { id: '4', title: 'Meu histórico', description: 'Consultar pagamentos recentes' },
        { id: '5', title: 'Atualizar telefone', description: 'Trocar o número cadastrado' },
        { id: '6', title: 'Falar com atendente', description: 'Pausar o robô e pedir ajuda' },
        { id: '7', title: 'Não quero renovar', description: 'Cancelar cadastro e avisos de cobrança' },
      ],
    }],
  }
}

export function buildPlanList(plans: Array<{ name: string; price: number }>): WhatsAppListMessage {
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
  return {
    type: 'list',
    title: 'Escolha seu plano',
    description: 'Selecione uma opção para continuar com a renovação.',
    footer: 'Se necessário, responda com o número do plano.',
    buttonText: 'Ver planos',
    sections: [{
      title: 'Planos disponíveis',
      rows: plans.slice(0, 10).map((plan, index) => ({
        id: String(index + 1),
        title: plan.name.slice(0, 24),
        description: currency.format(Number(plan.price)),
      })),
    }],
  }
}

export function buildRenewalConfirmationButtons(description: string): WhatsAppButtonsMessage {
  return {
    type: 'buttons',
    title: 'Confirmar renovação',
    description,
    footer: 'Fallback: responda 1 para confirmar ou 2 para cancelar.',
    buttons: [
      { id: '1', displayText: 'Confirmar PIX' },
      { id: '2', displayText: 'Cancelar' },
    ],
  }
}

export function buildCancellationConfirmationButtons(): WhatsAppButtonsMessage {
  return {
    type: 'buttons',
    title: 'Cancelar renovação?',
    description: 'Você deixará de receber avisos de cobrança e cobranças PIX pendentes serão canceladas. Confirma?',
    footer: 'Fallback: SIM cancela; NÃO mantém os avisos.',
    buttons: [
      { id: BILLING_ACTION_IDS.confirmCancellation, displayText: 'Sim, cancelar' },
      { id: BILLING_ACTION_IDS.keepRenewal, displayText: 'Continuar recebendo' },
    ],
  }
}

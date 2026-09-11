export type PlanId = 'starter' | 'pro' | 'master'

export type PlanCapability =
  | 'dashboard' | 'clients' | 'services' | 'finance_basic' | 'finance_advanced'
  | 'pix_manual' | 'pix_automatic' | 'promotions' | 'settings' | 'support'
  | 'automation_basic' | 'automation' | 'intelligent_collections' | 'self_service' | 'analytics'
  | 'client_portal' | 'leads' | 'warmup' | 'iptv_panels' | 'integrations'
  | 'intelligence' | 'resellers' | 'developer_api'

export type PlanCatalogItem = {
  id: PlanId
  name: string
  description: string
  monthlyPriceCents: number | null
  clientLimit: number | null
  whatsappInstanceLimit: number
  /** Mensagens por dia por número de WhatsApp. `null` = ilimitado, igual a `clientLimit`. */
  dailyMessageLimit: number | null
  capabilities: PlanCapability[]
  isPublic: boolean
  isPurchasable: boolean
  sortOrder: number
}

export type OrganizationPlanContext = {
  plan: PlanId
  active: boolean
  expiresAt: string | null
  limits: { clients: number | null; whatsappInstances: number; dailyMessagesPerInstance: number | null }
  capabilities: PlanCapability[]
}

export const PLAN_RESOURCE_LIMITS: Record<PlanId, { clients: number | null; whatsappInstances: number; dailyMessagesPerInstance: number | null }> = {
  starter: { clients: 100, whatsappInstances: 1, dailyMessagesPerInstance: 80 },
  pro: { clients: 500, whatsappInstances: 2, dailyMessagesPerInstance: 300 },
  master: { clients: null, whatsappInstances: 3, dailyMessagesPerInstance: null },
}

export function isWithinPlanLimit(current: number, increment: number, limit: number | null) {
  return limit === null || current + increment <= limit
}

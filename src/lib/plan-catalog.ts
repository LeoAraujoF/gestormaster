import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/service-role'
import type { OrganizationPlanContext, PlanCapability, PlanCatalogItem, PlanId } from '@/lib/plan-types'

const FALLBACK_CATALOG: PlanCatalogItem[] = [
  { id: 'starter', name: 'Starter', description: 'Organização essencial para operações que estão começando.', monthlyPriceCents: 2000, clientLimit: 100, whatsappInstanceLimit: 1, capabilities: ['dashboard','clients','services','finance_basic','pix_manual','promotions','settings','support','automation_basic'], isPublic: true, isPurchasable: true, sortOrder: 1 },
  { id: 'pro', name: 'Pro', description: 'Automação, cobrança inteligente e crescimento para operações em escala.', monthlyPriceCents: 3000, clientLimit: 500, whatsappInstanceLimit: 2, capabilities: ['dashboard','clients','services','finance_basic','finance_advanced','pix_manual','pix_automatic','promotions','settings','support','automation_basic','automation','intelligent_collections','self_service','analytics','client_portal','leads','warmup','iptv_panels','integrations'], isPublic: true, isPurchasable: true, sortOrder: 2 },
  { id: 'master', name: 'Master', description: 'Inteligência e recursos avançados para operações de alto volume.', monthlyPriceCents: 4000, clientLimit: null, whatsappInstanceLimit: 3, capabilities: ['dashboard','clients','services','finance_basic','finance_advanced','pix_manual','pix_automatic','promotions','settings','support','automation_basic','automation','intelligent_collections','self_service','analytics','client_portal','leads','warmup','iptv_panels','integrations','intelligence','resellers','developer_api'], isPublic: true, isPurchasable: true, sortOrder: 3 },
]

function mapRow(row: Record<string, unknown>): PlanCatalogItem {
  return {
    id: row.plan as PlanId,
    name: String(row.display_name),
    description: String(row.description),
    monthlyPriceCents: row.monthly_price_cents == null ? null : Number(row.monthly_price_cents),
    clientLimit: row.client_limit == null ? null : Number(row.client_limit),
    whatsappInstanceLimit: Number(row.whatsapp_instance_limit),
    capabilities: (row.capabilities || []) as PlanCapability[],
    isPublic: Boolean(row.is_public),
    isPurchasable: Boolean(row.is_purchasable),
    sortOrder: Number(row.sort_order),
  }
}

export async function getPlanCatalog(): Promise<PlanCatalogItem[]> {
  const { data, error } = await supabaseAdmin.from('saas_plan_catalog').select('*').order('sort_order')
  if (error) {
    if (error.code === '42P01') return FALLBACK_CATALOG
    throw new Error(`Falha ao consultar catálogo de planos: ${error.message}`)
  }
  if (!data?.length) return FALLBACK_CATALOG
  return data.map((row) => mapRow(row as Record<string, unknown>))
}

export async function getPlanById(planId: string): Promise<PlanCatalogItem | null> {
  if (!['starter', 'pro', 'master'].includes(planId)) return null
  return (await getPlanCatalog()).find((plan) => plan.id === planId) || null
}

export function stripePriceIdForPlan(planId: PlanId): string | null {
  const configured: Partial<Record<PlanId, string | undefined>> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    pro: process.env.STRIPE_PRICE_PRO,
    master: process.env.STRIPE_PRICE_MASTER,
  }
  const value = configured[planId]
  return value && !value.includes('placeholder') ? value : null
}

export async function getOrganizationPlanContext(organizationId: string): Promise<OrganizationPlanContext> {
  const [{ data: entitlement, error }, catalog] = await Promise.all([
    supabaseAdmin.from('organization_entitlements').select('plan, is_active, expires_at').eq('organization_id', organizationId).maybeSingle(),
    getPlanCatalog(),
  ])
  if (error) throw new Error(`Falha ao consultar entitlement: ${error.message}`)
  const validUntil = !entitlement?.expires_at || new Date(entitlement.expires_at) > new Date()
  const active = Boolean(entitlement?.is_active && validUntil)
  const planId = (entitlement?.plan || 'starter') as PlanId
  const plan = catalog.find((item) => item.id === planId) || FALLBACK_CATALOG[0]
  return {
    plan: plan.id,
    active,
    expiresAt: entitlement?.expires_at || null,
    limits: { clients: plan.clientLimit, whatsappInstances: plan.whatsappInstanceLimit },
    capabilities: active ? plan.capabilities : [],
  }
}

export async function organizationHasCapability(organizationId: string, capability: PlanCapability) {
  const context = await getOrganizationPlanContext(organizationId)
  return context.active && context.capabilities.includes(capability)
}

export class PlanAccessError extends Error {
  constructor(public capability: PlanCapability) { super('PLAN_UPGRADE_REQUIRED') }
}

export async function requireOrganizationCapability(organizationId: string, capability: PlanCapability) {
  const context = await getOrganizationPlanContext(organizationId)
  if (!context.active || !context.capabilities.includes(capability)) throw new PlanAccessError(capability)
  return context
}

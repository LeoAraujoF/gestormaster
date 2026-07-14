'use client'

import { createContext, useContext } from 'react'
import type { OrganizationPlanContext, PlanCapability } from '@/lib/plan-types'

const EMPTY: OrganizationPlanContext = { plan: 'starter', active: false, expiresAt: null, limits: { clients: 100, whatsappInstances: 1 }, capabilities: [] }
const PlanContext = createContext<OrganizationPlanContext>(EMPTY)

export function PlanProvider({ value, children }: { value: OrganizationPlanContext; children: React.ReactNode }) {
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>
}

export function usePlan() { return useContext(PlanContext) }
export function usePlanCapability(capability: PlanCapability) {
  const plan = usePlan()
  return plan.active && plan.capabilities.includes(capability)
}

'use client'

import Link from 'next/link'
import { LockKeyhole } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { usePlan } from '@/components/providers/plan-provider'
import type { PlanCapability } from '@/lib/plan-types'

const ROUTE_CAPABILITIES: Array<[string, PlanCapability, string]> = [
  ['/inteligencia', 'intelligence', 'Master'],
  ['/analytics', 'analytics', 'Pro ou Master'],
  ['/portal-cliente', 'client_portal', 'Pro ou Master'],
  ['/cobranca-inteligente', 'intelligent_collections', 'Pro ou Master'],
  ['/autoatendimento', 'self_service', 'Pro ou Master'],
  ['/aquecimento', 'warmup', 'Pro ou Master'],
  ['/leads', 'leads', 'Pro ou Master'],
  ['/conexoes/paineis', 'iptv_panels', 'Pro ou Master'],
  ['/conexoes/gateways', 'integrations', 'Pro ou Master'],
  ['/revendas', 'resellers', 'Master'],
]

export function PlanRouteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const plan = usePlan()
  const rule = ROUTE_CAPABILITIES.find(([route]) => pathname.startsWith(route))
  if (!rule || plan.capabilities.includes(rule[1])) return <>{children}</>

  return <div className="mx-auto max-w-2xl py-16 text-center">
    <LockKeyhole className="mx-auto size-10 text-muted-foreground" />
    <h1 className="mt-4 text-2xl font-semibold">Recurso disponível no plano {rule[2]}</h1>
    <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">Seu plano atual é {plan.plan.charAt(0).toUpperCase() + plan.plan.slice(1)}. Compare os recursos e escolha o plano adequado para sua operação.</p>
    <Button nativeButton={false} className="mt-6" render={<Link href={`/planos?upgrade=${rule[1]}`} />}>Comparar planos</Button>
  </div>
}

"use client"

import { usePathname } from 'next/navigation'
import { useFeatureFlags } from '@/components/providers/feature-flags-provider'
import { MaintenanceLock } from '@/components/maintenance-lock'

const pageFlags: Record<string, string> = {
  '/painel': 'page_painel',
  '/clientes': 'page_clientes',
  '/leads': 'page_leads',
  '/automacao': 'page_automacao',
  '/financeiro': 'page_financeiro',
  '/inteligencia': 'page_inteligencia',
  '/promocoes': 'page_promocoes',
  '/servicos': 'page_servicos',
  '/aquecimento': 'page_aquecimento',
  '/configuracoes': 'page_configuracoes',
  '/conexoes/gateways': 'page_integracoes',
  '/conexoes/paineis': 'page_integracoes_paineis',
  '/desenvolvedor': 'page_desenvolvedor',
  '/suporte': 'page_suporte',
  '/revendas': 'page_revendas',
}

export function PageProtector({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { flags, isLoading } = useFeatureFlags()

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center animate-pulse" role="status" aria-live="polite">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" aria-hidden="true" />
        <span className="sr-only">Verificando disponibilidade da página…</span>
      </div>
    )
  }

  // Find matching flag for current path
  const flagEntry = Object.entries(pageFlags).find(([path]) => pathname.startsWith(path))

  if (flagEntry) {
    const flagKey = flagEntry[1]
    if (flags[flagKey] === false) {
      return <MaintenanceLock />
    }
  }

  return <>{children}</>
}

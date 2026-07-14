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
  '/integracoes': 'page_integracoes',
  '/desenvolvedor': 'page_desenvolvedor',
  '/suporte': 'page_suporte',
  '/revendas': 'page_revendas',
}

export function PageProtector({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { flags, isLoading } = useFeatureFlags()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] animate-pulse">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
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

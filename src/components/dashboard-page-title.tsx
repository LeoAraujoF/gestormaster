"use client"

import { usePathname } from "next/navigation"

const PAGE_TITLES: { route: string; title: string }[] = [
  { route: "/revendas/configuracoes", title: "Configurações de revenda" },
  { route: "/revendas/metricas", title: "Métricas de revenda" },
  { route: "/conexoes/gateways", title: "Integrações" },
  { route: "/conexoes/paineis", title: "Painéis IPTV" },
  { route: "/cobranca-inteligente", title: "Cobrança inteligente" },
  { route: "/portal-cliente", title: "Portal do cliente" },
  { route: "/autoatendimento", title: "Autoatendimento" },
  { route: "/atualizacoes", title: "Atualizações" },
  { route: "/configuracoes", title: "Configurações" },
  { route: "/desenvolvedor", title: "Desenvolvedor" },
  { route: "/minha-conta", title: "Minha conta" },
  { route: "/inteligencia", title: "Intelligence" },
  { route: "/aquecimento", title: "Aquecimento" },
  { route: "/automacao", title: "Automação" },
  { route: "/promocoes", title: "Promoções" },
  { route: "/financeiro", title: "Financeiro" },
  { route: "/afiliados", title: "Afiliados" },
  { route: "/analytics", title: "Analytics" },
  { route: "/clientes", title: "Clientes" },
  { route: "/servicos", title: "Serviços" },
  { route: "/revendas", title: "Revendas" },
  { route: "/suporte", title: "Suporte" },
  { route: "/painel", title: "Painel" },
  { route: "/leads", title: "Leads" },
]

export function DashboardPageTitle() {
  const pathname = usePathname()
  const match = PAGE_TITLES.find(({ route }) => pathname === route || pathname?.startsWith(`${route}/`))

  return (
    <p className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-foreground md:hidden" aria-live="polite">
      {match?.title ?? "Lembrado"}
    </p>
  )
}

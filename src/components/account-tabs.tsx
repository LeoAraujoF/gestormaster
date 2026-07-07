"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

/**
 * Abas internas de "Minha conta" (design_handoff 5f): texto 11.5px,
 * ativa com borda inferior 2px tinta — sem pills, sem fundo.
 * Afiliados e Atualizações saíram do menu lateral e vivem aqui.
 */
const TABS = [
  { label: "Perfil e conta", href: "/minha-conta" },
  { label: "Afiliados", href: "/afiliados" },
  { label: "Atualizações", href: "/atualizacoes" },
]

export function AccountTabs() {
  const pathname = usePathname()
  return (
    <div className="flex items-center gap-5 border-b border-border">
      {TABS.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "-mb-px border-b-2 pb-2 text-[11.5px] transition-colors",
              active
                ? "border-primary font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}

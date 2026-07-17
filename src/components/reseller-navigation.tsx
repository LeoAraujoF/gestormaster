import Link from "next/link"
import { BarChart3, Settings2, Users } from "lucide-react"

import { cn } from "@/lib/utils"

type ResellerRoute = "management" | "metrics" | "settings"

const items = [
  { id: "management" as const, label: "Gestão", href: "/revendas", icon: Users },
  { id: "metrics" as const, label: "Métricas", href: "/revendas/metricas", icon: BarChart3 },
  { id: "settings" as const, label: "Configurações", href: "/revendas/configuracoes", icon: Settings2 },
]

export function ResellerNavigation({ active }: { active: ResellerRoute }) {
  return (
    <nav aria-label="Navegação de revendas" className="overflow-x-auto border-b">
      <div className="flex min-w-max gap-1">
        {items.map((item) => {
          const Icon = item.icon
          const isActive = active === item.id
          return (
            <Link key={item.id} href={item.href} aria-current={isActive ? "page" : undefined} className={cn("relative flex min-h-11 items-center gap-2 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground", isActive && "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-foreground")}>
              <Icon className="size-4" />{item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

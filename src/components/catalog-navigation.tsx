import Link from "next/link"
import { BadgePercent, Layers3 } from "lucide-react"

import { cn } from "@/lib/utils"

type CatalogRoute = "services" | "promotions"

export function CatalogNavigation({ active }: { active: CatalogRoute }) {
  const items = [
    { id: "services" as const, label: "Serviços", href: "/servicos", icon: Layers3 },
    { id: "promotions" as const, label: "Promoções", href: "/promocoes", icon: BadgePercent },
  ]

  return (
    <nav aria-label="Navegação do catálogo" className="overflow-x-auto rounded-xl border border-border bg-muted/50 p-1">
      <div className="grid min-w-[280px] grid-cols-2 gap-1">
        {items.map((item) => {
          const Icon = item.icon
          return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active === item.id ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-[background-color,color,box-shadow] hover:bg-background/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active === item.id && "bg-background text-foreground shadow-sm"
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
          )
        })}
      </div>
    </nav>
  )
}

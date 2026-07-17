import Link from "next/link"
import { CreditCard, Tv } from "lucide-react"

import { cn } from "@/lib/utils"

type ConnectionsRoute = "panels" | "gateways"

const items = [
  { id: "panels" as const, label: "Painéis IPTV", href: "/conexoes/paineis", icon: Tv },
  { id: "gateways" as const, label: "Gateways e API", href: "/conexoes/gateways", icon: CreditCard },
]

export function ConnectionsNavigation({ active }: { active: ConnectionsRoute }) {
  return (
    <nav aria-label="Navegação de integrações" className="overflow-x-auto border-b">
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

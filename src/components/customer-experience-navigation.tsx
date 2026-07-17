import Link from "next/link"
import { Bot, ExternalLink } from "lucide-react"

import { cn } from "@/lib/utils"

type CustomerExperienceRoute = "portal" | "self-service"

const items = [
  { id: "portal" as const, label: "Portal do Cliente", description: "Acesso, recursos e convites", href: "/portal-cliente", icon: ExternalLink },
  { id: "self-service" as const, label: "Autoatendimento", description: "Mensagens, pausas e solicitações", href: "/autoatendimento", icon: Bot },
]

export function CustomerExperienceNavigation({ active }: { active: CustomerExperienceRoute }) {
  return (
    <nav aria-label="Experiência do cliente" className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => {
        const Icon = item.icon
        const isActive = active === item.id

        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group flex min-h-16 items-center gap-3 rounded-xl border px-4 py-3 transition-all",
              isActive
                ? "border-sky-500/30 bg-sky-500/[0.08] shadow-sm"
                : "border-border/70 bg-card/70 hover:-translate-y-0.5 hover:border-sky-500/20 hover:bg-card hover:shadow-sm"
            )}
          >
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", isActive ? "bg-sky-600 text-white" : "bg-muted text-muted-foreground group-hover:text-foreground")}>
              <Icon className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="block text-xs text-muted-foreground">{item.description}</span>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

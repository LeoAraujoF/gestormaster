import Link from "next/link"
import { BarChart3, BrainCircuit } from "lucide-react"

import { cn } from "@/lib/utils"

type InsightsRoute = "analytics" | "intelligence"

const items = [
  { id: "analytics" as const, label: "Analytics", description: "Projeções e cenários", href: "/analytics", icon: BarChart3 },
  { id: "intelligence" as const, label: "Inteligência", description: "Prioridades e recomendações", href: "/inteligencia", icon: BrainCircuit },
]

export function InsightsNavigation({ active }: { active: InsightsRoute }) {
  return (
    <nav aria-label="Navegação de insights" className="grid gap-2 sm:grid-cols-2">
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
                ? "border-primary/30 bg-primary/[0.07] shadow-sm"
                : "border-border/70 bg-card/70 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-card hover:shadow-sm"
            )}
          >
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:text-foreground")}>
              <Icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">{item.label}</span>
              <span className="block text-xs text-muted-foreground">{item.description}</span>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

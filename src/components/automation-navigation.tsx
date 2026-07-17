import Link from "next/link"
import { BrainCircuit, Flame, Workflow } from "lucide-react"

import { cn } from "@/lib/utils"

type AutomationRoute = "central" | "collections" | "warmup"

export function AutomationNavigation({ active }: { active: AutomationRoute }) {
  const items = [
    { id: "central" as const, label: "Central", href: "/automacao", icon: Workflow },
    { id: "collections" as const, label: "Cobrança inteligente", href: "/cobranca-inteligente", icon: BrainCircuit },
    { id: "warmup" as const, label: "Aquecimento", href: "/aquecimento", icon: Flame },
  ]

  return (
    <nav aria-label="Navegação de automação" className="overflow-x-auto rounded-xl border border-border bg-muted/50 p-1">
      <div className="grid min-w-[620px] grid-cols-3 gap-1">
        {items.map((item) => {
          const Icon = item.icon
          return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active === item.id ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-[background-color,color,box-shadow] hover:bg-background/70 hover:text-foreground motion-reduce:transition-none",
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

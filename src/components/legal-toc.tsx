"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"

/**
 * Sumário sticky das páginas legais (design_handoff 10a):
 * item ativo em --accent, cross-link para a outra página no fim.
 */
export function LegalToc({
  items,
  crossLink,
}: {
  items: { id: string; label: string }[]
  crossLink: { href: string; label: string }
}) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "")

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
            break
          }
        }
      },
      { rootMargin: "-80px 0px -70% 0px" }
    )
    items.forEach((item) => {
      const el = document.getElementById(item.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [items])

  return (
    <nav className="sticky top-20 hidden max-h-[calc(100vh-6rem)] overflow-y-auto lg:block">
      <p className="microlabel mb-2 px-2.5">Nesta página</p>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={cn(
                "block rounded-md px-2.5 py-1.5 text-[11.5px] leading-snug transition-colors",
                activeId === item.id
                  ? "bg-accent font-semibold text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
      <div className="mt-4 border-t border-border px-2.5 pt-3">
        <Link href={crossLink.href} className="text-[11.5px] font-medium text-interactive hover:underline">
          {crossLink.label} →
        </Link>
      </div>
    </nav>
  )
}

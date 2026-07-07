"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

/**
 * Banner de conexão (design_handoff §7 / 7b): faixa --warning-bg no topo do conteúdo
 * quando o WhatsApp está desconectado, com consequência explícita (mensagens aguardando)
 * e ação primária tinta. Não bloqueia a navegação.
 */
export function WhatsAppBanner() {
  const [disconnected, setDisconnected] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch("/api/evolution/status")
        const data = await res.json()
        if (cancelled) return
        const isDown = data.status !== "connected"
        setDisconnected(isDown)
        if (isDown) {
          const { count } = await supabase
            .from("alert_history")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending")
          if (!cancelled) setPendingCount(count || 0)
        }
      } catch {
        // status indisponível — não mostra banner para não alarmar à toa
      }
    }
    check()
    const interval = setInterval(check, 60000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [supabase])

  // Na própria página de automação o usuário já está resolvendo — não duplica o aviso
  if (!disconnected || pathname?.startsWith("/automacao")) return null

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-warning-border bg-warning-bg px-3 py-2.5">
      <span className="status-dot bg-warning" />
      <p className="flex-1 text-xs font-semibold text-warning-fg">
        WhatsApp desconectado.
        {pendingCount > 0 && (
          <span className="font-normal"> {pendingCount} mensage{pendingCount === 1 ? "m aguarda" : "ns aguardam"} envio na fila.</span>
        )}
      </p>
      <Button size="sm" onClick={() => router.push("/automacao")} className="h-7 px-3 text-xs">
        Reconectar
      </Button>
    </div>
  )
}

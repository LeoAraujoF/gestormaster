"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

/**
 * Status do WhatsApp no header: ponto de status + palavra (design_handoff §7).
 * Verde = conectado (--money), âmbar = desconectado (--warning). Clique leva a /automacao.
 */
export function WhatsAppStatus() {
  const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading')
  const router = useRouter()

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/evolution/status')
        const data = await res.json()
        setStatus(data.status)
      } catch (e) {
        setStatus('disconnected')
      }
    }

    fetchStatus()

    // O Radar de Saúde Global verifica em segundo plano a cada 30 segundos
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  if (status === 'loading') {
    return (
      <div className="flex h-8 items-center gap-2 px-2 text-xs text-muted-foreground">
        <span className="status-dot bg-input" />
        <span className="hidden sm:inline-block">Verificando…</span>
      </div>
    )
  }

  const connected = status === 'connected'

  return (
    <button
      onClick={() => router.push('/automacao')}
      title={connected ? 'WhatsApp conectado' : 'WhatsApp desconectado — clique para conectar'}
      className="flex h-8 items-center gap-2 rounded-md px-2 text-xs font-medium transition-colors hover:bg-secondary"
    >
      <span className={`status-dot ${connected ? 'bg-money' : 'bg-warning'}`} />
      <span className={`hidden sm:inline-block ${connected ? 'text-money' : 'text-warning-fg'}`}>
        {connected ? 'WhatsApp conectado' : 'WhatsApp desconectado'}
      </span>
    </button>
  )
}

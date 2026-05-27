"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

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
      <Button variant="outline" size="sm" className="gap-2 h-9 border-border/50 opacity-50" disabled>
        <div className="w-2 h-2 rounded-full bg-muted animate-pulse"></div>
        <span className="hidden sm:inline-block font-medium">Radar...</span>
      </Button>
    )
  }

  return (
    <Button 
      variant="outline" 
      size="sm"
      onClick={() => router.push('/automacao')}
      className={`gap-2 h-9 transition-all ${status === 'connected' ? 'border-emerald-500/50 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-amber-500/50 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}
    >
      <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse'}`}></div>
      <span className="hidden sm:inline-block font-medium">{status === 'connected' ? 'WhatsApp Online' : 'WhatsApp Offline'}</span>
    </Button>
  )
}

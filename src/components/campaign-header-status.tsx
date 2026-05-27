"use client"

import { useEffect, useState } from "react"
import { Loader2, Megaphone } from "lucide-react"

export function CampaignHeaderStatus() {
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    const checkStatus = () => {
      const active = localStorage.getItem('wa_campaign_active') === 'true'
      setIsActive(active)
    }

    // Initial check
    checkStatus()

    // Listeners for event-based and multi-tab synchronization
    window.addEventListener('wa_campaign_status_changed', checkStatus)
    window.addEventListener('storage', checkStatus)
    
    return () => {
      window.removeEventListener('wa_campaign_status_changed', checkStatus)
      window.removeEventListener('storage', checkStatus)
    }
  }, [])

  if (!isActive) return null

  return (
    <div className="hidden sm:flex items-center gap-2 bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm animate-pulse">
      <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-500" />
      <Megaphone className="w-3.5 h-3.5 text-sky-500 hidden md:inline-block" />
      <span>Campanha Ativa</span>
    </div>
  )
}

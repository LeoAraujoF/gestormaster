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
    <div className="hidden sm:flex items-center gap-2 bg-secondary border border-border text-interactive px-3 py-1.5 rounded-full text-xs font-semibold">
      <Loader2 className="w-3.5 h-3.5 animate-spin text-interactive" />
      <Megaphone className="w-3.5 h-3.5 text-interactive hidden md:inline-block" />
      <span>Campanha Ativa</span>
    </div>
  )
}

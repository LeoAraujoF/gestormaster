"use client"

import { Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePrivacy } from "@/hooks/use-privacy"

export function PrivacyToggle() {
  const { showValues, togglePrivacy } = usePrivacy()

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      onClick={togglePrivacy} 
      title={showValues ? "Ocultar valores" : "Mostrar valores"}
      className="text-muted-foreground hover:text-foreground"
    >
      {showValues ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
    </Button>
  )
}

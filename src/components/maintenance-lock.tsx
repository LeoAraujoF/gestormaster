"use client"

import { Lock, Construction } from "lucide-react"

export function MaintenanceLock({ title = "Recurso Indisponível" }: { title?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-in fade-in zoom-in duration-500" aria-labelledby="maintenance-lock-title">
      <div className="relative mb-8">
        <div className="w-24 h-24 bg-card border-4 border-red-500/20 rounded-full flex items-center justify-center shadow-2xl relative">
          <Lock className="w-10 h-10 text-red-500" aria-hidden="true" />
          <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-background rounded-full flex items-center justify-center border border-border">
            <Construction className="w-5 h-5 text-amber-500" aria-hidden="true" />
          </div>
        </div>
      </div>
      
      <h1 id="maintenance-lock-title" className="text-3xl font-heading font-bold text-foreground mb-4">{title}</h1>
      <p className="text-muted-foreground max-w-md mx-auto text-lg leading-relaxed">
        Esta funcionalidade foi temporariamente desativada pelo administrador do sistema para manutenção ou atualizações.
      </p>
      
      <div className="mt-8 p-4 bg-muted/50 rounded-xl border border-border/50">
        <p className="text-sm text-muted-foreground font-medium">
          Tente acessar novamente mais tarde.
        </p>
      </div>
    </div>
  )
}

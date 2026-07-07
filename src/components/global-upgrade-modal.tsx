import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Crown, Zap, CheckCircle2, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"

interface UpgradeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  featureName: string
  description?: string
  redirectOnClose?: boolean
}

export function UpgradeModal({ open, onOpenChange, featureName, description, redirectOnClose = false }: UpgradeModalProps) {
  const router = useRouter()

  const handleUpgrade = () => {
    onOpenChange(false)
    router.push('/minha-conta')
  }

  const handleClose = (isOpen: boolean) => {
    onOpenChange(isOpen)
    if (!isOpen && redirectOnClose) {
      router.push('/')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px] border-amber-500/30 overflow-hidden p-0">
        {/* Glow Effects */}
        
        {/* Banner Header */}
        <div className="relative h-32 bg-warning-bg border-b border-warning-border flex flex-col items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay"></div>
          <div className="w-16 h-16 rounded-full bg-warning flex items-center justify-center mb-2 relative z-10">
            <Crown className="w-8 h-8 text-amber-950" />
          </div>
        </div>

        <div className="px-8 pt-6 pb-2 text-center relative z-10">
          <DialogTitle className="text-2xl font-bold text-foreground inline-block">
            Recurso Premium
          </DialogTitle>
          <DialogDescription className="text-base mt-2 text-foreground/80 font-medium">
            O recurso <strong className="text-foreground">{featureName}</strong> é exclusivo para assinantes do Plano Pro.
          </DialogDescription>
          {description && (
            <p className="text-sm text-muted-foreground mt-2">{description}</p>
          )}
        </div>

        {/* Features List */}
        <div className="px-8 py-4 relative z-10">
          <div className="bg-background/40 border border-border/50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">O que você ganha no Pro:</p>
            
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <span className="text-sm text-foreground/90">Automação completa de WhatsApp (avisos e cobranças automáticas)</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <span className="text-sm text-foreground/90">Disparos em massa ilimitados para sua base</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <span className="text-sm text-foreground/90">Sem limites de clientes e cadastros</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <span className="text-sm text-foreground/90">Suporte prioritário e painel sem limitações</span>
            </div>
          </div>
        </div>

        <DialogFooter className="px-8 pb-8 pt-2 relative z-10 flex-col sm:flex-col gap-3">
          <Button 
            onClick={handleUpgrade} 
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold transition-all h-12 text-lg"
          >
            <Zap className="w-5 h-5 mr-2 fill-amber-950" />
            Fazer Upgrade Agora
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          <Button 
            variant="ghost" 
            onClick={() => handleClose(false)} 
            className="w-full text-muted-foreground hover:text-foreground"
          >
            Talvez mais tarde
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"

interface GlobalDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: { id: string; name: string } | null
  table: 'clients' | 'services' | 'promotions' | 'automations' | 'users' // add more as needed
  title?: string
  description?: string
  onSuccess: () => void
}

export function GlobalDeleteDialog({ 
  open, 
  onOpenChange, 
  item, 
  table, 
  title = "Excluir Registro", 
  description = "Esta ação é irreversível.",
  onSuccess 
}: GlobalDeleteDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasPin, setHasPin] = useState(false)
  const [savedPin, setSavedPin] = useState("")
  const [pinInput, setPinInput] = useState("")
  const supabase = createClient()

  useEffect(() => {
    if (open) {
      setPinInput("")
      const checkPin = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (user && user.user_metadata?.security_pin) {
          setHasPin(true)
          setSavedPin(user.user_metadata.security_pin)
        } else {
          setHasPin(false)
        }
      }
      checkPin()
    }
  }, [open, supabase.auth])

  const handleDelete = async () => {
    if (!item) return
    if (hasPin && pinInput !== savedPin) {
      return toast.error("PIN de segurança incorreto.")
    }

    setIsSubmitting(true)
    try {
      const { error } = await supabase.from(table).delete().eq('id', item.id)
      if (error) throw error
      toast.success("Registro excluído com sucesso!")
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error("Erro ao excluir registro.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card sm:max-w-[425px] border-destructive/30 overflow-hidden">
        <DialogHeader className="relative">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-destructive/10 rounded-full blur-3xl pointer-events-none" />
          <DialogTitle className="text-destructive flex items-center gap-3 text-xl">
             <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center">
               <Trash2 className="w-5 h-5 text-destructive" />
             </div>
             {title}
          </DialogTitle>
          <DialogDescription className="pt-3 text-base">
            Tem certeza que deseja excluir <strong className="text-foreground">{item?.name}</strong>? {description}
          </DialogDescription>
        </DialogHeader>
        
        {hasPin && (
          <div className="flex flex-col items-center justify-center py-6 bg-background/50 rounded-xl border border-destructive/20 space-y-4 mt-2">
            <Label className="text-sm font-semibold text-destructive uppercase tracking-widest">
              Autorização Necessária
            </Label>
            <InputOTP maxLength={4} value={pinInput} onChange={setPinInput}>
              <InputOTPGroup>
                <InputOTPSlot index={0} className="w-12 h-12 text-lg border-destructive/30 font-bold bg-background/80" />
                <InputOTPSlot index={1} className="w-12 h-12 text-lg border-destructive/30 font-bold bg-background/80" />
                <InputOTPSlot index={2} className="w-12 h-12 text-lg border-destructive/30 font-bold bg-background/80" />
                <InputOTPSlot index={3} className="w-12 h-12 text-lg border-destructive/30 font-bold bg-background/80" />
              </InputOTPGroup>
            </InputOTP>
          </div>
        )}

        <DialogFooter className="pt-6 relative z-10">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">Cancelar</Button>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={isSubmitting || (hasPin && pinInput.length !== 4)} className="w-full sm:w-auto">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirmar Exclusão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

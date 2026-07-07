"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { logAuditClient } from "@/lib/audit-client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"

interface GlobalDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: { id: string; name: string } | null
  table: 'clients' | 'services' | 'promotions' | 'automations' | 'users' | 'iptv_accounts' // add more as needed
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
      logAuditClient({ action: 'resource.delete', resource: table, details: { item_name: item.name || item.id } })
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
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-[14px] font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </DialogHeader>

        {/* Resumo do que se perde */}
        <div className="rounded-md bg-secondary px-3 py-2.5 text-xs">
          <p className="font-semibold text-danger">{item?.name}</p>
        </div>

        {hasPin && (
          <div className="flex flex-col items-center gap-2.5 py-1">
            <Label className="microlabel">PIN do cofre</Label>
            <InputOTP maxLength={4} value={pinInput} onChange={setPinInput}>
              <InputOTPGroup className="gap-1.5">
                {[0, 1, 2, 3].map((i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="num h-10 w-[38px] rounded-md border border-input bg-card text-base data-[active=true]:border-interactive data-[active=true]:ring-2 data-[active=true]:ring-interactive/20"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="sm:flex-1">
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isSubmitting || (hasPin && pinInput.length !== 4)}
            className="disabled:bg-[#f0d3d3] disabled:text-white disabled:opacity-100 dark:disabled:bg-danger/30 sm:flex-[1.4]"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

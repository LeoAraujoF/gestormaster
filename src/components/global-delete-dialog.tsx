"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  deleteProtectedResource,
  fetchSecurityPinStatus,
  SecurityPinApiError,
} from "@/lib/security-pin-client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"

interface GlobalDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: { id: string; name: string } | null
  table: 'clients' | 'services' | 'promotions' | 'iptv_accounts'
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
  const [isCheckingPin, setIsCheckingPin] = useState(false)
  const [pinUnavailable, setPinUnavailable] = useState(false)
  const [pinLockedUntil, setPinLockedUntil] = useState<string | null>(null)
  const [pinInput, setPinInput] = useState("")

  useEffect(() => {
    if (!open) return
    let active = true
    void Promise.resolve().then(async () => {
      if (!active) return
      setPinInput("")
      setPinUnavailable(false)
      setPinLockedUntil(null)
      setIsCheckingPin(true)
      try {
        const status = await fetchSecurityPinStatus()
        if (active) {
          setHasPin(status.configured)
          setPinLockedUntil(status.lockedUntil)
        }
      } catch {
        if (active) {
          setHasPin(false)
          setPinUnavailable(true)
        }
      } finally {
        if (active) setIsCheckingPin(false)
      }
    })
    return () => { active = false }
  }, [open])

  const handleDelete = async () => {
    if (!item) return
    if (!hasPin) return toast.error("Configure o Cofre PIN em Minha Conta antes de excluir registros.")

    setIsSubmitting(true)
    try {
      await deleteProtectedResource({ resource: table, ids: [item.id], pin: pinInput })
      toast.success("Registro excluído com sucesso!")
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      setPinInput("")
      if (error instanceof SecurityPinApiError && error.lockedUntil) {
        setPinLockedUntil(error.lockedUntil)
      }
      toast.error(error instanceof SecurityPinApiError ? error.message : "Erro ao excluir registro.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const isPinLocked = Boolean(pinLockedUntil)

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

        {isCheckingPin && (
          <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Verificando proteção...
          </div>
        )}

        {!isCheckingPin && !hasPin && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300">
            {pinUnavailable
              ? "Não foi possível consultar o Cofre PIN. Tente novamente."
              : "Configure o Cofre PIN em Minha Conta para autorizar exclusões."}
          </div>
        )}

        {!isCheckingPin && hasPin && isPinLocked && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-700 dark:text-red-300">
            PIN bloqueado após três erros. Tente novamente em 15 minutos.
          </div>
        )}

        {!isCheckingPin && hasPin && !isPinLocked && (
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
            disabled={isSubmitting || isCheckingPin || !hasPin || isPinLocked || pinInput.length !== 4}
            className="disabled:bg-danger-bg disabled:text-danger-fg disabled:opacity-100 dark:disabled:bg-danger/30 sm:flex-[1.4]"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

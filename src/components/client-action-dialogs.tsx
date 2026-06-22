"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Loader2, RefreshCw, Gift, Trash2, Plus, Minus } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils"
import confetti from "canvas-confetti"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function RenewDialog({ open, onOpenChange, client, onSuccess }: { open: boolean, onOpenChange: (open: boolean) => void, client: any, onSuccess: () => void }) {
  const [renewMonths, setRenewMonths] = useState(1)
  const [renewAmount, setRenewAmount] = useState(client?.plan_value || 0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (client && open) {
      setRenewMonths(1)
      setRenewAmount(client.plan_value || 0)
    }
  }, [client, open])

  const handleMonthsChange = (delta: number) => {
    const newVal = Math.max(1, renewMonths + delta)
    setRenewMonths(newVal)
    if (client) {
      setRenewAmount(client.plan_value * newVal)
    }
  }

  const handleRenew = async () => {
    if (!client) return
    setIsSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Usuário não autenticado")

      const currentDueDate = new Date(client.due_date + "T12:00:00")
      currentDueDate.setMonth(currentDueDate.getMonth() + renewMonths)
      const newDueDateStr = currentDueDate.toISOString().split('T')[0]

      const { error } = await supabase.from('clients').update({ due_date: newDueDateStr, status: 'active' }).eq('id', client.id)
      if (error) throw error

      const renewingServicesCost = client.client_services?.reduce((acc: number, cs: any) => acc + (cs.services?.cost || 0), 0) || 0
      const clientScreensRenew = client.screens || 1
      const totalCostForRenewPeriod = renewingServicesCost * clientScreensRenew * renewMonths
      const netProfitForRenew = renewAmount - totalCostForRenewPeriod

      const { error: paymentError } = await supabase.from('payments').insert({
        user_id: user.id, client_id: client.id, amount_paid: renewAmount, net_profit: netProfitForRenew, months_renewed: renewMonths
      })

      if (paymentError) throw paymentError

      const { data: rules } = await supabase
        .from('automations')
        .select('*')
        .eq('user_id', user.id)
        .eq('alert_type', 'renewal')
        .eq('is_active', true)
        
      if (rules && rules.length > 0) {
        for (const rule of rules) {
          // Fire and forget: roda em background para não travar a tela
          fetch(window.location.origin + '/api/evolution/send-instant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: client.id, ruleId: rule.id })
          })
          .then(async (res) => {
            if (!res.ok) {
              const errData = await res.json()
              toast.warning(`WhatsApp falhou em background: ${errData.error || 'Erro desconhecido'}`)
            }
          })
          .catch((err: any) => {
            toast.warning(`O WhatsApp foi bloqueado pelo seu navegador (Failed to fetch).`)
          })
        }
      }

      toast.success(`Assinatura renovada por ${renewMonths} mês(es)! Novo vencimento: ${currentDueDate.toLocaleDateString('pt-BR')}`)
      
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#10b981', '#f59e0b', '#3b82f6', '#8b5cf6']
      })
      
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error("Erro ao renovar cliente.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const renewingServicesCost = client?.client_services?.reduce((acc: number, cs: any) => acc + (cs.services?.cost || 0), 0) || 0
  const clientScreensRenew = client?.screens || 1
  const totalCostForRenewPeriod = renewingServicesCost * clientScreensRenew * renewMonths
  const netProfitForRenew = renewAmount - totalCostForRenewPeriod

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card sm:max-w-[425px] overflow-hidden border-primary/20">
        <DialogHeader className="relative">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          <DialogTitle className="text-primary flex items-center gap-3 text-xl">
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-primary" />
            </div>
            Renovar Assinatura
          </DialogTitle>
          <DialogDescription className="pt-3 text-base">
            Renovação de plano para <strong className="text-foreground">{client?.name}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 pt-4">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label className="text-muted-foreground">Meses (Duração)</Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-full" onClick={() => handleMonthsChange(-1)}>
                  <Minus className="h-4 w-4" />
                </Button>
                <div className="h-10 flex-1 flex items-center justify-center font-bold text-lg bg-background/50 border border-border/50 rounded-md">
                  {renewMonths}
                </div>
                <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-full" onClick={() => handleMonthsChange(1)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              <Label className="text-muted-foreground">Valor Total (R$)</Label>
              <Input type="number" step="0.01" value={renewAmount} onChange={(e) => setRenewAmount(parseFloat(e.target.value) || 0)} className="bg-background/50 h-10 text-lg font-semibold" />
            </div>
          </div>
          
          <div className="relative group rounded-xl bg-card border border-emerald-500/20 overflow-hidden shadow-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
            <div className="p-4 relative z-10 space-y-3">
              <div className="flex justify-between text-sm items-center">
                <span className="text-muted-foreground">Custo dos serviços ({renewMonths}x):</span>
                <span className="text-red-400 font-medium bg-red-400/10 px-2 py-0.5 rounded text-xs">{formatCurrency(totalCostForRenewPeriod)}</span>
              </div>
              <div className="flex justify-between items-center border-t border-border/50 pt-3">
                <span className="font-semibold text-foreground text-sm uppercase tracking-wide">Lucro Líquido</span>
                <span className="text-emerald-500 font-bold text-xl drop-shadow-sm">{formatCurrency(netProfitForRenew)}</span>
              </div>
            </div>
          </div>

          {client && (
            <div className="text-xs text-center text-muted-foreground bg-muted/30 py-2 rounded-lg border border-border/30">
              Vencimento: <strong className="text-foreground">{new Date(client.due_date + "T12:00:00").toLocaleDateString('pt-BR')}</strong> 
              <span className="mx-2 opacity-50">➔</span> 
              <strong className="text-primary">{(() => { const d = new Date(client.due_date + "T12:00:00"); d.setMonth(d.getMonth() + renewMonths); return d.toLocaleDateString('pt-BR'); })()}</strong>
            </div>
          )}
        </div>
        <DialogFooter className="pt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">Cancelar</Button>
          <Button type="button" onClick={handleRenew} disabled={isSubmitting} className="w-full sm:w-auto">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirmar Renovação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PromoDialog({ open, onOpenChange, client, onSuccess }: { open: boolean, onOpenChange: (open: boolean) => void, client: any, onSuccess: () => void }) {
  const [promotions, setPromotions] = useState<any[]>([])
  const [selectedPromoId, setSelectedPromoId] = useState<string>("")
  const [renewMonths, setRenewMonths] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingPromos, setIsLoadingPromos] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (open) {
      setRenewMonths(1)
      setSelectedPromoId("")
      fetchPromotions()
    }
  }, [open])

  const fetchPromotions = async () => {
    setIsLoadingPromos(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase.from('promotions').select('*').eq('user_id', user.id).eq('is_active', true)
      if (data) setPromotions(data)
    }
    setIsLoadingPromos(false)
  }

  const selectedPromo = promotions.find(p => p.id === selectedPromoId)

  const handleMonthsChange = (delta: number) => {
    const newVal = Math.max(1, renewMonths + delta)
    setRenewMonths(newVal)
  }

  const handlePromo = async () => {
    if (!client) return
    setIsSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Usuário não autenticado")

      const currentDueDate = new Date(client.due_date + "T12:00:00")
      currentDueDate.setMonth(currentDueDate.getMonth() + renewMonths)
      const newDueDateStr = currentDueDate.toISOString().split('T')[0]

      const { error } = await supabase.from('clients').update({ due_date: newDueDateStr, status: 'active' }).eq('id', client.id)
      if (error) throw error

      const clientScreens = client.screens || 1
      const promoServicesCost = client.client_services?.reduce((acc: number, cs: any) => acc + (cs.services?.cost || 0), 0) || 0
      const totalCostForPromo = promoServicesCost * clientScreens * renewMonths
      
      // If a promo is selected, consider its discount as the amount paid, otherwise 0
      const amountPaid = selectedPromo ? (client.plan_value - selectedPromo.discount_value) * renewMonths : 0
      const netProfitForPromo = amountPaid - totalCostForPromo

      const { error: paymentError } = await supabase.from('payments').insert({
        user_id: user.id, client_id: client.id, amount_paid: amountPaid, net_profit: netProfitForPromo, months_renewed: renewMonths
      })

      if (paymentError) throw paymentError

      const { data: rules } = await supabase
        .from('automations')
        .select('*')
        .eq('user_id', user.id)
        .eq('alert_type', 'promotion')
        .eq('is_active', true)
        
      if (rules && rules.length > 0) {
        for (const rule of rules) {
          // Fire and forget
          fetch(window.location.origin + '/api/evolution/send-instant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: client.id, ruleId: rule.id })
          })
          .then(async (res) => {
            if (!res.ok) {
              const errData = await res.json()
              toast.warning(`WhatsApp (Promoção) falhou em background: ${errData.error || 'Erro desconhecido'}`)
            }
          })
          .catch((err: any) => {
            toast.warning(`O WhatsApp foi bloqueado pelo seu navegador (Failed to fetch).`)
          })
        }
      }

      toast.success(`Promoção ativada! Vencimento estendido por ${renewMonths} mês(es).`)
      
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#10b981', '#f59e0b', '#3b82f6', '#8b5cf6']
      })
      
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error("Erro ao ativar promoção.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card sm:max-w-[425px] border-amber-500/20 overflow-hidden">
        <DialogHeader className="relative">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <DialogTitle className="text-amber-500 flex items-center gap-3 text-xl">
            <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center">
              <Gift className="w-5 h-5 text-amber-500" />
            </div>
             Aplicar Promoção
          </DialogTitle>
          <DialogDescription className="pt-3 text-base">
            Configure uma promoção de extensão de plano para <strong className="text-foreground">{client?.name}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 pt-4 relative z-10">
          
          <div className="space-y-3">
            <Label className="text-muted-foreground">Promoção Global (Opcional)</Label>
            {isLoadingPromos ? (
              <div className="h-10 bg-muted/50 animate-pulse rounded-md"></div>
            ) : (
              <Select value={selectedPromoId} onValueChange={(val) => setSelectedPromoId(val || "")}>
                <SelectTrigger className="bg-background/50 h-10 w-full">
                  {selectedPromoId && selectedPromoId !== "none" && selectedPromo ? (
                    <span data-slot="select-value" className="text-sm text-left truncate">
                      {selectedPromo.name} - Desconto: {formatCurrency(selectedPromo.discount_value)}
                    </span>
                  ) : selectedPromoId === "none" ? (
                    <span data-slot="select-value" className="text-sm text-left truncate">
                      Nenhuma (Apenas gerar bônus gratuito)
                    </span>
                  ) : (
                    <SelectValue placeholder="Selecione uma promoção (ou deixe vazio)" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma (Apenas gerar bônus gratuito)</SelectItem>
                  {promotions.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} - Desconto: {formatCurrency(p.discount_value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-3">
            <Label className="text-muted-foreground">Quantidade de Meses (Bônus/Extensão)</Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-full" onClick={() => handleMonthsChange(-1)}>
                <Minus className="h-4 w-4" />
              </Button>
              <div className="h-10 flex-1 flex items-center justify-center font-bold text-lg bg-background/50 border border-border/50 rounded-md">
                {renewMonths}
              </div>
              <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-full" onClick={() => handleMonthsChange(1)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {selectedPromo && (
             <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 flex flex-col gap-1 text-sm">
               <span className="text-amber-500 font-semibold">{selectedPromo.name}</span>
               <span className="text-muted-foreground">{selectedPromo.description || "Sem descrição."}</span>
               <div className="mt-1 flex justify-between items-center text-xs">
                 <span>Valor Base do Cliente: <span className="line-through">{formatCurrency(client?.plan_value || 0)}</span></span>
                 <span className="font-bold text-emerald-500 text-sm">{formatCurrency(Math.max(0, (client?.plan_value || 0) - selectedPromo.discount_value))} / mês</span>
               </div>
             </div>
          )}
          {!selectedPromoId || selectedPromoId === "none" ? (
             <div className="text-xs text-muted-foreground text-center bg-muted/30 p-2 rounded-lg">
               Isso irá gerar um comprovante de <strong>R$ 0,00</strong> para {renewMonths} mês(es).
             </div>
          ) : null}

        </div>
        <DialogFooter className="pt-6 relative z-10">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">Cancelar</Button>
          <Button type="button" className="bg-amber-500 hover:bg-amber-600 text-white w-full sm:w-auto" onClick={handlePromo} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Aplicar Promoção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteDialog({ open, onOpenChange, client, onSuccess }: { open: boolean, onOpenChange: (open: boolean) => void, client: any, onSuccess: () => void }) {
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
    if (!client) return
    if (hasPin && pinInput !== savedPin) {
      return toast.error("PIN de segurança incorreto.")
    }

    setIsSubmitting(true)
    try {
      const { error } = await supabase.from('clients').delete().eq('id', client.id)
      if (error) throw error
      toast.success("Cliente excluído!")
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error("Erro ao excluir cliente.")
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
             Excluir Registro
          </DialogTitle>
          <DialogDescription className="pt-3 text-base">
            Tem certeza que deseja excluir <strong className="text-foreground">{client?.name}</strong>? Esta ação é <strong>irreversível</strong>.
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

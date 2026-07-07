"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils"
import confetti from "canvas-confetti"
import { logAuditClient } from "@/lib/audit-client"

import { Dialog, DialogContent, DialogOverlay, DialogPortal } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

// Toggle Switch Component
function CustomToggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <div className="flex items-center justify-between py-[12px]">
      <span className="text-[12px] font-medium text-foreground">{label}</span>
      <div 
        onClick={onChange}
        className={cn(
          "w-[34px] h-[18px] rounded-full p-[2px] cursor-pointer transition-colors",
          checked ? "bg-primary" : "bg-input"
        )}
      >
        <div 
          className={cn(
            "w-[14px] h-[14px] bg-card rounded-full shadow-sm transition-transform",
            checked ? "translate-x-[16px]" : "translate-x-0"
          )}
        />
      </div>
    </div>
  )
}

// Keypad Component
function VirtualKeypad({ pin, setPin, disabled }: { pin: string, setPin: (val: string) => void, disabled?: boolean }) {
  const handleKey = (key: string) => {
    if (disabled) return
    if (key === 'backspace') {
      setPin(pin.slice(0, -1))
    } else if (pin.length < 4 && key !== 'empty') {
      setPin(pin + key)
    }
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'empty', '0', 'backspace']

  return (
    <div className="mt-4">
      {/* PIN display boxes */}
      <div className="flex justify-center gap-2 mb-6">
        {[0, 1, 2, 3].map(i => (
          <div 
            key={i}
            className={cn(
              "w-[44px] h-[46px] rounded-[7px] border bg-card flex items-center justify-center font-mono text-[18px]",
              pin.length === i ? "border-interactive ring-1 ring-interactive/20" : "border-input"
            )}
          >
            {pin[i] ? "•" : ""}
          </div>
        ))}
      </div>
      
      {/* Numeric Keypad */}
      <div className="grid grid-cols-3 gap-2 px-2">
        {keys.map((k, i) => (
          <button
            key={i}
            type="button"
            disabled={disabled || k === 'empty'}
            onClick={() => handleKey(k)}
            className={cn(
              "h-[38px] rounded-[7px] font-mono text-[14px] font-medium flex items-center justify-center transition-colors",
              k === 'empty' ? "invisible" : "border border-input bg-card text-foreground hover:bg-muted active:bg-secondary"
            )}
          >
            {k === 'backspace' ? '⌫' : k !== 'empty' ? k : ''}
          </button>
        ))}
      </div>
    </div>
  )
}

export function RenewDialog({ open, onOpenChange, client, onSuccess }: { open: boolean, onOpenChange: (open: boolean) => void, client: any, onSuccess: () => void }) {
  const [renewMonths, setRenewMonths] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(true)
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'money' | 'card'>('pix')
  const supabase = createClient()

  useEffect(() => {
    if (client && open) {
      setRenewMonths(1)
      setNotifyWhatsApp(true)
      setPaymentMethod('pix')
    }
  }, [client, open])

  const planValue = client?.plan_value || 0
  
  const periods = [
    { months: 1, label: '1 mês' },
    { months: 3, label: '3 meses' },
    { months: 6, label: '6 meses' },
    { months: 12, label: '1 ano' }
  ]

  const handleRenew = async () => {
    if (!client) return
    setIsSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Usuário não autenticado")

      const renewAmount = planValue * renewMonths

      // Se o plano já está vencido, renova a partir de hoje; senão, a partir do vencimento atual
      const originalDueDate = new Date(client.due_date + "T12:00:00")
      const today = new Date()
      today.setHours(12, 0, 0, 0)
      const renewalBase = originalDueDate < today ? today : originalDueDate
      const currentDueDate = new Date(renewalBase)
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

      if (notifyWhatsApp) {
        const { data: rules } = await supabase
          .from('automations')
          .select('*')
          .eq('user_id', user.id)
          .eq('alert_type', 'renewal')
          .eq('is_active', true)
          
        if (rules && rules.length > 0) {
          for (const rule of rules) {
            fetch(window.location.origin + '/api/evolution/send-instant', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientId: client.id, ruleId: rule.id })
            }).catch(() => {})
          }
        }
      }

      toast.success(`Assinatura renovada por ${renewMonths} mês(es)! Novo vencimento: ${currentDueDate.toLocaleDateString('pt-BR')}`)
      logAuditClient({ action: 'client.renew', resource: 'clients', details: { client_name: client.name, months: renewMonths } })
      
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, colors: ['#2e7d54', '#4055c8', '#191a1e'] })
      
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error("Erro ao renovar cliente.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const currentDueDate = client ? new Date(client.due_date + "T12:00:00") : new Date()
  const displayDate = client ? currentDueDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('. de ', '/') : ''
  // Preview: se o plano já está vencido, mostra novo vencimento a partir de hoje
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const renewalBase = currentDueDate < today ? new Date(today) : new Date(currentDueDate)
  const newDueDate = new Date(renewalBase)
  newDueDate.setMonth(newDueDate.getMonth() + renewMonths)
  
  const paymentMethods = [
    { id: 'pix', label: 'PIX', desc: 'Transferência instantânea' },
    { id: 'money', label: 'Dinheiro', desc: 'Pago em espécie' },
    { id: 'card', label: 'Cartão', desc: 'Débito ou crédito' }
  ] as const

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
          showCloseButton={false}
          className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 p-0 border-0 bg-transparent shadow-none ring-0 sm:max-w-none w-[440px] max-w-[95vw] focus:outline-none"
        >
          <div className="modal-2a">
            {/* HEADER */}
            <div className="modal-header-2a">
              <span className="w-[34px] h-[34px] rounded-[9px] bg-success-bg text-success-fg flex items-center justify-center text-[15px]">
                ↻
              </span>
              <div className="flex-1">
                <div className="font-semibold text-[15px] tracking-[-0.01em] text-foreground">
                  Renovar assinatura
                </div>
                <div className="text-muted-foreground text-[11px] mt-[1px] truncate">
                  {client?.name} · vence {displayDate}
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => onOpenChange(false)}
                className="cursor-pointer border-none bg-transparent text-muted-foreground text-[18px] hover:text-secondary-foreground"
              >
                ✕
              </button>
            </div>
            
            <div className="p-[20px_22px]">
              {/* Period grid */}
              <div className="grid grid-cols-2 gap-[8px] mb-[20px]">
                {periods.map(p => {
                  const isSelected = renewMonths === p.months
                  return (
                    <button
                      key={p.months}
                      onClick={() => setRenewMonths(p.months)}
                      className={cn(
                        "rounded-[8px] p-[10px] text-left transition-colors flex flex-col gap-[2px]",
                        isSelected 
                          ? "border-[1.5px] border-primary bg-muted" 
                          : "border-[1px] border-input bg-card"
                      )}
                    >
                      <span className="text-[12px] font-semibold text-foreground">{p.label}</span>
                      <span className="font-mono text-[11px] text-secondary-foreground">{formatCurrency(planValue * p.months)}</span>
                    </button>
                  )
                })}
              </div>

              {/* Summary ruler */}
              <div className="flex rounded-[8px] border border-border bg-muted overflow-hidden mb-[20px]">
                <div className="flex-1 p-[12px] border-r border-border">
                  <div className="microlabel mb-[4px]">NOVO VENCIMENTO</div>
                  <div className="font-mono text-[14px] font-bold text-foreground">{newDueDate.toLocaleDateString('pt-BR')}</div>
                </div>
                <div className="flex-1 p-[12px]">
                  <div className="microlabel mb-[4px]">TOTAL</div>
                  <div className="font-mono text-[14px] font-bold text-money">{formatCurrency(planValue * renewMonths)}</div>
                </div>
              </div>

              {/* Payment methods */}
              <div className="space-y-[8px] mb-[20px]">
                {paymentMethods.map(pm => (
                  <div 
                    key={pm.id}
                    onClick={() => setPaymentMethod(pm.id)}
                    className="flex items-center gap-[12px] p-[12px] rounded-[8px] border border-input cursor-pointer"
                  >
                    <div className={cn(
                      "w-[15px] h-[15px] rounded-full border transition-all",
                      paymentMethod === pm.id ? "border-[4.5px] border-primary" : "border-[1px] border-input"
                    )} />
                    <div>
                      <div className="text-[13px] font-medium text-foreground leading-tight">{pm.label}</div>
                      <div className="text-[11px] text-muted-foreground leading-tight mt-[2px]">{pm.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {paymentMethod === 'pix' && (
                <div className="flex items-center gap-[12px] p-[12px] bg-muted rounded-[8px] border border-border mb-[20px]">
                  <div className="w-[66px] h-[66px] bg-card border border-input rounded-[4px] flex items-center justify-center text-[10px] text-muted-foreground">
                    QR CODE
                  </div>
                  <div className="flex-1">
                    <input readOnly value="00020126360014br.gov.bcb.pix..." className="w-full bg-card border border-input rounded-[6px] px-[10px] py-[6px] text-[11px] font-mono text-secondary-foreground mb-[6px]" />
                    <button className="text-interactive text-[11px] font-medium hover:underline">Copiar código PIX</button>
                  </div>
                </div>
              )}

              {/* Toggle */}
              <div className="border-t border-border pt-[8px]">
                <CustomToggle 
                  checked={notifyWhatsApp} 
                  onChange={() => setNotifyWhatsApp(!notifyWhatsApp)}
                  label="Avisar o cliente da renovação no WhatsApp"
                />
              </div>

            </div>
            
            <div className="modal-footer-2a">
              <button 
                type="button" 
                onClick={() => onOpenChange(false)}
                className="border border-input bg-card rounded-[7px] px-[16px] py-[9px] font-medium text-[12px] text-secondary-foreground"
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={handleRenew}
                disabled={isSubmitting}
                className="border-none bg-primary text-primary-foreground rounded-[7px] px-[20px] py-[9px] font-semibold text-[12px] flex items-center gap-[6px]"
              >
                {isSubmitting && <Loader2 className="w-[14px] h-[14px] animate-spin" />}
                Confirmar renovação
              </button>
            </div>
          </div>
        </DialogContent>
    </Dialog>
  )
}

export function PromoDialog({ open, onOpenChange, client, onSuccess }: { open: boolean, onOpenChange: (open: boolean) => void, client: any, onSuccess: () => void }) {
  const [promotions, setPromotions] = useState<any[]>([])
  const [selectedPromoId, setSelectedPromoId] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (open) {
      setSelectedPromoId("")
      setNotifyWhatsApp(true)
      fetchPromotions()
    }
  }, [open])

  const fetchPromotions = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase.from('promotions').select('*').eq('user_id', user.id).eq('is_active', true)
      if (data) setPromotions(data)
    }
  }

  const handlePromo = async () => {
    if (!client || !selectedPromoId) return
    setIsSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Usuário não autenticado")

      const renewMonths = 1 // Default to 1 month for simplicity in promo, or extract from promo if it has duration
      const currentDueDate = new Date(client.due_date + "T12:00:00")
      currentDueDate.setMonth(currentDueDate.getMonth() + renewMonths)
      const newDueDateStr = currentDueDate.toISOString().split('T')[0]

      const { error } = await supabase.from('clients').update({ due_date: newDueDateStr, status: 'active' }).eq('id', client.id)
      if (error) throw error

      const promo = promotions.find(p => p.id === selectedPromoId)
      const clientScreens = client.screens || 1
      const promoServicesCost = client.client_services?.reduce((acc: number, cs: any) => acc + (cs.services?.cost || 0), 0) || 0
      const totalCostForPromo = promoServicesCost * clientScreens * renewMonths
      const amountPaid = promo ? Math.max(0, client.plan_value - promo.discount_value) * renewMonths : 0
      const netProfitForPromo = amountPaid - totalCostForPromo

      const { error: paymentError } = await supabase.from('payments').insert({
        user_id: user.id, client_id: client.id, amount_paid: amountPaid, net_profit: netProfitForPromo, months_renewed: renewMonths
      })

      if (paymentError) throw paymentError

      if (notifyWhatsApp) {
        const { data: rules } = await supabase
          .from('automations')
          .select('*')
          .eq('user_id', user.id)
          .eq('alert_type', 'promotion')
          .eq('is_active', true)
          
        if (rules && rules.length > 0) {
          for (const rule of rules) {
            fetch(window.location.origin + '/api/evolution/send-instant', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientId: client.id, ruleId: rule.id })
            }).catch(() => {})
          }
        }
      }

      toast.success(`Promoção ativada! Vencimento estendido.`)
      logAuditClient({ action: 'client.promotion', resource: 'clients', details: { client_name: client.name, promo: promo?.name, days: promo?.extra_days } })
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, colors: ['#3140a8', '#191a1e'] })
      
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error("Erro ao ativar promoção.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const currentDueDate = client ? new Date(client.due_date + "T12:00:00") : new Date()
  const displayDate = client ? currentDueDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('. de ', '/') : ''
  const newDueDate = new Date(currentDueDate)
  newDueDate.setMonth(newDueDate.getMonth() + 1) // default extension 1 month

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
          showCloseButton={false}
          className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 p-0 border-0 bg-transparent shadow-none ring-0 sm:max-w-none w-[420px] max-w-[95vw] focus:outline-none"
        >
          <div className="modal-2a">
            {/* HEADER */}
            <div className="modal-header-2a">
              <span className="w-[34px] h-[34px] rounded-[9px] bg-accent text-interactive-fg flex items-center justify-center text-[15px]">
                ▲
              </span>
              <div className="flex-1">
                <div className="font-semibold text-[15px] tracking-[-0.01em] text-foreground">
                  Aplicar promoção
                </div>
                <div className="text-muted-foreground text-[11px] mt-[1px] truncate">
                  {client?.name} · plano {formatCurrency(client?.plan_value || 0)}
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => onOpenChange(false)}
                className="cursor-pointer border-none bg-transparent text-muted-foreground text-[18px] hover:text-secondary-foreground"
              >
                ✕
              </button>
            </div>
            
            <div className="p-[20px_22px]">
              {/* Promos */}
              <div className="space-y-[8px] mb-[20px]">
                {promotions.length === 0 ? (
                  <div className="text-[12px] text-muted-foreground py-2">Nenhuma promoção cadastrada.</div>
                ) : (
                  promotions.map(p => (
                    <div 
                      key={p.id}
                      onClick={() => setSelectedPromoId(p.id)}
                      className={cn(
                        "flex items-center gap-[12px] p-[12px] rounded-[8px] border cursor-pointer transition-all",
                        selectedPromoId === p.id ? "border-interactive-fg bg-interactive-bg" : "border-input bg-card hover:bg-muted"
                      )}
                    >
                      <div className={cn(
                        "w-[15px] h-[15px] rounded-full border transition-all",
                        selectedPromoId === p.id ? "border-[4.5px] border-interactive-fg" : "border-[1px] border-input"
                      )} />
                      <div className="flex-1">
                        <div className="text-[13px] font-medium text-foreground leading-tight">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground leading-tight mt-[2px]">{p.description || "Sem descrição"}</div>
                      </div>
                      <div className="px-[6px] py-[2px] rounded-[4px] bg-success-bg text-money font-mono text-[11px] font-bold">
                        +30d
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Summary ruler */}
              <div className="flex rounded-[8px] border border-border bg-muted overflow-hidden mb-[20px]">
                <div className="flex-1 p-[12px] border-r border-border">
                  <div className="microlabel mb-[4px]">DIAS EXTRAS</div>
                  <div className="font-mono text-[14px] font-bold text-foreground">+30</div>
                </div>
                <div className="flex-1 p-[12px]">
                  <div className="microlabel mb-[4px]">NOVO VENCIMENTO</div>
                  <div className="font-mono text-[14px] font-bold text-money">{newDueDate.toLocaleDateString('pt-BR')}</div>
                </div>
              </div>

              {/* Toggle */}
              <div className="border-t border-border pt-[8px]">
                <CustomToggle 
                  checked={notifyWhatsApp} 
                  onChange={() => setNotifyWhatsApp(!notifyWhatsApp)}
                  label="Avisar a cliente no WhatsApp"
                />
              </div>
            </div>
            
            <div className="modal-footer-2a">
              <button 
                type="button" 
                onClick={() => onOpenChange(false)}
                className="border border-input bg-card rounded-[7px] px-[16px] py-[9px] font-medium text-[12px] text-secondary-foreground"
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={handlePromo}
                disabled={isSubmitting || !selectedPromoId}
                className="border-none bg-primary text-primary-foreground rounded-[7px] px-[20px] py-[9px] font-semibold text-[12px] flex items-center gap-[6px] disabled:opacity-50"
              >
                {isSubmitting && <Loader2 className="w-[14px] h-[14px] animate-spin" />}
                Aplicar promoção
              </button>
            </div>
          </div>
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
      logAuditClient({ action: 'client.delete', resource: 'clients', details: { client_name: client.name } })
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error("Erro ao excluir cliente.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const isComplete = !hasPin || pinInput.length === 4
  const primaryService = client?.client_services?.[0]?.services?.name || 'Vários serviços'
  const screens = client?.screens || 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
          showCloseButton={false}
          className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 p-0 border-0 bg-transparent shadow-none ring-0 sm:max-w-none w-[390px] max-w-[95vw] focus:outline-none"
        >
          <div className="modal-2a">
            {/* Header (No sticky for this one) */}
            <div className="p-[22px] pb-[16px]">
              <div className="flex justify-between items-start mb-[12px]">
                <span className="w-[32px] h-[32px] rounded-[9px] bg-danger-bg text-danger-fg flex items-center justify-center text-[15px]">
                  🗑
                </span>
                <button 
                  type="button" 
                  onClick={() => onOpenChange(false)}
                  className="cursor-pointer border-none bg-transparent text-muted-foreground text-[18px] hover:text-secondary-foreground"
                >
                  ✕
                </button>
              </div>
              <div className="font-semibold text-[15px] tracking-[-0.01em] text-foreground mb-[4px]">
                Excluir cliente
              </div>
              <div className="text-[13px] text-secondary-foreground leading-[1.4]">
                Excluir <strong>{client?.name}</strong> apaga o histórico de pagamentos e revoga os acessos. Esta ação é <strong className="text-danger-fg">irreversível</strong>.
              </div>
            </div>

            <div className="px-[22px] pb-[20px]">
              {/* Summary box */}
              <div className="bg-muted border border-border rounded-[8px] overflow-hidden mb-[20px]">
                <div className="p-[12px] flex justify-between items-center border-b border-border">
                  <span className="text-[12px] text-secondary-foreground">Assinatura</span>
                  <span className="text-[12px] font-medium text-foreground">{primaryService} · {screens} tela(s)</span>
                </div>
                <div className="p-[12px] flex justify-between items-center">
                  <span className="text-[12px] text-secondary-foreground">Total pago</span>
                  <span className="text-[12px] font-mono font-bold text-money">{formatCurrency(client?.plan_value || 0)}/m</span>
                </div>
              </div>

              {/* PIN Section */}
              {hasPin && (
                <div className="flex flex-col items-center">
                  <div className="text-[10.5px] font-medium text-secondary-foreground mb-[12px] uppercase tracking-wider">
                    Digite seu PIN do cofre para confirmar
                  </div>
                  <VirtualKeypad pin={pinInput} setPin={setPinInput} disabled={isSubmitting} />
                </div>
              )}
            </div>

            <div className="modal-footer-2a">
              <button 
                type="button" 
                onClick={() => onOpenChange(false)}
                className="border border-input bg-card rounded-[7px] px-[16px] py-[9px] font-medium text-[12px] text-secondary-foreground"
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={handleDelete}
                disabled={!isComplete || isSubmitting}
                className={cn(
                  "border-none rounded-[7px] px-[20px] py-[9px] font-semibold text-[12px] flex items-center gap-[6px] transition-colors",
                  isComplete ? "bg-danger text-primary-foreground" : "bg-danger-bg text-danger-fg"
                )}
              >
                {isSubmitting && <Loader2 className="w-[14px] h-[14px] animate-spin" />}
                Excluir cliente
              </button>
            </div>
          </div>
        </DialogContent>
    </Dialog>
  )
}

export function BulkDeleteDialog({ open, onOpenChange, clients, onSuccess }: { open: boolean, onOpenChange: (open: boolean) => void, clients: any[], onSuccess: () => void }) {
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
    if (!clients || clients.length === 0) return
    if (hasPin && pinInput !== savedPin) {
      return toast.error("PIN de segurança incorreto.")
    }

    setIsSubmitting(true)
    try {
      const ids = clients.map(c => c.id)
      const { error } = await supabase.from('clients').delete().in('id', ids)
      if (error) throw error
      toast.success(`${clients.length} clientes excluídos!`)
      logAuditClient({ action: 'client.bulk_delete', resource: 'clients', details: { count: clients.length } })
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error("Erro ao excluir clientes.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const isComplete = !hasPin || pinInput.length === 4
  const totalValue = clients.reduce((acc, c) => acc + (c.plan_value || 0), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
          showCloseButton={false}
          className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 p-0 border-0 bg-transparent shadow-none ring-0 sm:max-w-none w-[390px] max-w-[95vw] focus:outline-none"
        >
          <div className="modal-2a">
            {/* Header (No sticky for this one) */}
            <div className="p-[22px] pb-[16px]">
              <div className="flex justify-between items-start mb-[12px]">
                <span className="w-[32px] h-[32px] rounded-[9px] bg-danger-bg text-danger-fg flex items-center justify-center text-[15px]">
                  🗑
                </span>
                <button 
                  type="button" 
                  onClick={() => onOpenChange(false)}
                  className="cursor-pointer border-none bg-transparent text-muted-foreground text-[18px] hover:text-secondary-foreground"
                >
                  ✕
                </button>
              </div>
              <div className="font-semibold text-[15px] tracking-[-0.01em] text-foreground mb-[4px]">
                Excluir {clients.length} clientes
              </div>
              <div className="text-[13px] text-secondary-foreground leading-[1.4]">
                Excluir <strong>{clients.length}</strong> clientes apaga todos os históricos e revoga acessos. Esta ação é <strong className="text-danger-fg">irreversível</strong>.
              </div>
            </div>

            <div className="px-[22px] pb-[20px]">
              {/* Summary box */}
              <div className="bg-muted border border-border rounded-[8px] overflow-hidden mb-[20px]">
                <div className="p-[12px] flex justify-between items-center border-b border-border">
                  <span className="text-[12px] text-secondary-foreground">Clientes selecionados</span>
                  <span className="text-[12px] font-medium text-foreground">{clients.length}</span>
                </div>
                <div className="p-[12px] flex justify-between items-center">
                  <span className="text-[12px] text-secondary-foreground">Receita em risco</span>
                  <span className="text-[12px] font-mono font-bold text-danger">{formatCurrency(totalValue)}/m</span>
                </div>
              </div>

              {/* PIN Section */}
              {hasPin && (
                <div className="flex flex-col items-center">
                  <div className="text-[10.5px] font-medium text-secondary-foreground mb-[12px] uppercase tracking-wider">
                    Digite seu PIN do cofre para confirmar
                  </div>
                  <VirtualKeypad pin={pinInput} setPin={setPinInput} disabled={isSubmitting} />
                </div>
              )}
            </div>

            <div className="modal-footer-2a">
              <button 
                type="button" 
                onClick={() => onOpenChange(false)}
                className="border border-input bg-card rounded-[7px] px-[16px] py-[9px] font-medium text-[12px] text-secondary-foreground"
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={handleDelete}
                disabled={!isComplete || isSubmitting}
                className={cn(
                  "border-none rounded-[7px] px-[20px] py-[9px] font-semibold text-[12px] flex items-center gap-[6px] transition-colors",
                  isComplete ? "bg-danger text-primary-foreground" : "bg-danger-bg text-danger-fg"
                )}
              >
                {isSubmitting && <Loader2 className="w-[14px] h-[14px] animate-spin" />}
                Excluir {clients.length} clientes
              </button>
            </div>
          </div>
        </DialogContent>
    </Dialog>
  )
}

"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { BadgePercent, Loader2, RefreshCw, X } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils"
import confetti from "canvas-confetti"
import { logAuditClient } from "@/lib/audit-client"
import { isMissingRenewalReminderColumnError, withoutRenewalReminderFields } from "@/lib/renewal-reminder-compat"
import {
  deleteProtectedResource,
  fetchSecurityPinStatus,
  SecurityPinApiError,
} from "@/lib/security-pin-client"
import {
  addBillingDays,
  addBillingMonths,
  billingCreditsBetween,
  billingCreditsForPeriod,
  billingMonthsFromPlanName,
  calculateBillingTotals,
  parseDateOnly,
  renewalBaseDate,
  todayDateOnly,
} from "@/lib/billing-period"

import { Dialog, DialogContent, DialogOverlay, DialogPortal } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

// Toggle Switch Component
function CustomToggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <div className="flex items-center justify-between py-[12px]">
      <span className="text-[12px] font-medium text-foreground">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
        className={cn(
          "h-[18px] w-[34px] cursor-pointer rounded-full p-[2px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          checked ? "bg-primary" : "bg-input"
        )}
      >
        <div 
          className={cn(
            "w-[14px] h-[14px] bg-card rounded-full shadow-sm transition-transform",
            checked ? "translate-x-[16px]" : "translate-x-0"
          )}
        />
      </button>
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
  const [renewAmountStr, setRenewAmountStr] = useState("0")
  const [renewScreens, setRenewScreens] = useState(1)
  const [renewDueDate, setRenewDueDate] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(false)
  const [renewalReminderEnabled, setRenewalReminderEnabled] = useState(false)
  const [renewalReminderDaysBefore, setRenewalReminderDaysBefore] = useState(7)
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'money' | 'card'>('pix')
  
  // Estados para geração do PIX
  const [generatedPix, setGeneratedPix] = useState<{copia_e_cola: string, qr_code_base64: string} | null>(null)
  const [isGeneratingPix, setIsGeneratingPix] = useState(false)
  const [pixInstance, setPixInstance] = useState("")
  const [pixInstances, setPixInstances] = useState<any[]>([])

  const supabase = createClient()

  useEffect(() => {
    if (client && open) {
      // Inicializa com os dados atuais do cliente
      setRenewAmountStr(String(client.plan_value || 0).replace('.', ','))
      setRenewMonths(1)
      setRenewScreens(client.screens || 1)
      setRenewDueDate(addBillingMonths(renewalBaseDate(client.due_date), 1))
       setNotifyWhatsApp(false)
       setRenewalReminderEnabled(client.renewal_reminder_enabled === true)
       setRenewalReminderDaysBefore(client.renewal_reminder_days_before || 7)
      setPaymentMethod('pix')
      setGeneratedPix(null)

      // Busca instâncias disponíveis para notificação de webhook
      supabase.from('evolution_instances').select('instance_name').then(({ data, error }) => {
        if (data && data.length > 0) {
          setPixInstances(data)
          setPixInstance(data[0].instance_name)
        } else {
          setPixInstances([{ instance_name: "Nenhuma" }])
          setPixInstance("Nenhuma")
        }
      })
    }
  }, [client, open])

  const planValue = client?.plan_value || 0
  const screens = client?.screens || 1
  const renewAmount = parseFloat(renewAmountStr.replace(',', '.')) || 0

  // Pega os planos do serviço vinculado ao cliente (se existir)
  const servicePlans: { name: string; price: number }[] =
    client?.client_services?.[0]?.services?.plans ?? []

  // Se o serviço tem planos definidos, usa eles; senão, usa os períodos padrão com plan_value
  const periods = servicePlans.length > 0
    ? servicePlans.map(p => {
        const months = billingMonthsFromPlanName(p.name)
        return { months, label: p.name, price: p.price }
      })
    : [
        { months: 1, label: '1 mês', price: planValue },
        { months: 3, label: '3 meses', price: planValue * 3 },
        { months: 6, label: '6 meses', price: planValue * 6 },
        { months: 12, label: '1 ano', price: planValue * 12 },
      ]

  // Chip ativo: plano cujo preço bate exatamente com o valor atual
  const activePeriod = periods.find(p => p.price === renewAmount && p.months === renewMonths) ?? null
  const renewalBaseDateValue = client
    ? renewalBaseDate(client.due_date)
    : todayDateOnly()
  const minimumRenewDueDate = addBillingDays(renewalBaseDateValue, 1)
  const parsedRenewDueDate = parseDateOnly(renewDueDate)
  const newDueDate = parsedRenewDueDate ?? parseDateOnly(addBillingMonths(renewalBaseDateValue, renewMonths))!
  const hasValidRenewDueDate = Boolean(
    parsedRenewDueDate &&
    parsedRenewDueDate.getTime() > (parseDateOnly(renewalBaseDateValue)?.getTime() || 0),
  )
  const renewalMonthlyCost = client?.client_services?.reduce(
    (total: number, assignment: any) => total + Number(assignment.services?.cost || 0),
    0,
  ) || 0
  const renewalCredits = billingCreditsForPeriod(renewMonths, renewScreens)
  const renewalBillingTotals = calculateBillingTotals({
    amountPaid: renewAmount,
    monthlyServiceCost: renewalMonthlyCost,
    screens: renewScreens,
    credits: renewalCredits,
  })

  const priceForMonths = (months: number) =>
    periods.find((period) => period.months === months)?.price ?? planValue * months

  const selectRenewPeriod = (months: number, price: number) => {
    setRenewMonths(months)
    setRenewAmountStr(String(price).replace('.', ','))
    setRenewDueDate(addBillingMonths(renewalBaseDateValue, months))
    setGeneratedPix(null)
  }

  const selectCustomDueDate = (value: string) => {
    setRenewDueDate(value)
    if (!value) return

    const months = billingCreditsBetween(renewalBaseDateValue, value)
    setRenewMonths(months)
    setRenewAmountStr(String(priceForMonths(months)).replace('.', ','))
    setGeneratedPix(null)
  }

  const handleGeneratePix = async () => {
    if (!client || !pixInstance) {
      toast.error("Instância do WhatsApp não selecionada para o emissor.")
      return
    }

    setIsGeneratingPix(true)
    setGeneratedPix(null)

    try {
      const res = await fetch('/api/pix/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valor: renewAmount,
          descricao: `Renovação: ${client.name}`,
          telefone_pagador: client.phone || "00000000000",
          instance_name: pixInstance,
          client_id: client.id,
          months: renewMonths,
          target_due_date: renewDueDate,
          purpose: 'renewal',
          plan_name: client.name,
          expires_minutes: 24 * 60,
        })
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setGeneratedPix({ copia_e_cola: data.copia_e_cola, qr_code_base64: data.qr_code_base64 })
        const exp = data.expires_at
          ? new Date(data.expires_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
          : null
        toast.success(exp
          ? `PIX gerado! Expira em ${exp}. Ao pagar, a renovação é automática.`
          : "PIX gerado! Ao pagar, a renovação é automática.")
      } else {
        toast.error(data.error || "Erro ao gerar Pix no Mercado Pago.")
      }
    } catch (e) {
      toast.error("Erro interno ao gerar Pix.")
    } finally {
      setIsGeneratingPix(false)
    }
  }

  const handleCopyPix = () => {
    if (generatedPix) {
      navigator.clipboard.writeText(generatedPix.copia_e_cola)
      toast.success("Copia e Cola copiado!")
    }
  }

  const handleRenew = async () => {
    if (!client) return
    if (!hasValidRenewDueDate) {
      toast.error("Escolha um novo vencimento posterior à data-base da renovação.")
      return
    }
    if (renewAmount <= 0) {
      toast.error("Informe um valor cobrado maior que zero.")
      return
    }
    setIsSubmitting(true)
    let renewalReminderUnavailable = false
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Usuário não autenticado")

      const renewalUpdate = {
        due_date: renewDueDate,
        status: 'active',
        screens: renewScreens,
        renewal_reminder_enabled: renewalReminderEnabled,
        renewal_reminder_days_before: renewalReminderDaysBefore,
      }
      let updateResult = await supabase.from('clients').update(renewalUpdate).eq('id', client.id)
      if (isMissingRenewalReminderColumnError(updateResult.error)) {
        renewalReminderUnavailable = true
        updateResult = await supabase
          .from('clients')
          .update(withoutRenewalReminderFields(renewalUpdate))
          .eq('id', client.id)
      }
      if (updateResult.error) throw updateResult.error

      const { error: paymentError } = await supabase.from('payments').insert({
        user_id: user.id, client_id: client.id, amount_paid: renewAmount, net_profit: renewalBillingTotals.netProfit, months_renewed: renewMonths,
        credits_consumed: renewalBillingTotals.credits,
        payment_method: paymentMethod,
        paid_at: new Date().toISOString(),
      })

      if (paymentError) throw paymentError

      let notificationWarning: string | null = null
      if (notifyWhatsApp) {
        try {
          const { data: rules } = await supabase
            .from('automations')
            .select('*')
            .eq('user_id', user.id)
            .eq('alert_type', 'renewal')
            .eq('is_active', true)

          if (rules && rules.length > 0) {
            const notificationResults = await Promise.all(rules.map(async (rule) => {
              const response = await fetch(window.location.origin + '/api/evolution/send-instant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId: client.id, ruleId: rule.id, confirmRecentContact: true }),
              })
              const result = await response.json().catch(() => ({}))
              if (!response.ok) throw new Error(result.error || 'Falha ao enfileirar a mensagem de renovação')
              return result
            }))
            if (notificationResults.some((result) => result.deferred)) {
              notificationWarning = 'Renovação registrada; a mensagem foi programada para envio.'
            }
          } else {
            notificationWarning = 'Renovação registrada, mas não há uma automação de renovação ativa.'
          }
        } catch (notificationError) {
          notificationWarning = notificationError instanceof Error
            ? `Renovação registrada, mas a mensagem não foi enfileirada: ${notificationError.message}`
            : 'Renovação registrada, mas a mensagem não foi enfileirada.'
        }
      }

      toast.success(`Assinatura renovada por ${renewMonths} mês(es)! Novo vencimento: ${newDueDate.toLocaleDateString('pt-BR')}`)
      if (renewalReminderUnavailable) {
        toast.warning('Renovação registrada, mas o lembrete não foi salvo.', {
          description: 'Aplique a migration de lembretes no Supabase para ativar este recurso.',
        })
      }
      if (notificationWarning) toast.warning(notificationWarning)
      logAuditClient({ action: 'client.renew', resource: 'clients', details: { client_name: client.name, months: renewMonths, due_date: renewDueDate } })
      
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, colors: ['#2e7d54', '#4055c8', '#191a1e'] })

      onOpenChange(false)
      // Pequeno delay para garantir que o Supabase commitou antes do reload
      setTimeout(() => { onSuccess() }, 300)
    } catch (error) {
      toast.error("Erro ao renovar cliente.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const currentDueDate = client ? new Date(client.due_date + "T12:00:00") : new Date()
  const displayDate = client ? currentDueDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('. de ', '/') : ''
  
  const paymentMethods = [
    { id: 'pix', label: 'PIX', desc: 'Transferência instantânea' },
    { id: 'money', label: 'Dinheiro', desc: 'Pago em espécie' },
    { id: 'card', label: 'Cartão', desc: 'Débito ou crédito' }
  ] as const

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
          showCloseButton={false}
          className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 p-0 border-0 bg-transparent shadow-none ring-0 w-[calc(100%-24px)] max-w-[560px] sm:max-w-[560px] focus:outline-none"
        >
          <div className="modal-2a flex flex-col max-h-[90vh]">
            {/* HEADER */}
            <div className="modal-header-2a flex-shrink-0">
              <span className="w-[34px] h-[34px] rounded-[9px] bg-interactive-bg text-interactive-fg flex items-center justify-center flex-shrink-0">
                <RefreshCw className="w-[16px] h-[16px]" aria-hidden="true" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px] tracking-[-0.01em] text-foreground truncate">
                  Renovar plano
                </div>
                <div className="text-muted-foreground text-[11px] mt-[2px] truncate">
                  {client?.name} · vence {displayDate}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Fechar"
                className="cursor-pointer border-none bg-transparent text-muted-foreground hover:text-secondary-foreground flex-shrink-0"
              >
                <X className="w-[15px] h-[15px]" aria-hidden="true" />
              </button>
            </div>
            
            <div className="p-[20px_22px] overflow-y-auto flex-1">
              <div className="flex flex-col gap-[16px]">
                <div className="min-w-0">
                  {/* Period grid */}
              <p className="microlabel mb-[8px]">PERÍODO</p>
              <div className="grid grid-cols-2 gap-[8px] mb-[12px]">
                {periods.map(p => {
                  const isActive =
                    activePeriod?.months === p.months &&
                    activePeriod?.price === p.price &&
                    renewDueDate === addBillingMonths(renewalBaseDateValue, p.months)
                  return (
                    <button
                      key={`${p.label}-${p.months}`}
                      type="button"
                      onClick={() => selectRenewPeriod(p.months, p.price)}
                      aria-pressed={isActive}
                      className={cn(
                        "rounded-[8px] border p-[10px] text-left transition-colors flex flex-col gap-[2px] min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isActive
                          ? "border-interactive bg-interactive-bg text-interactive-fg"
                          : "border-border bg-card text-foreground hover:bg-muted"
                      )}
                    >
                      <span className="text-[12.5px] font-semibold">{p.label}</span>
                      <span className={cn("font-mono text-[11px]", isActive ? "text-interactive-fg/80" : "text-secondary-foreground")}>{formatCurrency(p.price)}</span>
                    </button>
                  )
                })}
              </div>

              <div className="mb-[14px]">
                <label htmlFor="renew-due-date" className="mb-[5px] block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Novo vencimento
                </label>
                <input
                  id="renew-due-date"
                  type="date"
                  min={minimumRenewDueDate}
                  value={renewDueDate}
                  onChange={(event) => selectCustomDueDate(event.target.value)}
                  className="input-2a h-[40px] font-mono text-[12px]"
                  aria-describedby="renew-due-date-help"
                />
                <p id="renew-due-date-help" className="mt-[5px] text-[10px] leading-relaxed text-muted-foreground">
                  Base: {parseDateOnly(renewalBaseDateValue)?.toLocaleDateString("pt-BR")} · o calendário ajusta automaticamente os créditos e o total.
                </p>
              </div>

              {/* Telas + Valor (linha única em desktop) */}
              <div className="flex flex-col sm:flex-row gap-[10px] mb-[16px]">
                {/* Seletor de telas */}
                <div className="shrink-0">
                  <div className="text-[10px] font-medium text-muted-foreground mb-[5px] uppercase tracking-wider">Telas</div>
                  <div className="flex items-center gap-[6px]">
                    <button
                      type="button"
                      onClick={() => setRenewScreens(s => Math.max(1, s - 1))}
                      className="w-[30px] h-[38px] rounded-[7px] border border-input bg-card text-foreground font-bold text-[16px] flex items-center justify-center hover:bg-muted transition-colors"
                    >−</button>
                    <span className="w-[28px] text-center font-mono text-[14px] font-semibold text-foreground">{renewScreens}</span>
                    <button
                      type="button"
                      onClick={() => setRenewScreens(s => Math.min(10, s + 1))}
                      className="w-[30px] h-[38px] rounded-[7px] border border-input bg-card text-foreground font-bold text-[16px] flex items-center justify-center hover:bg-muted transition-colors"
                    >+</button>
                  </div>
                </div>

                {/* Campo de valor editável */}
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-medium text-muted-foreground mb-[5px] uppercase tracking-wider truncate">Valor cobrado · editável</div>
                  <div className="flex items-center border border-input rounded-[7px] bg-card transition-colors focus-within:border-ring focus-within:shadow-[0_0_0_2px_rgba(64,85,200,0.12)] h-[38px] w-full min-w-0">
                    <span className="pl-[11px] pr-[4px] text-muted-foreground text-[12px] font-mono select-none">R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={renewAmountStr}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9,.]/g, '')
                        setRenewAmountStr(val)
                      }}
                      placeholder="0,00"
                      className="flex-1 min-w-0 pr-[11px] font-mono text-[13px] font-semibold bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  {planValue > 0 && renewAmount !== priceForMonths(renewMonths) && (
                    <button
                      type="button"
                      onClick={() => { setRenewAmountStr(String(priceForMonths(renewMonths)).replace('.', ',')); setRenewScreens(screens) }}
                      className="text-[10px] text-interactive mt-[4px] hover:underline"
                    >
                      Restaurar total de {renewalCredits} crédito{renewalCredits === 1 ? "" : "s"} · {renewScreens} tela{renewScreens > 1 ? 's' : ''}
                    </button>
                  )}
                </div>
              </div>

              {/* Summary ruler */}
              <div className="flex items-start justify-between gap-[10px] rounded-[10px] bg-muted px-[14px] py-[12px] mb-[4px] w-full min-w-0">
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground">Novo vencimento</p>
                  <p className="mt-[3px] font-mono text-[13px] font-semibold text-foreground">{newDueDate.toLocaleDateString('pt-BR')}</p>
                  <p className="mt-[2px] text-[10px] text-muted-foreground">{renewalCredits} crédito{renewalCredits === 1 ? "" : "s"}</p>
                </div>
                <div className="min-w-0 text-right">
                  <p className="text-[10px] text-muted-foreground">Total</p>
                  <p className="mt-[3px] font-mono text-[13px] font-semibold text-money">{formatCurrency(renewAmount)}</p>
                  <p className="mt-[2px] text-[10px] text-muted-foreground">Líquido {formatCurrency(renewalBillingTotals.netProfit)}</p>
                </div>
              </div>

                </div>

                <div className="min-w-0 flex flex-col">
                  {/* Payment methods */}
                  <p className="microlabel mb-[8px]">FORMA DE PAGAMENTO</p>
                  <div className="flex gap-[8px] mb-[16px]">
                    {paymentMethods.map(pm => (
                      <button
                        type="button"
                        key={pm.id}
                        onClick={() => setPaymentMethod(pm.id)}
                        aria-pressed={paymentMethod === pm.id}
                        title={pm.desc}
                        className={cn(
                          "flex-1 min-h-[38px] rounded-[8px] border text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          paymentMethod === pm.id
                            ? "border-interactive bg-interactive-bg text-interactive-fg"
                            : "border-border bg-card text-foreground hover:bg-muted"
                        )}
                      >
                        {pm.label}
                      </button>
                    ))}
                  </div>

                  {paymentMethod === 'pix' && (
                    <div className="bg-muted rounded-[8px] border border-border mb-[20px] p-[12px] flex flex-col gap-3">
                      {!generatedPix ? (
                        <>
                          <div className="flex flex-col gap-[6px]">
                            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">WhatsApp Emissor</label>
                            <select 
                              className="h-[32px] rounded-[6px] border border-input bg-card text-[12px] px-[8px] outline-none w-full text-foreground"
                              value={pixInstance}
                              onChange={(e) => setPixInstance(e.target.value)}
                            >
                              {pixInstances.length === 0 && <option value="">Carregando...</option>}
                              {pixInstances.map(inst => (
                                <option key={inst.instance_name} value={inst.instance_name}>{inst.instance_name}</option>
                              ))}
                            </select>
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-snug">
                            PIX dinâmico com validade de 24h. Renovação automática ao confirmar.
                          </p>
                          <button 
                            type="button"
                            onClick={handleGeneratePix}
                            disabled={isGeneratingPix || !pixInstance}
                            className="h-[32px] rounded-[6px] bg-primary text-primary-foreground text-[12px] font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50 mt-auto"
                          >
                            {isGeneratingPix && <Loader2 className="w-[14px] h-[14px] animate-spin" />}
                            Gerar PIX Mercado Pago
                          </button>
                        </>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-[12px]">
                            <div className="w-[66px] h-[66px] bg-white border border-input rounded-[4px] overflow-hidden flex-shrink-0">
                              <img src={`data:image/jpeg;base64,${generatedPix.qr_code_base64}`} alt="QR Code" className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 flex flex-col justify-center min-w-0">
                              <input readOnly value={generatedPix.copia_e_cola} className="w-full bg-card border border-input rounded-[6px] px-[10px] py-[6px] text-[11px] font-mono text-secondary-foreground mb-[6px] truncate select-all" />
                              <div className="flex gap-2">
                                <button type="button" onClick={handleCopyPix} className="text-interactive text-[11px] font-medium hover:underline">Copiar código PIX</button>
                                <span className="text-muted-foreground text-[11px]">•</span>
                                <button type="button" onClick={() => setGeneratedPix(null)} className="text-muted-foreground text-[11px] font-medium hover:underline">Gerar outro</button>
                              </div>
                            </div>
                          </div>
                          <p className="text-[10px] text-money font-medium">
                            Aguardando pagamento · renovação automática
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-auto border-t border-border pt-[8px]">
                    <CustomToggle 
                      checked={notifyWhatsApp} 
                      onChange={() => setNotifyWhatsApp(!notifyWhatsApp)}
                      label="Avisar o cliente da renovação no WhatsApp"
                    />
                    <CustomToggle
                      checked={renewalReminderEnabled}
                      onChange={() => setRenewalReminderEnabled(!renewalReminderEnabled)}
                      label="Lembrar-me antes do vencimento"
                    />
                    {renewalReminderEnabled && (
                      <div className="flex items-center justify-end gap-[8px] pb-[6px]">
                        <label htmlFor="renewalReminderDays" className="text-[10.5px] text-muted-foreground">Avisar com</label>
                        <input
                          id="renewalReminderDays"
                          type="number"
                          min="1"
                          max="60"
                          value={renewalReminderDaysBefore}
                          onChange={(event) => setRenewalReminderDaysBefore(Math.min(60, Math.max(1, Number(event.target.value) || 1)))}
                          className="h-[30px] w-[58px] rounded-[6px] border border-input bg-card px-[8px] text-[11px] font-mono text-foreground"
                        />
                        <span className="text-[10.5px] text-muted-foreground">dia(s) antes</span>
                      </div>
                    )}
                    <p className="pb-[4px] text-[10px] leading-snug text-muted-foreground">
                      O lembrete interno usa o WhatsApp de suporte configurado em Minha conta.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="modal-footer-2a flex-shrink-0">
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
                disabled={isSubmitting || !hasValidRenewDueDate || renewAmount <= 0}
                className="border-none bg-primary text-primary-foreground rounded-[7px] px-[20px] py-[9px] font-semibold text-[12px] flex items-center gap-[6px] disabled:cursor-not-allowed disabled:opacity-60"
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
      const promoCredits = billingCreditsForPeriod(renewMonths, clientScreens)
      const totalCostForPromo = promoServicesCost * promoCredits
      const amountPaid = promo ? Math.max(0, client.plan_value - promo.discount_value) * renewMonths : 0
      const netProfitForPromo = amountPaid - totalCostForPromo

      const { error: paymentError } = await supabase.from('payments').insert({
        user_id: user.id, client_id: client.id, amount_paid: amountPaid, net_profit: netProfitForPromo, months_renewed: renewMonths,
        credits_consumed: promoCredits,
        paid_at: new Date().toISOString(),
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
          className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 p-0 border-0 bg-transparent shadow-none ring-0 w-[calc(100%-24px)] max-w-[420px] sm:max-w-[420px] focus:outline-none"
        >
          <div className="modal-2a">
            {/* HEADER */}
            <div className="modal-header-2a">
              <span className="flex size-[34px] items-center justify-center rounded-[9px] bg-interactive-bg text-interactive-fg">
                <BadgePercent className="size-[17px]" aria-hidden="true" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px] tracking-[-0.01em] text-foreground truncate">
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
  const [isCheckingPin, setIsCheckingPin] = useState(false)
  const [pinLockedUntil, setPinLockedUntil] = useState<string | null>(null)
  const [pinInput, setPinInput] = useState("")

  useEffect(() => {
    if (!open) return
    let active = true
    void Promise.resolve().then(async () => {
      if (!active) return
      setPinInput("")
      setPinLockedUntil(null)
      setIsCheckingPin(true)
      try {
        const status = await fetchSecurityPinStatus()
        if (active) {
          setHasPin(status.configured)
          setPinLockedUntil(status.lockedUntil)
        }
      } catch {
        if (active) setHasPin(false)
      } finally {
        if (active) setIsCheckingPin(false)
      }
    })
    return () => { active = false }
  }, [open])

  const handleDelete = async () => {
    if (!client) return
    if (!hasPin) return toast.error("Configure o Cofre PIN em Minha Conta antes de excluir clientes.")

    setIsSubmitting(true)
    try {
      await deleteProtectedResource({ resource: 'clients', ids: [client.id], pin: pinInput })
      toast.success("Cliente excluído!")
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      setPinInput("")
      if (error instanceof SecurityPinApiError && error.lockedUntil) {
        setPinLockedUntil(error.lockedUntil)
      }
      toast.error(error instanceof SecurityPinApiError ? error.message : "Erro ao excluir cliente.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const isPinLocked = Boolean(pinLockedUntil)
  const isComplete = hasPin && !isPinLocked && pinInput.length === 4
  const primaryService = client?.client_services?.[0]?.services?.name || 'Vários serviços'
  const screens = client?.screens || 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
          showCloseButton={false}
          className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 p-0 border-0 bg-transparent shadow-none ring-0 w-[calc(100%-24px)] max-w-[390px] sm:max-w-[390px] focus:outline-none"
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
              {isCheckingPin && (
                <div className="flex items-center justify-center gap-2 py-5 text-xs text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Verificando proteção...
                </div>
              )}
              {!isCheckingPin && !hasPin && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-center text-xs text-amber-700 dark:text-amber-300">
                  Configure o Cofre PIN em Minha Conta para autorizar exclusões.
                </div>
              )}
              {!isCheckingPin && hasPin && isPinLocked && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-center text-xs text-red-700 dark:text-red-300">
                  PIN bloqueado após três erros. Tente novamente em 15 minutos.
                </div>
              )}
              {!isCheckingPin && hasPin && !isPinLocked && (
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
                disabled={!isComplete || isSubmitting || isCheckingPin}
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
  const [isCheckingPin, setIsCheckingPin] = useState(false)
  const [pinLockedUntil, setPinLockedUntil] = useState<string | null>(null)
  const [pinInput, setPinInput] = useState("")

  useEffect(() => {
    if (!open) return
    let active = true
    void Promise.resolve().then(async () => {
      if (!active) return
      setPinInput("")
      setPinLockedUntil(null)
      setIsCheckingPin(true)
      try {
        const status = await fetchSecurityPinStatus()
        if (active) {
          setHasPin(status.configured)
          setPinLockedUntil(status.lockedUntil)
        }
      } catch {
        if (active) setHasPin(false)
      } finally {
        if (active) setIsCheckingPin(false)
      }
    })
    return () => { active = false }
  }, [open])

  const handleDelete = async () => {
    if (!clients || clients.length === 0) return
    if (!hasPin) return toast.error("Configure o Cofre PIN em Minha Conta antes de excluir clientes.")

    setIsSubmitting(true)
    try {
      const ids = clients.map(c => c.id)
      await deleteProtectedResource({ resource: 'clients', ids, pin: pinInput })
      toast.success(`${clients.length} clientes excluídos!`)
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      setPinInput("")
      if (error instanceof SecurityPinApiError && error.lockedUntil) {
        setPinLockedUntil(error.lockedUntil)
      }
      toast.error(error instanceof SecurityPinApiError ? error.message : "Erro ao excluir clientes.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const isPinLocked = Boolean(pinLockedUntil)
  const isComplete = hasPin && !isPinLocked && pinInput.length === 4
  const totalValue = clients.reduce((acc, c) => acc + (c.plan_value || 0), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
          showCloseButton={false}
          className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 p-0 border-0 bg-transparent shadow-none ring-0 w-[calc(100%-24px)] max-w-[390px] sm:max-w-[390px] focus:outline-none"
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
              {isCheckingPin && (
                <div className="flex items-center justify-center gap-2 py-5 text-xs text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Verificando proteção...
                </div>
              )}
              {!isCheckingPin && !hasPin && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-center text-xs text-amber-700 dark:text-amber-300">
                  Configure o Cofre PIN em Minha Conta para autorizar exclusões.
                </div>
              )}
              {!isCheckingPin && hasPin && isPinLocked && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-center text-xs text-red-700 dark:text-red-300">
                  PIN bloqueado após três erros. Tente novamente em 15 minutos.
                </div>
              )}
              {!isCheckingPin && hasPin && !isPinLocked && (
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
                disabled={!isComplete || isSubmitting || isCheckingPin}
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

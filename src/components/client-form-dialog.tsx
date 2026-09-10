"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Loader2, Check, Eye, EyeOff, UserPlus, X } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { logAuditClient } from "@/lib/audit-client"
import { normalizeClientPhone } from "@/lib/phone"
import { isMissingRenewalReminderColumnError, withoutRenewalReminderFields } from "@/lib/renewal-reminder-compat"
import {
  addBillingMonths,
  billingCreditsBetween,
  billingCreditsForPeriod,
  billingMonthsFromPlanName,
  calculateBillingTotals,
  todayDateOnly,
  monthlyPlanValueFromPayment,
} from "@/lib/billing-period"

import { Dialog, DialogContent, DialogOverlay, DialogPortal } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const FORM_STEPS = [
  { key: 'dados' as const, label: 'Dados' },
  { key: 'plano' as const, label: 'Plano' },
]

const clientSchema = z.object({
  name: z.string().min(2, "Nome é obrigatório"),
  phone: z.string().optional(),
  plan_value: z.number().min(0, "O valor não pode ser negativo"),
  screens: z.number().min(1, "Mínimo de 1 tela").max(10, "Máximo de 10 telas"),
  due_date: z.string().min(1, "Data de vencimento é obrigatória"),
  due_time: z.string().optional(),
  payment_method: z.enum(['pix', 'money', 'card']),
  status: z.enum(['active', 'inactive', 'pending', 'vencido']),
  observation: z.string().optional(),
  description: z.string().optional(),
  send_welcome: z.boolean(),
  renewal_reminder_enabled: z.boolean(),
  renewal_reminder_days_before: z.number().int().min(1).max(60),
  selected_services: z.array(z.string()).min(1, "É obrigatório selecionar pelo menos um serviço"),
  service_access: z.any().optional(),
})

type ClientForm = z.infer<typeof clientSchema>

interface ClientFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  client?: any | null
  servicesList: any[]
  onSuccess?: () => void
}

export function ClientFormDialog({ open, onOpenChange, client, servicesList, onSuccess }: ClientFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [localVal, setLocalVal] = useState<string | null>(null)
  const supabase = createClient()

  // O protótipo v2 divide o cadastro em duas etapas: "Dados" (quem é o cliente)
  // e "Plano" (o que ele paga). Os campos da etapa oculta continuam registrados
  // no react-hook-form — `shouldUnregister` é false por padrão —, então trocar
  // de passo não descarta nada do que já foi digitado.
  const [formStep, setFormStep] = useState<'dados' | 'plano'>('dados')

  const { register, handleSubmit, reset, control, setValue, watch, formState: { errors } } = useForm<ClientForm>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: "",
      phone: "",
      plan_value: 0,
      screens: 1,
      due_date: new Date().toISOString().split('T')[0],
      due_time: "23:59",
      payment_method: 'pix',
      status: 'active',
      observation: "",
       description: "",
       send_welcome: false,
       renewal_reminder_enabled: false,
       renewal_reminder_days_before: 7,
       selected_services: [],
      service_access: {},
    }
  })

  const selectedServices = watch("selected_services") || []
  const planValue = watch("plan_value")
  const screens = watch("screens") || 1
  const dueDate = watch("due_date")
  const renewalReminderEnabled = watch("renewal_reminder_enabled")
  const initialBillingMonths = client
    ? 1
    : billingCreditsBetween(todayDateOnly(), dueDate)
  const initialBillingCredits = billingCreditsForPeriod(initialBillingMonths, screens)
  const monthlyServiceCost = servicesList
    .filter((service) => selectedServices.includes(service.id))
    .reduce((total, service) => total + Number(service.cost || 0), 0)
  const initialAmount = Number(planValue || 0)
  const initialBillingTotals = calculateBillingTotals({
    amountPaid: initialAmount,
    monthlyServiceCost,
    screens,
    credits: initialBillingCredits,
  })

  // Planos do primeiro serviço selecionado (se houver)
  const firstSelectedService = servicesList.find(s => selectedServices.includes(s.id))
  const availablePlans: { name: string; price: number }[] = firstSelectedService?.plans ?? []

  /** O passo do plano só faz sentido depois de identificar o cliente. */
  const goToStep = (step: 'dados' | 'plano') => {
    if (step === 'plano' && !(watch("name") || "").trim()) {
      toast.error("Informe o nome do cliente antes de continuar.")
      setFormStep('dados')
      return
    }
    setFormStep(step)
  }

  useEffect(() => {
    if (open) {
      setFormStep('dados')
      if (client) {
        const accessFromClient: Record<string, { username?: string; password?: string }> = {}
        ;(client.client_services || []).forEach((cs: any) => {
          accessFromClient[cs.service_id] = { username: cs.username || "", password: cs.password || "" }
        })

        reset({
          name: client.name || "",
          phone: client.phone_e164 || client.phone || "",
          plan_value: client.plan_value || 0,
          screens: client.screens || 1,
          due_date: client.due_date || new Date().toISOString().split('T')[0],
          due_time: client.due_time || "23:59",
          payment_method: 'pix',
          status: client.status || 'active',
          observation: client.observation || "",
           description: client.description || "",
           send_welcome: false,
           renewal_reminder_enabled: client.renewal_reminder_enabled === true,
           renewal_reminder_days_before: client.renewal_reminder_days_before || 7,
           selected_services: client.client_services ? client.client_services.map((cs: any) => cs.service_id) : [],
          service_access: accessFromClient,
        })
      } else {
        reset({
          name: "",
          phone: "",
          plan_value: 0,
          screens: 1,
          due_date: new Date().toISOString().split('T')[0],
          due_time: "23:59",
          payment_method: 'pix',
          status: 'active',
          observation: "",
           description: "",
            send_welcome: false,
            renewal_reminder_enabled: false,
            renewal_reminder_days_before: 7,
            selected_services: [],
          service_access: {},
        })
      }
      setRevealed({})
    }
  }, [open, client, reset])

  const toggleService = (serviceId: string) => {
    const current = selectedServices
    const updated = current.includes(serviceId)
      ? current.filter(id => id !== serviceId)
      : [...current, serviceId]
    setValue("selected_services", updated, { shouldValidate: true })

    // Ao selecionar um serviço com planos, preenche automaticamente com o primeiro plano
    const service = servicesList.find(s => s.id === serviceId)
    if (!current.includes(serviceId) && service?.plans?.length > 0) {
      const firstPlan = service.plans[0]
      const planMonths = billingMonthsFromPlanName(firstPlan.name)
      setValue("plan_value", client ? Number(firstPlan.price) / planMonths : Number(firstPlan.price), { shouldValidate: true })
      if (!client) {
        setValue("due_date", addBillingMonths(todayDateOnly(), planMonths), { shouldValidate: true })
      }
    }
  }

  const toggleReveal = (id: string) => setRevealed((r) => ({ ...r, [id]: !r[id] }))

  const onSubmit = async (data: ClientForm) => {
    setIsSubmitting(true)
    let renewalReminderUnavailable = false
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Usuário não autenticado")

      let clientId = client?.id
      const normalizedPhone = normalizeClientPhone(data.phone)
      if (data.phone?.trim() && !normalizedPhone.phone_e164) {
        throw new Error("Número inválido. Informe o WhatsApp com DDI, por exemplo: +55 11 99999-9999 ou +1 202 555 0123.")
      }

      // O opt-in deixou de existir. O formulário também não escreve mais
      // `whatsapp_opt_out`: antes, salvar um cliente com a caixa desmarcada
      // marcava como opt-out quem já tinha autorizado. Só o "PARAR" respondido
      // no WhatsApp registra opt-out, e é o webhook que faz isso.

      if (client) {
        const clientUpdate = {
          name: data.name,
          ...normalizedPhone,
          plan_value: data.plan_value,
          screens: data.screens,
          due_date: data.due_date,
          due_time: data.due_time,
          status: data.status,
          observation: data.observation,
          description: data.description,
          renewal_reminder_enabled: data.renewal_reminder_enabled,
          renewal_reminder_days_before: data.renewal_reminder_days_before,
        }
        let updateResult = await supabase
          .from('clients')
          .update(clientUpdate)
          .eq('id', clientId)

        if (isMissingRenewalReminderColumnError(updateResult.error)) {
          renewalReminderUnavailable = true
          updateResult = await supabase
            .from('clients')
            .update(withoutRenewalReminderFields(clientUpdate))
            .eq('id', clientId)
        }

        if (updateResult.error) throw updateResult.error
        await supabase.from('client_services').delete().eq('client_id', clientId)

        const selectedServicesCost = servicesList
          .filter(s => data.selected_services.includes(s.id))
          .reduce((acc, s) => acc + s.cost, 0)

        const totalCost = selectedServicesCost * data.screens

        const { data: latestPayment } = await supabase
          .from('payments')
          .select('id, amount_paid, months_renewed')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (latestPayment) {
          const newNetProfit = latestPayment.amount_paid - (totalCost * (latestPayment.months_renewed || 1))
          await supabase.from('payments').update({ net_profit: newNetProfit }).eq('id', latestPayment.id)
        }
      } else {
        const clientInsert = {
          user_id: user.id,
          name: data.name,
          ...normalizedPhone,
          plan_value: monthlyPlanValueFromPayment(data.plan_value, billingCreditsBetween(todayDateOnly(), data.due_date)),
          screens: data.screens,
          due_date: data.due_date,
          due_time: data.due_time,
          status: data.status,
          observation: data.observation,
          description: data.description,
          renewal_reminder_enabled: data.renewal_reminder_enabled,
          renewal_reminder_days_before: data.renewal_reminder_days_before,
        }
        let insertResult = await supabase
          .from('clients')
          .insert(clientInsert)
          .select()
          .single()

        if (isMissingRenewalReminderColumnError(insertResult.error)) {
          renewalReminderUnavailable = true
          insertResult = await supabase
            .from('clients')
            .insert(withoutRenewalReminderFields(clientInsert))
            .select()
            .single()
        }

        if (insertResult.error) throw insertResult.error
        if (!insertResult.data) throw new Error("O cliente não foi retornado após o cadastro.")
        clientId = insertResult.data.id

        const selectedServicesCost = servicesList
          .filter(s => data.selected_services.includes(s.id))
          .reduce((acc, s) => acc + s.cost, 0)

        const monthsCovered = billingCreditsBetween(todayDateOnly(), data.due_date)
        const creditsConsumed = billingCreditsForPeriod(monthsCovered, data.screens)
        const amountPaid = data.plan_value
        const billingTotals = calculateBillingTotals({
          amountPaid,
          monthlyServiceCost: selectedServicesCost,
          screens: data.screens,
          credits: creditsConsumed,
        })

        const { error: paymentError } = await supabase
          .from('payments')
          .insert({
            user_id: user.id,
            client_id: clientId,
            amount_paid: amountPaid,
            net_profit: billingTotals.netProfit,
            months_renewed: monthsCovered,
            credits_consumed: creditsConsumed,
            payment_method: data.payment_method,
            paid_at: new Date().toISOString(),
          })

        if (paymentError) console.error("Erro ao registrar o primeiro pagamento:", paymentError)
      }

      if (clientId && data.selected_services.length > 0) {
        const access = data.service_access || {}
        const servicesToInsert = data.selected_services.map(serviceId => ({
          client_id: clientId,
          service_id: serviceId,
          username: (access as Record<string, any>)[serviceId]?.username?.trim() || null,
          password: (access as Record<string, any>)[serviceId]?.password || null,
        }))

        const { error: serviceError } = await supabase
          .from('client_services')
          .insert(servicesToInsert)

        if (serviceError) throw serviceError
      }

      // Disparo de Boas Vindas se for um novo cliente
      if (!client && clientId && data.send_welcome) {
        const { data: rules } = await supabase
          .from('automations')
          .select('*')
          .eq('user_id', user.id)
          .in('alert_type', ['activation', 'welcome'])
          .eq('is_active', true)

        if (rules && rules.length > 0) {
          for (const rule of rules) {
            try {
              const res = await fetch(window.location.origin + '/api/evolution/send-instant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId: clientId, ruleId: rule.id })
              })
              if (!res.ok) {
                const errData = await res.json().catch(() => ({}))
                toast.warning(`WhatsApp (Boas Vindas) falhou: ${errData.error}`)
              }
            } catch {
              toast.warning(`WhatsApp (Boas Vindas) bloqueado pelo navegador.`)
            }
          }
        }
      }

      if (renewalReminderUnavailable) {
        toast.warning(client ? "Cliente atualizado, mas o lembrete não foi salvo." : "Cliente cadastrado, mas o lembrete não foi salvo.", {
          description: "Aplique a migration de lembretes no Supabase para ativar este recurso.",
        })
      } else {
        toast.success(client ? "Cliente atualizado com sucesso!" : "Cliente cadastrado com sucesso!")
      }
      logAuditClient({ action: client ? 'client.update' : 'client.create', resource: 'clients', details: { client_name: data.name } })
      onOpenChange(false)
      onSuccess?.()
    } catch (error: any) {
      toast.error(error.message || "Ocorreu um erro ao salvar o cliente")
    } finally {
      setIsSubmitting(false)
    }
  }

  const statuses = [
    { value: 'active', label: 'Ativo', color: '#2e7d54' },
    { value: 'pending', label: 'Pendente', color: '#c98a1e' },
    { value: 'vencido', label: 'Vencido', color: '#b23c3c' },
    { value: 'inactive', label: 'Inativo', color: '#9b9a94' },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
          showCloseButton={false}
          className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 p-0 border-0 bg-transparent shadow-none ring-0 w-[calc(100%-24px)] max-w-[560px] sm:max-w-[560px] data-open:animate-none data-open:zoom-in-100 data-closed:animate-none data-closed:zoom-out-100 focus:outline-none"
        >
          <div className="modal-2a max-h-[90vh] flex flex-col">

            {/* HEADER */}
            <div className="flex-shrink-0 border-b border-border">
              <div className="flex items-center gap-[11px] px-[22px] pt-[17px] pb-[14px]">
                <span className="w-[34px] h-[34px] rounded-[9px] bg-interactive-bg text-interactive-fg flex items-center justify-center flex-shrink-0">
                  <UserPlus className="w-[16px] h-[16px]" aria-hidden="true" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] tracking-[-0.01em] text-foreground truncate">
                    {client ? 'Editar cliente' : 'Novo cliente'}
                  </div>
                  <div className="text-muted-foreground text-[11px] mt-[2px] truncate">
                    {formStep === 'dados'
                      ? 'Etapa 1 de 2 · nome, contato e situação'
                      : 'Etapa 2 de 2 · serviços, valor e vencimento'}
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
              <div className="flex gap-[6px] px-[22px] pb-[14px]">
                {FORM_STEPS.map((step, index) => {
                  const active = formStep === step.key
                  return (
                    <button
                      key={step.key}
                      type="button"
                      onClick={() => goToStep(step.key)}
                      aria-current={active ? 'step' : undefined}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-[7px] min-h-[34px] rounded-[8px] border-none cursor-pointer text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active ? "bg-muted text-foreground font-semibold" : "bg-transparent text-muted-foreground font-medium hover:text-secondary-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 font-mono text-[10px] font-semibold",
                          active ? "bg-foreground text-background" : "bg-border text-muted-foreground",
                        )}
                      >
                        {index + 1}
                      </span>
                      {step.label}
                    </button>
                  )
                })}
              </div>

              {/* Avisos do cadastro: valem para o envio inteiro, não para uma
                  etapa só, então ficam no cabeçalho, visíveis nos dois passos.
                  `register` funciona por ref — não precisam estar dentro do
                  <form> para serem enviados. */}
              <div className="flex flex-wrap items-center gap-x-[18px] gap-y-[8px] border-t border-border px-[22px] py-[10px]">
                {!client && (
                  <label className="flex items-center gap-[7px] text-[11px] cursor-pointer">
                    <input type="checkbox" {...register("send_welcome")} />
                    <span className="font-medium text-foreground">Enviar boas-vindas agora</span>
                  </label>
                )}
                <label className="flex items-center gap-[7px] text-[11px] cursor-pointer">
                  <input type="checkbox" {...register("renewal_reminder_enabled")} />
                  <span className="font-medium text-foreground">Lembrete antes do vencimento</span>
                </label>
                {renewalReminderEnabled && (
                  <div className="flex items-center gap-[6px]">
                    <label htmlFor="renewalReminderDays" className="text-[10.5px] text-muted-foreground">Avisar com</label>
                    <input
                      id="renewalReminderDays"
                      type="number"
                      min="1"
                      max="60"
                      {...register("renewal_reminder_days_before", { valueAsNumber: true })}
                      className="h-[26px] w-[56px] rounded-[6px] border border-input bg-card px-[6px] text-[11px] font-mono text-foreground"
                    />
                    <span className="text-[10.5px] text-muted-foreground">dia(s) antes</span>
                  </div>
                )}
                <p className="w-full text-[10px] leading-snug text-muted-foreground">
                  {client
                    ? 'O lembrete vai para o seu WhatsApp de suporte, sem falar com o cliente.'
                    : 'As boas-vindas exigem uma automação ativa. O lembrete vai para o seu WhatsApp de suporte, sem falar com o cliente.'}
                </p>
              </div>
            </div>

            {/* BODY */}
            <form
              id="client-form"
              onSubmit={handleSubmit(onSubmit, (formErrors) => {
                // Um erro de campo da etapa 1 ficaria invisível com o passo do
                // plano aberto — volta para onde o usuário precisa corrigir.
                if (formErrors.name || formErrors.status) setFormStep('dados')
              })}
              className="p-[20px_22px] overflow-y-auto flex-1">

              {/* PASSO 1 — DADOS: quem é o cliente */}
              {formStep === 'dados' && (
                <div>
              {/* DADOS PESSOAIS */}
              <div className="microlabel mb-[10px]">DADOS PESSOAIS</div>
              <div className="flex flex-col sm:flex-row gap-[12px] mb-[8px]">
                <div className="flex-[1.4]">
                  <div className="text-[11px] font-medium text-secondary-foreground mb-[5px]">
                    Nome completo <span className="text-danger">*</span>
                  </div>
                  <input
                    {...register("name")}
                    placeholder="Ex: João da Silva"
                    className="input-2a"
                  />
                  {errors.name && <p className="text-[10px] text-danger mt-1">{errors.name.message}</p>}
                </div>
                <div className="flex-1">
                  <div className="text-[11px] font-medium text-secondary-foreground mb-[5px]">
                    WhatsApp
                  </div>
                  <input
                    {...register("phone")}
                    placeholder="+55 11 99999-9999 ou +1 202 555 0123"
                    className="input-2a"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">Use o código do país para números internacionais.</p>
                </div>
              </div>

              {/* Segmented Control de Status */}
              <div className="bg-secondary rounded-[7px] p-[2px] flex flex-wrap sm:flex-nowrap">
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <>
                      {statuses.map((st) => (
                        <button
                          key={st.value}
                          type="button"
                          onClick={() => field.onChange(st.value)}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-[6px] rounded-[5px] py-[6px] text-[11.5px] font-medium transition-all",
                            field.value === st.value
                              ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                              : "text-muted-foreground hover:text-secondary-foreground"
                          )}
                        >
                          <span
                            className="w-[6px] h-[6px] rounded-full"
                            style={{ backgroundColor: st.color }}
                          />
                          {st.label}
                        </button>
                      ))}
                    </>
                  )}
                />
              </div>

              {/* OBSERVAÇÃO */}
              <div className="microlabel mt-[20px] mb-[8px]">OBSERVAÇÃO</div>
              <textarea
                {...register("observation")}
                placeholder="Anotações internas sobre o cliente (opcional)…"
                className="input-2a min-h-[64px] resize-none leading-[1.55]"
              />
                </div>
              )}

              {/* PASSO 2 — PLANO: o que ele paga e quando */}
              {formStep === 'plano' && (
                <div>
              <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[2px] mt-[20px] mb-[8px]">
                <span className="microlabel m-0">SERVIÇOS E ACESSOS <span className="text-danger">*</span></span>
                <span className="font-mono text-[9.5px] font-medium text-muted-foreground">marque os serviços · usuário e senha são opcionais</span>
              </div>

              {/* Lista compacta: uma caixa só com divisórias, em vez de um cartão
                  por serviço. Com muitos serviços cadastrados, os cartões de 52px
                  viravam uma parede de rolagem dentro do modal. */}
              <div>
                {servicesList.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground py-2">Nenhum serviço cadastrado no sistema ainda.</p>
                ) : (
                  <div className="rounded-[8px] border border-border overflow-hidden divide-y divide-border">
                  {servicesList.map((service) => {
                    const isSelected = selectedServices.includes(service.id)
                    const show = !!revealed[service.id]
                    return (
                      <div
                        key={service.id}
                        className={cn(
                          "transition-colors",
                          isSelected ? "bg-interactive-bg" : "bg-card"
                        )}
                      >
                        {/* linha de seleção */}
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={isSelected}
                          onClick={() => toggleService(service.id)}
                          className="flex w-full items-center gap-[10px] px-[12px] py-[9px] text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          <span
                            className={cn(
                              "w-[16px] h-[16px] rounded-[4px] flex items-center justify-center border flex-shrink-0",
                              isSelected ? "bg-primary border-primary text-primary-foreground" : "border-input bg-card"
                            )}
                          >
                            {isSelected && <Check className="w-[11px] h-[11px]" strokeWidth={3} />}
                          </span>
                          <span className="flex-1 min-w-0 truncate text-[12px] font-medium text-foreground">{service.name}</span>
                        </button>

                        {/* credenciais opcionais */}
                        {isSelected && (
                          <div className="px-[12px] pb-[10px] pl-[38px] grid grid-cols-2 gap-[8px] animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="space-y-[4px]">
                              <label className="text-[10.5px] text-muted-foreground font-medium">Usuário</label>
                              <input
                                placeholder="login do painel"
                                className="input-2a font-mono text-[11px] bg-muted"
                                {...register(`service_access.${service.id}.username` as const)}
                              />
                            </div>
                            <div className="space-y-[4px]">
                              <label className="text-[10.5px] text-muted-foreground font-medium">Senha</label>
                              <div className="relative">
                                <input
                                  type={show ? "text" : "password"}
                                  placeholder="senha de acesso"
                                  className="input-2a font-mono text-[11px] bg-muted pr-[28px]"
                                  {...register(`service_access.${service.id}.password` as const)}
                                />
                                <button
                                  type="button"
                                  onClick={() => toggleReveal(service.id)}
                                  className="absolute right-[8px] top-1/2 -translate-y-1/2 text-muted-foreground hover:text-secondary-foreground"
                                  tabIndex={-1}
                                >
                                  {show ? <EyeOff className="w-[14px] h-[14px]" /> : <Eye className="w-[14px] h-[14px]" />}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  </div>
                )}
                {errors.selected_services && (
                  <p className="mt-[6px] text-[10px] text-danger">{errors.selected_services.message}</p>
                )}
              </div>

              {/* COBRANÇA E PLANO */}
              <div className="microlabel mt-[20px] mb-[10px]">COBRANÇA E PLANO</div>
              {/* Planos do serviço: atalho que preenche valor e vencimento de uma
                  vez. Ficam acima e ocupando a largura toda — dentro da coluna de
                  um terço cada pílula tomava uma linha inteira e empurrava o campo
                  de valor para o fim de uma pilha, longe de Telas e Vencimento. */}
              {availablePlans.length > 0 && (
                <div className="mb-[12px]">
                  <div className="text-[11px] font-medium text-secondary-foreground mb-[6px]">
                    Planos do serviço
                  </div>
                  <div className="flex flex-wrap gap-[6px]">
                    {availablePlans.map((plan) => {
                      const isActive = Math.abs(planValue - (client ? Number(plan.price) / billingMonthsFromPlanName(plan.name) : Number(plan.price))) < 0.001
                      return (
                        <button
                          key={plan.name}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => {
                            const planMonths = billingMonthsFromPlanName(plan.name)
                            setValue("plan_value", client ? Number(plan.price) / planMonths : Number(plan.price), { shouldValidate: true })
                            if (!client) {
                              setValue("due_date", addBillingMonths(todayDateOnly(), planMonths), { shouldValidate: true })
                            }
                          }}
                          className={cn(
                            "px-[10px] py-[5px] rounded-[6px] text-[11px] font-medium border transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            isActive
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card text-secondary-foreground border-input hover:border-primary/50 hover:bg-muted"
                          )}
                        >
                          {plan.name} · R$ {Number(plan.price).toFixed(2).replace('.', ',')} total
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_0.7fr_1.2fr] gap-[12px] mb-[12px]">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-secondary-foreground mb-[5px]">
                    {client ? "Valor mensal" : "Valor pago"} <span className="text-danger">*</span>
                  </div>
                  <div className="flex items-center border border-input rounded-[7px] bg-transparent transition-colors focus-within:border-ring focus-within:shadow-[0_0_0_2px_rgba(64,85,200,0.12)]">
                    <span className="pl-[11px] pr-[4px] text-muted-foreground text-[12px] font-mono select-none whitespace-nowrap">R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={localVal !== null ? localVal : (planValue === 0 ? "" : String(planValue).replace('.', ','))}
                      onChange={(e) => {
                        let rawStr = e.target.value.replace(/[^0-9.,]/g, '')
                        setLocalVal(rawStr)
                        const raw = rawStr.replace(',', '.')
                        const num = parseFloat(raw)
                        setValue("plan_value", isNaN(num) ? 0 : num, { shouldValidate: true })
                      }}
                      onBlur={() => setLocalVal(null)}
                      className="flex-1 min-w-0 py-[9px] pr-[11px] font-mono text-[12px] bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  {errors.plan_value && <p className="text-[10px] text-danger mt-1">{errors.plan_value.message}</p>}
                </div>

                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-secondary-foreground mb-[5px]">
                    Telas <span className="text-danger">*</span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    {...register("screens", { valueAsNumber: true })}
                    className="input-2a font-mono text-[12px]"
                  />
                  {errors.screens && <p className="text-[10px] text-danger mt-1">{errors.screens.message}</p>}
                </div>

                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-secondary-foreground mb-[5px]">
                    Vencimento <span className="text-danger">*</span>
                  </div>
                  <input
                    type="date"
                    {...register("due_date")}
                    className="input-2a text-[12px]"
                  />
                  {errors.due_date && <p className="text-[10px] text-danger mt-1">{errors.due_date.message}</p>}
                </div>
              </div>

              {!client && (
                <div className="mb-[12px] space-y-[10px] rounded-[8px] border border-border bg-muted px-[12px] py-[10px]">
                  <div role="status">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="text-[11px] font-medium text-foreground">
                        Pagamento inicial · {initialBillingCredits} crédito{initialBillingCredits === 1 ? "" : "s"}
                      </span>
                      <span className="font-mono text-[12px] font-bold text-money">
                        R$ {initialAmount.toFixed(2).replace(".", ",")}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                      R$ {initialAmount.toFixed(2).replace(".", ",")} recebidos. Despesas do período: {initialBillingCredits} créditos × R$ {monthlyServiceCost.toFixed(2).replace(".", ",")} = R$ {initialBillingTotals.totalCost.toFixed(2).replace(".", ",")}.
                      {" "}Lucro líquido estimado: R$ {initialBillingTotals.netProfit.toFixed(2).replace(".", ",")}.
                    </p>
                  </div>

                  <Controller
                    control={control}
                    name="payment_method"
                    render={({ field }) => (
                      <fieldset>
                        <legend className="mb-[6px] text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          Forma de pagamento
                        </legend>
                        <div className="grid grid-cols-3 gap-[6px]">
                          {[
                            { value: 'pix' as const, label: 'PIX' },
                            { value: 'money' as const, label: 'Dinheiro' },
                            { value: 'card' as const, label: 'Cartão' },
                          ].map((method) => (
                            <button
                              key={method.value}
                              type="button"
                              aria-pressed={field.value === method.value}
                              onClick={() => field.onChange(method.value)}
                              className={cn(
                                "min-h-9 rounded-[7px] border px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                field.value === method.value
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-input bg-card text-secondary-foreground hover:bg-muted",
                              )}
                            >
                              {method.label}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                    )}
                  />
                </div>
              )}

                </div>
              )}

            </form>

            {/* FOOTER */}
            <div className="modal-footer-2a flex-shrink-0">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="border border-input bg-card rounded-[7px] px-[16px] py-[9px] font-medium text-[12px] text-secondary-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              {formStep === 'dados' ? (
                <button
                  type="button"
                  onClick={() => goToStep('plano')}
                  className="border-none bg-primary text-primary-foreground rounded-[7px] px-[20px] py-[9px] font-semibold text-[12px] hover:bg-foreground"
                >
                  Avançar para o plano
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setFormStep('dados')}
                    className="border border-input bg-card rounded-[7px] px-[16px] py-[9px] font-medium text-[12px] text-secondary-foreground hover:bg-muted"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    form="client-form"
                    disabled={isSubmitting}
                    className="border-none bg-primary text-primary-foreground rounded-[7px] px-[20px] py-[9px] font-semibold text-[12px] flex items-center gap-[6px] hover:bg-foreground disabled:opacity-70"
                  >
                    {isSubmitting && <Loader2 className="w-[14px] h-[14px] animate-spin" />}
                    {client ? 'Salvar cliente' : 'Criar cliente'}
                  </button>
                </>
              )}
            </div>

          </div>
        </DialogContent>
    </Dialog>
  )
}

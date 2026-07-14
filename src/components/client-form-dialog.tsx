"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"
import { phoneMask } from "@/lib/utils"
import { z } from "zod"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { logAuditClient } from "@/lib/audit-client"

import { Dialog, DialogContent, DialogOverlay, DialogPortal } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const clientSchema = z.object({
  name: z.string().min(2, "Nome é obrigatório"),
  phone: z.string().optional(),
  plan_value: z.number().min(0, "O valor não pode ser negativo"),
  screens: z.number().min(1, "Mínimo de 1 tela").max(10, "Máximo de 10 telas"),
  due_date: z.string().min(1, "Data de vencimento é obrigatória"),
  due_time: z.string().optional(),
  status: z.enum(['active', 'inactive', 'pending', 'vencido']),
  observation: z.string().optional(),
  description: z.string().optional(),
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

  const { register, handleSubmit, reset, control, setValue, watch, formState: { errors } } = useForm<ClientForm>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: "",
      phone: "",
      plan_value: 0,
      screens: 1,
      due_date: new Date().toISOString().split('T')[0],
      due_time: "23:59",
      status: 'active',
      observation: "",
      description: "",
      selected_services: [],
      service_access: {},
    }
  })

  const selectedServices = watch("selected_services") || []
  const planValue = watch("plan_value")

  // Planos do primeiro serviço selecionado (se houver)
  const firstSelectedService = servicesList.find(s => selectedServices.includes(s.id))
  const availablePlans: { name: string; price: number }[] = firstSelectedService?.plans ?? []

  useEffect(() => {
    if (open) {
      if (client) {
        const accessFromClient: Record<string, { username?: string; password?: string }> = {}
        ;(client.client_services || []).forEach((cs: any) => {
          accessFromClient[cs.service_id] = { username: cs.username || "", password: cs.password || "" }
        })

        reset({
          name: client.name || "",
          phone: client.phone || "",
          plan_value: client.plan_value || 0,
          screens: client.screens || 1,
          due_date: client.due_date || new Date().toISOString().split('T')[0],
          due_time: client.due_time || "23:59",
          status: client.status || 'active',
          observation: client.observation || "",
          description: client.description || "",
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
          status: 'active',
          observation: "",
          description: "",
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
      setValue("plan_value", service.plans[0].price, { shouldValidate: true })
    }
  }

  const toggleReveal = (id: string) => setRevealed((r) => ({ ...r, [id]: !r[id] }))

  const onSubmit = async (data: ClientForm) => {
    setIsSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Usuário não autenticado")

      let clientId = client?.id

      if (client) {
        const { error } = await supabase
          .from('clients')
          .update({
            name: data.name,
            phone: data.phone?.replace(/\D/g, ''),
            plan_value: data.plan_value,
            screens: data.screens,
            due_date: data.due_date,
            due_time: data.due_time,
            status: data.status,
            observation: data.observation,
            description: data.description,
          })
          .eq('id', clientId)

        if (error) throw error
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
        const { data: newClient, error } = await supabase
          .from('clients')
          .insert({
            user_id: user.id,
            name: data.name,
            phone: data.phone?.replace(/\D/g, ''),
            plan_value: data.plan_value,
            screens: data.screens,
            due_date: data.due_date,
            due_time: data.due_time,
            status: data.status,
            observation: data.observation,
            description: data.description,
          })
          .select()
          .single()

        if (error) throw error
        clientId = newClient.id

        const selectedServicesCost = servicesList
          .filter(s => data.selected_services.includes(s.id))
          .reduce((acc, s) => acc + s.cost, 0)

        const totalCost = selectedServicesCost * data.screens
        const netProfit = data.plan_value - totalCost

        const { error: paymentError } = await supabase
          .from('payments')
          .insert({
            user_id: user.id,
            client_id: clientId,
            amount_paid: data.plan_value,
            net_profit: netProfit,
            months_renewed: 1
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
      if (!client && clientId) {
        const { data: rules } = await supabase
          .from('automations')
          .select('*')
          .eq('user_id', user.id)
          .in('alert_type', ['activation', 'welcome'])
          .eq('is_active', true)

        if (rules && rules.length > 0) {
          for (const rule of rules) {
            fetch(window.location.origin + '/api/evolution/send-instant', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientId: clientId, ruleId: rule.id })
            }).then(async (res) => {
              if (!res.ok) {
                const errData = await res.json()
                toast.warning(`WhatsApp (Boas Vindas) falhou: ${errData.error}`)
              }
            }).catch(() => {
              toast.warning(`WhatsApp (Boas Vindas) bloqueado pelo navegador.`)
            })
          }
        }
      }

      toast.success(client ? "Cliente atualizado com sucesso!" : "Cliente cadastrado com sucesso!")
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
          className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 p-0 border-0 bg-transparent shadow-none ring-0 w-[calc(100%-24px)] max-w-[640px] sm:max-w-[640px] data-open:animate-none data-open:zoom-in-100 data-closed:animate-none data-closed:zoom-out-100 focus:outline-none"
        >
          <div className="modal-2a max-h-[90vh] flex flex-col">

            {/* HEADER */}
            <div className="modal-header-2a flex-shrink-0">
              <span className="w-[34px] h-[34px] rounded-[9px] bg-secondary flex items-center justify-center text-[15px]">
                👤
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px] tracking-[-0.01em] text-foreground">
                  {client ? 'Editar cliente' : 'Novo cliente'}
                </div>
                <div className="text-muted-foreground text-[11px] mt-[1px]">
                  {client ? 'Atualize os dados e os acessos do assinante.' : 'Cadastre o assinante e os acessos de cada serviço.'}
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

            {/* BODY */}
            <form id="client-form" onSubmit={handleSubmit(onSubmit)} className="p-[20px_22px] overflow-y-auto flex-1">

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
                    onChange={(e) => e.target.value = phoneMask(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="input-2a"
                  />
                </div>
              </div>

              {/* SERVIÇOS E ACESSOS */}
              <div className="flex items-center gap-[8px] mt-[20px] mb-[10px]">
                <span className="microlabel m-0">SERVIÇOS E ACESSOS <span className="text-danger">*</span></span>
                <span className="font-mono text-[9.5px] font-medium text-muted-foreground">usuário e senha são opcionais</span>
              </div>

              <div className="space-y-[8px]">
                {servicesList.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground py-2">Nenhum serviço cadastrado no sistema ainda.</p>
                ) : (
                  servicesList.map((service) => {
                    const isSelected = selectedServices.includes(service.id)
                    const show = !!revealed[service.id]
                    return (
                      <div
                        key={service.id}
                        className={cn(
                          "rounded-[8px] border overflow-hidden transition-colors",
                          isSelected ? "border-interactive/40 bg-interactive-bg" : "border-border bg-card"
                        )}
                      >
                        {/* linha de seleção */}
                        <div
                          onClick={() => toggleService(service.id)}
                          className="flex items-center gap-[10px] px-[12px] py-[12px] cursor-pointer"
                        >
                          <span
                            className={cn(
                              "w-[18px] h-[18px] rounded-[5px] flex items-center justify-center border",
                              isSelected ? "bg-primary border-primary text-primary-foreground" : "border-input bg-card"
                            )}
                          >
                            {isSelected && <CheckCircle2 className="w-[12px] h-[12px]" strokeWidth={3} />}
                          </span>
                          <span className="flex-1 text-[13px] font-medium text-foreground">{service.name}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {isSelected ? "incluído" : "toque para adicionar"}
                          </span>
                        </div>

                        {/* credenciais opcionais */}
                        {isSelected && (
                          <div className="px-[12px] pb-[12px] grid grid-cols-2 gap-[8px] animate-in fade-in slide-in-from-top-1 duration-200">
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
                  })
                )}
                {errors.selected_services && (
                  <p className="text-[10px] text-danger">{errors.selected_services.message}</p>
                )}
              </div>

              {/* COBRANÇA E PLANO */}
              <div className="microlabel mt-[20px] mb-[10px]">COBRANÇA E PLANO</div>
              <div className="flex flex-col sm:flex-row gap-[12px] mb-[12px]">
                <div className="flex-1">
                  <div className="text-[11px] font-medium text-secondary-foreground mb-[5px]">
                    Valor cobrado <span className="text-danger">*</span>
                  </div>

                  {/* Chips de planos do serviço selecionado */}
                  {availablePlans.length > 0 && (
                    <div className="flex flex-wrap gap-[6px] mb-[8px]">
                      {availablePlans.map((plan) => (
                        <button
                          key={plan.name}
                          type="button"
                          onClick={() => setValue("plan_value", plan.price, { shouldValidate: true })}
                          className={cn(
                            "px-[10px] py-[4px] rounded-[6px] text-[11px] font-medium border transition-all",
                            planValue === plan.price
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card text-secondary-foreground border-input hover:border-primary/50 hover:bg-muted"
                          )}
                        >
                          {plan.name} · R$ {plan.price.toFixed(2).replace('.', ',')}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Input de valor — editável (clique para personalizar) */}
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

                <div className="flex-1">
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

                <div className="flex-[1.2]">
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
              <button
                type="submit"
                form="client-form"
                disabled={isSubmitting}
                className="border-none bg-primary text-primary-foreground rounded-[7px] px-[20px] py-[9px] font-semibold text-[12px] flex items-center gap-[6px] hover:bg-foreground disabled:opacity-70"
              >
                {isSubmitting && <Loader2 className="w-[14px] h-[14px] animate-spin" />}
                {client ? 'Salvar cliente' : 'Criar cliente'}
              </button>
            </div>

          </div>
        </DialogContent>
    </Dialog>
  )
}

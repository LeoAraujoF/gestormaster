"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Loader2, Calendar as CalendarIcon, User, MonitorSmartphone, Receipt, Box, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { phoneMask } from "@/lib/utils"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { z } from "zod"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const clientSchema = z.object({
  name: z.string().min(2, "Nome é obrigatório"),
  username: z.string().optional(),
  phone: z.string().optional(),
  plan_value: z.number().min(0, "O valor não pode ser negativo"),
  screens: z.number().min(1, "Mínimo de 1 tela").max(10, "Máximo de 10 telas"),
  due_date: z.string().min(1, "Data de vencimento é obrigatória"),
  status: z.enum(['active', 'inactive', 'pending']),
  observation: z.string().optional(),
  description: z.string().optional(),
  selected_services: z.array(z.string()).min(1, "É obrigatório selecionar pelo menos um serviço"),
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
  const supabase = createClient()
  
  const { register, handleSubmit, reset, control, setValue, watch, formState: { errors } } = useForm<ClientForm>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: "",
      username: "",
      phone: "",
      plan_value: 0,
      screens: 1,
      due_date: new Date().toISOString().split('T')[0],
      status: 'active',
      observation: "",
      description: "",
      selected_services: [],
    }
  })

  const selectedServices = watch("selected_services") || []

  useEffect(() => {
    if (open) {
      if (client) {
        reset({
          name: client.name || "",
          username: client.username || "",
          phone: client.phone || "",
          plan_value: client.plan_value || 0,
          screens: client.screens || 1,
          due_date: client.due_date || new Date().toISOString().split('T')[0],
          status: client.status || 'active',
          observation: client.observation || "",
          description: client.description || "",
          selected_services: client.client_services ? client.client_services.map((cs: any) => cs.service_id) : [],
        })
      } else {
        reset({
          name: "",
          username: "",
          phone: "",
          plan_value: 0,
          screens: 1,
          due_date: new Date().toISOString().split('T')[0],
          status: 'active',
          observation: "",
          description: "",
          selected_services: [],
        })
      }
    }
  }, [open, client, reset])

  const toggleService = (serviceId: string) => {
    const current = selectedServices
    const updated = current.includes(serviceId)
      ? current.filter(id => id !== serviceId)
      : [...current, serviceId]
    setValue("selected_services", updated, { shouldValidate: true })
  }

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
            username: data.username,
            phone: data.phone?.replace(/\D/g, ''),
            plan_value: data.plan_value,
            screens: data.screens,
            due_date: data.due_date,
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
            username: data.username,
            phone: data.phone?.replace(/\D/g, ''),
            plan_value: data.plan_value,
            screens: data.screens,
            due_date: data.due_date,
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
        const servicesToInsert = data.selected_services.map(serviceId => ({
          client_id: clientId,
          service_id: serviceId
        }))
        
        const { error: serviceError } = await supabase
          .from('client_services')
          .insert(servicesToInsert)
          
        if (serviceError) throw serviceError
      }

      toast.success(client ? "Cliente atualizado com sucesso!" : "Cliente cadastrado com sucesso!")
      onOpenChange(false)
      onSuccess?.()
    } catch (error: any) {
      toast.error(error.message || "Ocorreu um erro ao salvar o cliente")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card sm:max-w-4xl w-[95vw] md:w-[80vw] lg:w-[60vw] max-h-[90vh] overflow-y-auto border-primary/20 p-0">
        <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border/50 px-6 py-4">
          <DialogHeader className="relative">
            <DialogTitle className="text-primary flex items-center gap-3 text-2xl">
               <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
                 <User className="w-5 h-5 text-primary" />
               </div>
               {client ? 'Ficha do Cliente' : 'Novo Cliente'}
            </DialogTitle>
            <DialogDescription className="pt-1">
              Preencha os dados abaixo para {client ? 'atualizar o' : 'registrar um novo'} assinante no sistema.
            </DialogDescription>
          </DialogHeader>
        </div>
        
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-8">
          
          <div className="space-y-6">
            {/* Box: Dados do Cliente */}
            <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden shadow-sm">
              <div className="bg-muted/40 px-4 py-3 border-b border-border/50 flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Dados Pessoais</h3>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo <span className="text-destructive">*</span></Label>
                  <Input id="name" {...register("name")} className="bg-background/80 focus-visible:ring-primary/50" placeholder="Ex: João da Silva" />
                  {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">WhatsApp</Label>
                  <Input 
                    id="phone" 
                    placeholder="(00) 00000-0000"
                    {...register("phone")}
                    onChange={(e) => e.target.value = phoneMask(e.target.value)}
                    className="bg-background/80 focus-visible:ring-primary/50" 
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="username">Login / Usuário (Opcional)</Label>
                  <Input id="username" placeholder="Ex: joao_iptv" {...register("username")} className="bg-background/80 focus-visible:ring-primary/50" />
                </div>
              </div>
            </div>

            {/* Box: Serviços (Obrigatório) */}
            <div className={cn(
              "rounded-xl border overflow-hidden shadow-sm transition-colors",
              errors.selected_services ? "border-destructive/50 bg-destructive/5" : "border-border/50 bg-muted/20"
            )}>
              <div className={cn(
                "px-4 py-3 border-b border-border/50 flex items-center gap-2",
                errors.selected_services ? "bg-destructive/10 text-destructive" : "bg-muted/40"
              )}>
                <Box className={cn("w-4 h-4", errors.selected_services ? "text-destructive" : "text-primary")} />
                <h3 className="text-sm font-semibold uppercase tracking-wider">
                  Serviços Adquiridos <span className="text-destructive">*</span>
                </h3>
              </div>
              <div className="p-4 space-y-3">
                {servicesList.length === 0 ? (
                   <p className="text-sm text-muted-foreground text-center py-4">Nenhum serviço cadastrado no sistema ainda.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {servicesList.map(service => {
                      const isSelected = selectedServices.includes(service.id)
                      return (
                        <div
                          key={service.id}
                          onClick={() => toggleService(service.id)}
                          className={cn(
                            "relative flex items-center justify-between p-3 rounded-xl cursor-pointer border-2 transition-all duration-200",
                            isSelected 
                              ? "border-primary bg-primary/10 text-primary shadow-md shadow-primary/10" 
                              : "border-border/50 bg-background/80 hover:border-primary/40 text-foreground"
                          )}
                        >
                          <span className="font-medium text-sm truncate pr-6" title={service.name}>{service.name}</span>
                          {isSelected && (
                            <CheckCircle2 className="w-4 h-4 absolute right-3 text-primary animate-in zoom-in duration-200" />
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                {errors.selected_services && (
                  <p className="text-xs font-semibold text-destructive flex items-center gap-1 mt-2">
                    {errors.selected_services.message}
                  </p>
                )}
              </div>
            </div>

            {/* Box: Financeiro & Assinatura */}
            <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden shadow-sm">
              <div className="bg-muted/40 px-4 py-3 border-b border-border/50 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Cobrança e Plano</h3>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                
                <div className="space-y-2">
                  <Label htmlFor="plan_value">Valor Cobrado <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                    <Input id="plan_value" type="number" step="0.01" {...register("plan_value", { valueAsNumber: true })} className="pl-9 bg-background/80 font-medium" />
                  </div>
                  {errors.plan_value && <p className="text-xs text-destructive">{errors.plan_value.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="screens">Telas/Conexões <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <MonitorSmartphone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input id="screens" type="number" min="1" max="10" {...register("screens", { valueAsNumber: true })} className="pl-9 bg-background/80" />
                  </div>
                  {errors.screens && <p className="text-xs text-destructive">{errors.screens.message}</p>}
                </div>

                <div className="space-y-2 lg:col-span-2">
                  <Label htmlFor="due_date">Data de Vencimento <span className="text-destructive">*</span></Label>
                  <Controller
                    control={control}
                    name="due_date"
                    render={({ field }) => (
                      <Popover>
                        <PopoverTrigger render={
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full justify-start text-left font-normal bg-background/80 h-10 border-border/50",
                              !field.value && "text-muted-foreground"
                            )}
                          />
                        }>
                          <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                          <span className="truncate">
                            {field.value ? format(new Date(field.value + "T00:00:00"), "PPP", { locale: ptBR }) : <span>Selecione a data</span>}
                          </span>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={field.value ? new Date(field.value + "T00:00:00") : undefined}
                            onSelect={(date) => field.onChange(date ? format(date, "yyyy-MM-dd") : "")}
                          />
                        </PopoverContent>
                      </Popover>
                    )}
                  />
                  {errors.due_date && <p className="text-xs text-destructive">{errors.due_date.message}</p>}
                </div>

                <div className="space-y-2 lg:col-span-4 border-t border-border/50 pt-4 mt-2">
                  <Label>Status Inicial da Assinatura</Label>
                  <Controller
                    control={control}
                    name="status"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger className="bg-background/80 h-10">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">🟢 Ativo</SelectItem>
                          <SelectItem value="pending">🟡 Pendente</SelectItem>
                          <SelectItem value="inactive">🔴 Inativo</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Box: Anotações Extras */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
               <div className="space-y-2">
                 <Label htmlFor="observation" className="text-muted-foreground">Notas Internas</Label>
                 <Textarea 
                   id="observation" 
                   placeholder="Anotações visíveis apenas para você..."
                   {...register("observation")} 
                   className="resize-none bg-background/50 h-20" 
                 />
               </div>
               <div className="space-y-2">
                 <Label htmlFor="description" className="text-muted-foreground">Descrição (Visível ao Cliente)</Label>
                 <Textarea 
                   id="description" 
                   placeholder="Informações extras que vão no comprovante..."
                   {...register("description")} 
                   className="resize-none bg-background/50 h-20" 
                 />
               </div>
            </div>

          </div>

          <div className="sticky bottom-0 bg-background/80 backdrop-blur-md pt-4 pb-2 border-t border-border/50 flex justify-end gap-3 z-20">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="px-6">
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="px-8 shadow-md shadow-primary/20">
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {client ? 'Salvar Ficha' : 'Criar Cliente'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

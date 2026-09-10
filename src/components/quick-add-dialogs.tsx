"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { z } from "zod"
import { Controller, useFieldArray, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Loader2, MessageCircle, CheckCircle2, XCircle, AlertCircle, Layers3, Zap } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils"
import { logAuditClient } from "@/lib/audit-client"

const serviceSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
  panelType: z.string().optional(),
  cost: z.coerce.number().min(0, "O custo não pode ser negativo"),
  plans: z.array(z.object({
    name: z.string().min(1, "Nome obrigatório"),
    price: z.coerce.number().min(0, "Valor não pode ser negativo")
  })).default([]).optional()
})

export function QuickAddServiceDialog({ open, onOpenChange, onSuccess, service = null }: any) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const supabase = createClient()
  const { register, control, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(serviceSchema),
    defaultValues: { name: "", panelType: "", cost: 0, plans: [] as {name: string, price: number}[] }
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: "plans"
  })

  useEffect(() => {
    if (open) {
      if (service) {
        reset({ name: service.name, panelType: service.panel_type || "", cost: service.cost, plans: service.plans || [] })
      } else {
        reset({ name: "", panelType: "", cost: 0, plans: [] })
      }
    }
  }, [open, service, reset])

  const onSubmit = async (data: any) => {
    setIsSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Não autenticado")

      const payload = {
        name: data.name,
        panel_type: data.panelType || null,
        cost: data.cost,
        plans: data.plans,
      }

      if (service) {
        const { error } = await supabase.from('services').update(payload).eq('id', service.id)
        if (error) throw error
        toast.success("Serviço atualizado!")
        logAuditClient({ action: 'service.update', resource: 'services', details: { service_name: data.name } })
      } else {
        const { error } = await supabase.from('services').insert({
          user_id: user.id,
          ...payload
        })
        if (error) throw error
        toast.success("Serviço cadastrado!")
        logAuditClient({ action: 'service.create', resource: 'services', details: { service_name: data.name } })
      }
      
      onOpenChange(false)
      onSuccess?.()
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] max-h-[90vh] overflow-y-auto border-border">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-interactive-bg text-interactive-fg">
              <Layers3 className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-[15px] font-semibold">
                {service ? "Editar serviço" : "Novo serviço"}
              </DialogTitle>
              <DialogDescription className="text-[11px]">
                Nome, painel e custo unitário do serviço
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2 relative z-10">
          <div className="space-y-2">
            <Label>Nome do serviço</Label>
            <Input {...register("name")} placeholder="Ex: Assinatura Mensal VIP" />
            {errors.name && <p className="text-xs text-destructive">{errors.name?.message as string}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Painel</Label>
              <Input {...register("panelType")} placeholder="Ex: Sigma, Koffice" />
            </div>
            <div className="space-y-2">
              <Label>Custo unitário</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                <Input type="number" step="0.01" {...register("cost")} className="pl-9" />
              </div>
              {errors.cost && <p className="text-xs text-destructive">{errors.cost?.message as string}</p>}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">Custo unitário é o valor pago ao seu fornecedor, usado para calcular o lucro líquido.</p>

          <div className="pt-3 border-t border-border space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Planos</h4>
                <p className="text-[10px] text-muted-foreground">Usados no fluxo de renovação do WhatsApp.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => append({name: "", price: 0})} className="h-8 gap-1">
                + Plano
              </Button>
            </div>

            <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
              {fields.map((field: any, index: number) => (
                <div key={field.id} className="flex items-start gap-2 rounded-md border border-border p-2">
                  <div className="flex-1 space-y-1">
                    <Input {...register(`plans.${index}.name`)} placeholder="Ex: Mensal" className="h-8 text-sm" />
                    {errors.plans?.[index]?.name && <p className="text-[10px] text-destructive">{errors.plans[index]?.name?.message as string}</p>}
                  </div>
                  <div className="w-28 space-y-1">
                    <Input type="number" step="0.01" {...register(`plans.${index}.price`)} placeholder="Valor (R$)" className="num h-8 text-sm" />
                    {errors.plans?.[index]?.price && <p className="text-[10px] text-destructive">{errors.plans[index]?.price?.message as string}</p>}
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => remove(index)}>
                    <XCircle className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
              {fields.length === 0 && (
                <p className="text-xs text-center text-muted-foreground py-4 rounded-md border border-dashed border-border">Nenhum plano cadastrado. O robô não oferecerá renovação automática para clientes deste serviço.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="sm:flex-1">Cancelar</Button>
            <Button type="submit" disabled={isSubmitting} className="sm:flex-[1.4]">
              {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} {service ? "Salvar alterações" : "Cadastrar serviço"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function WhatsAppStatusDialog({ open, onOpenChange }: any) {
  const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected' | 'error' | 'not_configured'>('loading')
  const supabase = createClient()

  useEffect(() => {
    if (!open) return
    setStatus('loading')
    
    async function checkStatus() {
      try {
        const response = await fetch('/api/evolution/status')
        if (!response.ok) {
          setStatus('error')
          return
        }

        const data = await response.json()
        if (!data.instances || data.instances.length === 0) {
          setStatus('not_configured')
          return
        }

        // Se houver alguma instância conectada, consideramos conectada
        const primary = data.instances.find((i: any) => i.is_primary) || data.instances[0]
        if (primary.status === 'connected') {
          setStatus('connected')
        } else {
          setStatus('disconnected')
        }
      } catch (error) {
        setStatus('error')
      }
    }

    checkStatus()
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] flex flex-col items-center justify-center p-8 text-center overflow-hidden">
        
        {/* Glow Effects Background based on status */}
        
        {status === 'loading' && (
          <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300 relative z-10">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping"></div>
              <div className="relative bg-background rounded-full p-4 border border-primary/50 shadow-lg">
                <MessageCircle className="w-8 h-8 text-primary" />
              </div>
            </div>
            <h3 className="text-xl font-semibold mt-4 text-primary">Diagnóstico de Rede...</h3>
            <p className="text-sm text-muted-foreground">Comunicando com os servidores da Evolution API.</p>
          </div>
        )}

        {status === 'connected' && (
          <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300 relative z-10">
            <div className="relative">
              <div className="relative bg-background rounded-full p-4 border border-emerald-500/50 shadow-lg">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-emerald-500 mt-4 tracking-tight">WhatsApp Sincronizado</h3>
            <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg border border-border/50">
              O sistema de envio automático e cobranças está <strong className="text-emerald-500">ativo e operante</strong>.
            </p>
            <Button className="mt-4 w-full bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => onOpenChange(false)}>Tudo Certo!</Button>
          </div>
        )}

        {status === 'disconnected' && (
          <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300 relative z-10">
            <div className="relative bg-background rounded-full p-4 border border-amber-500/50 shadow-lg">
              <AlertCircle className="w-10 h-10 text-amber-500" />
            </div>
            <h3 className="text-xl font-bold text-amber-500 mt-4 tracking-tight">Dispositivo Desconectado</h3>
            <p className="text-sm text-muted-foreground bg-amber-500/5 p-3 rounded-lg border border-amber-500/20">
              Seu WhatsApp perdeu a conexão. É necessário ler o QR Code novamente para restaurar os envios.
            </p>
            <Button className="mt-4 w-full bg-amber-500 hover:bg-amber-600 text-white shadow-md" onClick={() => {
              onOpenChange(false)
              window.location.href = '/automacao'
            }}>
              Restaurar Conexão (Ler QR)
            </Button>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300 relative z-10">
            <div className="relative bg-background rounded-full p-4 border border-destructive/50 shadow-lg">
              <XCircle className="w-10 h-10 text-destructive" />
            </div>
            <h3 className="text-xl font-bold text-destructive mt-4 tracking-tight">Falha de Comunicação</h3>
            <p className="text-sm text-muted-foreground bg-destructive/5 p-3 rounded-lg border border-destructive/20">
              Não foi possível contatar a API. Verifique suas credenciais de servidor (URL/API Key).
            </p>
            <Button className="mt-4 w-full" variant="outline" onClick={() => onOpenChange(false)}>Fechar e Tentar Novamente</Button>
          </div>
        )}

        {status === 'not_configured' && (
          <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300 relative z-10">
            <div className="relative bg-background rounded-full p-4 border border-muted-foreground/50 shadow-lg">
              <MessageCircle className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-bold mt-4 tracking-tight">Setup Pendente</h3>
            <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg border border-border/50">
              Os dados de conexão da Evolution API ainda não foram configurados neste painel.
            </p>
            <Button className="mt-4 w-full" onClick={() => {
              onOpenChange(false)
              window.location.href = '/automacao'
            }}>
              Iniciar Configuração
            </Button>
          </div>
        )}
        
      </DialogContent>
    </Dialog>
  )
}

const promoSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
  description: z.string().optional(),
  discount_value: z.coerce.number().min(0, "O desconto não pode ser negativo"),
  is_active: z.boolean().default(true).optional(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
})

export function QuickAddPromoDialog({ open, onOpenChange, onSuccess, promo = null }: any) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const supabase = createClient()
  
  const { register, control, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(promoSchema),
    defaultValues: {
      name: "",
      description: "",
      discount_value: 0,
      is_active: true,
      start_date: "",
      end_date: ""
    }
  })

  useEffect(() => {
    if (open) {
      if (promo) {
        reset({
          name: promo.name,
          description: promo.description || "",
          discount_value: promo.discount_value,
          is_active: promo.is_active !== undefined ? promo.is_active : true,
          start_date: promo.start_date ? promo.start_date.split('T')[0] : "",
          end_date: promo.end_date ? promo.end_date.split('T')[0] : "",
        })
      } else {
        reset({ name: "", description: "", discount_value: 0, is_active: true, start_date: "", end_date: "" })
      }
    }
  }, [open, promo, reset])

  const onSubmit = async (data: any) => {
    setIsSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Não autenticado")

      const payload = {
        name: data.name,
        description: data.description,
        discount_value: data.discount_value,
        is_active: data.is_active !== undefined ? data.is_active : true,
        start_date: data.start_date || null,
        end_date: data.end_date || null,
      }

      if (promo) {
        const { error } = await supabase.from('promotions').update(payload).eq('id', promo.id)
        if (error) throw error
        toast.success("Promoção atualizada!")
        logAuditClient({ action: 'promotion.update', resource: 'promotions', details: { promo_name: data.name } })
      } else {
        const { error } = await supabase.from('promotions').insert({
          ...payload,
          user_id: user.id,
        })
        if (error) throw error
        toast.success("Promoção criada!")
        logAuditClient({ action: 'promotion.create', resource: 'promotions', details: { promo_name: data.name } })
      }

      onOpenChange(false)
      onSuccess?.()
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar promoção")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto border-border">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-interactive-bg text-interactive-fg">
              <Zap className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-[15px] font-semibold">
                {promo ? "Editar promoção" : "Nova promoção"}
              </DialogTitle>
              <DialogDescription className="text-[11px]">
                Desconto, vigência e status da campanha
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2 relative z-10">
          <div className="space-y-2">
            <Label>Nome da promoção</Label>
            <Input {...register("name")} placeholder="Ex: Black Friday Especial" />
            {errors.name && <p className="text-xs text-destructive">{errors.name?.message as string}</p>}
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea {...register("description")} rows={2} placeholder="Descrição (opcional)" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Desconto (R$)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                <Input type="number" step="0.01" {...register("discount_value")} className="pl-9" />
              </div>
              {errors.discount_value && <p className="text-xs text-destructive">{errors.discount_value?.message as string}</p>}
            </div>
            <div className="space-y-2">
              <Label>Início</Label>
              <Input type="date" {...register("start_date")} />
            </div>
            <div className="space-y-2">
              <Label>Fim</Label>
              <Input type="date" {...register("end_date")} />
            </div>
          </div>
          <Controller
            control={control}
            name="is_active"
            render={({ field }) => (
              <label className="flex cursor-pointer items-center gap-2.5">
                <Switch checked={field.value} onCheckedChange={field.onChange} />
                <span className="text-xs text-foreground">Promoção ativa</span>
              </label>
            )}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="sm:flex-1">Cancelar</Button>
            <Button type="submit" disabled={isSubmitting} className="sm:flex-[1.4]">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {promo ? "Salvar alterações" : "Criar promoção"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

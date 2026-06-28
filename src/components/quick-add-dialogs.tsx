"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Loader2, MessageCircle, CheckCircle2, XCircle, AlertCircle, Box, Gift } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils"
import { logAuditClient } from "@/lib/audit-client"

const serviceSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
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
    defaultValues: { name: "", cost: 0, plans: [] as {name: string, price: number}[] }
  })
  
  const { fields, append, remove } = require('react-hook-form').useFieldArray({
    control,
    name: "plans"
  })

  useEffect(() => { 
    if (open) {
      if (service) {
        reset({ name: service.name, cost: service.cost, plans: service.plans || [] })
      } else {
        reset({ name: "", cost: 0, plans: [] })
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
        cost: data.cost,
        plans: data.plans,
      }
      
      if (service) {
        const { error } = await supabase.from('services').update(payload).eq('id', service.id)
        if (error) throw error
        toast.success("Serviço atualizado!")
        logAuditClient('service.update', 'services', { service_name: data.name })
      } else {
        const { error } = await supabase.from('services').insert({
          user_id: user.id,
          ...payload
        })
        if (error) throw error
        toast.success("Serviço cadastrado!")
        logAuditClient('service.create', 'services', { service_name: data.name })
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
      <DialogContent className="glass-card sm:max-w-[480px] max-h-[90vh] overflow-y-auto border-sky-500/20">
        <DialogHeader className="relative">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
          <DialogTitle className="text-sky-500 flex items-center gap-3 text-xl">
             <div className="w-10 h-10 rounded-full bg-sky-500/15 flex items-center justify-center">
               <Box className="w-5 h-5 text-sky-500" />
             </div>
             {service ? "Editar Serviço" : "Novo Serviço Global"}
          </DialogTitle>
          <DialogDescription className="pt-3 text-base">
            {service ? "Edite as informações do serviço." : "Cadastre rapidamente um novo serviço para utilizar em todos os seus clientes."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pt-4 relative z-10">
          <div className="space-y-2">
            <Label>Nome do Serviço</Label>
            <Input {...register("name")} className="bg-background/80 focus-visible:ring-sky-500/50" placeholder="Ex: Assinatura Mensal VIP" />
            {errors.name && <p className="text-xs text-destructive">{errors.name?.message as string}</p>}
          </div>
          <div className="space-y-2">
            <Label>Custo Fixo (Seu Custo)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
              <Input type="number" step="0.01" {...register("cost")} className="pl-9 bg-background/80 focus-visible:ring-sky-500/50" />
            </div>
            <p className="text-[10px] text-muted-foreground">Valor pago ao seu fornecedor (usado para calcular o lucro líquido).</p>
            {errors.cost && <p className="text-xs text-destructive">{errors.cost?.message as string}</p>}
          </div>
          
          <div className="pt-4 border-t border-border/50 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold">Planos de Renovação Automática</h4>
                <p className="text-[10px] text-muted-foreground">Crie planos para usar no fluxo de renovação do WhatsApp.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => append({name: "", price: 0})} className="h-8 gap-1">
                + Plano
              </Button>
            </div>
            
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-2 items-start bg-muted/30 p-2 rounded-lg border border-border/50">
                  <div className="flex-1 space-y-1">
                    <Input {...register(`plans.${index}.name`)} placeholder="Ex: Mensal" className="h-8 text-sm bg-background" />
                    {errors.plans?.[index]?.name && <p className="text-[10px] text-destructive">{errors.plans[index]?.name?.message as string}</p>}
                  </div>
                  <div className="w-28 space-y-1">
                    <Input type="number" step="0.01" {...register(`plans.${index}.price`)} placeholder="Valor (R$)" className="h-8 text-sm bg-background" />
                    {errors.plans?.[index]?.price && <p className="text-[10px] text-destructive">{errors.plans[index]?.price?.message as string}</p>}
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => remove(index)}>
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {fields.length === 0 && (
                <p className="text-xs text-center text-muted-foreground py-4 bg-muted/10 rounded-lg border border-dashed border-border/50">Nenhum plano cadastrado. O robô não oferecerá renovação automática para clientes deste serviço.</p>
              )}
            </div>
          </div>
          
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto bg-sky-500 hover:bg-sky-600 text-white">
              {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Salvar Serviço
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
      <DialogContent className="glass-card sm:max-w-[425px] flex flex-col items-center justify-center p-8 text-center overflow-hidden">
        
        {/* Glow Effects Background based on status */}
        {status === 'connected' && <div className="absolute -top-20 -left-20 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />}
        {status === 'disconnected' && <div className="absolute -top-20 -left-20 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />}
        {status === 'error' && <div className="absolute -top-20 -left-20 w-48 h-48 bg-destructive/10 rounded-full blur-3xl pointer-events-none" />}
        
        {status === 'loading' && (
          <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300 relative z-10">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping"></div>
              <div className="relative bg-background rounded-full p-4 border border-primary/50 shadow-lg shadow-primary/20">
                <MessageCircle className="w-8 h-8 text-primary animate-pulse" />
              </div>
            </div>
            <h3 className="text-xl font-semibold mt-4 text-primary">Diagnóstico de Rede...</h3>
            <p className="text-sm text-muted-foreground">Comunicando com os servidores da Evolution API.</p>
          </div>
        )}

        {status === 'connected' && (
          <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300 relative z-10">
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-pulse"></div>
              <div className="relative bg-background rounded-full p-4 border border-emerald-500/50 shadow-lg shadow-emerald-500/20">
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
            <div className="relative bg-background rounded-full p-4 border border-amber-500/50 shadow-lg shadow-amber-500/20">
              <AlertCircle className="w-10 h-10 text-amber-500" />
            </div>
            <h3 className="text-xl font-bold text-amber-500 mt-4 tracking-tight">Dispositivo Desconectado</h3>
            <p className="text-sm text-muted-foreground bg-amber-500/5 p-3 rounded-lg border border-amber-500/20">
              Seu WhatsApp perdeu a conexão. É necessário ler o QR Code novamente para restaurar os envios.
            </p>
            <Button className="mt-4 w-full bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20" onClick={() => {
              onOpenChange(false)
              window.location.href = '/automacao'
            }}>
              Restaurar Conexão (Ler QR)
            </Button>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300 relative z-10">
            <div className="relative bg-background rounded-full p-4 border border-destructive/50 shadow-lg shadow-destructive/20">
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
  
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
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
        logAuditClient('promotion.update', 'promotions', { promo_name: data.name })
      } else {
        const { error } = await supabase.from('promotions').insert({
          ...payload,
          user_id: user.id,
        })
        if (error) throw error
        toast.success("Promoção criada!")
        logAuditClient('promotion.create', 'promotions', { promo_name: data.name })
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
      <DialogContent className="glass-card sm:max-w-[425px] border-amber-500/20 overflow-hidden">
        <DialogHeader className="relative">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <DialogTitle className="text-amber-500 flex items-center gap-3 text-xl">
             <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center">
               <Gift className="w-5 h-5 text-amber-500" />
             </div>
             {promo ? "Editar Promoção" : "Nova Promoção Global"}
          </DialogTitle>
          <DialogDescription className="pt-3 text-base">
            {promo ? "Altere as configurações da campanha selecionada." : "Crie uma regra de promoção para usar em campanhas de renovação de clientes."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pt-4 relative z-10">
          <div className="space-y-2">
            <Label>Nome da Promoção</Label>
            <Input {...register("name")} className="bg-background/80 focus-visible:ring-amber-500/50" placeholder="Ex: Black Friday Especial" />
            {errors.name && <p className="text-xs text-destructive">{errors.name?.message as string}</p>}
          </div>
          <div className="space-y-2">
            <Label>Desconto Aplicado (R$)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
              <Input type="number" step="0.01" {...register("discount_value")} className="pl-9 bg-background/80 focus-visible:ring-amber-500/50 font-medium" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data de Início</Label>
              <Input type="date" {...register("start_date")} className="bg-background/80 focus-visible:ring-amber-500/50" />
            </div>
            <div className="space-y-2">
              <Label>Data de Fim</Label>
              <Input type="date" {...register("end_date")} className="bg-background/80 focus-visible:ring-amber-500/50" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição / Notas Internas</Label>
            <Input {...register("description")} className="bg-background/80 focus-visible:ring-amber-500/50" placeholder="Apenas para controle interno..." />
          </div>
          <DialogFooter className="pt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {promo ? "Salvar Alterações" : "Salvar Promoção"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

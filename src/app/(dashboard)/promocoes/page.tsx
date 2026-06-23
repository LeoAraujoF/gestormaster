"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Plus, Edit2, Trash2, Loader2, Tags, CalendarIcon, Megaphone, Timer, ArrowDownToLine } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils"
import { logAuditClient } from "@/lib/audit-client"
import { z } from "zod"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { Promotion } from "@/types/database"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { QuickAddPromoDialog } from "@/components/quick-add-dialogs"
import { GlobalDeleteDialog } from "@/components/global-delete-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"



export default function PromocoesPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null)
  const [deletingPromo, setDeletingPromo] = useState<Promotion | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [userPlan, setUserPlan] = useState<string>("Desconhecido")
  const [isAdmin, setIsAdmin] = useState(false)
  
  const supabase = createClient()



  const loadPromotions = async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setUserPlan(user.user_metadata?.plan_name || "Desconhecido")

      try {
        const res = await fetch('/api/admin/check')
        const adminData = await res.json()
        setIsAdmin(adminData.isAdmin)
      } catch (e) {
        setIsAdmin(false)
      }

      const { data, error } = await supabase
        .from('promotions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setPromotions(data || [])
    } catch (error) {
      toast.error("Não foi possível carregar as promoções.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPromotions()
  }, [])

  const getPromoStatus = (promo: Promotion) => {
    if (!promo.is_active) return { label: 'Pausada', color: 'bg-muted text-muted-foreground border-muted-foreground/30' }
    
    const today = new Date()
    today.setHours(0,0,0,0)
    
    const startDate = promo.start_date ? new Date(promo.start_date + "T00:00:00") : null
    const endDate = promo.end_date ? new Date(promo.end_date + "T00:00:00") : null

    if (endDate && endDate < today) return { label: 'Expirada', color: 'bg-red-500/10 text-red-500 border-red-500/30' }
    if (startDate && startDate > today) return { label: 'Agendada', color: 'bg-blue-500/10 text-blue-500 border-blue-500/30' }
    
    return { label: 'Ativa', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 font-semibold' }
  }

  const activePromosCount = promotions.filter(p => getPromoStatus(p).label === 'Ativa').length

  const maxDiscountPromo = promotions.length > 0 
    ? [...promotions].filter(p => getPromoStatus(p).label === 'Ativa').sort((a,b) => b.discount_value - a.discount_value)[0]
    : null

  const expiringSoonPromo = promotions.length > 0
    ? [...promotions].filter(p => getPromoStatus(p).label === 'Ativa' && p.end_date).sort((a,b) => new Date(a.end_date!).getTime() - new Date(b.end_date!).getTime())[0]
    : null

  const openCreateDialog = () => {
    setEditingPromo(null)
    setIsDialogOpen(true)
  }

  const openEditDialog = (promo: Promotion) => {
    setEditingPromo(promo)
    setIsDialogOpen(true)
  }





  const toggleStatus = async (promo: Promotion, newStatus: boolean) => {
    try {
      const { error } = await supabase.from('promotions').update({ is_active: newStatus }).eq('id', promo.id)
      if (error) throw error
      logAuditClient({ action: 'promotion.toggle', resource: 'promotions', resource_id: promo.id, details: { new_status: newStatus ? 'active' : 'inactive', promo_name: promo.name } })
      toast.success(`Promoção ${newStatus ? 'ativada' : 'desativada'}.`)
      loadPromotions()
    } catch (error) {
      toast.error("Erro ao alterar status.")
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight mb-2">Promoções</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Gerencie campanhas de descontos e renovações para disparos.</p>
          {userPlan === "Lite" && !isAdmin && (
            <div className="mt-2 text-sm text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-500/10 p-2 rounded-md inline-flex items-center gap-2">
              <span className="text-lg">🔒</span>
              O Plano Lite permite ativar o desconto no painel, mas <strong>o disparo via WhatsApp está bloqueado.</strong>
            </div>
          )}
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="w-4 h-4" />
          Nova Promoção
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 rounded-xl">
              <Megaphone className="w-5 h-5 text-emerald-500" />
            </div>
            <h3 className="font-medium text-muted-foreground">Campanhas Ativas</h3>
          </div>
          <p className="text-3xl font-bold mt-2">{activePromosCount}</p>
        </div>

        <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-sky-500/5 rounded-bl-full -z-10" />
          <div className="flex items-center gap-3">
            <div className="p-3 bg-sky-500/10 rounded-xl">
              <ArrowDownToLine className="w-5 h-5 text-sky-500" />
            </div>
            <h3 className="font-medium text-muted-foreground">Maior Desconto</h3>
          </div>
          <p className="text-3xl font-bold mt-2 text-sky-500">
            {maxDiscountPromo ? formatCurrency(maxDiscountPromo.discount_value) : 'R$ 0,00'}
          </p>
          <p className="text-xs text-muted-foreground truncate">{maxDiscountPromo ? maxDiscountPromo.name : 'Nenhuma oferta rodando'}</p>
        </div>

        <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2 relative overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 rounded-xl">
              <Timer className="w-5 h-5 text-amber-500" />
            </div>
            <h3 className="font-medium text-muted-foreground">Acaba Mais Cedo</h3>
          </div>
          <p className="text-2xl font-bold mt-2 truncate text-foreground">
            {expiringSoonPromo ? expiringSoonPromo.name : 'Nenhum prazo'}
          </p>
          <p className="text-xs text-amber-500 font-medium mt-1">
            {expiringSoonPromo?.end_date ? `Vence em ${new Date(expiringSoonPromo.end_date + "T00:00:00").toLocaleDateString('pt-BR')}` : '-'}
          </p>
        </div>
      </div>

      <div>
        <div className="glass-card rounded-2xl overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-12 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : promotions.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-sky-500/10 flex items-center justify-center">
                <Tags className="w-8 h-8 text-sky-500" />
              </div>
              <h3 className="text-xl font-semibold">Nenhuma promoção ativa</h3>
              <p className="text-muted-foreground max-w-sm">
                Crie promoções de renovação ou descontos especiais para avisar sua base via Automação.
              </p>
              <Button onClick={openCreateDialog} variant="outline" className="mt-2">Criar Promoção</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Desconto</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {promotions.map((promo) => (
                    <TableRow key={promo.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3 pl-2">
                          <div className="p-2 bg-muted/50 text-foreground rounded-lg">
                            <Tags className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="flex items-center gap-2 text-base font-medium">
                              {promo.name}
                            </span>
                            <div className="text-xs text-muted-foreground max-w-[250px] truncate">{promo.description}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="inline-flex items-center justify-center px-3 py-1 rounded-md bg-emerald-500/10 text-emerald-500 text-sm font-bold border border-emerald-500/20 shadow-sm">
                          {formatCurrency(promo.discount_value)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                          {promo.start_date && (
                            <span className="flex items-center gap-1 font-medium">
                              <CalendarIcon className="w-3 h-3" /> 
                              De: {new Date(promo.start_date + "T00:00:00").toLocaleDateString('pt-BR')}
                            </span>
                          )}
                          {promo.end_date && (
                            <span className="flex items-center gap-1 font-medium">
                              <CalendarIcon className="w-3 h-3" /> 
                              Até: {new Date(promo.end_date + "T00:00:00").toLocaleDateString('pt-BR')}
                            </span>
                          )}
                          {!promo.start_date && !promo.end_date && <span className="font-medium bg-muted/50 px-2 py-0.5 rounded-sm w-fit">Sempre válido</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Switch 
                            checked={promo.is_active} 
                            onCheckedChange={(checked) => toggleStatus(promo, checked)} 
                          />
                          <Badge variant="outline" className={getPromoStatus(promo).color}>
                            {getPromoStatus(promo).label}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(promo)}>
                            <Edit2 className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { setDeletingPromo(promo); setIsDeleteDialogOpen(true); }}>
                            <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      <QuickAddPromoDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen} 
        promo={editingPromo} 
        onSuccess={loadPromotions} 
      />

      <GlobalDeleteDialog 
        open={isDeleteDialogOpen} 
        onOpenChange={setIsDeleteDialogOpen} 
        item={deletingPromo} 
        table="promotions" 
        title="Excluir Promoção" 
        description="Todos os dados desta promoção serão apagados definitivamente." 
        onSuccess={loadPromotions} 
      />
    </div>
  )
}

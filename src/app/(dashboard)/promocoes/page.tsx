"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Plus, Edit2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils"
import type { Promotion } from "@/types/database"

import { Button } from "@/components/ui/button"
import { QuickAddPromoDialog } from "@/components/quick-add-dialogs"
import { GlobalDeleteDialog } from "@/components/global-delete-dialog"
import { Skeleton } from "@/components/ui/skeleton"

export default function PromocoesPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  const [isPromoDialogOpen, setIsPromoDialogOpen] = useState(false)
  const [isDeletePromoOpen, setIsDeletePromoOpen] = useState(false)
  
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null)
  const [deletingPromo, setDeletingPromo] = useState<Promotion | null>(null)
  
  const supabase = createClient()

  const loadData = async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('promotions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setPromotions(data || [])
    } catch (error) {
      console.error("Error loading data:", error)
      toast.error("Não foi possível carregar as promoções.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const getPromoStatus = (promo: Promotion) => {
    if (!promo.is_active) return { label: 'Pausada', color: 'bg-muted text-muted-foreground border-muted-foreground/30' }
    
    const today = new Date()
    today.setHours(0,0,0,0)
    
    const startDate = promo.start_date ? new Date(promo.start_date + "T00:00:00") : null
    const endDate = promo.end_date ? new Date(promo.end_date + "T00:00:00") : null

    if (endDate && endDate < today) return { label: 'Encerrada', color: 'bg-red-500/10 text-red-500 border-red-500/30', dot: 'bg-red-500' }
    if (startDate && startDate > today) return { label: 'Agendada', color: 'bg-blue-500/10 text-blue-500 border-blue-500/30', dot: 'bg-blue-500' }
    
    return { label: 'Ativa', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 font-semibold', dot: 'bg-emerald-500' }
  }

  const openCreatePromo = () => { setEditingPromo(null); setIsPromoDialogOpen(true) }
  const openEditPromo = (p: Promotion) => { setEditingPromo(p); setIsPromoDialogOpen(true) }
  const openDeletePromo = (p: Promotion) => { setDeletingPromo(p); setIsDeletePromoOpen(true) }

  return (
    <div className="pb-10 max-w-7xl mx-auto space-y-6">
      
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-[17px] font-semibold tracking-[-0.02em]">Promoções</h1>
          <p className="text-[13px] text-muted-foreground mt-1">Crie descontos temporários ou estenda planos para atrair mais clientes.</p>
        </div>
        <Button onClick={openCreatePromo} className="h-8 gap-1.5 text-xs bg-foreground text-background hover:bg-foreground/90">
          <Plus className="size-3.5" /> Nova promoção
        </Button>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[120px] w-full rounded-xl" />
            ))
        ) : promotions.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-border p-12 flex flex-col items-center justify-center text-center bg-card/50">
              <p className="text-sm font-medium text-muted-foreground mb-4">Nenhuma promoção ativa no momento.</p>
              <Button variant="outline" size="sm" onClick={openCreatePromo} className="text-xs">
                + Criar Promoção
              </Button>
            </div>
        ) : (
          promotions.map((promo) => {
            const status = getPromoStatus(promo)
            const uses = (promo as any).uses_count || 0
            
            return (
              <div key={promo.id} className="group relative rounded-xl border border-border bg-card p-4 transition-colors hover:border-border/80 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-[15px] text-foreground pr-4 truncate">{promo.name}</span>
                    <span className={`flex items-center gap-1.5 text-[11px] font-semibold shrink-0 ${status.label === 'Ativa' ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                      {status.label === 'Ativa' && <span className={`size-1.5 rounded-full ${status.dot}`} />}
                      {status.label}
                    </span>
                  </div>
                  
                  <div className="text-[12px] text-muted-foreground mb-4 line-clamp-2">
                    {promo.description || `Desconto de ${formatCurrency(promo.discount_value)}`}
                    {promo.end_date ? ` · até ${new Date(promo.end_date + "T00:00:00").toLocaleDateString('pt-BR')}` : ''}
                  </div>
                </div>
                
                {status.label === 'Ativa' && (
                  <div className="space-y-2 mt-auto">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Usos</span>
                      <span className="num font-medium text-foreground">{uses} / ∞</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min((uses / 50) * 100, 100)}%` }} />
                    </div>
                  </div>
                )}

                {/* Actions overlay - appears on hover */}
                <div className="absolute right-2.5 top-2.5 flex opacity-0 group-hover:opacity-100 transition-opacity bg-card rounded-md shadow-sm border border-border">
                    <Button variant="ghost" size="icon" onClick={() => openEditPromo(promo)} className="h-7 w-7 text-muted-foreground hover:text-foreground">
                      <Edit2 className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openDeletePromo(promo)} className="h-7 w-7 text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3.5" />
                    </Button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <QuickAddPromoDialog
        open={isPromoDialogOpen}
        onOpenChange={setIsPromoDialogOpen}
        promo={editingPromo}
        onSuccess={loadData}
      />

      <GlobalDeleteDialog 
        open={isDeletePromoOpen} 
        onOpenChange={setIsDeletePromoOpen} 
        item={deletingPromo} 
        table="promotions" 
        title="Excluir Promoção" 
        description="Todos os dados desta promoção serão apagados definitivamente." 
        onSuccess={loadData} 
      />
    </div>
  )
}

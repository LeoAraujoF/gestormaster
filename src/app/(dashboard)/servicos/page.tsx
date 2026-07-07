"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Plus, Edit2, Trash2, Loader2, Briefcase, Tv, Server } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils"
import type { Service, Promotion } from "@/types/database"

import { Button } from "@/components/ui/button"
import { QuickAddServiceDialog, QuickAddPromoDialog } from "@/components/quick-add-dialogs"
import { GlobalDeleteDialog } from "@/components/global-delete-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function ServicosPage() {
  const [services, setServices] = useState<Service[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  
  const [isLoading, setIsLoading] = useState(true)
  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false)
  const [isPromoDialogOpen, setIsPromoDialogOpen] = useState(false)
  
  const [isDeleteServiceOpen, setIsDeleteServiceOpen] = useState(false)
  const [isDeletePromoOpen, setIsDeletePromoOpen] = useState(false)
  
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [deletingService, setDeletingService] = useState<Service | null>(null)
  
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null)
  const [deletingPromo, setDeletingPromo] = useState<Promotion | null>(null)
  
  const supabase = createClient()

  const loadData = async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [servicesRes, promosRes] = await Promise.all([
        supabase
          .from('services')
          .select(`*, client_services (count)`)
          .eq('user_id', user.id)
          .order('name'),
        supabase
          .from('promotions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
      ])

      if (servicesRes.error) throw servicesRes.error
      if (promosRes.error) throw promosRes.error

      const formattedServices = servicesRes.data.map((item: any) => ({
        ...item,
        client_count: item.client_services[0]?.count || 0
      }))

      setServices(formattedServices)
      setPromotions(promosRes.data || [])
    } catch (error) {
      console.error("Error loading data:", error)
      toast.error("Não foi possível carregar os dados.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const getServiceIcon = (name: string) => {
    const n = name.toLowerCase()
    if (n.includes('tv') || n.includes('iptv') || n.includes('p2p')) return <Tv className="w-5 h-5" />
    if (n.includes('vps') || n.includes('host') || n.includes('servidor')) return <Server className="w-5 h-5" />
    return <Briefcase className="w-5 h-5" />
  }

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

  const totalServices = services.length

  const openCreateService = () => { setEditingService(null); setIsServiceDialogOpen(true) }
  const openEditService = (s: Service) => { setEditingService(s); setIsServiceDialogOpen(true) }
  const openDeleteService = (s: Service) => {
    if ((s.client_count || 0) > 0) {
      toast.error(`Não é possível excluir. Existem ${s.client_count} clientes usando este serviço.`)
      return
    }
    setDeletingService(s); setIsDeleteServiceOpen(true)
  }

  const openCreatePromo = () => { setEditingPromo(null); setIsPromoDialogOpen(true) }
  const openEditPromo = (p: Promotion) => { setEditingPromo(p); setIsPromoDialogOpen(true) }
  const openDeletePromo = (p: Promotion) => { setDeletingPromo(p); setIsDeletePromoOpen(true) }

  return (
    <div className="pb-10 max-w-5xl mx-auto space-y-6">
      <div className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-[15px] font-semibold tracking-[-0.02em]">Serviços</h1>
            <span className="num rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">{totalServices}</span>
          </div>
          <Button size="sm" onClick={openCreateService} className="h-8 gap-1.5 text-xs bg-foreground text-background hover:bg-foreground/90">
            <Plus className="size-3.5" /> Novo serviço
          </Button>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {isLoading ? (
            <div className="space-y-0 divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-3 w-20" /></div>
                  <Skeleton className="h-3.5 w-16" /><Skeleton className="h-5 w-14 rounded" />
                </div>
              ))}
            </div>
          ) : services.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-4 py-16 text-center">
              <p className="microlabel">Nenhum serviço cadastrado</p>
              <p className="text-xs text-muted-foreground">Cadastre um serviço para vinculá-lo aos clientes no registro.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="microlabel pl-4">Serviço</TableHead>
                    <TableHead className="microlabel hidden sm:table-cell">Painel</TableHead>
                    <TableHead className="microlabel text-right">Custo un.</TableHead>
                    <TableHead className="microlabel text-right">Custo total</TableHead>
                    <TableHead className="microlabel pr-4 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((service) => (
                    <TableRow key={service.id} className="hover:bg-muted group">
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                            {getServiceIcon(service.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-foreground">{service.name}</p>
                            <p className="num text-[11px] text-muted-foreground">{service.client_count || 0} clientes</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                        {(service as any).panel_type || '—'}
                      </TableCell>
                      <TableCell className="num whitespace-nowrap text-right text-xs text-muted-foreground">{formatCurrency(service.cost)}</TableCell>
                      <TableCell className="num whitespace-nowrap text-right text-xs font-medium text-danger">
                        {formatCurrency(service.cost * (service.client_count || 0))}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" onClick={() => openEditService(service)} className="h-7 w-7 text-muted-foreground hover:text-foreground">
                            <Edit2 className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openDeleteService(service)} className="h-7 w-7 text-muted-foreground hover:text-destructive">
                            <Trash2 className="size-3.5" />
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

      <QuickAddServiceDialog 
        open={isServiceDialogOpen} 
        onOpenChange={setIsServiceDialogOpen} 
        service={editingService} 
        onSuccess={loadData} 
      />
      


      <GlobalDeleteDialog 
        open={isDeleteServiceOpen} 
        onOpenChange={setIsDeleteServiceOpen} 
        item={deletingService} 
        table="services" 
        title="Excluir Serviço" 
        description="Todos os dados deste serviço serão apagados definitivamente." 
        onSuccess={loadData} 
      />
      

    </div>
  )
}

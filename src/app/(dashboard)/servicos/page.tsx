"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Plus, Edit2, Trash2, Loader2, Briefcase, Tv, Server, Box, TrendingUp, Wallet, Flame } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { Service } from "@/types/database"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { QuickAddServiceDialog } from "@/components/quick-add-dialogs"
import { GlobalDeleteDialog } from "@/components/global-delete-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"




export default function ServicosPage() {
  const [services, setServices] = useState<Service[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [deletingService, setDeletingService] = useState<Service | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const supabase = createClient()



  const loadServices = async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('services')
        .select(`
          *,
          client_services (count)
        `)
        .eq('user_id', user.id)
        .order('name')

      if (error) throw error

      // Transform to include count easily
      const formattedData = data.map((item: any) => ({
        ...item,
        client_count: item.client_services[0]?.count || 0
      }))

      setServices(formattedData)
    } catch (error) {
      console.error("Error loading services:", error)
      toast.error("Não foi possível carregar os serviços.")
    } finally {
      setIsLoading(false)
    }
  }

  const getServiceIcon = (name: string) => {
    const n = name.toLowerCase()
    if (n.includes('tv') || n.includes('iptv') || n.includes('p2p')) return <Tv className="w-5 h-5" />
    if (n.includes('vps') || n.includes('host') || n.includes('servidor')) return <Server className="w-5 h-5" />
    return <Briefcase className="w-5 h-5" />
  }

  const totalServices = services.length
  const totalFixedCost = services.reduce((acc, s) => acc + (s.cost * (s.client_count || 0)), 0)
  
  // Find top service
  const topService = services.length > 0 
    ? [...services].sort((a, b) => (b.client_count || 0) - (a.client_count || 0))[0] 
    : null

  useEffect(() => {
    loadServices()
  }, [])

  const openCreateDialog = () => {
    setEditingService(null)
    setIsDialogOpen(true)
  }

  const openEditDialog = (service: Service) => {
    setEditingService(service)
    setIsDialogOpen(true)
  }

  const openDeleteDialog = (service: Service) => {
    if ((service.client_count || 0) > 0) {
      toast.error(`Não é possível excluir. Existem ${service.client_count} clientes usando este serviço.`)
      return
    }
    setDeletingService(service)
    setIsDeleteDialogOpen(true)
  }





  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight mb-2">Serviços</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Gerencie seus produtos e o impacto deles no seu caixa.</p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="w-4 h-4" />
          Novo Serviço
        </Button>
      </div>

      <Tabs defaultValue="servicos" className="w-full">
        <TabsList className="mb-6 bg-muted/50 p-1">
          <TabsTrigger value="servicos" className="data-[state=active]:bg-background">Visão Geral (Serviços)</TabsTrigger>
          <TabsTrigger value="planos" className="data-[state=active]:bg-background">Planos de Renovação</TabsTrigger>
        </TabsList>

        <TabsContent value="servicos" className="space-y-6">
          {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-sky-500/10 rounded-xl">
              <Box className="w-5 h-5 text-sky-500" />
            </div>
            <h3 className="font-medium text-muted-foreground">Total de Serviços</h3>
          </div>
          <p className="text-3xl font-bold mt-2">{totalServices}</p>
        </div>

        <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-red-500/5 rounded-bl-full -z-10" />
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-500/10 rounded-xl">
              <Wallet className="w-5 h-5 text-red-500" />
            </div>
            <h3 className="font-medium text-muted-foreground">Custo Fixo Ativo</h3>
          </div>
          <p className="text-3xl font-bold mt-2 text-red-500">{formatCurrency(totalFixedCost)}</p>
          <p className="text-xs text-muted-foreground">Gasto mensal devido aos clientes ativos</p>
        </div>

        <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 rounded-xl">
              <TrendingUp className="w-5 h-5 text-amber-500" />
            </div>
            <h3 className="font-medium text-muted-foreground">Carro Chefe</h3>
          </div>
          <p className="text-2xl font-bold mt-2 truncate text-foreground">{topService && topService.client_count ? topService.name : 'Nenhum ativo'}</p>
          <p className="text-xs text-muted-foreground">{topService?.client_count || 0} clientes vinculados</p>
        </div>
      </div>

      <div>
        <div className="glass-card rounded-2xl overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-12 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Carregando serviços...</p>
            </div>
          ) : services.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-sky-500/10 flex items-center justify-center">
                <Briefcase className="w-8 h-8 text-sky-500" />
              </div>
              <h3 className="text-xl font-semibold">Nenhum serviço cadastrado</h3>
              <p className="text-muted-foreground max-w-sm">
                Cadastre seu primeiro serviço para poder vinculá-lo aos seus clientes na hora do registro.
              </p>
              <Button onClick={openCreateDialog} variant="outline" className="mt-2">
                Cadastrar Serviço
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="pl-6">Serviço</TableHead>
                    <TableHead>Custo Unitário</TableHead>
                    <TableHead>Clientes Vinculados</TableHead>
                    <TableHead>Custo Fixo (Total)</TableHead>
                    <TableHead className="text-right pr-6">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((service) => (
                    <TableRow key={service.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium pl-6">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-muted/50 text-sky-500 rounded-lg">
                            {getServiceIcon(service.name)}
                          </div>
                          <div>
                            <span className="flex items-center gap-2 text-base">
                              {service.name}
                              {topService?.id === service.id && service.client_count ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-bold tracking-wider uppercase ml-1">
                                  <Flame className="w-3 h-3" /> Mais Vendido
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground font-medium">{formatCurrency(service.cost)}</TableCell>
                      <TableCell>
                        <div className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-sky-500/10 text-sky-500 text-xs font-bold">
                          {service.client_count || 0} clientes
                        </div>
                      </TableCell>
                      <TableCell className="font-bold text-red-500/90">
                        {formatCurrency(service.cost * (service.client_count || 0))}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex items-center justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => openEditDialog(service)}
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => openDeleteDialog(service)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
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
      </TabsContent>

      <TabsContent value="planos" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map(service => (
            <div key={service.id} className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-sky-500/10 rounded-xl">
                  {getServiceIcon(service.name)}
                </div>
                <h3 className="font-semibold text-lg">{service.name}</h3>
              </div>
              <div className="space-y-2 flex-1">
                <h4 className="text-sm font-medium text-muted-foreground">Planos Configurados:</h4>
                {(!service.plans || service.plans.length === 0) ? (
                   <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg text-center">Nenhum plano configurado para o robô</p>
                ) : (
                   <ul className="space-y-2">
                     {service.plans.map((p: any, i: number) => (
                       <li key={i} className="flex justify-between items-center text-sm p-2 rounded-lg bg-muted/30 border border-border/50">
                         <span>{p.name}</span>
                         <span className="font-semibold">{formatCurrency(p.price)}</span>
                       </li>
                     ))}
                   </ul>
                )}
              </div>
              <Button variant="outline" className="mt-auto w-full" onClick={() => openEditDialog(service)}>
                 Configurar Planos
              </Button>
            </div>
          ))}
          {services.length === 0 && (
             <div className="col-span-full p-12 text-center text-muted-foreground bg-muted/10 rounded-2xl border border-dashed">
               Nenhum serviço cadastrado ainda. Crie um serviço primeiro.
             </div>
          )}
        </div>
      </TabsContent>
    </Tabs>

      <QuickAddServiceDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen} 
        service={editingService} 
        onSuccess={loadServices} 
      />

      <GlobalDeleteDialog 
        open={isDeleteDialogOpen} 
        onOpenChange={setIsDeleteDialogOpen} 
        item={deletingService} 
        table="services" 
        title="Excluir Serviço" 
        description="Todos os dados deste serviço serão apagados definitivamente." 
        onSuccess={loadServices} 
      />
    </div>
  )
}

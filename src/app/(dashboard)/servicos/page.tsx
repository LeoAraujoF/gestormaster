"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { BriefcaseBusiness, Edit2, Layers3, Plus, Server, Trash2, Tv, UsersRound, WalletCards, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { CatalogNavigation } from "@/components/catalog-navigation"
import { GlobalDeleteDialog } from "@/components/global-delete-dialog"
import { MetricGrid, PageHeader, PageSection, PageShell, ResponsiveDataView } from "@/components/page-layout"
import { QuickAddServiceDialog } from "@/components/quick-add-dialogs"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"
import { cn, formatCurrency } from "@/lib/utils"
import type { Service } from "@/types/database"

type CatalogService = Service & {
  panel_type?: string | null
  client_services?: Array<{ count?: number | null }>
}

function ServiceMetric({
  icon: Icon,
  label,
  value,
  hint,
  emphasis = false,
  compactValue = false,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  hint: string
  emphasis?: boolean
  compactValue?: boolean
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", emphasis ? "bg-interactive-bg text-interactive" : "bg-secondary text-secondary-foreground")}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="microlabel text-[9px]">{label}</p>
          <p className={cn("num mt-1 font-semibold leading-tight", compactValue ? "whitespace-nowrap text-[15px] tracking-[-0.04em] sm:text-xl sm:tracking-tight" : "break-words text-[17px] tracking-tight sm:text-xl", emphasis ? "text-interactive" : "text-foreground")}>{value}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
        </div>
      </div>
    </div>
  )
}

function ServiceIcon({ name }: { name: string }) {
  const normalized = name.toLowerCase()
  const iconClass = "size-4"
  if (normalized.includes("tv") || normalized.includes("iptv") || normalized.includes("p2p")) return <Tv className={iconClass} aria-hidden="true" />
  if (normalized.includes("vps") || normalized.includes("host") || normalized.includes("servidor")) return <Server className={iconClass} aria-hidden="true" />
  return <BriefcaseBusiness className={iconClass} aria-hidden="true" />
}

export default function ServicosPage() {
  const supabase = useMemo(() => createClient(), [])
  const [services, setServices] = useState<CatalogService[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false)
  const [isDeleteServiceOpen, setIsDeleteServiceOpen] = useState(false)
  const [editingService, setEditingService] = useState<CatalogService | null>(null)
  const [deletingService, setDeletingService] = useState<CatalogService | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from("services")
        .select("*, client_services (count)")
        .eq("user_id", user.id)
        .order("name")

      if (error) throw error

      const formattedServices = (data || []).map((item: CatalogService) => ({
        ...item,
        client_count: item.client_services?.[0]?.count || 0,
      }))
      setServices(formattedServices)
    } catch (error) {
      console.error("Error loading data:", error)
      toast.error("Não foi possível carregar os serviços.")
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0)
    return () => window.clearTimeout(timer)
  }, [loadData])

  const totalAssignments = services.reduce((total, service) => total + (service.client_count || 0), 0)
  const totalOperationalCost = services.reduce((total, service) => total + Number(service.cost || 0) * (service.client_count || 0), 0)
  const servicesWithoutClients = services.filter((service) => (service.client_count || 0) === 0).length
  const leadingService = [...services].sort((a, b) => (b.client_count || 0) - (a.client_count || 0))[0]

  const openCreateService = () => {
    setEditingService(null)
    setIsServiceDialogOpen(true)
  }

  const openEditService = (service: CatalogService) => {
    setEditingService(service)
    setIsServiceDialogOpen(true)
  }

  const openDeleteService = (service: CatalogService) => {
    if ((service.client_count || 0) > 0) {
      toast.error(`Não é possível excluir. Existem ${service.client_count} clientes usando este serviço.`)
      return
    }
    setDeletingService(service)
    setIsDeleteServiceOpen(true)
  }

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Catálogo"
        title="Serviços"
        description="Organize sua oferta, acompanhe a adesão da carteira e entenda o custo operacional de cada serviço."
        badge={isLoading ? "…" : `${services.length} cadastrado${services.length === 1 ? "" : "s"}`}
        actions={
          <Button onClick={openCreateService} className="min-h-10 gap-2">
            <Plus className="size-4" aria-hidden="true" /> Novo serviço
          </Button>
        }
      />

      <CatalogNavigation active="services" />

      <section aria-label="Resumo dos serviços">
        {isLoading ? (
          <MetricGrid columns={4}>
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[116px] rounded-2xl" />)}
          </MetricGrid>
        ) : (
          <MetricGrid columns={4}>
            <ServiceMetric icon={Layers3} label="Portfólio" value={services.length} hint={`${servicesWithoutClients} sem clientes vinculados`} />
            <ServiceMetric icon={UsersRound} label="Vínculos da carteira" value={totalAssignments} hint="Soma dos clientes em todos os serviços" emphasis />
            <ServiceMetric icon={WalletCards} label="Custo operacional" value={formatCurrency(totalOperationalCost)} hint="Custo unitário × clientes vinculados" compactValue />
            <ServiceMetric icon={BriefcaseBusiness} label="Maior base" value={leadingService?.name || "—"} hint={leadingService ? `${leadingService.client_count || 0} clientes vinculados` : "Cadastre o primeiro serviço"} />
          </MetricGrid>
        )}
      </section>

      <PageSection
        title="Portfólio de serviços"
        description={servicesWithoutClients > 0 ? `${servicesWithoutClients} serviço${servicesWithoutClients === 1 ? " ainda não possui" : "s ainda não possuem"} clientes vinculados.` : "Todos os serviços cadastrados já possuem clientes vinculados."}
      >
        {isLoading ? (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 px-4 py-4 sm:px-5">
                  <Skeleton className="size-10 rounded-xl" />
                  <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-3 w-24" /></div>
                  <Skeleton className="hidden h-4 w-20 sm:block" />
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          </div>
        ) : services.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground"><Layers3 className="size-5" aria-hidden="true" /></span>
            <h3 className="mt-4 text-sm font-semibold text-foreground">Comece pelo primeiro serviço</h3>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">Cadastre o que você comercializa para vincular clientes, planos, acessos e custos operacionais.</p>
            <Button onClick={openCreateService} className="mt-5 min-h-10 gap-2"><Plus className="size-4" aria-hidden="true" /> Cadastrar serviço</Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <ResponsiveDataView
              desktopFrom="md"
              mobile={
                <div className="divide-y divide-border">
                  {services.map((service) => {
                    const monthlyCost = Number(service.cost || 0) * (service.client_count || 0)
                    return (
                      <article key={service.id} className="space-y-4 p-4">
                        <div className="flex items-start gap-3">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><ServiceIcon name={service.name} /></span>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-semibold text-foreground">{service.name}</h3>
                            <p className="mt-1 text-[11px] text-muted-foreground">{service.panel_type || "Painel não informado"} · {service.plans?.length || 0} plano{service.plans?.length === 1 ? "" : "s"}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-xl bg-muted/60 p-3"><p className="microlabel text-[8px]">Clientes</p><p className="num mt-1 text-sm font-semibold">{service.client_count || 0}</p></div>
                          <div className="rounded-xl bg-muted/60 p-3"><p className="microlabel text-[8px]">Custo un.</p><p className="num mt-1 text-sm font-semibold">{formatCurrency(service.cost)}</p></div>
                          <div className="rounded-xl bg-muted/60 p-3"><p className="microlabel text-[8px]">Custo total</p><p className="num mt-1 text-sm font-semibold text-danger">{formatCurrency(monthlyCost)}</p></div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button variant="outline" onClick={() => openEditService(service)} aria-label={`Editar ${service.name}`} className="min-h-10 gap-2 text-xs"><Edit2 className="size-3.5" aria-hidden="true" /> Editar</Button>
                          <Button variant="outline" onClick={() => openDeleteService(service)} aria-label={`Excluir ${service.name}`} className="min-h-10 gap-2 text-xs text-danger hover:bg-danger-bg hover:text-danger"><Trash2 className="size-3.5" aria-hidden="true" /> Excluir</Button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              }
              desktop={
                <Table>
                  <TableHeader className="bg-muted/70">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="microlabel pl-5">Serviço</TableHead>
                      <TableHead className="microlabel">Painel e planos</TableHead>
                      <TableHead className="microlabel text-right">Clientes</TableHead>
                      <TableHead className="microlabel text-right">Custo unitário</TableHead>
                      <TableHead className="microlabel text-right">Custo total</TableHead>
                      <TableHead className="microlabel pr-5 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {services.map((service) => (
                      <TableRow key={service.id} className="group hover:bg-muted/45">
                        <TableCell className="pl-5 py-4">
                          <div className="flex items-center gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><ServiceIcon name={service.name} /></span>
                            <div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{service.name}</p><p className="mt-0.5 text-[11px] text-muted-foreground">Oferta ativa no catálogo</p></div>
                          </div>
                        </TableCell>
                        <TableCell><p className="text-xs text-foreground">{service.panel_type || "Não informado"}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{service.plans?.length || 0} plano{service.plans?.length === 1 ? "" : "s"} configurado{service.plans?.length === 1 ? "" : "s"}</p></TableCell>
                        <TableCell className="num text-right text-sm font-semibold text-foreground">{service.client_count || 0}</TableCell>
                        <TableCell className="num whitespace-nowrap text-right text-xs text-muted-foreground">{formatCurrency(service.cost)}</TableCell>
                        <TableCell className="num whitespace-nowrap text-right text-sm font-semibold text-danger">{formatCurrency(Number(service.cost || 0) * (service.client_count || 0))}</TableCell>
                        <TableCell className="pr-5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditService(service)} aria-label={`Editar ${service.name}`} title={`Editar ${service.name}`} className="size-9 text-muted-foreground hover:text-foreground"><Edit2 className="size-4" aria-hidden="true" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => openDeleteService(service)} aria-label={`Excluir ${service.name}`} title={`Excluir ${service.name}`} className="size-9 text-muted-foreground hover:bg-danger-bg hover:text-danger"><Trash2 className="size-4" aria-hidden="true" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
            />
          </div>
        )}
      </PageSection>

      <QuickAddServiceDialog open={isServiceDialogOpen} onOpenChange={setIsServiceDialogOpen} service={editingService} onSuccess={loadData} />
      <GlobalDeleteDialog open={isDeleteServiceOpen} onOpenChange={setIsDeleteServiceOpen} item={deletingService} table="services" title="Excluir Serviço" description="Todos os dados deste serviço serão apagados definitivamente." onSuccess={loadData} />
    </PageShell>
  )
}

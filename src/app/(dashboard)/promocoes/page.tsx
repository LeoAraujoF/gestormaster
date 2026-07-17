"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { BadgePercent, CalendarClock, CalendarDays, CheckCircle2, CirclePause, Edit2, Plus, TicketPercent, Trash2, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { CatalogNavigation } from "@/components/catalog-navigation"
import { GlobalDeleteDialog } from "@/components/global-delete-dialog"
import { MetricGrid, PageHeader, PageSection, PageShell } from "@/components/page-layout"
import { QuickAddPromoDialog } from "@/components/quick-add-dialogs"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"
import { cn, formatCurrency } from "@/lib/utils"
import type { Promotion } from "@/types/database"

type PromotionState = {
  key: "active" | "scheduled" | "ended" | "paused"
  label: string
  badgeClass: string
  detail: string
}

function formatDate(date: string | null) {
  return date ? new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR") : null
}

function getPromotionState(promotion: Promotion, today: Date): PromotionState {
  if (!promotion.is_active) {
    return { key: "paused", label: "Pausada", badgeClass: "border-border bg-muted text-muted-foreground", detail: "Desativada manualmente" }
  }

  const startDate = promotion.start_date ? new Date(`${promotion.start_date}T00:00:00`) : null
  const endDate = promotion.end_date ? new Date(`${promotion.end_date}T00:00:00`) : null

  if (endDate && endDate < today) {
    return { key: "ended", label: "Encerrada", badgeClass: "border-danger-border bg-danger-bg text-danger", detail: `Encerrada em ${formatDate(promotion.end_date)}` }
  }
  if (startDate && startDate > today) {
    return { key: "scheduled", label: "Agendada", badgeClass: "border-warning-border bg-warning-bg text-warning-fg", detail: `Inicia em ${formatDate(promotion.start_date)}` }
  }
  return { key: "active", label: "Ativa", badgeClass: "border-success-border bg-success-bg text-success-fg", detail: "Disponível para aplicação nas renovações" }
}

function PromotionMetric({
  icon: Icon,
  label,
  value,
  hint,
  emphasis = false,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  hint: string
  emphasis?: boolean
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", emphasis ? "bg-success-bg text-success-fg" : "bg-secondary text-secondary-foreground")}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="microlabel text-[9px]">{label}</p>
          <p className={cn("num mt-1 break-words text-[17px] font-semibold leading-tight tracking-tight sm:text-xl", emphasis ? "text-success-fg" : "text-foreground")}>{value}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
        </div>
      </div>
    </div>
  )
}

export default function PromocoesPage() {
  const supabase = useMemo(() => createClient(), [])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isPromoDialogOpen, setIsPromoDialogOpen] = useState(false)
  const [isDeletePromoOpen, setIsDeletePromoOpen] = useState(false)
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null)
  const [deletingPromo, setDeletingPromo] = useState<Promotion | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from("promotions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (error) throw error
      setPromotions(data || [])
    } catch (error) {
      console.error("Error loading data:", error)
      toast.error("Não foi possível carregar as promoções.")
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0)
    return () => window.clearTimeout(timer)
  }, [loadData])

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const promotionStates = promotions.map((promotion) => ({ promotion, state: getPromotionState(promotion, today) }))
  const activeCount = promotionStates.filter(({ state }) => state.key === "active").length
  const scheduledCount = promotionStates.filter(({ state }) => state.key === "scheduled").length
  const endedCount = promotionStates.filter(({ state }) => state.key === "ended").length
  const pausedCount = promotionStates.filter(({ state }) => state.key === "paused").length
  const averageDiscount = promotions.length > 0
    ? promotions.reduce((total, promotion) => total + Number(promotion.discount_value || 0), 0) / promotions.length
    : 0

  const openCreatePromo = () => {
    setEditingPromo(null)
    setIsPromoDialogOpen(true)
  }

  const openEditPromo = (promotion: Promotion) => {
    setEditingPromo(promotion)
    setIsPromoDialogOpen(true)
  }

  const openDeletePromo = (promotion: Promotion) => {
    setDeletingPromo(promotion)
    setIsDeletePromoOpen(true)
  }

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Catálogo"
        title="Promoções"
        description="Crie ofertas com objetivo claro, acompanhe a vigência e mantenha disponíveis apenas as condições relevantes para sua carteira."
        badge={isLoading ? "…" : `${promotions.length} cadastrada${promotions.length === 1 ? "" : "s"}`}
        actions={
          <Button onClick={openCreatePromo} className="min-h-10 gap-2">
            <Plus className="size-4" aria-hidden="true" /> Nova promoção
          </Button>
        }
      />

      <CatalogNavigation active="promotions" />

      <section aria-label="Resumo das promoções">
        {isLoading ? (
          <MetricGrid columns={4}>
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[116px] rounded-2xl" />)}
          </MetricGrid>
        ) : (
          <MetricGrid columns={4}>
            <PromotionMetric icon={BadgePercent} label="Promoções" value={promotions.length} hint={`${pausedCount} pausada${pausedCount === 1 ? "" : "s"} · ${endedCount} encerrada${endedCount === 1 ? "" : "s"}`} />
            <PromotionMetric icon={CheckCircle2} label="Ativas agora" value={activeCount} hint="Disponíveis para aplicação" emphasis />
            <PromotionMetric icon={CalendarClock} label="Agendadas" value={scheduledCount} hint="Começam em uma data futura" />
            <PromotionMetric icon={TicketPercent} label="Desconto médio" value={formatCurrency(averageDiscount)} hint="Média das promoções cadastradas" />
          </MetricGrid>
        )}
      </section>

      <PageSection
        title="Campanhas promocionais"
        description="Desconto, disponibilidade e vigência em uma leitura rápida para decidir o que manter no catálogo."
      >
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-[310px] rounded-2xl" />)}
          </div>
        ) : promotions.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground"><BadgePercent className="size-5" aria-hidden="true" /></span>
            <h3 className="mt-4 text-sm font-semibold text-foreground">Crie sua primeira promoção</h3>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">Defina um desconto e uma vigência para usar a oferta nas renovações dos clientes.</p>
            <Button onClick={openCreatePromo} className="mt-5 min-h-10 gap-2"><Plus className="size-4" aria-hidden="true" /> Criar promoção</Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {promotionStates.map(({ promotion, state }) => (
              <article key={promotion.id} className="flex min-h-[310px] flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><BadgePercent className="size-4" aria-hidden="true" /></span>
                  <span className={cn("inline-flex min-h-7 items-center rounded-full border px-2.5 text-[10px] font-semibold", state.badgeClass)}>{state.label}</span>
                </div>

                <div className="mt-5 min-w-0">
                  <h3 className="truncate text-base font-semibold tracking-tight text-foreground">{promotion.name}</h3>
                  <p className="mt-1 min-h-10 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{promotion.description || "Promoção sem descrição cadastrada."}</p>
                </div>

                <div className="mt-5 flex items-end justify-between gap-4 border-y border-border py-4">
                  <div><p className="microlabel text-[9px]">Desconto</p><p className="num mt-1 text-2xl font-semibold tracking-tight text-foreground">{formatCurrency(promotion.discount_value)}</p></div>
                  <TicketPercent className="size-6 text-muted-foreground" aria-hidden="true" />
                </div>

                <div className="mt-4 space-y-2.5">
                  <div className="flex items-start gap-2.5 text-xs">
                    <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0"><p className="font-medium text-foreground">Vigência</p><p className="mt-0.5 text-[11px] text-muted-foreground">{formatDate(promotion.start_date) || "Início imediato"} — {formatDate(promotion.end_date) || "Sem data final"}</p></div>
                  </div>
                  <div className="flex items-start gap-2.5 text-xs">
                    {state.key === "paused" ? <CirclePause className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : <CheckCircle2 className={cn("mt-0.5 size-4 shrink-0", state.key === "active" ? "text-success-fg" : "text-muted-foreground")} aria-hidden="true" />}
                    <p className="leading-relaxed text-muted-foreground">{state.detail}</p>
                  </div>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
                  <Button variant="outline" onClick={() => openEditPromo(promotion)} aria-label={`Editar ${promotion.name}`} className="min-h-10 gap-2 text-xs"><Edit2 className="size-3.5" aria-hidden="true" /> Editar</Button>
                  <Button variant="outline" onClick={() => openDeletePromo(promotion)} aria-label={`Excluir ${promotion.name}`} className="min-h-10 gap-2 text-xs text-danger hover:bg-danger-bg hover:text-danger"><Trash2 className="size-3.5" aria-hidden="true" /> Excluir</Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </PageSection>

      <QuickAddPromoDialog open={isPromoDialogOpen} onOpenChange={setIsPromoDialogOpen} promo={editingPromo} onSuccess={loadData} />
      <GlobalDeleteDialog open={isDeletePromoOpen} onOpenChange={setIsDeletePromoOpen} item={deletingPromo} table="promotions" title="Excluir Promoção" description="Todos os dados desta promoção serão apagados definitivamente." onSuccess={loadData} />
    </PageShell>
  )
}

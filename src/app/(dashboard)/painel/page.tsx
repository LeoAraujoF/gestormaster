"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, CheckCircle2, CircleAlert, Plus, Send, Zap } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { formatCurrency, cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { PixRapidoModal } from "@/components/pix-rapido-modal"
import { ClientFormDialog } from "@/components/client-form-dialog"
import { RenewDialog } from "@/components/client-action-dialogs"
import type { ExecutiveDashboardDTO, ExecutivePeriod } from "@/lib/executive-metrics"
import { usePrivacy } from "@/hooks/use-privacy"
import { BrandLoader } from "@/components/brand-loader"
import { OnboardingProgress } from "@/components/onboarding-progress"
import { useConfirm } from "@/components/providers/confirm-provider"
import { ExecutiveDashboardView, ExecutiveUpgrade } from "@/components/executive-dashboard-view"
import { usePlanCapability } from "@/components/providers/plan-provider"
import { PageShell } from "@/components/page-layout"
import { PainelHero } from "@/components/painel-hero"
import { DashboardOverview, buildDueDaySpark } from "@/components/dashboard-overview"
import { DueDateMap } from "@/components/due-date-map"

type QueueFilter = "vencidos" | "hoje" | "7dias"

type QueueClient = {
  id: string
  name: string
  phone: string | null
  due_date: string
  plan_value: number
  screens: number | null
  status: string
  client_services?: { services: { id: string; name: string; cost: number } | null }[]
  diffDays: number
}

const UNDO_DELAY_MS = 6000

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [executive, setExecutive] = useState<ExecutiveDashboardDTO | null>(null)
  const [executivePeriod, setExecutivePeriod] = useState<ExecutivePeriod>("month")
  const [upgradeRequired, setUpgradeRequired] = useState(false)
  const [clientsList, setClientsList] = useState<QueueClient[]>([])
  const [servicesList, setServicesList] = useState<any[]>([])
  const [automations, setAutomations] = useState<{ id: string; alert_type: string }[]>([])
  const [basicPayments, setBasicPayments] = useState({ count: 0, total: 0 })

  const [queueFilter, setQueueFilter] = useState<QueueFilter>("vencidos")
  const [chargingIds, setChargingIds] = useState<Set<string>>(new Set())
  const pendingCharges = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const queueSectionRef = useRef<HTMLDivElement>(null)

  // Dialogs
  const [isAddClientOpen, setIsAddClientOpen] = useState(false)
  const [isRenewDialogOpen, setIsRenewDialogOpen] = useState(false)
  const [actionClient, setActionClient] = useState<any | null>(null)

  const { displayValue } = usePrivacy()
  const hasAdvancedFinance = usePlanCapability('finance_advanced')
  const confirm = useConfirm()
  const supabase = createClient()
  const router = useRouter()

  const loadDashboardData = async () => {
    try {
      if (hasAdvancedFinance) {
        const executiveResponse = await fetch(`/api/executive-dashboard?period=${executivePeriod}`)
        const executivePayload = await executiveResponse.json()
        if (executiveResponse.ok) {
          const executiveData = executivePayload as ExecutiveDashboardDTO
          setExecutive(executiveData)
          setUpgradeRequired(false)
        } else if (executiveResponse.status === 403 && executivePayload.upgrade_required) {
          setExecutive(null)
          setUpgradeRequired(true)
        }
      } else {
        setExecutive(null)
        setUpgradeRequired(true)
      }

      // Clientes para a fila de cobrança
      const { data: clientsData } = await supabase
        .from("clients")
        .select(`
          id, name, phone, due_date, plan_value, screens, status,
          client_services(services(id, name, cost))
        `)
        .neq("status", "inactive")
        .order("due_date", { ascending: true })

      if (clientsData) {
        const today = startOfToday()
        setClientsList(
          clientsData.map((c: any) => ({
            ...c,
            diffDays: diffInDays(today, c.due_date),
          }))
        )
      }

      const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const { data: paymentsData } = await supabase.from('payments')
        .select('amount_paid').gte('created_at', firstDayOfMonth)
      if (paymentsData) {
        setBasicPayments({
          count: paymentsData.length,
          total: paymentsData.reduce((total, payment) => total + Number(payment.amount_paid || 0), 0),
        })
      }

      // Serviços (para o dialog de novo cliente)
      const { data: servicesData } = await supabase.from("services").select("id, name, cost, plans")
      if (servicesData) setServicesList(servicesData)

      // Regras de automação ativas
      const { data: rulesData } = await supabase
        .from("automations")
        .select("id, alert_type")
        .eq("is_active", true)
        .in("alert_type", ["before_due", "on_due", "after_due"])
      if (rulesData) setAutomations(rulesData)

    } catch (error) {
      console.error("Error loading dashboard data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadDashboardData()
    const pending = pendingCharges.current
    return () => {
      pending.forEach((t) => clearTimeout(t))
    }
  }, [executivePeriod, hasAdvancedFinance])

  // --- Fila de cobrança ---
  const vencidos = clientsList.filter((c) => c.diffDays < 0)
  const vencemHoje = clientsList.filter((c) => c.diffDays === 0)
  const proximos7 = clientsList.filter((c) => c.diffDays > 0 && c.diffDays <= 7)
  const overdueTotal = vencidos.reduce((total, client) => total + Number(client.plan_value || 0), 0)

  const queueMap: Record<QueueFilter, QueueClient[]> = {
    vencidos,
    hoje: vencemHoje,
    "7dias": proximos7,
  }
  const queue = queueMap[queueFilter]

  const revealQueue = (filter: QueueFilter) => {
    setQueueFilter(filter)
    window.requestAnimationFrame(() => {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      queueSectionRef.current?.scrollIntoView({ behavior, block: "start" })
      queueSectionRef.current?.focus({ preventScroll: true })
    })
  }

  const revealRiskClients = () => revealQueue("vencidos")

  const prazoLabel = (diff: number) => {
    if (diff === -1) return "ontem"
    if (diff < 0) return `há ${Math.abs(diff)} dias`
    if (diff === 0) return "vence hoje"
    if (diff === 1) return "amanhã"
    return `em ${diff} dias`
  }
  const prazoColor = (diff: number) =>
    diff < 0 ? "text-danger" : diff === 0 ? "text-warning-fg" : "text-muted-foreground"
  const dotColor = (diff: number) =>
    diff < 0 ? "bg-danger" : diff === 0 ? "bg-warning" : "bg-muted-foreground"

  const clientSubtitle = (c: QueueClient) => {
    const service = c.client_services?.[0]?.services?.name || "Sem serviço"
    const telas = c.screens ? ` · ${c.screens} tela${c.screens > 1 ? "s" : ""}` : ""
    return `${service}${telas}`
  }

  const pickRule = (diff: number) => {
    const type = diff < 0 ? "after_due" : diff === 0 ? "on_due" : "before_due"
    return automations.find((a) => a.alert_type === type) || automations[0]
  }

  const sendCharge = async (client: QueueClient) => {
    const rule = pickRule(client.diffDays)
    const res = await fetch("/api/evolution/send-instant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: client.id, ruleId: rule?.id }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Falha no envio")
  }

  const handleCobrar = (client: QueueClient) => {
    if (!client.phone) {
      toast.error(`${client.name} não possui WhatsApp cadastrado.`)
      return
    }
    if (automations.length === 0) {
      toast.error("Nenhuma regra de automação ativa.", {
        action: { label: "Criar regra", onClick: () => router.push("/automacao") },
      })
      return
    }
    if (chargingIds.has(client.id)) return

    setChargingIds((prev) => new Set(prev).add(client.id))

    const timeoutId = setTimeout(async () => {
      pendingCharges.current.delete(client.id)
      try {
        await sendCharge(client)
        toast.success(`Cobrança enviada para ${client.name}.`)
      } catch (e: any) {
        toast.error(`Falha ao cobrar ${client.name}: ${e.message}`)
      } finally {
        setChargingIds((prev) => {
          const next = new Set(prev)
          next.delete(client.id)
          return next
        })
      }
    }, UNDO_DELAY_MS)

    pendingCharges.current.set(client.id, timeoutId)

    toast(`Cobrança para ${client.name}`, {
      description: "A mensagem será enviada pelo WhatsApp.",
      duration: UNDO_DELAY_MS,
      action: {
        label: "Desfazer",
        onClick: () => {
          const t = pendingCharges.current.get(client.id)
          if (t) clearTimeout(t)
          pendingCharges.current.delete(client.id)
          setChargingIds((prev) => {
            const next = new Set(prev)
            next.delete(client.id)
            return next
          })
          toast.info("Cobrança cancelada.")
        },
      },
    })
  }

  const handleCobrarTodos = async () => {
    const targets = queue.filter((c) => c.phone)
    if (targets.length === 0) {
      toast.info("Nenhum cliente com WhatsApp nesta fila.")
      return
    }
    if (automations.length === 0) {
      toast.error("Nenhuma regra de automação ativa.", {
        action: { label: "Criar regra", onClick: () => router.push("/automacao") },
      })
      return
    }
    const ok = await confirm({
      title: `Cobrar ${targets.length} cliente${targets.length > 1 ? "s" : ""}?`,
      description: "Cada um recebe a mensagem da regra de automação correspondente no WhatsApp.",
    })
    if (!ok) return

    setChargingIds(new Set(targets.map((t) => t.id)))
    let sent = 0
    let failed = 0
    for (const client of targets) {
      try {
        await sendCharge(client)
        sent++
      } catch {
        failed++
      }
    }
    setChargingIds(new Set())
    if (failed === 0) toast.success(`${sent} cobranças enviadas.`)
    else toast.warning(`${sent} enviadas · ${failed} falharam.`)
  }

  // --- Renderização ---
  const now = new Date()
  const weekday = now.toLocaleDateString("pt-BR", { weekday: "long" }).replace(/^./, (c) => c.toUpperCase()).split("-")[0]
  const dayMonth = now.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })

  const segments: { key: QueueFilter; label: string; count: number }[] = [
    { key: "vencidos", label: "Vencidos", count: vencidos.length },
    { key: "hoje", label: "Hoje", count: vencemHoje.length },
    { key: "7dias", label: "7 dias", count: proximos7.length },
  ]
  const selectedQueue = segments.find((segment) => segment.key === queueFilter) || segments[0]
  const selectedQueueAmount = queue.reduce((total, client) => total + Number(client.plan_value || 0), 0)
  const selectedQueueContacts = queue.filter((client) => client.phone).length

  const activeClientsCount = clientsList.filter((client) => client.status === "active").length
  const sparkTotal = buildDueDaySpark(clientsList)
  const sparkActive = buildDueDaySpark(clientsList.filter((client) => client.status === "active"))
  const sparkOverdue = buildDueDaySpark(vencidos)
  const newClientsInPeriod = executive?.growth.new_clients
  const receivedInPeriod = executive?.summary.confirmed ?? basicPayments.total
  const dueTodayTotal = vencemHoje.reduce((total, client) => total + Number(client.plan_value || 0), 0)
  const nextSevenDaysTotal = proximos7.reduce((total, client) => total + Number(client.plan_value || 0), 0)
  const trackedReceivable = overdueTotal + dueTodayTotal + nextSevenDaysTotal
  const activeShare = clientsList.length > 0 ? (activeClientsCount / clientsList.length) * 100 : 0

  if (isLoading) {
    return <BrandLoader />
  }

  return (
    <PageShell>
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        <PainelHero
          eyebrow={`${weekday}, ${dayMonth}`}
          badge={hasAdvancedFinance ? "PRO" : undefined}
          trackedAmountLabel={String(displayValue(formatCurrency(trackedReceivable)))}
          overdueCount={vencidos.length}
          overdueAmountLabel={String(displayValue(formatCurrency(overdueTotal)))}
          dueTodayCount={vencemHoje.length}
          dueTodayAmountLabel={String(displayValue(formatCurrency(dueTodayTotal)))}
          confirmedAmountLabel={String(displayValue(formatCurrency(receivedInPeriod)))}
          actions={
            <>
              <PixRapidoModal>
                <Button variant="outline" className="gap-2 border-white/25 bg-transparent text-ink-fg hover:bg-white/10 hover:text-ink-fg">
                  <Zap className="size-4" aria-hidden="true" /> Gerar PIX
                </Button>
              </PixRapidoModal>
              <Button onClick={() => setIsAddClientOpen(true)} className="gap-2 bg-ink-fg text-ink hover:bg-ink-fg/90">
                <Plus className="size-4" aria-hidden="true" /> Novo cliente
              </Button>
            </>
          }
        />
      </div>

      <DashboardOverview
        totalClients={clientsList.length}
        activeClients={activeClientsCount}
        overdueClients={vencidos.length}
        activeShare={activeShare}
        overdueAmount={String(displayValue(formatCurrency(overdueTotal)))}
        newClients={newClientsInPeriod ?? null}
        previousNewClients={executive?.growth.previous_new_clients ?? null}
        dueTodayCount={vencemHoje.length}
        nextSevenDaysCount={proximos7.length}
        dueTodayAmount={String(displayValue(formatCurrency(dueTodayTotal)))}
        nextSevenDaysAmount={String(displayValue(formatCurrency(nextSevenDaysTotal)))}
        confirmedAmount={String(displayValue(formatCurrency(receivedInPeriod)))}
        trackedAmount={String(displayValue(formatCurrency(trackedReceivable)))}
        advancedFinance={hasAdvancedFinance && Boolean(executive)}
        period={executivePeriod}
        onPeriodChange={setExecutivePeriod}
        sparkTotal={sparkTotal}
        sparkActive={sparkActive}
        sparkOverdue={sparkOverdue}
        onOverdueOpen={() => revealQueue("vencidos")}
        onTodayOpen={() => revealQueue("hoje")}
        onNextSevenDaysOpen={() => revealQueue("7dias")}
      />

      <OnboardingProgress />

      <div ref={queueSectionRef} tabIndex={-1} className="scroll-mt-20 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
      <section className="flex flex-col gap-4" aria-labelledby="action-queue-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="action-queue-title" className="text-base font-semibold tracking-[-0.01em] text-foreground">Fila de ação</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">Resolva primeiro o que afeta receita e relacionamento com o cliente.</p>
          </div>
          {queue.length > 0 ? (
            <Button variant="outline" size="sm" onClick={handleCobrarTodos} className="h-[34px] gap-1.5 rounded-lg px-3 text-[11px] font-medium">
              <Send className="size-3" aria-hidden="true" /> Cobrar todos ({selectedQueueContacts})
            </Button>
          ) : null}
        </div>

        {queueFilter === "vencidos" && executive && Math.abs(executive.summary.at_risk - overdueTotal) > 0.01 ? (
          <div className="flex items-start gap-3 rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-xs text-warning-fg" role="note">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="leading-relaxed">
              <strong>{displayValue(formatCurrency(executive.summary.at_risk))} em risco executivo</strong> considera ciclos financeiros vencidos. A fila abaixo soma <strong>{displayValue(formatCurrency(overdueTotal))}</strong> em mensalidades atuais dos clientes vencidos; a diferença pode representar ciclos anteriores ou valores históricos ainda não conciliados.
            </p>
          </div>
        ) : null}
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.65fr)]">
          <div className="flex min-w-0 flex-col overflow-hidden border-t border-foreground">
            <div className="overflow-x-auto border-b border-border p-2">
              <div className="flex min-w-max items-center gap-1 rounded-lg bg-muted p-1 sm:w-fit sm:min-w-0">
                {segments.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setQueueFilter(s.key)}
                    aria-pressed={queueFilter === s.key}
                    className={cn(
                      "min-h-9 rounded-lg px-3 py-1.5 text-xs transition-all duration-200 motion-reduce:transition-none",
                      queueFilter === s.key
                        ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                        : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
                    )}
                  >
                    {s.label} · <span className="num">{s.count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="hidden items-center gap-3 border-b border-border px-4 py-2.5 font-mono text-[9px] font-medium uppercase tracking-[0.06em] text-muted-foreground xl:flex">
              <span className="min-w-[120px] flex-1">Cliente</span>
              <span className="min-w-[64px] text-right">Prazo</span>
              <span className="min-w-[64px] text-right">Valor</span>
              <span className="min-w-[132px] text-right">Ação</span>
            </div>

            <div className="max-h-[460px] overflow-y-auto">
              {queue.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-success-bg text-success-fg">
                    <CheckCircle2 className="size-5" aria-hidden="true" />
                  </span>
                  <p className="text-[13px] font-semibold text-foreground">
                    {queueFilter === "vencidos" ? "Nenhuma cobrança vencida" : queueFilter === "hoje" ? "Nenhum vencimento hoje" : "Nenhum vencimento nos próximos 7 dias"}
                  </p>
                  <p className="max-w-xs text-[11px] text-muted-foreground">Esta fila está em dia. Selecione outro período para continuar acompanhando.</p>
                </div>
              ) : (
                queue.map((client) => (
                  <div
                    key={client.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-[11px] transition-colors hover:bg-muted motion-reduce:transition-none"
                  >
                    <div className="flex min-w-[150px] flex-1 items-center gap-[11px]">
                      <span className={cn("size-[7px] shrink-0 rounded-full", dotColor(client.diffDays))} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-foreground">{client.name}</p>
                        <p className="mt-[3px] truncate text-xs text-muted-foreground">{clientSubtitle(client)}</p>
                      </div>
                    </div>
                    <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
                      <span className={cn("num min-w-[64px] whitespace-nowrap text-right text-[11px] font-medium", prazoColor(client.diffDays))}>
                        {prazoLabel(client.diffDays)}
                      </span>
                      <span className="num min-w-[64px] whitespace-nowrap text-right text-xs font-semibold text-foreground">
                        {displayValue(formatCurrency(client.plan_value))}
                      </span>
                      <div className="flex shrink-0 justify-end gap-1.5">
                        <Button
                          size="sm"
                          onClick={() => handleCobrar(client)}
                          disabled={chargingIds.has(client.id)}
                          className="h-8 rounded-[6px] px-3 text-[11px] font-semibold"
                        >
                          {chargingIds.has(client.id) ? "Enviando…" : "Cobrar"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setActionClient(client)
                            setIsRenewDialogOpen(true)
                          }}
                          className="h-8 rounded-[6px] px-3 text-[11px] font-medium"
                        >
                          Renovar
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <aside className="overflow-hidden rounded-lg border border-border bg-card">
            <div className={cn(
              "border-b border-border p-[18px]",
              queueFilter === "vencidos" ? "bg-danger-bg/45" : queueFilter === "hoje" ? "bg-warning-bg/45" : "bg-interactive-bg/45"
            )}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="microlabel">Fila selecionada</p>
                  <h3 className="mt-1 text-[13px] font-semibold text-foreground">{selectedQueue.label}</h3>
                </div>
                <span className={cn(
                  "flex size-[34px] shrink-0 items-center justify-center rounded-lg",
                  queue.length === 0
                    ? "bg-success-bg text-success-fg"
                    : queueFilter === "vencidos"
                      ? "bg-danger-bg text-danger-fg"
                      : queueFilter === "hoje"
                        ? "bg-warning-bg text-warning-fg"
                        : "bg-interactive-bg text-interactive-fg"
                )}>
                  {queue.length === 0 ? <CheckCircle2 className="size-[15px]" aria-hidden="true" /> : <CircleAlert className="size-[15px]" aria-hidden="true" />}
                </span>
              </div>
              <p className="num mt-6 text-[30px] font-semibold leading-none tracking-[-0.05em] text-foreground">{queue.length}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">cliente{queue.length === 1 ? "" : "s"} nesta prioridade</p>
              <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-border/70 pt-3">
                <span className="text-[10px] text-muted-foreground">Valor acompanhado</span>
                <span className="num text-[13px] font-semibold text-foreground">{displayValue(formatCurrency(selectedQueueAmount))}</span>
              </div>
            </div>

            <div className="p-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Trocar prioridade</p>
              <div className="mt-2.5 flex flex-col gap-2">
                {segments.map((segment) => (
                  <button
                    key={segment.key}
                    type="button"
                    onClick={() => setQueueFilter(segment.key)}
                    aria-pressed={queueFilter === segment.key}
                    className={cn(
                      "group flex min-h-11 w-full items-center gap-2.5 rounded-lg border px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                      queueFilter === segment.key
                        ? "border-interactive/30 bg-interactive-bg text-interactive-fg"
                        : "border-border bg-card text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <span className="min-w-0 flex-1 text-xs font-medium">{segment.label}</span>
                    <span className="num rounded-lg bg-card px-2 py-1 text-xs font-semibold text-foreground">{segment.count}</span>
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                  </button>
                ))}
              </div>

              <div className="mt-[18px] border-t border-border pt-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-success-bg text-success-fg"><Send className="size-3.5" aria-hidden="true" /></span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground">Automação de cobrança</p>
                      <p className="mt-px truncate text-[10px] text-muted-foreground">{automations.length} regra{automations.length === 1 ? "" : "s"} ativa{automations.length === 1 ? "" : "s"}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => router.push("/automacao")} className="min-h-9 rounded-lg px-2 text-[10px] font-semibold text-interactive-fg hover:bg-interactive-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Gerenciar
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>
      </div>

      {hasAdvancedFinance ? (
        upgradeRequired ? <ExecutiveUpgrade /> : executive ? (
          <ExecutiveDashboardView data={executive} period={executivePeriod} onRiskOpen={revealRiskClients} />
        ) : null
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted px-4 py-3 sm:flex-row sm:items-center">
          <p className="flex-1 text-xs leading-relaxed text-muted-foreground"><b className="text-interactive-fg">Visão básica ativa.</b> {basicPayments.count} pagamento{basicPayments.count === 1 ? "" : "s"} registrado{basicPayments.count === 1 ? "" : "s"} neste mês. Previsões, comparativos, MRR e indicadores de saúde financeira estão disponíveis no Pro.</p>
          <Button variant="outline" size="sm" onClick={() => router.push('/planos')} className="h-8 shrink-0 text-[11px]">Conhecer o Pro</Button>
        </div>
      )}

      <DueDateMap clients={clientsList} />

      {/* Dialogs */}
      <ClientFormDialog
        open={isAddClientOpen}
        onOpenChange={setIsAddClientOpen}
        client={null}
        servicesList={servicesList}
        onSuccess={loadDashboardData}
      />
      <RenewDialog
        open={isRenewDialogOpen}
        onOpenChange={setIsRenewDialogOpen}
        client={actionClient}
        onSuccess={loadDashboardData}
      />
    </PageShell>
  )
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function diffInDays(today: Date, dueDateStr: string) {
  const due = new Date(dueDateStr + "T00:00:00")
  return Math.round((due.getTime() - today.getTime()) / 86400000)
}

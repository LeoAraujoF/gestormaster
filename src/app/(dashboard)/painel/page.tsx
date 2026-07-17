"use client"

import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, CalendarClock, CheckCircle2, CircleAlert, CircleDollarSign, LayoutDashboard, Plus, Send, WalletCards, Zap } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { formatCurrency, cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { PixRapidoModal } from "@/components/pix-rapido-modal"
import { ClientFormDialog } from "@/components/client-form-dialog"
import { RenewDialog } from "@/components/client-action-dialogs"
import type { ExecutiveDashboardDTO, ExecutivePeriod } from "@/lib/executive-metrics"
import { usePrivacy } from "@/hooks/use-privacy"
import { Skeleton } from "@/components/ui/skeleton"
import { OnboardingProgress } from "@/components/onboarding-progress"
import { useConfirm } from "@/components/providers/confirm-provider"
import { ExecutiveDashboardView, ExecutiveUpgrade } from "@/components/executive-dashboard-view"
import { usePlanCapability } from "@/components/providers/plan-provider"
import { MetricGrid, PageSection, PageShell } from "@/components/page-layout"

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
  const [todayConfirmed, setTodayConfirmed] = useState(0)

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
          if (executivePeriod === "month" || executivePeriod === "30d") {
            setTodayConfirmed(executiveData.series.find((item) => item.date === localDateKey())?.confirmed ?? 0)
          }
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
  const upcomingTotal = proximos7.reduce((total, client) => total + Number(client.plan_value || 0), 0)

  const queueMap: Record<QueueFilter, QueueClient[]> = {
    vencidos,
    hoje: vencemHoje,
    "7dias": proximos7,
  }
  const queue = queueMap[queueFilter]

  const revealRiskClients = () => {
    setQueueFilter("vencidos")
    window.requestAnimationFrame(() => {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      queueSectionRef.current?.scrollIntoView({ behavior, block: "start" })
      queueSectionRef.current?.focus({ preventScroll: true })
    })
  }

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
    diff < 0 ? "bg-danger" : diff === 0 ? "bg-warning" : "bg-[#c9c8c2]"

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

  if (isLoading) {
    return (
      <PageShell>
        <Skeleton className="h-52 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-36 rounded-2xl" />)}
        </div>
        <Skeleton className="h-[380px] w-full rounded-2xl" />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <section className="animate-in fade-in slide-in-from-bottom-2 overflow-hidden rounded-2xl border border-border bg-card shadow-sm duration-500" aria-labelledby="dashboard-title">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-interactive-bg text-interactive-fg">
                <LayoutDashboard className="size-4" aria-hidden="true" />
              </span>
              <div>
                <p className="microlabel">{weekday}, {dayMonth}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <h1 id="dashboard-title" className="text-2xl font-semibold tracking-[-0.035em] text-foreground sm:text-3xl">Painel da operação</h1>
                  {hasAdvancedFinance ? <span className="rounded-md bg-interactive-bg px-2 py-1 text-[10px] font-semibold text-interactive-fg">PRO</span> : null}
                </div>
              </div>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Resultado financeiro, carteira e prioridades em uma leitura rápida para decidir o próximo passo.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <PixRapidoModal>
              <Button variant="outline" className="min-h-10 gap-2">
                <Zap className="size-4" aria-hidden="true" /> Gerar PIX
              </Button>
            </PixRapidoModal>
            <Button onClick={() => setIsAddClientOpen(true)} className="min-h-10 gap-2">
              <Plus className="size-4" aria-hidden="true" /> Novo cliente
            </Button>
          </div>
        </div>

        <div className="grid border-t border-border sm:grid-cols-2 xl:grid-cols-4">
          <HeroSignal
            icon={CircleDollarSign}
            label="Arrecadado hoje"
            value={hasAdvancedFinance ? displayValue(formatCurrency(todayConfirmed)) : "—"}
            hint={hasAdvancedFinance ? "Pagamentos confirmados hoje" : "Disponível na visão avançada"}
            tone="success"
          />
          <HeroSignal
            icon={WalletCards}
            label="Recebido neste mês"
            value={displayValue(formatCurrency(basicPayments.total))}
            hint={`${basicPayments.count} pagamentos neste mês`}
            tone="success"
          />
          <HeroSignal
            icon={CircleAlert}
            label="Exige atenção agora"
            value={displayValue(formatCurrency(overdueTotal))}
            hint={`${vencidos.length} cliente${vencidos.length === 1 ? "" : "s"} vencido${vencidos.length === 1 ? "" : "s"}`}
            tone={vencidos.length > 0 ? "danger" : "success"}
            onClick={vencidos.length > 0 ? revealRiskClients : undefined}
            actionLabel="Ver clientes vencidos em exige atenção agora"
          />
          <HeroSignal
            icon={CalendarClock}
            label="Próximos 7 dias"
            value={displayValue(formatCurrency(upcomingTotal))}
            hint={proximos7.length === 1 ? "1 renovação prevista" : `${proximos7.length} renovações previstas`}
            tone="warning"
          />
        </div>
      </section>

      <OnboardingProgress />

      <div ref={queueSectionRef} tabIndex={-1} className="scroll-mt-20 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
      <PageSection
        title="Fila de ação"
        description="Resolva primeiro o que afeta receita e relacionamento com o cliente."
        actions={
          queue.length > 0 ? (
            <Button variant="outline" size="sm" onClick={handleCobrarTodos} className="h-9 gap-2 text-xs">
              <Send className="size-3.5" aria-hidden="true" /> Cobrar todos ({queue.filter((client) => client.phone).length})
            </Button>
          ) : null
        }
      >
        {queueFilter === "vencidos" && executive && Math.abs(executive.summary.at_risk - overdueTotal) > 0.01 ? (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-xs text-warning-fg" role="note">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="leading-relaxed">
              <strong>{displayValue(formatCurrency(executive.summary.at_risk))} em risco executivo</strong> considera ciclos financeiros vencidos. A fila abaixo soma <strong>{displayValue(formatCurrency(overdueTotal))}</strong> em mensalidades atuais dos clientes vencidos; a diferença pode representar ciclos anteriores ou valores históricos ainda não conciliados.
            </p>
          </div>
        ) : null}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.65fr)]">
          <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto border-b border-border p-2">
              <div className="flex min-w-max items-center gap-1 rounded-xl bg-muted p-1 sm:min-w-0 sm:w-fit">
                {segments.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setQueueFilter(s.key)}
                    aria-pressed={queueFilter === s.key}
                    className={cn(
                      "min-h-9 rounded-lg px-3 py-1.5 text-xs transition-all duration-200",
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

            <div className="max-h-[460px] divide-y divide-border overflow-y-auto">
              {queue.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-success-bg text-success-fg">
                    <CheckCircle2 className="size-5" aria-hidden="true" />
                  </span>
                  <p className="text-sm font-semibold text-foreground">
                    {queueFilter === "vencidos" ? "Nenhuma cobrança vencida" : queueFilter === "hoje" ? "Nenhum vencimento hoje" : "Nenhum vencimento nos próximos 7 dias"}
                  </p>
                  <p className="max-w-sm text-xs text-muted-foreground">Esta fila está em dia. Selecione outro período para continuar acompanhando.</p>
                </div>
              ) : (
                queue.map((client) => (
                  <div
                    key={client.id}
                    className="group flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-muted/70 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl", client.diffDays < 0 ? "bg-danger-bg text-danger-fg" : client.diffDays === 0 ? "bg-warning-bg text-warning-fg" : "bg-secondary text-secondary-foreground")}>
                        <span className={cn("status-dot", dotColor(client.diffDays))} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold leading-tight text-foreground">{client.name}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{clientSubtitle(client)}</p>
                      </div>
                      <div className="shrink-0 text-right sm:hidden">
                        <p className="num whitespace-nowrap text-xs font-semibold text-foreground">{displayValue(formatCurrency(client.plan_value))}</p>
                        <p className={cn("mt-1 text-[11px] font-medium", prazoColor(client.diffDays))}>{prazoLabel(client.diffDays)}</p>
                      </div>
                    </div>
                    <span className={cn("hidden shrink-0 text-[11px] font-medium sm:block", prazoColor(client.diffDays))}>
                      {prazoLabel(client.diffDays)}
                    </span>
                    <span className="num shrink-0 whitespace-nowrap text-xs font-medium text-foreground">
                      {displayValue(formatCurrency(client.plan_value))}
                    </span>
                    <div className="grid w-full shrink-0 grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
                      <Button
                        size="sm"
                        onClick={() => handleCobrar(client)}
                        disabled={chargingIds.has(client.id)}
                        className="h-9 rounded-lg px-3 text-xs sm:h-8"
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
                        className="h-9 rounded-lg px-3 text-xs sm:h-8"
                      >
                        Renovar
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <aside className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <p className="microlabel">Ações rápidas</p>
            <h3 className="mt-1 text-sm font-semibold text-foreground">Continue a operação</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Atalhos para as tarefas mais frequentes do dia.</p>

            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={() => setIsAddClientOpen(true)}
                className="group flex min-h-12 w-full items-center gap-3 rounded-xl border border-input px-3 text-left transition-all hover:border-foreground/25 hover:bg-muted"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-interactive-bg text-interactive-fg"><Plus className="size-4" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-foreground">Adicionar cliente</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">Cadastre uma nova assinatura</span></span>
                <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
              <PixRapidoModal>
                <button className="group flex min-h-12 w-full items-center gap-3 rounded-xl border border-input px-3 text-left transition-all hover:border-foreground/25 hover:bg-muted">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-success-bg text-success-fg"><Zap className="size-4" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-foreground">Gerar PIX rápido</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">Crie uma cobrança avulsa</span></span>
                  <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </button>
              </PixRapidoModal>
              <button
                type="button"
                onClick={() => router.push("/automacao")}
                className="group flex min-h-12 w-full items-center gap-3 rounded-xl border border-input px-3 text-left transition-all hover:border-foreground/25 hover:bg-muted"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning-bg text-warning-fg"><Send className="size-4" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-foreground">Abrir automação</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">Revise regras e entregas</span></span>
                <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 border-t border-border pt-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Resumo da fila</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {segments.map((segment) => (
                  <button key={segment.key} type="button" onClick={() => setQueueFilter(segment.key)} className="rounded-lg bg-muted p-2 text-center transition-colors hover:bg-secondary" aria-label={`Ver ${segment.label.toLowerCase()}`}>
                    <span className="num block text-base font-semibold text-foreground">{segment.count}</span>
                    <span className="mt-0.5 block text-[9px] text-muted-foreground">{segment.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </PageSection>
      </div>

      {hasAdvancedFinance ? (
        upgradeRequired ? <ExecutiveUpgrade /> : executive ? <ExecutiveDashboardView data={executive} period={executivePeriod} onPeriodChange={setExecutivePeriod} onRiskOpen={revealRiskClients} /> : null
      ) : (
        <>
          <MetricGrid columns={4}>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="microlabel">Recebido no mês</p>
              <p className="num mt-2 text-xl font-semibold text-money">{displayValue(formatCurrency(basicPayments.total))}</p>
              <p className="mt-1 text-xs text-muted-foreground">{basicPayments.count} pagamentos confirmados</p>
            </div>
            <div className="rounded-xl border border-danger-border bg-danger-bg/50 p-4">
              <p className="microlabel">Valor vencido</p>
              <p className="num mt-2 text-xl font-semibold text-danger">{displayValue(formatCurrency(overdueTotal))}</p>
              <p className="mt-1 text-xs text-danger-fg">{vencidos.length} clientes exigem atenção</p>
            </div>
            <div className="rounded-xl border border-warning-border bg-warning-bg/40 p-4">
              <p className="microlabel">A receber em 7 dias</p>
              <p className="num mt-2 text-xl font-semibold text-warning-fg">{displayValue(formatCurrency(upcomingTotal))}</p>
              <p className="mt-1 text-xs text-warning-fg">{proximos7.length} renovações previstas</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="microlabel">Vencem hoje</p>
              <p className="num mt-2 text-xl font-semibold">{vencemHoje.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">clientes para acompanhar</p>
            </div>
          </MetricGrid>
          <div className="flex flex-col gap-3 rounded-xl border border-accent bg-interactive-bg px-4 py-3 sm:flex-row sm:items-center">
            <p className="flex-1 text-xs leading-relaxed text-muted-foreground"><b className="text-interactive-fg">Visão básica ativa.</b> Previsões, comparativos, MRR e indicadores de saúde financeira estão disponíveis no Pro.</p>
            <Button variant="outline" size="sm" onClick={() => router.push('/planos')} className="h-8 text-xs">Conhecer o Pro</Button>
          </div>
        </>
      )}

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

function HeroSignal({ icon: Icon, label, value, hint, tone, onClick, actionLabel }: {
  icon: typeof WalletCards
  label: string
  value: ReactNode
  hint: string
  tone: "success" | "danger" | "warning"
  onClick?: () => void
  actionLabel?: string
}) {
  const toneClasses = {
    success: "bg-success-bg text-success-fg",
    danger: "bg-danger-bg text-danger-fg",
    warning: "bg-warning-bg text-warning-fg",
  }
  const valueClasses = {
    success: "text-money",
    danger: "text-danger",
    warning: "text-warning-fg",
  }

  const content = (
    <>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", toneClasses[tone])}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-medium uppercase tracking-[0.07em] text-muted-foreground">{label}</p>
        <p className={cn("num mt-1 truncate text-base font-semibold", valueClasses[tone])}>{value}</p>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{hint}</p>
      </div>
      {onClick ? <ArrowRight className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" /> : null}
    </>
  )

  const className = "group flex min-w-0 items-center gap-3 border-b border-border p-4 text-left last:border-b-0 transition-colors sm:px-5 xl:border-b-0 xl:border-r xl:last:border-r-0"

  if (onClick) {
    return <button type="button" onClick={onClick} aria-label={actionLabel || label} className={cn(className, "hover:bg-muted/70")}>{content}</button>
  }

  return <div className={className}>{content}</div>
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

function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

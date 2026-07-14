"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Zap, Send, CheckCircle2 } from "lucide-react"
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
          setExecutive(executivePayload as ExecutiveDashboardDTO)
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
      <div className="space-y-6 pb-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Bloco 1: Visão Geral Premium */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-3">
        <div>
          <h1 className="text-[19px] font-semibold tracking-[-0.02em] text-foreground">
            {weekday}, {dayMonth}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Centro de Controle Financeiro
          </p>
        </div>
      </div>

      <OnboardingProgress />
      {hasAdvancedFinance ? (
        upgradeRequired ? <ExecutiveUpgrade /> : executive ? <ExecutiveDashboardView data={executive} period={executivePeriod} onPeriodChange={setExecutivePeriod} /> : null
      ) : (
        <>
          <div className="grid grid-cols-2 rounded-lg border border-border bg-card md:grid-cols-4 md:divide-x md:divide-border">
            <div className="p-4">
              <p className="microlabel">Recebido no mês</p>
              <p className="num mt-1 text-[18px] font-semibold text-money">{displayValue(formatCurrency(basicPayments.total))}</p>
              <p className="mt-0.5 text-[10.5px] text-muted-foreground">{basicPayments.count} pagamentos</p>
            </div>
            <div className="p-4">
              <p className="microlabel">A receber (7d)</p>
              <p className="num mt-1 text-[18px] font-semibold text-warning">{displayValue(formatCurrency(upcomingTotal))}</p>
              <p className="mt-0.5 text-[10.5px] text-muted-foreground">{proximos7.length} renovações</p>
            </div>
            <div className="p-4">
              <p className="microlabel">Valor vencido</p>
              <p className="num mt-1 text-[18px] font-semibold text-danger">{displayValue(formatCurrency(overdueTotal))}</p>
              <p className="mt-0.5 text-[10.5px] text-muted-foreground">{vencidos.length} clientes</p>
            </div>
            <div className="p-4">
              <p className="microlabel">Vencem hoje</p>
              <p className="num mt-1 text-[18px] font-semibold">{vencemHoje.length}</p>
              <p className="mt-0.5 text-[10.5px] text-muted-foreground">clientes para acompanhar</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-accent bg-interactive-bg px-4 py-3 sm:flex-row sm:items-center">
            <p className="flex-1 text-[11.5px] text-muted-foreground"><b className="text-interactive-fg">Visão básica ativa.</b> Previsões, comparativos, MRR e indicadores de saúde financeira estão no Pro.</p>
            <Button variant="outline" size="sm" onClick={() => router.push('/planos')} className="h-8 text-xs">Conhecer o Pro</Button>
          </div>
        </>
      )}

      {/* Ações Rápidas */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          onClick={() => setIsAddClientOpen(true)}
          className="flex h-11 items-center justify-center gap-2 rounded-lg border border-dashed border-input text-xs font-medium text-secondary-foreground transition-colors hover:border-foreground/30 hover:bg-muted"
        >
          <Plus className="size-3.5" /> Novo cliente
        </button>
        <PixRapidoModal>
          <button className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-input text-xs font-medium text-secondary-foreground transition-colors hover:border-foreground/30 hover:bg-muted">
            <Zap className="size-3.5" /> PIX rápido
          </button>
        </PixRapidoModal>
        <button
          onClick={() => router.push("/automacao")}
          className="flex h-11 items-center justify-center gap-2 rounded-lg border border-dashed border-input text-xs font-medium text-secondary-foreground transition-colors hover:border-foreground/30 hover:bg-muted"
        >
          <Send className="size-3.5" /> Disparo em massa
        </button>
      </div>

      <div>

          {/* Fila Operacional */}
          <div className="flex flex-col rounded-lg border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="flex items-center gap-0.5 rounded-md bg-secondary p-0.5">
                {segments.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setQueueFilter(s.key)}
                    className={cn(
                      "rounded-[5px] px-2.5 py-1 text-xs transition-colors",
                      queueFilter === s.key
                        ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                        : "text-secondary-foreground hover:text-foreground"
                    )}
                  >
                    {s.label} · <span className="num">{s.count}</span>
                  </button>
                ))}
              </div>
              {queue.length > 0 && (
                <button
                  onClick={handleCobrarTodos}
                  className="text-xs font-medium text-interactive hover:underline"
                >
                  Cobrar todos →
                </button>
              )}
            </div>

            <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
              {queue.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-14 text-center">
                  <p className="microlabel">
                    {queueFilter === "vencidos" ? "Sem vencidos" : queueFilter === "hoje" ? "Nada vence hoje" : "Nada nos próximos 7 dias"}{" "}
                    <CheckCircle2 className="size-4 text-money inline ml-1" />
                  </p>
                </div>
              ) : (
                queue.map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted"
                  >
                    <span className={cn("status-dot", dotColor(client.diffDays))} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold leading-tight text-foreground">
                        {client.name}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">{clientSubtitle(client)}</p>
                    </div>
                    <span className={cn("hidden shrink-0 text-[11px] font-medium sm:block", prazoColor(client.diffDays))}>
                      {prazoLabel(client.diffDays)}
                    </span>
                    <span className="num shrink-0 whitespace-nowrap text-xs font-medium text-foreground">
                      {displayValue(formatCurrency(client.plan_value))}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        size="sm"
                        onClick={() => handleCobrar(client)}
                        disabled={chargingIds.has(client.id)}
                        className="h-7 rounded-md px-2.5 text-xs"
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
                        className="h-7 rounded-md px-2.5 text-xs"
                      >
                        Renovar
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
      </div>

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
    </div>
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

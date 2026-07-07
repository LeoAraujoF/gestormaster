"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Zap, Send } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { formatCurrency, cn } from "@/lib/utils"
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis } from "recharts"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { PixRapidoModal } from "@/components/pix-rapido-modal"
import { ClientFormDialog } from "@/components/client-form-dialog"
import { RenewDialog } from "@/components/client-action-dialogs"
import type { DashboardMetrics } from "@/types/database"
import { usePrivacy } from "@/hooks/use-privacy"
import { Skeleton } from "@/components/ui/skeleton"
import { OnboardingProgress } from "@/components/onboarding-progress"
import { useConfirm } from "@/components/providers/confirm-provider"

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

type DayEarning = { day: string; net: number; isToday: boolean }
type TodayPayment = { id: string; amount_paid: number; clientName: string }

const UNDO_DELAY_MS = 6000

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [clientsList, setClientsList] = useState<QueueClient[]>([])
  const [servicesList, setServicesList] = useState<any[]>([])
  const [automations, setAutomations] = useState<{ id: string; alert_type: string }[]>([])
  const [todayMetrics, setTodayMetrics] = useState({ gross: 0, cost: 0, net: 0 })
  const [todayPayments, setTodayPayments] = useState<TodayPayment[]>([])
  const [weekEarnings, setWeekEarnings] = useState<DayEarning[]>([])

  const [queueFilter, setQueueFilter] = useState<QueueFilter>("vencidos")
  const [chargingIds, setChargingIds] = useState<Set<string>>(new Set())
  const pendingCharges = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Dialogs
  const [isAddClientOpen, setIsAddClientOpen] = useState(false)
  const [isRenewDialogOpen, setIsRenewDialogOpen] = useState(false)
  const [actionClient, setActionClient] = useState<any | null>(null)

  const { displayValue } = usePrivacy()
  const confirm = useConfirm()
  const supabase = createClient()
  const router = useRouter()

  const loadDashboardData = async () => {
    try {
      // Métricas principais (RPC existente)
      const { data: metricsData } = await supabase.rpc("get_dashboard_metrics")
      if (metricsData && metricsData.length > 0) setMetrics(metricsData[0])

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

      // Serviços (para o dialog de novo cliente)
      const { data: servicesData } = await supabase.from("services").select("id, name, cost")
      if (servicesData) setServicesList(servicesData)

      // Regras de automação ativas (template usado pelo botão Cobrar)
      const { data: rulesData } = await supabase
        .from("automations")
        .select("id, alert_type")
        .eq("is_active", true)
        .in("alert_type", ["before_due", "on_due", "after_due"])
      if (rulesData) setAutomations(rulesData)

      // Pagamentos dos últimos 7 dias (Ganho do Dia + mini gráfico)
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 6)
      weekAgo.setHours(0, 0, 0, 0)

      const { data: weekPayments } = await supabase
        .from("payments")
        .select("amount_paid, net_profit, created_at, clients(name)")
        .gte("created_at", weekAgo.toISOString())
        .order("created_at", { ascending: true })

      if (weekPayments) {
        const todayKey = new Date().toDateString()

        // Ganho do dia (bruto/custo/líquido)
        const paymentsToday = weekPayments.filter(
          (p: any) => new Date(p.created_at).toDateString() === todayKey
        )
        const gross = paymentsToday.reduce((acc: number, p: any) => acc + (p.amount_paid || 0), 0)
        const net = paymentsToday.reduce((acc: number, p: any) => acc + (p.net_profit || 0), 0)
        setTodayMetrics({ gross, cost: gross - net, net })
        setTodayPayments(
          paymentsToday.map((p: any, i: number) => ({
            id: `${i}`,
            amount_paid: p.amount_paid || 0,
            clientName: p.clients?.name || "Cliente",
          }))
        )

        // Barras: 7 dias, última (hoje) em verde
        const days: DayEarning[] = []
        for (let i = 6; i >= 0; i--) {
          const d = new Date()
          d.setDate(d.getDate() - i)
          const key = d.toDateString()
          const dayNet = weekPayments
            .filter((p: any) => new Date(p.created_at).toDateString() === key)
            .reduce((acc: number, p: any) => acc + (p.net_profit || 0), 0)
          days.push({
            day: d.toLocaleDateString("pt-BR", { day: "2-digit" }),
            net: Math.max(0, dayNet),
            isToday: i === 0,
          })
        }
        setWeekEarnings(days)
      }
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
      // Cancela envios pendentes ao sair da página (o Desfazer deixa de existir)
      pending.forEach((t) => clearTimeout(t))
    }
  }, [])

  // --- Fila de cobrança ---
  const vencidos = clientsList.filter((c) => c.diffDays < 0)
  const vencemHoje = clientsList.filter((c) => c.diffDays === 0)
  const proximos7 = clientsList.filter((c) => c.diffDays > 0 && c.diffDays <= 7)

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

  // Regra compatível com o estado do cliente (template da mensagem de cobrança)
  const pickRule = (diff: number) => {
    const type = diff < 0 ? "after_due" : diff === 0 ? "on_due" : "before_due"
    return automations.find((a) => a.alert_type === type) || automations[0]
  }

  const sendCharge = async (client: QueueClient) => {
    const rule = pickRule(client.diffDays)
    const res = await fetch("/api/evolution/send-instant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: client.id, ruleId: rule.id }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Falha no envio")
  }

  // Cobrar com Desfazer: agenda o envio em 6s; o toast permite cancelar antes de ir
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

  // Cobrar todos: confirmação simples (não-destrutiva), envio sequencial
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

  // --- Cabeçalho ---
  const now = new Date()
  const weekday = now.toLocaleDateString("pt-BR", { weekday: "long" }).replace(/^./, (c) => c.toUpperCase()).split("-")[0]
  const dayMonth = now.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })

  const defaultMetrics: DashboardMetrics = {
    total_active_clients: 0,
    total_inactive_clients: 0,
    total_pending_clients: 0,
    total_clients: 0,
    monthly_revenue: 0,
    monthly_costs: 0,
    monthly_net_revenue: 0,
    total_vencido_clients: 0,
  }
  const m = metrics || defaultMetrics

  const segments: { key: QueueFilter; label: string; count: number }[] = [
    { key: "vencidos", label: "Vencidos", count: vencidos.length },
    { key: "hoje", label: "Hoje", count: vencemHoje.length },
    { key: "7dias", label: "7 dias", count: proximos7.length },
  ]

  return (
    <div className="space-y-5 pb-10">
      {/* Cabeçalho: dia + resumo da fila */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {isLoading ? (
          <Skeleton className="h-6 w-64" />
        ) : (
          <>
            <h1 className="text-[17px] font-semibold tracking-[-0.02em] text-foreground">
              {weekday}, {dayMonth}
            </h1>
            <p className="text-xs text-muted-foreground">
              {vencidos.length} vencido{vencidos.length !== 1 && "s"} · {vencemHoje.length} vence
              {vencemHoje.length === 1 ? "" : "m"} hoje
            </p>
          </>
        )}
      </div>

      <OnboardingProgress />

      {/* Régua de KPIs: card único dividido por hairlines */}
      {isLoading ? (
        <Skeleton className="h-[84px] w-full rounded-lg" />
      ) : (
        <div className="grid grid-cols-2 rounded-lg border border-border bg-card md:grid-cols-4 md:divide-x md:divide-border">
          <div className="p-4">
            <p className="microlabel">Ativos</p>
            <p className="num mt-1 text-[22px] font-semibold tracking-[-0.02em] text-foreground">
              {m.total_active_clients}
            </p>
          </div>
          <div className="p-4">
            <p className="microlabel">Vencem em 7d</p>
            <p className="num mt-1 text-[22px] font-semibold tracking-[-0.02em] text-warning">
              {proximos7.length}
            </p>
          </div>
          <div className="p-4">
            <p className="microlabel">Vencidos</p>
            <p className="num mt-1 text-[22px] font-semibold tracking-[-0.02em] text-danger">
              {vencidos.length}
            </p>
          </div>
          <div className="p-4">
            <p className="microlabel">Lucro do mês</p>
            <p className="num mt-1 whitespace-nowrap text-[22px] font-semibold tracking-[-0.02em] text-money">
              {displayValue(formatCurrency(m.monthly_net_revenue))}
            </p>
          </div>
        </div>
      )}

      {/* Fila de cobrança + Ganho do dia */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_232px]">
        {/* Fila */}
        <div className="flex flex-col rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            {/* Filtro segmentado */}
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

          {/* Linhas da fila */}
          <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-1.5 w-1.5 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-36" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-3.5 w-16" />
                  <Skeleton className="h-7 w-16 rounded-md" />
                  <Skeleton className="h-7 w-16 rounded-md" />
                </div>
              ))
            ) : queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-14 text-center">
                <p className="microlabel">
                  {queueFilter === "vencidos" ? "Sem vencidos" : queueFilter === "hoje" ? "Nada vence hoje" : "Nada nos próximos 7 dias"}{" "}
                  <span className="text-money">✓</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {queueFilter === "vencidos"
                    ? "Tudo em dia. Nenhuma cobrança pendente."
                    : "Nenhum cliente neste período."}
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

        {/* Ganho do dia */}
        <div className="flex flex-col rounded-lg border border-border bg-card p-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <>
              <p className="microlabel">Ganho do dia</p>
              <p className="num mt-1 whitespace-nowrap text-[24px] font-semibold tracking-[-0.02em] text-money">
                {displayValue(formatCurrency(todayMetrics.net))}
              </p>
              <p className="num mt-0.5 text-[10.5px] text-muted-foreground">
                bruto {displayValue(formatCurrency(todayMetrics.gross))} · custo{" "}
                {displayValue(formatCurrency(todayMetrics.cost))}
              </p>

              {/* Mini gráfico: 7 dias, hoje em verde */}
              <div className="mt-3 h-16">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekEarnings} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="day" hide />
                    <Bar dataKey="net" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                      {weekEarnings.map((d, i) => (
                        <Cell key={i} fill={d.isToday ? "var(--money)" : "var(--secondary)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <p className="microlabel">Recebidos hoje</p>
                {todayPayments.length === 0 ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">Nenhum recebimento ainda.</p>
                ) : (
                  <div className="mt-1.5 space-y-1">
                    {todayPayments.slice(0, 6).map((p) => (
                      <div key={p.id} className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-xs text-foreground">{p.clientName}</span>
                        <span className="num shrink-0 text-[11px] font-medium text-money">
                          +{displayValue(
                            (p.amount_paid).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Ações rápidas */}
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
          onClick={() => router.push("/leads")}
          className="flex h-11 items-center justify-center gap-2 rounded-lg border border-dashed border-input text-xs font-medium text-secondary-foreground transition-colors hover:border-foreground/30 hover:bg-muted"
        >
          <Send className="size-3.5" /> Disparo em massa
        </button>
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

// --- Datas (comparação por dia local, sem fuso) ---
function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function diffInDays(today: Date, dueDateStr: string) {
  const due = new Date(dueDateStr + "T00:00:00")
  return Math.round((due.getTime() - today.getTime()) / 86400000)
}

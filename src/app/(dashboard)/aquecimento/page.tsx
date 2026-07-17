"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Activity, CheckCircle2, Flame, Loader2, Power, Smartphone, Wifi, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { cn, phoneMask } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AutomationNavigation } from "@/components/automation-navigation"
import { MetricGrid, PageHeader, PageSection, PageShell } from "@/components/page-layout"

const WARMUP_DAYS = 14

export default function AquecimentoPage() {
  const [instances, setInstances] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isToggling, setIsToggling] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    loadInstances()
  }, [])

  const loadInstances = async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data, error } = await supabase
        .from('evolution_instances')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      setInstances(data || [])
    } catch (e: any) {
      toast.error('Erro ao carregar instâncias: ' + e.message)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleWarmup = async (instanceId: string, currentStatus: boolean) => {
    setIsToggling(instanceId)
    try {
      const res = await fetch('/api/instances/warmup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_id: instanceId, is_warming_up: !currentStatus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setInstances(instances.map((inst) => (inst.id === instanceId ? { ...inst, is_warming_up: !currentStatus } : inst)))
      if (!currentStatus) toast.success('Aquecimento ativado para esta instância!')
      else toast.info('Aquecimento desativado.')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setIsToggling(null)
    }
  }

  const activeWarmups = instances.filter((i) => i.is_warming_up).length

  // Maturidade do chip: dias desde a criação (proxy de reputação), limitado a 14
  const chipDay = (createdAt: string) => {
    if (!createdAt) return 1
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000) + 1
    return Math.max(1, Math.min(days, WARMUP_DAYS))
  }
  // Limite seguro de envio escala com a maturidade (~10/dia no início → ~80/dia maduro)
  const safeSend = (day: number) => Math.round(10 + (day / WARMUP_DAYS) * 70)
  const connectedInstances = instances.filter(instance => instance.status === 'connected')
  const matureInstances = instances.filter(instance => chipDay(instance.created_at) >= WARMUP_DAYS)
  const averageMaturity = instances.length > 0
    ? Math.round(instances.reduce((sum, instance) => sum + (chipDay(instance.created_at) / WARMUP_DAYS) * 100, 0) / instances.length)
    : 0

  return (
    <PageShell width="default">
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5 text-warning-fg"><Flame className="size-3.5" aria-hidden="true" /> Saúde dos canais</span>}
        title="Aquecimento"
        description="Acompanhe a maturidade estimada de cada número e aumente o volume de mensagens gradualmente."
        badge={!isLoading && instances.length > 0 ? `${activeWarmups} aquecendo` : undefined}
        actions={<Button nativeButton={false} render={<Link href="/automacao" />} variant="outline" size="sm"><Wifi className="size-4" aria-hidden="true" /> Gerenciar conexões</Button>}
      />
      <AutomationNavigation active="warmup" />

      {!isLoading && instances.length > 0 && (
        <MetricGrid columns={4}>
          <WarmupMetric icon={Smartphone} label="Números cadastrados" value={String(instances.length)} hint={`${connectedInstances.length} conectados`} />
          <WarmupMetric icon={Flame} label="Em aquecimento" value={String(activeWarmups)} hint={activeWarmups >= 2 ? "Motor pronto para operar" : "Recomendado: pelo menos 2"} tone={activeWarmups >= 2 ? "success" : "warning"} />
          <WarmupMetric icon={Activity} label="Maturidade média" value={`${averageMaturity}%`} hint="Estimativa pela idade do cadastro" />
          <WarmupMetric icon={CheckCircle2} label="Números maduros" value={String(matureInstances.length)} hint={`de ${instances.length} cadastrados`} tone={matureInstances.length > 0 ? "success" : "neutral"} />
        </MetricGrid>
      )}

      {!isLoading && instances.length > 0 && activeWarmups < 2 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-xs text-warning-fg">
          <span className="status-dot bg-warning" />
          <div><p className="font-semibold">Ative pelo menos 2 números conectados</p><p className="mt-0.5 opacity-80">O motor de aquecimento precisa desse mínimo para funcionar. Números desconectados não podem ser ativados.</p></div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : instances.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-4 py-16 text-center shadow-sm">
          <span className="flex size-12 items-center justify-center rounded-xl bg-warning-bg text-warning-fg"><Smartphone className="size-6" aria-hidden="true" /></span>
          <h2 className="mt-4 font-semibold">Nenhum número cadastrado</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">Conecte um WhatsApp na Central de Automação para começar a acompanhar o aquecimento.</p>
          <Button nativeButton={false} className="mt-5" render={<Link href="/automacao" />}><Wifi className="size-4" aria-hidden="true" /> Conectar número</Button>
        </div>
      ) : (
        <PageSection title="Saúde por número" description="A maturidade é estimada pela idade do cadastro e serve como orientação operacional; ela não representa uma medição externa de reputação.">
        <div className="space-y-4">
          {instances.map((inst) => {
            const isConnected = inst.status === 'connected'
            const warming = inst.is_warming_up
            const day = chipDay(inst.created_at)
            const pct = Math.round((day / WARMUP_DAYS) * 100)
            const remaining = WARMUP_DAYS - day

            return (
              <div key={inst.id} className={cn("rounded-2xl border bg-card p-4 shadow-sm sm:p-5", isConnected ? "border-border" : "border-danger-border")}>
                {/* Cabeçalho da linha */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="num text-[13px] font-semibold text-foreground">
                      {inst.phone_number ? phoneMask(inst.phone_number) : inst.instance_name}
                      <span className="ml-1.5 font-sans text-[11px] font-normal text-muted-foreground">· {inst.instance_name}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Dia <span className="num">{day}</span> de {WARMUP_DAYS}
                      {!isConnected && <span className="text-danger"> · desconectado</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-start">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      <span className={cn("status-dot", !isConnected ? "bg-danger" : warming ? "bg-money" : "bg-warning")} />
                      <span className={!isConnected ? "text-danger-fg" : warming ? "text-money" : "text-warning-fg"}>{!isConnected ? "Desconectado" : warming ? "Aquecendo" : "Disponível"}</span>
                    </span>
                    <Button
                      variant={warming ? "outline" : "default"}
                      size="sm"
                      disabled={!isConnected || isToggling === inst.id}
                      onClick={() => toggleWarmup(inst.id, warming)}
                      className="h-9 rounded-md px-3 text-xs sm:h-8"
                    >
                      {isToggling === inst.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : warming ? (
                        <><Power className="mr-1 size-3" /> Parar</>
                      ) : (
                        <><Flame className="mr-1 size-3" /> Aquecer</>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Barra de progresso + par rotulado mono */}
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="microlabel">Maturidade estimada</span>
                    <span className="num text-[11px] font-semibold text-foreground">{pct}%</span>
                  </div>
                  <div role="progressbar" aria-label={`Maturidade estimada de ${inst.instance_name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn("h-full rounded-full", warming ? "bg-money" : "bg-warning")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Rodapé mono */}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-[11px] text-muted-foreground">
                  <span>
                    Limite estimado: <span className="num font-semibold text-foreground">~{safeSend(day)} msgs/dia</span>
                  </span>
                  {remaining > 0 ? (
                    <span>
                      Próximo nível: <span className="num font-semibold text-foreground">{remaining} dias</span>
                    </span>
                  ) : (
                    <span className="text-money">Chip maduro ✓</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        </PageSection>
      )}
    </PageShell>
  )
}

function WarmupMetric({ icon: Icon, label, value, hint, tone = "neutral" }: { icon: LucideIcon; label: string; value: string; hint: string; tone?: "neutral" | "warning" | "success" }) {
  const toneClass = tone === "warning" ? "bg-warning-bg text-warning-fg" : tone === "success" ? "bg-success-bg text-success-fg" : "bg-secondary text-secondary-foreground"
  return <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><p className="microlabel">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div><span className={`rounded-lg p-2 ${toneClass}`}><Icon className="size-4" aria-hidden="true" /></span></div>
  </div>
}

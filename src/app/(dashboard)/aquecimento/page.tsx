"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Loader2, Power, Flame } from "lucide-react"
import { toast } from "sonner"
import { cn, phoneMask } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

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

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[17px] font-semibold tracking-[-0.02em]">Aquecimento</h1>
            {!isLoading && instances.length > 0 && (
              <span className="flex items-center gap-1.5 text-xs">
                <span className={cn("status-dot", activeWarmups >= 2 ? "bg-money" : "bg-warning")} />
                <span className={activeWarmups >= 2 ? "text-money" : "text-warning-fg"}>
                  {activeWarmups} de {instances.length} aquecendo
                </span>
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Conversas simuladas entre seus números para criar reputação antes de disparar.
          </p>
        </div>
      </div>

      {activeWarmups > 0 && activeWarmups < 2 && (
        <div className="flex items-center gap-2.5 rounded-md border border-warning-border bg-warning-bg px-3 py-2.5 text-xs text-warning-fg">
          <span className="status-dot bg-warning" />
          Ative pelo menos <strong>2 números</strong> conectados para o motor de aquecimento funcionar.
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-[110px] w-full rounded-lg" />
          ))}
        </div>
      ) : instances.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-16 text-center">
          <p className="microlabel">Nenhum número cadastrado</p>
          <p className="text-xs text-muted-foreground">Conecte um WhatsApp em Automação para começar a aquecer.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {instances.map((inst) => {
            const isConnected = inst.status === 'connected'
            const warming = inst.is_warming_up
            const day = chipDay(inst.created_at)
            const pct = Math.round((day / WARMUP_DAYS) * 100)
            const remaining = WARMUP_DAYS - day

            return (
              <div key={inst.id} className="rounded-lg border border-border bg-card p-4">
                {/* Cabeçalho da linha */}
                <div className="flex items-center justify-between gap-3">
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
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      <span className={cn("status-dot", warming ? "bg-money" : "bg-warning")} />
                      <span className={warming ? "text-money" : "text-warning-fg"}>{warming ? "Aquecendo" : "Início"}</span>
                    </span>
                    <Button
                      variant={warming ? "outline" : "default"}
                      size="sm"
                      disabled={!isConnected || isToggling === inst.id}
                      onClick={() => toggleWarmup(inst.id, warming)}
                      className="h-7 rounded-md px-2.5 text-xs"
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
                    <span className="microlabel">Reputação</span>
                    <span className="num text-[11px] font-semibold text-foreground">{pct}%</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn("h-full rounded-full", warming ? "bg-money" : "bg-warning")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Rodapé mono */}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-[11px] text-muted-foreground">
                  <span>
                    Envio seguro: <span className="num font-semibold text-foreground">~{safeSend(day)} msgs/dia</span>
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
      )}
    </div>
  )
}

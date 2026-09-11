"use client"

import { useCallback, useEffect, useState } from "react"
import { Clock3, Inbox, Loader2, RefreshCw, TriangleAlert, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { useConfirm } from "@/components/providers/confirm-provider"
import { AutomationNavigation } from "@/components/automation-navigation"
import { PageHeader, PageShell } from "@/components/page-layout"

type QueueItem = {
  id: string
  status: string
  phone: string | null
  client_name: string | null
  is_lead: boolean
  is_campaign: boolean
  instance_name: string | null
  created_at: string
  reason: string
  reason_code: string | null
  stale: boolean
  created_local_day: string
}

type QueueResponse = {
  total: number
  stale_total: number
  today_local: string
  items: QueueItem[]
}

function formatarQuando(iso: string) {
  const data = new Date(iso)
  return data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

/**
 * Fila de envios: o que está esperando, por que, e cancelar.
 *
 * Existe porque em 11/09/2026 lembretes da régua das 18h05 do dia anterior saíram
 * às 08:25 da manhã seguinte sem que houvesse como impedir. Os freios existiam,
 * mas nenhum se apresentava como "cancelar esta mensagem", e nada mostrava o que
 * estava na fila nem desde quando.
 */
export default function FilaDeEnviosPage() {
  const confirm = useConfirm()
  const [data, setData] = useState<QueueResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [selecionados, setSelecionados] = useState<string[]>([])

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true)
    try {
      const res = await fetch("/api/evolution/send-queue", { cache: "no-store" })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || "Falha ao carregar a fila")
      setData(payload)
      // Uma mensagem que saiu enquanto a tela estava aberta não pode continuar
      // marcada, senão o botão de cancelar agiria sobre o que já foi.
      setSelecionados((anteriores) =>
        anteriores.filter((id) => (payload.items as QueueItem[]).some((item) => item.id === id)))
    } catch (error) {
      if (!silencioso) toast.error(error instanceof Error ? error.message : "Erro ao carregar a fila")
    } finally {
      if (!silencioso) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
    const timer = setInterval(() => { void carregar(true) }, 20_000)
    return () => clearInterval(timer)
  }, [carregar])

  const cancelar = async (action: "cancel" | "cancel_all" | "cancel_stale") => {
    const quantidade = action === "cancel"
      ? selecionados.length
      : action === "cancel_stale"
        ? data?.stale_total ?? 0
        : data?.total ?? 0
    if (quantidade === 0) return

    const rotulo = action === "cancel"
      ? `${quantidade} ${quantidade === 1 ? "mensagem selecionada" : "mensagens selecionadas"}`
      : action === "cancel_stale"
        ? `${quantidade} ${quantidade === 1 ? "mensagem atrasada" : "mensagens atrasadas"}`
        : `todas as ${quantidade} mensagens da fila`

    if (!await confirm({
      title: "Cancelar envio?",
      description: `${rotulo} não serão enviadas. Isso não pode ser desfeito — para enviar de novo, será preciso disparar outra vez.`,
      variant: "destructive",
    })) return

    setBusy(true)
    try {
      const res = await fetch("/api/evolution/send-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "cancel" ? { action, ids: selecionados } : { action }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || "Falha ao cancelar")
      toast.success(`${payload.cancelled} ${payload.cancelled === 1 ? "mensagem cancelada" : "mensagens canceladas"}.`)
      setSelecionados([])
      await carregar(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao cancelar")
    } finally {
      setBusy(false)
    }
  }

  const itens = data?.items || []
  const todosMarcados = itens.length > 0 && selecionados.length === itens.length

  return (
    <PageShell width="default">
      <PageHeader
        eyebrow="Automação"
        title="Fila de envios"
        description="O que ainda vai sair, por que está esperando e como impedir. Cancelar aqui não desliga nenhuma régua."
        badge={data ? `${data.total} na fila` : undefined}
        actions={
          <Button variant="outline" size="sm" disabled={loading || busy} onClick={() => carregar()}>
            <RefreshCw className="mr-2 size-4" aria-hidden="true" />
            Atualizar
          </Button>
        }
      />

      <AutomationNavigation active="queue" />

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <span className="sr-only">Carregando a fila de envios</span>
        </div>
      ) : itens.length === 0 ? (
        <div className="rounded-[16px] border border-border bg-card p-10 text-center">
          <span className="mx-auto flex size-10 items-center justify-center rounded-[11px] bg-secondary text-secondary-foreground">
            <Inbox className="size-5" aria-hidden="true" />
          </span>
          <p className="mt-3 text-[13px] font-semibold">Nada aguardando envio</p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            Quando uma mensagem ficar esperando — limite do número, fila cheia ou fora do horário — ela aparece aqui antes de sair.
          </p>
        </div>
      ) : (
        <>
          {data && data.stale_total > 0 && (
            <div role="alert" className="flex flex-col gap-2 rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-warning-fg sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">
                    <span className="num">{data.stale_total}</span> {data.stale_total === 1 ? "mensagem é de um dia anterior" : "mensagens são de dias anteriores"}
                  </p>
                  <p className="mt-0.5 text-xs opacity-90">
                    Um aviso de cobrança criado ontem chegando hoje costuma render mais reclamação que resultado.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                className="shrink-0 border-warning-border text-warning-fg hover:bg-warning-fg/10"
                onClick={() => cancelar("cancel_stale")}
              >
                Cancelar as atrasadas
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
            <label className="flex items-center gap-2.5 text-[12.5px]">
              <Checkbox
                checked={todosMarcados}
                onCheckedChange={(marcado) => setSelecionados(marcado ? itens.map((item) => item.id) : [])}
                aria-label="Selecionar todas as mensagens da fila"
              />
              {selecionados.length > 0
                ? <span className="font-medium"><span className="num">{selecionados.length}</span> selecionada{selecionados.length === 1 ? "" : "s"}</span>
                : <span className="text-muted-foreground">Selecionar todas</span>}
            </label>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={busy || selecionados.length === 0} onClick={() => cancelar("cancel")}>
                {busy ? <Loader2 className="mr-2 size-3.5 animate-spin" aria-hidden="true" /> : <X className="mr-2 size-3.5" aria-hidden="true" />}
                Cancelar selecionadas
              </Button>
              <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-bg hover:text-danger" disabled={busy} onClick={() => cancelar("cancel_all")}>
                Cancelar tudo
              </Button>
            </div>
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-[16px] border border-border bg-card">
            {itens.map((item) => (
              <li key={item.id} className="flex items-start gap-3 p-4">
                <Checkbox
                  className="mt-0.5"
                  checked={selecionados.includes(item.id)}
                  onCheckedChange={(marcado) => setSelecionados((anteriores) =>
                    marcado ? [...anteriores, item.id] : anteriores.filter((id) => id !== item.id))}
                  aria-label={`Selecionar mensagem para ${item.client_name || item.phone || "destinatário"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[13px] font-semibold">
                      {item.client_name || (item.is_lead ? "Lead" : "Destinatário")}
                    </p>
                    {item.stale && (
                      <span className="microlabel rounded bg-warning-bg px-1.5 py-0.5 text-warning-fg">atrasada</span>
                    )}
                    {item.is_campaign && (
                      <span className="microlabel rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">campanha</span>
                    )}
                  </div>
                  <p className="num mt-1 text-[11px] text-muted-foreground">{item.phone || "sem telefone"}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[10.5px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock3 className="size-3" aria-hidden="true" />
                      <span className="num">{formatarQuando(item.created_at)}</span>
                    </span>
                    {item.instance_name && <span className="num">{item.instance_name}</span>}
                    <span>{item.reason}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </PageShell>
  )
}

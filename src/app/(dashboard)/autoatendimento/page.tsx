"use client"

import React, { useEffect, useState } from "react"
import { Bot, ClipboardCheck, Loader2, Save, UserRoundCheck } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { PageProtector } from "@/components/page-protector"
import { CustomerExperienceNavigation } from "@/components/customer-experience-navigation"
import { MetricGrid, PageHeader, PageShell } from "@/components/page-layout"
import { Card, CardContent } from "@/components/ui/card"

export default function AutoatendimentoPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [enabled, setEnabled] = useState(true)
  const [greetingMessage, setGreetingMessage] = useState("")
  const [transferMessage, setTransferMessage] = useState("")
  const [invalidPlanMessage, setInvalidPlanMessage] = useState("")
  const [pixErrorMessage, setPixErrorMessage] = useState("")

  const [pausedClients, setPausedClients] = useState<any[]>([])
  const [changeRequests, setChangeRequests] = useState<any[]>([])

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/autoatendimento")
      const data = await res.json()
      if (res.ok) {
        setEnabled(data.config.enabled)
        setGreetingMessage(data.config.greetingMessage)
        setTransferMessage(data.config.transferMessage)
        setInvalidPlanMessage(data.config.invalidPlanMessage || "Não consegui identificar o valor do seu plano. Por favor, escolha a opção 4 para falar com um atendente.")
        setPixErrorMessage(data.config.pixErrorMessage || "Desculpe, ocorreu um erro ao gerar o seu PIX. O sistema pode estar indisponível.")
        setPausedClients(data.pausedClients || [])
      }
      const requestsRes = await fetch("/api/autoatendimento/requests")
      const requestsData = await requestsRes.json()
      if (requestsRes.ok) setChangeRequests(requestsData.requests || [])
    } catch (e) {
      toast.error("Erro ao carregar configurações.")
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/autoatendimento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_config",
          config: { enabled, greetingMessage, transferMessage, invalidPlanMessage, pixErrorMessage }
        })
      })
      if (res.ok) {
        toast.success("Configurações salvas")
      } else {
        toast.error("Erro ao salvar configurações")
      }
    } catch (e) {
      toast.error("Erro interno ao salvar")
    } finally {
      setSaving(false)
    }
  }

  const handleUnpause = async (phone: string) => {
    try {
      const res = await fetch("/api/autoatendimento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unpause", phone })
      })
      if (res.ok) {
        toast.success(`Atendimento retomado para ${phone}`)
        setPausedClients(prev => prev.filter(p => p.phone !== phone))
      }
    } catch (e) {
      toast.error("Erro ao retomar robô")
    }
  }

  const handleRequestDecision = async (requestId: string, decision: "approved" | "rejected") => {
    try {
      const res = await fetch("/api/autoatendimento/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, decision })
      })
      if (!res.ok) throw new Error("request_failed")
      setChangeRequests(prev => prev.filter(request => request.id !== requestId))
      toast.success(decision === "approved" ? "Solicitação aprovada" : "Solicitação recusada")
    } catch {
      toast.error("Não foi possível revisar a solicitação")
    }
  }

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return `${h}h ${m}m restantes`
  }

  if (loading) {
    return (
      <PageShell><div className="flex min-h-[50vh] items-center justify-center rounded-2xl border border-dashed"><Loader2 className="size-5 animate-spin" /><span className="ml-3 text-sm text-muted-foreground">Carregando o autoatendimento...</span></div></PageShell>
    )
  }

  return (
    <PageProtector>
      <PageShell width="default">
        <div className="rounded-xl border bg-card p-5 sm:p-6">
          <PageHeader
            eyebrow="Experiência e operação"
            title="Autoatendimento"
            description="Acompanhe pendências humanas primeiro e configure as respostas automáticas que orientam seus clientes."
            badge={enabled ? "Robô ativo" : "Robô inativo"}
            actions={<Button
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
            {saving ? "Salvando..." : "Salvar alterações"}
          </Button>}
          />
        </div>

        <CustomerExperienceNavigation active="self-service" />

        <MetricGrid columns={3}>
          <Card className={enabled ? "border-emerald-500/20 bg-emerald-500/[0.06]" : "border-muted bg-muted/20"}><CardContent className="flex items-center gap-4 p-5"><span className="grid size-10 place-items-center rounded-xl bg-background shadow-sm"><Bot className="size-5" /></span><div><p className="text-xs text-muted-foreground">Operação</p><p className="text-lg font-semibold">{enabled ? "Atendimento ativo" : "Atendimento pausado"}</p></div></CardContent></Card>
          <Card className={pausedClients.length ? "border-amber-500/25 bg-amber-500/[0.07]" : undefined}><CardContent className="flex items-center gap-4 p-5"><span className="grid size-10 place-items-center rounded-xl bg-background shadow-sm"><UserRoundCheck className="size-5" /></span><div><p className="text-xs text-muted-foreground">Atendimento humano</p><p className="text-lg font-semibold">{pausedClients.length} em pausa</p></div></CardContent></Card>
          <Card className={changeRequests.length ? "border-sky-500/25 bg-sky-500/[0.07]" : undefined}><CardContent className="flex items-center gap-4 p-5"><span className="grid size-10 place-items-center rounded-xl bg-background shadow-sm"><ClipboardCheck className="size-5" /></span><div><p className="text-xs text-muted-foreground">Decisão necessária</p><p className="text-lg font-semibold">{changeRequests.length} solicitações</p></div></CardContent></Card>
        </MetricGrid>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* COLUNA ESQUERDA - CONFIGURAÇÕES E MENUS */}
          <div className="lg:col-span-2 space-y-6">

            <div className="bg-card border border-border rounded-[8px] overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="text-[13px] font-medium text-foreground">
                    Interceptação de mensagens
                  </h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Habilita o robô de menu para todos os clientes ativos.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-muted-foreground">{enabled ? "Ativo" : "Inativo"}</span>
                  <Switch checked={enabled} onCheckedChange={setEnabled} />
                </div>
              </div>

              <div className="p-4 space-y-5">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-medium text-foreground">
                    Mensagem inicial
                  </Label>
                  <Textarea
                    value={greetingMessage}
                    onChange={e => setGreetingMessage(e.target.value)}
                    className="min-h-[80px] resize-none text-[13px] border-border bg-input focus-visible:ring-ring"
                    placeholder="Olá 👋 Como posso te ajudar hoje?"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[13px] font-medium text-foreground">
                    Mensagem de transferência (Opção 4)
                  </Label>
                  <Textarea
                    value={transferMessage}
                    onChange={e => setTransferMessage(e.target.value)}
                    className="min-h-[60px] resize-none text-[13px] border-border bg-input focus-visible:ring-ring"
                    placeholder="Um atendente humano assumirá o atendimento em breve. Por favor, aguarde! ⏳"
                  />
                </div>
              </div>
            </div>

            {/* AVISOS DE SEGURANÇA E FALHA */}
            <div className="bg-card border border-border rounded-[8px] overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/20">
                <h2 className="text-[13px] font-medium text-foreground">
                  Avisos de Falha e Segurança
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Mensagens enviadas quando o sistema não consegue completar o processo financeiro.
                </p>
              </div>

              <div className="p-4 space-y-5">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-medium text-foreground flex gap-1.5 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    Plano Indefinido
                  </Label>
                  <p className="text-[10.5px] text-muted-foreground">
                    Se o cliente pedir para renovar, mas não tiver "Valor Fixo" e nem "Pacotes de Serviços".
                  </p>
                  <Textarea
                    value={invalidPlanMessage}
                    onChange={e => setInvalidPlanMessage(e.target.value)}
                    className="min-h-[60px] resize-none text-[13px] border-border bg-input focus-visible:ring-ring mt-1"
                    placeholder="Não consegui identificar o valor do seu plano. Por favor, escolha a opção 4..."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[13px] font-medium text-foreground flex gap-1.5 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                    Falha na Geração do PIX
                  </Label>
                  <p className="text-[10.5px] text-muted-foreground">
                    Se você não configurou o Mercado Pago, ou o servidor bancário estiver fora do ar.
                  </p>
                  <Textarea
                    value={pixErrorMessage}
                    onChange={e => setPixErrorMessage(e.target.value)}
                    className="min-h-[60px] resize-none text-[13px] border-border bg-input focus-visible:ring-ring mt-1"
                    placeholder="Desculpe, ocorreu um erro ao gerar o seu PIX. O sistema pode estar indisponível."
                  />
                </div>
              </div>
            </div>

          </div>

          {/* COLUNA DIREITA - MONITORAMENTO & PREVIEW */}
          <div className="space-y-6">

            {/* CARD DE PREVIEW DO FLUXO (Read-only) */}
            <div className="bg-card border border-border rounded-[8px] overflow-hidden">
              <div className="p-3 border-b border-border bg-muted/30">
                <h2 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider microlabel">
                  COMO SEU CLIENTE VÊ
                </h2>
              </div>
              <div className="p-4 space-y-3 bg-[#e5ddd5] dark:bg-[#111b21]">
                {/* Balão WhatsApp Fictício */}
                <div className="bg-white dark:bg-[#202c33] rounded-lg rounded-tl-none p-3 shadow-sm max-w-[85%]">
                  <p className="text-[13px] whitespace-pre-wrap dark:text-gray-200">
                    {greetingMessage || "Olá 👋 Como posso te ajudar hoje?"}
                  </p>
                  <div className="mt-2 text-[13px] dark:text-gray-200 font-mono text-sm leading-relaxed">
                    <p>1️⃣ Renovar meu plano</p>
                    <p>2️⃣ Segunda via do PIX</p>
                    <p>3️⃣ Meu histórico</p>
                    <p>4️⃣ Falar com um atendente</p>
                  </div>
                  <p className="mt-2 text-[12px] italic text-muted-foreground">
                    _Digite o número da opção desejada._
                  </p>
                </div>
              </div>
            </div>

            {/* CARD DE MONITORAMENTO DE PAUSAS */}
            <div className="bg-card border border-border rounded-[8px] overflow-hidden">
              <div className="p-3 border-b border-border bg-muted/30">
                <h2 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider microlabel">
                  ATENDIMENTO HUMANO ({pausedClients.length})
                </h2>
              </div>

              <div className="p-0">
                {pausedClients.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="text-[13px] text-foreground">Nenhum cliente em pausa</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Todos estão sendo atendidos pelo robô.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {pausedClients.map(client => (
                      <div key={client.phone} className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-[13px] font-medium text-foreground flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                            +{client.phone}
                          </p>
                          <p className="text-[11px] num text-muted-foreground mt-0.5 ml-3">
                            {formatTime(client.expiresInSeconds)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleUnpause(client.phone)}
                          className="text-[12px] font-medium text-[var(--interactive)] hover:underline"
                        >
                          Retomar robô
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-card border border-border rounded-[8px] overflow-hidden">
              <div className="p-3 border-b border-border bg-muted/30">
                <h2 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider microlabel">
                  SOLICITAÇÕES PENDENTES ({changeRequests.length})
                </h2>
              </div>
              <div className="divide-y divide-border">
                {changeRequests.length === 0 ? (
                  <p className="p-4 text-[12px] text-muted-foreground">Nenhuma solicitação pendente.</p>
                ) : changeRequests.map(request => (
                  <div key={request.id} className="p-3 space-y-2">
                    <p className="text-[12px] text-foreground">
                      <strong>{request.clients?.name || "Cliente"}</strong>{" — "}
                      {request.request_type === "due_date" ? `novo vencimento: ${new Date(`${request.requested_due_date}T12:00:00`).toLocaleDateString("pt-BR")}` : "solicitou atendimento humano"}
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-[11px]" onClick={() => handleRequestDecision(request.id, "approved")}>Aprovar</Button>
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => handleRequestDecision(request.id, "rejected")}>Recusar</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      </PageShell>
    </PageProtector>
  )
}

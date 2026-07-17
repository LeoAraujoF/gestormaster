"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { BrainCircuit, CheckCircle2, Clock3, KeyRound, Loader2, RefreshCw, Settings2, ShieldCheck, Sparkles, X } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { InsightsNavigation } from "@/components/insights-navigation"
import { MetricGrid, PageHeader, PageSection, PageShell } from "@/components/page-layout"
import type { IntelligenceAgent, IntelligenceDashboardDTO, IntelligenceFinding } from "@/lib/intelligence-types"

const agents: Array<{ key: IntelligenceAgent; label: string }> = [
  { key: "executive", label: "Executivo" },
  { key: "financial", label: "Financeiro" },
  { key: "commercial", label: "Comercial" },
  { key: "collections", label: "Cobrança" },
  { key: "operational", label: "Operacional" },
]

const severity: Record<string, { label: string; className: string }> = {
  critical: { label: "Crítico", className: "border-red-500/30 bg-red-500/10 text-red-600" },
  warning: { label: "Atenção", className: "border-amber-500/30 bg-amber-500/10 text-amber-700" },
  opportunity: { label: "Oportunidade", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" },
  info: { label: "Informativo", className: "border-border bg-muted text-muted-foreground" },
}

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function Evidence({ finding }: { finding: IntelligenceFinding }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {finding.evidence.map((item) => (
        <span key={item.metric} className="rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
          {item.metric.replaceAll("_", " ")}: <strong className="text-foreground">{item.unit === "BRL" ? money(Number(item.value)) : `${item.value}${item.unit === "%" ? "%" : ""}`}</strong>
        </span>
      ))}
    </div>
  )
}

export default function IntelligencePage() {
  const [data, setData] = useState<IntelligenceDashboardDTO | null>(null)
  const [upgrade, setUpgrade] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [reportTime, setReportTime] = useState("07:00")
  const [timezone, setTimezone] = useState("America/Sao_Paulo")
  const [useByok, setUseByok] = useState(false)
  const [enabledAgents, setEnabledAgents] = useState<IntelligenceAgent[]>(agents.map((agent) => agent.key))

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const response = await fetch("/api/intelligence", { cache: "no-store" })
      const payload = await response.json()
      if (response.status === 403 && payload.upgrade_required) {
        setUpgrade(true)
        setData(null)
        return
      }
      if (!response.ok) throw new Error(payload.error || "Falha ao carregar")
      setData(payload)
      setUpgrade(false)
      setReportTime(payload.settings.report_time)
      setTimezone(payload.settings.timezone)
      setUseByok(payload.settings.use_byok_after_quota)
      setEnabledAgents(payload.settings.enabled_agents)
      const historyResponse = await fetch("/api/intelligence/runs?page=1", { cache: "no-store" })
      if (historyResponse.ok) setHistory((await historyResponse.json()).runs || [])
    } catch (error: any) {
      if (!quiet) toast.error(error.message || "Não foi possível carregar o Intelligence")
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!data?.run || !["pending", "processing"].includes(data.run.status)) return
    const timer = setInterval(() => load(true), 5000)
    return () => clearInterval(timer)
  }, [data?.run, load])

  const priorities = useMemo(() => Object.values(data?.findings || {}).flat().filter((finding) => finding.state !== "dismissed").sort((a, b) => b.priority - a.priority).slice(0, 3), [data])

  const patchSettings = async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/intelligence/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || "Falha ao salvar")
    return body
  }

  const activate = async () => {
    setSaving(true)
    try {
      await patchSettings({ enabled: true })
      toast.success("Intelligence ativado. Preparando o primeiro relatório.")
      await runNow()
    } catch (error: any) {
      toast.error(error.message)
    } finally { setSaving(false) }
  }

  const runNow = async () => {
    setRunning(true)
    try {
      const response = await fetch("/api/intelligence/run", { method: "POST" })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Falha ao gerar relatório")
      toast.success("Relatório enfileirado.")
      await load(true)
    } catch (error: any) {
      toast.error(error.message)
    } finally { setRunning(false) }
  }

  const saveSettings = async () => {
    setSaving(true)
    try {
      await patchSettings({ report_time: reportTime, timezone, use_byok_after_quota: useByok, enabled_agents: enabledAgents, ...(apiKey ? { api_key: apiKey } : {}) })
      setApiKey("")
      setShowSettings(false)
      toast.success("Configurações salvas.")
      await load(true)
    } catch (error: any) { toast.error(error.message) } finally { setSaving(false) }
  }

  const removeByok = async () => {
    setSaving(true)
    try { await patchSettings({ remove_byok: true }); toast.success("Chave própria removida."); await load(true) } catch (error: any) { toast.error(error.message) } finally { setSaving(false) }
  }

  const markFinding = async (finding: IntelligenceFinding, state: "read" | "dismissed") => {
    if (!finding.id) return
    const response = await fetch(`/api/intelligence/findings/${finding.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state }) })
    if (response.ok) await load(true)
  }

  if (loading) return <PageShell><div className="flex min-h-[50vh] items-center justify-center rounded-2xl border border-dashed"><Loader2 className="size-6 animate-spin text-muted-foreground" /><span className="ml-3 text-sm text-muted-foreground">Preparando suas recomendações...</span></div></PageShell>

  if (upgrade) return (
    <PageShell width="compact">
      <InsightsNavigation active="intelligence" />
      <div className="rounded-xl border bg-card px-6 py-16 text-center">
      <BrainCircuit className="mx-auto size-10 text-muted-foreground" />
      <h1 className="mt-4 text-2xl font-semibold">Transforme dados em prioridades claras</h1>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">Consultoria financeira, comercial, de cobrança, executiva e operacional baseada nos dados reais da sua organização.</p>
      <Button className="mt-6" onClick={() => window.location.assign("/planos")}>Conhecer o plano Master</Button>
      </div>
    </PageShell>
  )

  if (!data) return null
  if (!data.settings.enabled) return (
    <PageShell width="compact">
      <InsightsNavigation active="intelligence" />
      <div className="rounded-xl border bg-card px-6 py-16 text-center">
      <ShieldCheck className="mx-auto size-10 text-emerald-600" />
      <h1 className="mt-4 text-2xl font-semibold">Ative sua central de inteligência</h1>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">A simulação usa somente fatos calculados pelas Fases três e quatro. Nenhuma recomendação executa ações automaticamente.</p>
      <Button className="mt-6" disabled={saving} onClick={activate}>{saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}Ativar e preparar relatório</Button>
      </div>
    </PageShell>
  )

  return (
    <PageShell>
      <div className="rounded-xl border bg-card p-5 sm:p-6">
        <PageHeader
          eyebrow="Consultoria orientada por dados"
          title="Lembrado Intelligence"
          description="Veja primeiro o que exige atenção, entenda as evidências e decida o próximo passo. Nenhuma recomendação executa ações automaticamente."
          badge={data.run?.status === "completed" ? "Relatório atualizado" : data.run?.status || "Pendente"}
          actions={<><Button variant="outline" className="bg-background/70" onClick={() => setShowSettings(!showSettings)}><Settings2 className="mr-2 size-4" />Configurar</Button><Button disabled={running || data.run?.status === "processing"} onClick={runNow}>{running ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}Gerar agora</Button></>}
        />
      </div>

      <InsightsNavigation active="intelligence" />

      {showSettings && <Card><CardHeader><CardTitle className="text-base">Configurações</CardTitle></CardHeader><CardContent className="grid gap-5 md:grid-cols-2">
        <label className="space-y-1.5 text-sm"><span>Horário diário</span><Input type="time" value={reportTime} onChange={(event) => setReportTime(event.target.value)} /></label>
        <label className="space-y-1.5 text-sm"><span>Fuso horário</span><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="America/Sao_Paulo">Brasília</option><option value="America/Manaus">Manaus</option><option value="America/Rio_Branco">Rio Branco</option><option value="America/Fortaleza">Fortaleza</option><option value="America/Recife">Recife</option><option value="America/Bahia">Bahia</option></select></label>
        <div className="space-y-2 md:col-span-2"><p className="text-sm">Agentes habilitados</p><div className="flex flex-wrap gap-3">{agents.map((agent) => <label key={agent.key} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Switch checked={enabledAgents.includes(agent.key)} onCheckedChange={(checked) => setEnabledAgents(checked ? [...new Set([...enabledAgents, agent.key])] : enabledAgents.filter((item) => item !== agent.key))} />{agent.label}</label>)}</div></div>
        <div className="space-y-2 md:col-span-2"><div className="flex items-center justify-between"><div><p className="text-sm font-medium">Chave OpenAI própria</p><p className="text-xs text-muted-foreground">Usada somente após a cota, mediante consentimento.</p></div><Switch checked={useByok} onCheckedChange={setUseByok} /></div><div className="flex gap-2"><Input type="password" autoComplete="off" placeholder={data.settings.byok_configured ? `Configurada ••••${data.settings.byok_last4}` : "sk-..."} value={apiKey} onChange={(event) => setApiKey(event.target.value)} />{data.settings.byok_configured && <Button variant="outline" disabled={saving} onClick={removeByok}><X className="size-4" /></Button>}</div></div>
        <div className="md:col-span-2 flex justify-end"><Button disabled={saving || enabledAgents.length === 0} onClick={saveSettings}>{saving && <Loader2 className="mr-2 size-4 animate-spin" />}Salvar</Button></div>
      </CardContent></Card>}

      <MetricGrid columns={4}>
        <Card className="border-violet-500/20 bg-violet-500/[0.05]"><CardContent className="p-5"><p className="text-xs text-muted-foreground">Cota da plataforma</p><p className="mt-1 text-2xl font-semibold">{data.usage.remaining}</p><p className="text-xs text-muted-foreground">de {data.usage.limit} restantes</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Cobertura</p><p className="mt-1 text-2xl font-semibold">{data.run?.coverage.partial ? "Parcial" : "Completa"}</p><p className="text-xs text-muted-foreground">{data.run?.coverage.cycles || 0} ciclos analisados</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Relatório</p><p className="mt-1 text-2xl font-semibold capitalize">{data.run?.status || "Pendente"}</p><p className="text-xs text-muted-foreground">{data.run?.report_date || "Ainda não gerado"}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Narrativa</p><p className="mt-1 text-2xl font-semibold">{data.run?.narrative_status === "completed" ? "IA validada" : "Determinística"}</p><p className="text-xs text-muted-foreground">{data.run?.model || "Sem modelo"}</p></CardContent></Card>
      </MetricGrid>

      {data.run && ["pending", "processing"].includes(data.run.status) && <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-sm"><Loader2 className="size-4 animate-spin text-blue-600" />O relatório está sendo processado. Os fatos determinísticos já permanecem salvos.</div>}

      <PageSection title="Prioridades de hoje" description="Os três pontos de maior impacto, ordenados para orientar sua próxima decisão."><div className="grid gap-3 lg:grid-cols-3">{priorities.map((finding, index) => <div key={finding.id || `${finding.agent_type}-${finding.priority}`} className="relative overflow-hidden rounded-xl border bg-card p-5 shadow-sm"><span className="absolute right-4 top-4 text-3xl font-semibold text-muted/70">0{index + 1}</span><Badge variant="outline" className={severity[finding.severity].className}>{severity[finding.severity].label}</Badge><h2 className="mt-4 pr-8 font-semibold">{finding.title}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{finding.summary}</p><Evidence finding={finding} /></div>)}</div></PageSection>

      <Tabs defaultValue="executive"><TabsList className="max-w-full overflow-x-auto">{agents.map((agent) => <TabsTrigger key={agent.key} value={agent.key}>{agent.label}</TabsTrigger>)}</TabsList>{agents.map((agent) => <TabsContent key={agent.key} value={agent.key} className="space-y-3">{data.findings[agent.key].filter((finding) => finding.state !== "dismissed").map((finding) => <Card key={finding.id || `${agent.key}-${finding.priority}`}><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Badge variant="outline" className={severity[finding.severity].className}>{severity[finding.severity].label}</Badge>{finding.source === "ai" && <Badge variant="secondary"><BrainCircuit className="mr-1 size-3" />IA</Badge>}</div><h3 className="mt-3 font-semibold">{finding.title}</h3></div><div className="flex gap-1"><Button size="icon" variant="ghost" title="Marcar como lido" onClick={() => markFinding(finding, "read")}><CheckCircle2 className="size-4" /></Button><Button size="icon" variant="ghost" title="Descartar" onClick={() => markFinding(finding, "dismissed")}><X className="size-4" /></Button></div></div><p className="mt-2 text-sm text-muted-foreground">{finding.summary}</p><Evidence finding={finding} /><div className="mt-4 rounded-md bg-muted/50 p-3 text-sm"><strong>Recomendação:</strong> {finding.recommendation}</div>{finding.action_url && <Button variant="link" className="mt-2 h-auto p-0" onClick={() => window.location.assign(finding.action_url!)}>Abrir área relacionada</Button>}</CardContent></Card>)}{!data.findings[agent.key].some((finding) => finding.state !== "dismissed") && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum finding ativo deste agente.</div>}</TabsContent>)}</Tabs>

      <Card><CardHeader><CardTitle className="text-base">Histórico recente</CardTitle></CardHeader><CardContent className="divide-y">{history.slice(0, 10).map((run) => <div key={run.id} className="flex items-center justify-between py-3 text-sm"><div className="flex items-center gap-3"><Clock3 className="size-4 text-muted-foreground" /><div><p className="font-medium">Relatório de {run.report_date}</p><p className="text-xs text-muted-foreground">{run.model || "Somente fatos determinísticos"}</p></div></div><Badge variant="outline" className="capitalize">{run.status}</Badge></div>)}{history.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">O histórico aparecerá após a primeira execução.</p>}</CardContent></Card>
    </PageShell>
  )
}

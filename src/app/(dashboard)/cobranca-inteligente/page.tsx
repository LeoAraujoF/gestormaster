"use client"

import { useEffect, useState } from "react"
import { PageProtector } from "@/components/page-protector"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { BrainCircuit, CircleCheckBig, Clock3, Gauge, ShieldCheck, Users, type LucideIcon } from "lucide-react"
import { AutomationNavigation } from "@/components/automation-navigation"
import { MetricGrid, PageHeader, PageSection, PageShell } from "@/components/page-layout"
import { Skeleton } from "@/components/ui/skeleton"

type Step = { id: string; sequence: number; relative_day: number; send_time: string; message_template: string; is_active: boolean }
type Profile = { id: string; code: string; name: string; min_score: number | null; max_score: number | null; steps: Step[] }
type Score = { client_id: string; score: number; confidence: string; profile: string; profile_source?: string; tags?: string[]; clients?: { name?: string } | null }
type EligibilityReason = 'CLIENT_PLAN_VALUE_NOT_POSITIVE' | 'CLIENT_PHONE_NOT_FOUND'
type Eligibility = {
  tracked: number
  billable: number
  readyForSend: number
  withoutPositiveValue: number
  withoutPhone: number
  ineligible: Array<{ clientId: string; name: string; reasons: EligibilityReason[] }>
}

const EMPTY_ELIGIBILITY: Eligibility = { tracked: 0, billable: 0, readyForSend: 0, withoutPositiveValue: 0, withoutPhone: 0, ineligible: [] }

export default function IntelligentCollectionsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [scores, setScores] = useState<Score[]>([])
  const [cycles, setCycles] = useState<any[]>([])
  const [eligibility, setEligibility] = useState<Eligibility>(EMPTY_ELIGIBILITY)

  const load = async () => {
    try {
      const response = await fetch("/api/intelligent-collections")
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setInitialized(Boolean(data.initialized))
      setEnabled(Boolean(data.settings?.enabled))
      setProfiles(data.profiles || [])
      setScores(data.scores || [])
      setCycles(data.cycles || [])
      setEligibility(data.eligibility || EMPTY_ELIGIBILITY)
    } catch (error: any) {
      toast.error(error.message || "Não foi possível carregar a cobrança inteligente")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const initialize = async () => {
    setSaving(true)
    try {
      const response = await fetch("/api/intelligent-collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "initialize" }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      toast.success("Simulação preparada. Revise os perfis antes de ativar.")
      await load()
    } catch (error: any) {
      toast.error(error.message || "Não foi possível preparar a simulação")
    } finally { setSaving(false) }
  }

  const updateEnabled = async (next: boolean) => {
    setSaving(true)
    try {
      const response = await fetch("/api/intelligent-collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set_enabled", enabled: next }) })
      if (!response.ok) throw new Error((await response.json()).error)
      setEnabled(next)
      toast.success(next ? "Régua inteligente ativada após a simulação." : "Régua inteligente pausada.")
    } catch (error: any) {
      toast.error(error.message || "Não foi possível atualizar a régua")
    } finally { setSaving(false) }
  }

  const saveStep = async (profileId: string, step: Step) => {
    setSaving(true)
    try {
      const response = await fetch("/api/intelligent-collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_step", step }) })
      if (!response.ok) throw new Error((await response.json()).error)
      toast.success("Etapa atualizada")
      await load()
    } catch (error: any) { toast.error(error.message || "Não foi possível salvar a etapa") } finally { setSaving(false) }
  }

  const assignTag = async (clientId: string, tagCode: "vip" | "premium") => {
    try {
      const response = await fetch("/api/intelligent-collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assign_tag", clientId, tagCode }) })
      if (!response.ok) throw new Error((await response.json()).error)
      toast.success(`Etiqueta ${tagCode.toUpperCase()} aplicada`)
      await load()
    } catch (error: any) { toast.error(error.message || "Não foi possível aplicar a etiqueta") }
  }

  const totalSteps = profiles.reduce((sum, profile) => sum + profile.steps.length, 0)
  const activeSteps = profiles.reduce((sum, profile) => sum + profile.steps.filter(step => step.is_active).length, 0)

  if (loading) return (
    <PageProtector>
      <PageShell>
        <div className="space-y-2"><Skeleton className="h-4 w-36" /><Skeleton className="h-8 w-72" /><Skeleton className="h-4 w-full max-w-xl" /></div>
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </PageShell>
    </PageProtector>
  )

  if (!initialized) return (
    <PageProtector>
      <PageShell width="default" className="py-8">
        <PageHeader
          eyebrow={<span className="flex items-center gap-1.5 text-interactive-fg"><BrainCircuit className="size-3.5" aria-hidden="true" /> Cobrança orientada por risco</span>}
          title="Prepare a cobrança inteligente"
          description="Crie uma simulação segura, revise os perfis e só depois escolha ativar os envios."
          badge="Configuração inicial"
        />
        <AutomationNavigation active="collections" />
        <div className="rounded-2xl border border-interactive/20 bg-card p-6 shadow-sm sm:p-10">
          <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-interactive-bg text-interactive-fg"><BrainCircuit className="size-6" aria-hidden="true" /></span>
          <h2 className="mt-4 text-xl font-semibold">Sua operação em três passos</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Vamos criar os perfis, ciclos e scores da organização. Nenhuma mensagem será enviada até você revisar os dados e ativar a régua.</p>
          <div className="mx-auto mt-6 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
            {["Criar perfis de risco", "Simular clientes e ciclos", "Revisar antes de ativar"].map((item, index) => <div key={item} className="rounded-xl border border-border bg-muted/50 p-3"><span className="num text-xs font-semibold text-interactive-fg">0{index + 1}</span><p className="mt-1 text-xs font-medium">{item}</p></div>)}
          </div>
          <Button className="mt-6 min-h-10" disabled={saving} onClick={initialize}>{saving ? "Preparando..." : "Preparar simulação"}</Button>
        </div>
      </PageShell>
    </PageProtector>
  )

  return (
    <PageProtector>
      <PageShell>
        <PageHeader
          eyebrow={<span className="flex items-center gap-1.5 text-interactive-fg"><BrainCircuit className="size-3.5" aria-hidden="true" /> Recuperação orientada por risco</span>}
          title="Cobrança inteligente"
          description="Adapte a régua ao perfil de cada cliente, revise a simulação e acompanhe quem exige atenção."
          badge={enabled ? "Régua ativa" : "Modo simulação"}
          actions={
            <div className="flex min-h-10 items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-2 shadow-sm">
              <div><p className="text-sm font-medium">{enabled ? "Envios ativos" : "Somente simulação"}</p><p className="text-[11px] text-muted-foreground">{enabled ? "A régua pode executar etapas" : "Nenhuma mensagem será enviada"}</p></div>
              <Switch aria-label="Ativar cobrança inteligente" checked={enabled} disabled={saving} onCheckedChange={updateEnabled} />
            </div>
          }
        />
        <AutomationNavigation active="collections" />

        <MetricGrid columns={4}>
          <CollectionMetric icon={Clock3} label="Ciclos pendentes" value={String(cycles.length)} hint={cycles.length > 0 ? "Aguardando processamento" : "Nenhum ciclo na fila"} tone={cycles.length > 0 ? "warning" : "neutral"} />
          <CollectionMetric icon={Users} label="Prontos para envio" value={String(eligibility.readyForSend)} hint={`${eligibility.billable} com valor de cobrança`} />
          <CollectionMetric icon={ShieldCheck} label="Inelegíveis" value={String(Math.max(0, eligibility.tracked - eligibility.readyForSend))} hint={`${eligibility.withoutPositiveValue} sem valor · ${eligibility.withoutPhone} sem telefone`} tone={eligibility.tracked > eligibility.readyForSend ? "warning" : "success"} />
          <CollectionMetric icon={Gauge} label="Etapas ativas" value={`${activeSteps}/${totalSteps}`} hint={`${profiles.length} perfis configurados`} />
        </MetricGrid>

        {enabled && (
          <div className="flex items-start gap-3 rounded-xl border border-money/25 bg-success-bg px-4 py-3 text-success-fg">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Operação híbrida ativa</p>
              <p className="mt-0.5 text-xs leading-relaxed opacity-90">A cobrança inteligente controla os avisos antes e no vencimento. Regras após o vencimento continuam na Central como recuperação complementar; se houver coincidência no mesmo dia, a etapa inteligente prevalece. Planos de R$ 0,00 não geram cobrança.</p>
            </div>
          </div>
        )}

        {!enabled && (
          <div className="flex items-start gap-3 rounded-xl border border-interactive/20 bg-interactive-bg px-4 py-3 text-interactive-fg">
            <BrainCircuit className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div><p className="text-sm font-semibold">Você está em modo de simulação</p><p className="mt-0.5 text-xs opacity-80">Revise perfis, horários e mensagens abaixo. Ativar a régua é uma decisão separada e explícita.</p></div>
          </div>
        )}

        {eligibility.ineligible.length > 0 && (
          <PageSection title="Clientes inelegíveis" description="Estes clientes permanecem fora dos disparos até que os dados indicados sejam corrigidos.">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {eligibility.ineligible.map(client => (
                <article key={client.clientId} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <p className="truncate text-sm font-semibold">{client.name || "Cliente sem nome"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {client.reasons.includes('CLIENT_PLAN_VALUE_NOT_POSITIVE') && <span className="rounded-md bg-warning-bg px-2 py-1 text-[11px] font-medium text-warning-fg">Plano sem valor positivo</span>}
                    {client.reasons.includes('CLIENT_PHONE_NOT_FOUND') && <span className="rounded-md bg-danger-bg px-2 py-1 text-[11px] font-medium text-danger-fg">Telefone não cadastrado</span>}
                  </div>
                </article>
              ))}
            </div>
          </PageSection>
        )}

        <PageSection title="Perfis e etapas" description="Cada perfil seleciona automaticamente uma régua. Ajuste texto, momento e horário sem perder a visão do conjunto.">
          <div className="grid gap-4 lg:grid-cols-2">
            {profiles.map(profile => <div key={profile.id} className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex items-start justify-between gap-3 border-b border-border pb-3"><div><h3 className="font-semibold">{profile.name}</h3><p className="mt-1 text-xs text-muted-foreground">{profile.steps.filter(step => step.is_active).length} de {profile.steps.length} etapas ativas</p></div><span className="num rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-secondary-foreground">{profile.min_score === null ? "Por etiqueta" : `${profile.min_score}–${profile.max_score} pontos`}</span></div>
              {profile.steps.map(step => <StepEditor key={step.id} step={step} saving={saving} onSave={(next) => saveStep(profile.id, next)} />)}
            </div>)}
          </div>
        </PageSection>

        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border p-4 sm:p-5"><div className="flex items-center gap-2"><CircleCheckBig className="size-4 text-money" aria-hidden="true" /><h2 className="font-semibold">Simulação e score</h2></div><p className="mt-1 text-sm text-muted-foreground">Clientes com menos de três ciclos concluídos usam o perfil Regular com confiança baixa.</p></div>
          <div className="divide-y divide-border">
            {scores.length === 0 ? <div className="p-8 text-center"><Gauge className="mx-auto size-6 text-muted-foreground" aria-hidden="true" /><p className="mt-3 text-sm font-medium">Histórico ainda em formação</p><p className="mt-1 text-xs text-muted-foreground">Ainda não há ciclos suficientes para pontuar clientes.</p></div> : scores.map(score => <div key={score.client_id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:p-5">
              <div className="min-w-0"><p className="font-medium">{score.clients?.name || "Cliente"}</p><p className="mt-1 text-xs text-muted-foreground">Perfil: {score.profile} · confiança {score.confidence === "high" ? "alta" : "baixa"}{score.profile_source?.includes("override") ? " · etiqueta aplicada" : ""}</p></div>
              <span className="num w-fit rounded-lg bg-muted px-3 py-1.5 text-sm font-semibold">{score.score}/100</span>
              <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => assignTag(score.client_id, "vip")}>Marcar VIP</Button><Button size="sm" variant="outline" onClick={() => assignTag(score.client_id, "premium")}>Marcar Premium</Button></div>
            </div>)}
          </div>
        </section>
      </PageShell>
    </PageProtector>
  )
}

function CollectionMetric({ icon: Icon, label, value, hint, tone = "neutral" }: { icon: LucideIcon; label: string; value: string; hint: string; tone?: "neutral" | "warning" | "success" }) {
  const toneClass = tone === "warning" ? "bg-warning-bg text-warning-fg" : tone === "success" ? "bg-success-bg text-success-fg" : "bg-secondary text-secondary-foreground"
  return <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><p className="microlabel">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div><span className={`rounded-lg p-2 ${toneClass}`}><Icon className="size-4" aria-hidden="true" /></span></div>
  </div>
}

function StepEditor({ step, saving, onSave }: { step: Step; saving: boolean; onSave: (step: Step) => void }) {
  const [draft, setDraft] = useState(step)
  useEffect(() => setDraft(step), [step])
  return <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3.5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="space-y-1.5"><span className="microlabel">Dia relativo</span><Input aria-label="Dia relativo ao vencimento" className="h-9 sm:w-28" type="number" value={draft.relative_day} onChange={event => setDraft({ ...draft, relative_day: Number(event.target.value) })} /></label>
      <label className="space-y-1.5"><span className="microlabel">Horário</span><Input aria-label="Horário de envio" className="h-9 sm:w-32" type="time" value={draft.send_time.slice(0, 5)} onChange={event => setDraft({ ...draft, send_time: event.target.value })} /></label>
      <span className="pb-2 text-xs leading-relaxed text-muted-foreground">Negativo: antes do vencimento · positivo: recuperação</span>
    </div>
    <label className="block space-y-1.5"><span className="microlabel">Mensagem enviada</span><Textarea aria-label="Mensagem da etapa" className="min-h-24 bg-card text-sm" value={draft.message_template} onChange={event => setDraft({ ...draft, message_template: event.target.value })} /></label>
    <div className="flex items-center justify-between gap-3"><span className={`text-xs font-medium ${draft.is_active ? "text-money" : "text-muted-foreground"}`}>{draft.is_active ? "Etapa ativa" : "Etapa pausada"}</span><Button size="sm" disabled={saving} onClick={() => onSave(draft)}>Salvar etapa</Button></div>
  </div>
}

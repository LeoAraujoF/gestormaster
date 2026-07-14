"use client"

import { useEffect, useState } from "react"
import { PageProtector } from "@/components/page-protector"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

type Step = { id: string; sequence: number; relative_day: number; send_time: string; message_template: string; is_active: boolean }
type Profile = { id: string; code: string; name: string; min_score: number | null; max_score: number | null; steps: Step[] }
type Score = { client_id: string; score: number; confidence: string; profile: string; profile_source?: string; tags?: string[]; clients?: { name?: string } | null }

export default function IntelligentCollectionsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [scores, setScores] = useState<Score[]>([])
  const [cycles, setCycles] = useState<any[]>([])

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

  if (loading) return <div className="flex h-[50vh] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>

  if (!initialized) return (
    <PageProtector>
      <div className="mx-auto max-w-3xl px-4 py-16 md:px-8">
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <h1 className="text-xl font-semibold">Prepare sua simulação</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">Vamos criar os perfis, ciclos e scores da organização. Nenhuma mensagem será enviada até você revisar os dados e ativar a régua.</p>
          <Button className="mt-6" disabled={saving} onClick={initialize}>{saving ? "Preparando..." : "Preparar simulação"}</Button>
        </div>
      </div>
    </PageProtector>
  )

  return (
    <PageProtector>
      <div className="mx-auto max-w-6xl space-y-6 px-4 pb-12 pt-6 md:px-8">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Cobrança Inteligente</h1>
            <p className="mt-1 text-sm text-muted-foreground">Simule e adapte a régua pelo risco financeiro de cada cliente.</p>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
            <span className="text-sm">{enabled ? "Ativa" : "Em simulação"}</span>
            <Switch checked={enabled} disabled={saving} onCheckedChange={updateEnabled} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Ciclos pendentes</p><p className="mt-1 text-2xl font-semibold">{cycles.length}</p></div>
          <div className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Clientes em acompanhamento</p><p className="mt-1 text-2xl font-semibold">{scores.length}</p></div>
          <div className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Proteção ativa</p><p className="mt-1 text-sm font-medium">1 mensagem/dia · 4/ciclo · 08h–20h</p></div>
        </div>

        <section className="space-y-3">
          <div><h2 className="font-semibold">Perfis e etapas</h2><p className="text-sm text-muted-foreground">Os perfis selecionam automaticamente a régua. Você pode ajustar texto, dia e horário.</p></div>
          <div className="grid gap-4 lg:grid-cols-2">
            {profiles.map(profile => <div key={profile.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between"><h3 className="font-medium">{profile.name}</h3><span className="text-xs text-muted-foreground">{profile.min_score === null ? "Etiqueta" : `${profile.min_score}–${profile.max_score}`}</span></div>
              {profile.steps.map(step => <StepEditor key={step.id} step={step} saving={saving} onSave={(next) => saveStep(profile.id, next)} />)}
            </div>)}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4"><h2 className="font-semibold">Simulação e score</h2><p className="text-sm text-muted-foreground">Clientes com menos de três ciclos concluídos usam o perfil Regular com confiança baixa.</p></div>
          <div className="divide-y divide-border">
            {scores.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Ainda não há ciclos suficientes para pontuar clientes.</p> : scores.map(score => <div key={score.client_id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-48 flex-1"><p className="font-medium">{score.clients?.name || "Cliente"}</p><p className="text-xs text-muted-foreground">Perfil: {score.profile} · confiança {score.confidence === "high" ? "alta" : "baixa"}{score.profile_source?.includes("override") ? " · etiqueta aplicada" : ""}</p></div>
              <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">{score.score}/100</span>
              <Button size="sm" variant="outline" onClick={() => assignTag(score.client_id, "vip")}>VIP</Button>
              <Button size="sm" variant="outline" onClick={() => assignTag(score.client_id, "premium")}>Premium</Button>
            </div>)}
          </div>
        </section>
      </div>
    </PageProtector>
  )
}

function StepEditor({ step, saving, onSave }: { step: Step; saving: boolean; onSave: (step: Step) => void }) {
  const [draft, setDraft] = useState(step)
  useEffect(() => setDraft(step), [step])
  return <div className="rounded-md border border-border p-3 space-y-2">
    <div className="flex gap-2"><Input className="h-8 w-24" type="number" value={draft.relative_day} onChange={event => setDraft({ ...draft, relative_day: Number(event.target.value) })} /><Input className="h-8 w-28" type="time" value={draft.send_time.slice(0, 5)} onChange={event => setDraft({ ...draft, send_time: event.target.value })} /><span className="self-center text-xs text-muted-foreground">D negativo = antes; positivo = recuperação</span></div>
    <Textarea className="min-h-20 text-sm" value={draft.message_template} onChange={event => setDraft({ ...draft, message_template: event.target.value })} />
    <Button size="sm" disabled={saving} onClick={() => onSave(draft)}>Salvar etapa</Button>
  </div>
}

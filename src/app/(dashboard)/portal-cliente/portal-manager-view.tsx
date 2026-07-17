'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Copy, ExternalLink, Loader2, Send, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { CustomerExperienceNavigation } from '@/components/customer-experience-navigation'
import { PageHeader, PageSection, PageShell } from '@/components/page-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

type PortalSettings = {
  enabled: boolean
  slug: string
  display_name: string
  logo_url: string | null
  primary_color: string
  allow_renewal: boolean
  allow_due_date_request: boolean
  allow_phone_change: boolean
  allow_support_request: boolean
}
type State = { entitled: boolean; settings: PortalSettings; blockers: { evolution: boolean; mercado_pago: boolean }; clients: Array<{ id: string; name: string; phone: string | null; canInvite: boolean }> }
const FEATURES: ReadonlyArray<readonly [keyof Pick<PortalSettings, 'allow_renewal' | 'allow_due_date_request' | 'allow_phone_change' | 'allow_support_request'>, string]> = [
  ['allow_renewal', 'Renovação por PIX'], ['allow_due_date_request', 'Alterar vencimento'],
  ['allow_phone_change', 'Atualizar telefone'], ['allow_support_request', 'Falar com atendente'],
]

export function PortalManagerView() {
  const [state, setState] = useState<State | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const response = await fetch('/api/client-portal/settings', { cache: 'no-store' })
    if (response.ok) setState(await response.json())
  }
  useEffect(() => {
    let active = true
    void fetch('/api/client-portal/settings', { cache: 'no-store' }).then(async (response) => {
      if (response.ok && active) setState(await response.json() as State)
    })
    return () => { active = false }
  }, [])
  if (!state) return <PageShell><div className="flex min-h-[50vh] items-center justify-center rounded-2xl border border-dashed"><Loader2 className="size-5 animate-spin" /><span className="ml-3 text-sm text-muted-foreground">Preparando o Portal do Cliente...</span></div></PageShell>

  if (!state.entitled) return (
    <PageShell width="compact">
      <CustomerExperienceNavigation active="portal" />
      <div className="rounded-xl border bg-card px-6 py-16 text-center">
      <ExternalLink className="mx-auto size-10 text-sky-600" />
      <h1 className="mt-4 text-2xl font-semibold">Dê autonomia aos seus clientes</h1>
      <p className="mt-3 text-muted-foreground">Disponível nos planos Pro e Master para consultas, PIX, comprovantes e solicitações com login seguro por WhatsApp.</p>
      <Button className="mt-6" onClick={() => window.location.assign('/planos')}>Conhecer planos</Button>
      </div>
    </PageShell>
  )

  const update = <K extends keyof PortalSettings>(key: K, value: PortalSettings[K]) => setState({ ...state, settings: { ...state.settings, [key]: value } })
  const save = async () => {
    setSaving(true)
    const response = await fetch('/api/client-portal/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state.settings) })
    setSaving(false)
    if (!response.ok) return toast.error((await response.json()).error || 'Falha ao salvar')
    toast.success('Configuração salva')
    await load()
  }
  const link = `${window.location.origin}/portal/${state.settings.slug}`

  return (
    <PageShell width="default">
      <div className="rounded-xl border bg-card p-5 sm:p-6">
        <PageHeader eyebrow="Experiência do cliente" title="Portal do Cliente" description="Configure o acesso público, escolha os recursos disponíveis e envie convites com segurança." badge={state.settings.enabled ? "Ativo" : "Inativo"} actions={<Button disabled={saving} onClick={save}>{saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CheckCircle2 className="mr-2 size-4" />}{saving ? 'Salvando…' : 'Salvar alterações'}</Button>} />
      </div>
      <CustomerExperienceNavigation active="portal" />
      {(state.blockers.evolution || state.blockers.mercado_pago) && <div className="flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] p-4 text-sm"><ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" /><div>{state.blockers.evolution && <p className="font-medium">Conecte uma instância principal do WhatsApp antes de ativar.</p>}{state.blockers.mercado_pago && <p className="mt-1 text-muted-foreground">Mercado Pago ausente: a renovação por PIX ficará bloqueada.</p>}</div></div>}
      <PageSection title="Identidade e disponibilidade" description="Defina como o portal será apresentado e quais ações o cliente poderá executar.">
      <Card><CardContent className="grid gap-5 p-5 md:grid-cols-2 sm:p-6">
        <label className="space-y-2 text-sm"><span className="font-medium">Nome exibido</span><Input value={state.settings.display_name} onChange={(e) => update('display_name', e.target.value)} /></label>
        <label className="space-y-2 text-sm"><span className="font-medium">Slug público</span><Input value={state.settings.slug} onChange={(e) => update('slug', e.target.value)} /></label>
        <label className="space-y-2 text-sm"><span className="font-medium">Logo HTTPS (opcional)</span><Input value={state.settings.logo_url || ''} onChange={(e) => update('logo_url', e.target.value)} /></label>
        <label className="space-y-2 text-sm"><span className="font-medium">Cor principal</span><input type="color" className="h-10 w-full rounded-lg border bg-background p-1" value={state.settings.primary_color} onChange={(e) => update('primary_color', e.target.value)} /></label>
        <div className="grid gap-3 sm:grid-cols-2 md:col-span-2">
          {FEATURES.map(([key,label]) => <label key={key} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border bg-muted/20 px-4 py-3 text-sm"><span>{label}</span><Switch checked={state.settings[key]} onCheckedChange={(checked) => update(key, checked)} /></label>)}
        </div>
        <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3 text-sm font-semibold md:col-span-2"><span><span className="block">Portal ativo</span><span className="font-normal text-muted-foreground">Permite acesso e envio de novos convites.</span></span><Switch checked={state.settings.enabled} disabled={state.blockers.evolution} onCheckedChange={(checked) => update('enabled', checked)} /></label>
      </CardContent></Card>
      </PageSection>
      <PageSection title="Link e convites" description="Compartilhe o acesso público ou envie individualmente pelo WhatsApp.">
      <Card><CardContent className="p-5 sm:p-6"><div className="flex flex-col gap-2 sm:flex-row"><Input readOnly value={link} className="min-w-0 flex-1 bg-muted" /><Button variant="outline" onClick={() => { void navigator.clipboard.writeText(link); toast.success('Link copiado') }}><Copy className="mr-2 size-4" />Copiar</Button></div>
        <div className="mt-5 max-h-80 divide-y overflow-auto">{state.clients.map((client) => <div key={client.id} className="flex flex-col gap-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{client.name}</p><p className="text-muted-foreground">{client.phone || 'Telefone inválido'}</p></div><Button variant="outline" disabled={!client.canInvite || !state.settings.enabled} onClick={async () => { const response = await fetch('/api/client-portal/invite', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({clientId:client.id}) }); if (response.ok) toast.success('Convite enfileirado'); else toast.error('Envio bloqueado') }}><Send className="mr-2 size-4" />Enviar link</Button></div>)}</div>
      </CardContent></Card>
      </PageSection>
    </PageShell>
  )
}

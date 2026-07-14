'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'

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
  if (!state) return <div className="p-6 text-sm text-muted-foreground">Carregando Portal do Cliente…</div>

  if (!state.entitled) return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mt-2 text-3xl font-bold">Portal do Cliente</h1>
      <p className="mt-3 text-muted-foreground">Disponível nos planos Pro e Master para consultas, PIX, comprovantes e solicitações com login seguro por WhatsApp.</p>
      <a href="/planos" className="mt-6 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Conhecer planos</a>
    </div>
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
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Experiência do cliente</p><h1 className="text-3xl font-bold">Portal do Cliente</h1></div>
      {(state.blockers.evolution || state.blockers.mercado_pago) && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{state.blockers.evolution && <p>Conecte uma instância principal do WhatsApp antes de ativar.</p>}{state.blockers.mercado_pago && <p>Mercado Pago ausente: a renovação por PIX ficará bloqueada.</p>}</div>}
      <div className="grid gap-6 rounded-xl border bg-card p-5 md:grid-cols-2">
        <label className="space-y-2 text-sm"><span>Nome exibido</span><input className="w-full rounded-lg border bg-background px-3 py-2" value={state.settings.display_name} onChange={(e) => update('display_name', e.target.value)} /></label>
        <label className="space-y-2 text-sm"><span>Slug público</span><input className="w-full rounded-lg border bg-background px-3 py-2" value={state.settings.slug} onChange={(e) => update('slug', e.target.value)} /></label>
        <label className="space-y-2 text-sm"><span>Logo HTTPS (opcional)</span><input className="w-full rounded-lg border bg-background px-3 py-2" value={state.settings.logo_url || ''} onChange={(e) => update('logo_url', e.target.value)} /></label>
        <label className="space-y-2 text-sm"><span>Cor principal</span><input type="color" className="h-10 w-full rounded-lg border bg-background" value={state.settings.primary_color} onChange={(e) => update('primary_color', e.target.value)} /></label>
        <div className="md:col-span-2 grid gap-3 sm:grid-cols-2">
          {FEATURES.map(([key,label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={state.settings[key]} onChange={(e) => update(key, e.target.checked)} />{label}</label>)}
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={state.settings.enabled} disabled={state.blockers.evolution} onChange={(e) => update('enabled', e.target.checked)} />Portal ativo</label>
        <div className="flex justify-end"><button disabled={saving} onClick={save} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? 'Salvando…' : 'Salvar'}</button></div>
      </div>
      <div className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Link e convites</h2><div className="mt-3 flex gap-2"><input readOnly value={link} className="min-w-0 flex-1 rounded-lg border bg-muted px-3 py-2 text-sm" /><button onClick={() => { void navigator.clipboard.writeText(link); toast.success('Link copiado') }} className="rounded-lg border px-3 text-sm">Copiar</button></div>
        <div className="mt-5 max-h-72 divide-y overflow-auto">{state.clients.map((client) => <div key={client.id} className="flex items-center justify-between py-3 text-sm"><div><p className="font-medium">{client.name}</p><p className="text-muted-foreground">{client.phone || 'Telefone inválido'}</p></div><button disabled={!client.canInvite || !state.settings.enabled} onClick={async () => { const response = await fetch('/api/client-portal/invite', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({clientId:client.id}) }); if (response.ok) toast.success('Convite enfileirado'); else toast.error('Envio bloqueado') }} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Enviar link</button></div>)}</div>
      </div>
    </div>
  )
}

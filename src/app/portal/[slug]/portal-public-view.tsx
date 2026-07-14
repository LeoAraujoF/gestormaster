'use client'

import { useEffect, useState, type CSSProperties } from 'react'

type Brand = { display_name: string; logo_url: string | null; primary_color: string }
type HistoryItem = { id: string; source: string; amount: number; paidAt: string | null; method: string; chargeId: string | null }
type PendingPix = { amount: number; expires_at: string | null; qr_code_base64: string | null; copia_e_cola: string | null }
type PortalDashboard = {
  brand: { slug: string }
  client: { name: string; status: string; dueDate: string | null; amount: number; services: string[] }
  features: { renewal: boolean; dueDate: boolean; phone: boolean; support: boolean }
  pendingPix: PendingPix | null
  history: HistoryItem[]
}
type JsonObject = Record<string, unknown>

export function PortalPublicView({ slug, brand, initiallyAuthenticated }: { slug: string; brand: Brand; initiallyAuthenticated: boolean }) {
  const [dashboard, setDashboard] = useState<PortalDashboard | null>(null)
  const [authenticated, setAuthenticated] = useState(initiallyAuthenticated)
  const [phone, setPhone] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const endpoint = `/api/portal/${slug}`

  const load = async () => {
    const response = await fetch(`${endpoint}/dashboard`, { cache: 'no-store' })
    if (response.ok) {
      setDashboard(await response.json() as PortalDashboard)
      setAuthenticated(true)
    } else setAuthenticated(false)
  }

  useEffect(() => {
    if (!initiallyAuthenticated) return
    let active = true
    void fetch(`/api/portal/${slug}/dashboard`, { cache: 'no-store' }).then(async (response) => {
      if (!active) return
      if (response.ok) {
        setDashboard(await response.json() as PortalDashboard)
        setAuthenticated(true)
      } else setAuthenticated(false)
    })
    return () => { active = false }
  }, [initiallyAuthenticated, slug])

  const post = async (path: string, body: JsonObject = {}): Promise<JsonObject> => {
    const response = await fetch(`${endpoint}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await response.json().catch(() => ({})) as JsonObject
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Não foi possível concluir')
    return data
  }
  const requestCode = async () => {
    const data = await post('/auth/request-code', { phone })
    setChallengeId(typeof data.challengeId === 'string' ? data.challengeId : '')
    setMessage(typeof data.message === 'string' ? data.message : '')
  }
  const verify = async () => {
    try { await post('/auth/verify-code', { challengeId, code }); await load() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Código inválido') }
  }
  const portalStyle = { '--portal-color': brand.primary_color } as CSSProperties

  return <main className="min-h-screen bg-slate-50 text-slate-950" style={portalStyle}>
    <header className="border-b bg-white"><div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4">{brand.logo_url && <>
      {/* A URL de branding é validada no servidor e pode pertencer a qualquer domínio HTTPS. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={brand.logo_url} alt="" className="h-9 w-9 rounded object-contain" />
    </>}<strong>{brand.display_name}</strong></div></header>
    {!authenticated || !dashboard
      ? <section className="mx-auto max-w-md px-5 py-16"><div className="rounded-2xl border bg-white p-6 shadow-sm"><h1 className="text-2xl font-bold">Acesse seu portal</h1><p className="mt-2 text-sm text-slate-600">Informe o WhatsApp cadastrado. Enviaremos um código de seis dígitos.</p>{!challengeId ? <div className="mt-6 space-y-3"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" className="w-full rounded-lg border px-3 py-2.5" /><button onClick={requestCode} className="w-full rounded-lg px-4 py-2.5 font-semibold text-white" style={{ background: brand.primary_color }}>Enviar código</button></div> : <div className="mt-6 space-y-3"><input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g,''))} placeholder="000000" className="w-full rounded-lg border px-3 py-2.5 text-center text-xl tracking-[.4em]" /><button onClick={verify} className="w-full rounded-lg px-4 py-2.5 font-semibold text-white" style={{ background: brand.primary_color }}>Entrar</button><button onClick={() => { setChallengeId(''); setCode('') }} className="w-full text-sm text-slate-600">Usar outro telefone</button></div>}{message && <p className="mt-4 text-sm text-slate-600">{message}</p>}</div></section>
      : <Dashboard dashboard={dashboard} post={post} reload={load} />}
  </main>
}

function Dashboard({ dashboard, post, reload }: { dashboard: PortalDashboard; post: (path:string, body?:JsonObject)=>Promise<JsonObject>; reload:()=>Promise<void> }) {
  const [notice, setNotice] = useState('')
  const action = async (fn:()=>Promise<unknown>, success:string) => {
    try { await fn(); setNotice(success); await reload() }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Falha') }
  }
  const currency = (value:number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value)
  return <div className="mx-auto max-w-5xl space-y-6 px-5 py-8">
    <div className="flex items-start justify-between"><div><p className="text-sm text-slate-500">Olá,</p><h1 className="text-2xl font-bold">{dashboard.client.name}</h1></div><button onClick={async()=>{await post('/auth/logout'); location.reload()}} className="rounded-lg border bg-white px-3 py-2 text-sm">Sair</button></div>
    {notice && <div className="rounded-lg border bg-white p-3 text-sm">{notice}</div>}
    <div className="grid gap-4 sm:grid-cols-3"><Info label="Situação" value={dashboard.client.status}/><Info label="Vencimento" value={dashboard.client.dueDate ? new Date(`${dashboard.client.dueDate}T12:00:00`).toLocaleDateString('pt-BR'):'—'}/><Info label="Valor atual" value={currency(dashboard.client.amount)}/></div>
    <div className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Serviços</h2><p className="mt-2 text-sm text-slate-600">{dashboard.client.services.join(', ') || 'Nenhum serviço vinculado'}</p></div>
    {dashboard.pendingPix && <div className="rounded-xl border bg-white p-5"><h2 className="font-semibold">PIX pendente</h2><p className="mt-1 text-sm text-slate-600">{currency(Number(dashboard.pendingPix.amount))} · expira {dashboard.pendingPix.expires_at ? new Date(dashboard.pendingPix.expires_at).toLocaleString('pt-BR'):'em breve'}</p>{dashboard.pendingPix.qr_code_base64 && <>
      {/* QR Code já é produzido pelo provedor em base64. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`data:image/png;base64,${dashboard.pendingPix.qr_code_base64}`} alt="QR Code PIX" className="my-4 h-44 w-44" />
    </>}<textarea readOnly value={dashboard.pendingPix.copia_e_cola || ''} className="w-full rounded-lg border bg-slate-50 p-2 text-xs"/><button onClick={()=>navigator.clipboard.writeText(dashboard.pendingPix?.copia_e_cola || '')} className="mt-2 rounded-lg border px-3 py-2 text-sm">Copiar PIX</button></div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{dashboard.features.renewal && <button onClick={()=>action(()=>post('/renew'),'PIX disponível para pagamento.')} className="rounded-xl border bg-white p-4 text-left font-semibold">Renovar plano</button>}{dashboard.features.dueDate && <button onClick={()=>{const dueDate=prompt('Nova data (AAAA-MM-DD)'); if(dueDate) void action(()=>post('/requests/due-date',{dueDate}),'Solicitação enviada.')}} className="rounded-xl border bg-white p-4 text-left font-semibold">Alterar vencimento</button>}{dashboard.features.phone && <button onClick={async()=>{const newPhone=prompt('Novo WhatsApp'); if(!newPhone)return; try {const result=await post('/phone/request',{phone:newPhone}); const verificationId=typeof result.verificationId === 'string' ? result.verificationId : ''; const verificationCode=prompt('Código recebido no novo WhatsApp'); if(verificationCode) await action(()=>post('/phone/verify',{verificationId,code:verificationCode}),'Telefone atualizado.')}catch(error){setNotice(error instanceof Error?error.message:'Falha')}}} className="rounded-xl border bg-white p-4 text-left font-semibold">Atualizar telefone</button>}{dashboard.features.support && <button onClick={()=>action(()=>post('/requests/support'),'Atendimento solicitado.')} className="rounded-xl border bg-white p-4 text-left font-semibold">Falar com atendente</button>}</div>
    <div className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Pagamentos e comprovantes</h2><div className="mt-3 divide-y">{dashboard.history.length ? dashboard.history.map((item)=><div key={`${item.source}-${item.id}`} className="flex items-center justify-between py-3 text-sm"><div><p className="font-medium">{currency(Number(item.amount))}</p><p className="text-slate-500">{item.paidAt ? new Date(item.paidAt).toLocaleDateString('pt-BR'):'Data não identificada'} · {item.method}</p></div>{item.chargeId && <a className="underline" href={`/portal/${dashboard.brand.slug}/comprovante/${item.chargeId}`}>Comprovante</a>}</div>):<p className="py-4 text-sm text-slate-500">Nenhum pagamento encontrado.</p>}</div></div>
  </div>
}

function Info({label,value}:{label:string;value:string}) { return <div className="rounded-xl border bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div> }

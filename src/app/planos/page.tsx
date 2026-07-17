"use client"

import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, LayoutDashboard, Loader2, LockKeyhole, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { PlanCatalogItem, PlanId } from '@/lib/plan-types'

type CheckoutPlan = PlanCatalogItem & { checkout: { stripe: boolean; pix: boolean; affiliateCredit: boolean } }
type PayMethod = 'pix' | 'card' | 'credit'

const PLAN_FEATURES: Record<PlanId, string[]> = {
  starter: ['Até 100 clientes', '1 WhatsApp conectado', 'Painel e financeiro básico', 'Automação básica', 'Promoções'],
  pro: ['Até 500 clientes', '2 WhatsApps conectados', 'Cobrança Inteligente e Autoatendimento', 'Analytics e Portal do Cliente', 'Promoções'],
  master: ['Clientes ilimitados', '3 WhatsApps conectados', 'Todos os recursos do Pro', 'Lembrado Intelligence', 'Revendas, API e Promoções'],
}

export default function PlanosPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [plans, setPlans] = useState<CheckoutPlan[]>([])
  const [currentPlan, setCurrentPlan] = useState<PlanId | null>(null)
  const [selectedId, setSelectedId] = useState<PlanId>('pro')
  const [method, setMethod] = useState<PayMethod>('pix')
  const [affiliateBalance, setAffiliateBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [pixData, setPixData] = useState<{ qr_code: string; qr_image_url: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    void Promise.all([
      fetch('/api/plans').then((response) => response.json()),
      fetch('/api/entitlements', { cache: 'no-store' }).then((response) => response.ok ? response.json() : null),
      supabase.auth.getUser(),
    ]).then(async ([catalog, entitlement, auth]) => {
      if (!active) return
      const loadedPlans = (catalog.plans || []) as CheckoutPlan[]
      setPlans(loadedPlans)
      if (entitlement?.plan) setCurrentPlan(entitlement.plan as PlanId)
      const requested = new URLSearchParams(window.location.search).get('plan') as PlanId | null
      if (requested && loadedPlans.some((plan) => plan.id === requested)) setSelectedId(requested)
      if (auth.data.user) {
        const { data } = await supabase.from('affiliate_earnings').select('amount,status').eq('referrer_id', auth.data.user.id)
        if (active) setAffiliateBalance((data || []).reduce((total, item) => total + (item.status === 'available' || (item.status === 'paid' && Number(item.amount) < 0) ? Number(item.amount) : 0), 0))
      }
    }).catch(() => toast.error('Não foi possível carregar os planos')).finally(() => active && setLoading(false))
    return () => { active = false }
  }, [supabase])

  const selected = plans.find((plan) => plan.id === selectedId) || null
  const price = selected?.monthlyPriceCents == null ? null : selected.monthlyPriceCents / 100
  const hasCredit = price != null && affiliateBalance >= price
  const methods = useMemo(() => selected ? [
    { id: 'pix' as const, label: 'PIX', hint: 'Ativação após a confirmação do gateway', enabled: selected.checkout.pix },
    { id: 'card' as const, label: 'Cartão', hint: 'Assinatura recorrente segura pela Stripe', enabled: selected.checkout.stripe },
    { id: 'credit' as const, label: 'Saldo de afiliado', hint: `Saldo disponível: ${money(affiliateBalance)}`, enabled: selected.checkout.affiliateCredit && hasCredit },
  ] : [], [affiliateBalance, hasCredit, selected])
  const effectiveMethod = methods.some((item) => item.id === method && item.enabled) ? method : methods.find((item) => item.enabled)?.id || method

  const pay = async () => {
    if (!selected?.isPurchasable || price == null) return
    setSubmitting(true)
    try {
      const endpoint = effectiveMethod === 'card' ? '/api/stripe/checkout' : effectiveMethod === 'pix' ? '/api/pixgo/checkout' : '/api/afiliados/converter'
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: selected.id }) })
      if (!response.ok) throw new Error((await response.text()) || 'Não foi possível iniciar o pagamento')
      const data = await response.json()
      if (effectiveMethod === 'card') {
        if (!data.url) throw new Error('Checkout indisponível')
        window.open(data.url, '_self')
      } else if (effectiveMethod === 'pix') {
        setPixData({ qr_code: data.qr_code, qr_image_url: data.qr_image_url })
      } else {
        toast.success('Plano ativado com o saldo de afiliado')
        router.push('/painel')
        router.refresh()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao processar pagamento')
    } finally { setSubmitting(false) }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="size-6 animate-spin" /></div>

  return <div className="min-h-screen bg-background px-4 py-10">
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Planos</p><h1 className="mt-1 text-3xl font-bold">Escolha a estrutura ideal para sua operação</h1><p className="mt-2 text-sm text-muted-foreground">Os limites e recursos são aplicados por organização.</p></div><div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => router.push('/painel')}><LayoutDashboard className="mr-2 size-4" />Painel</Button><Button variant="ghost" size="sm" onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}><LogOut className="mr-2 size-4" />Sair</Button></div></div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const selectedPlan = plan.id === selectedId
          const current = plan.id === currentPlan
          return <button key={plan.id} onClick={() => setSelectedId(plan.id)} className={cn('relative rounded-xl border bg-card p-5 text-left transition-all', selectedPlan ? 'border-primary ring-1 ring-primary' : 'hover:border-foreground/30')}>
            {current && <span className="absolute right-4 top-4 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">Plano atual</span>}
            <h2 className="text-xl font-semibold">{plan.name}</h2><p className="mt-2 min-h-10 text-sm text-muted-foreground">{plan.description}</p>
            <p className="mt-5 text-3xl font-bold">{plan.monthlyPriceCents == null ? 'Preço a definir' : money(plan.monthlyPriceCents / 100)}{plan.monthlyPriceCents != null && <span className="text-sm font-normal text-muted-foreground">/mês</span>}</p>
            <ul className="mt-5 space-y-2">{PLAN_FEATURES[plan.id].map((feature) => <li key={feature} className="flex gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />{feature}</li>)}</ul>
          </button>
        })}
      </div>

      {selected && <div className="mx-auto mt-6 max-w-2xl rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between"><div><h2 className="font-semibold">Contratar {selected.name}</h2><p className="text-sm text-muted-foreground">O servidor confirma plano e valor antes de criar a cobrança.</p></div>{price != null && <strong>{money(price)}/mês</strong>}</div>
        {!selected.isPurchasable || price == null ? <div className="mt-5 flex items-center gap-3 rounded-lg bg-muted p-4 text-sm text-muted-foreground"><LockKeyhole className="size-4" />Este plano está estruturado, mas o preço comercial ainda não foi ativado.</div> : <>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">{methods.map((item) => <button key={item.id} disabled={!item.enabled} onClick={() => setMethod(item.id)} className={cn('rounded-lg border p-3 text-left disabled:cursor-not-allowed disabled:opacity-40', effectiveMethod === item.id && item.enabled && 'border-primary bg-primary/5')}><span className="block text-sm font-semibold">{item.label}</span><span className="mt-1 block text-[11px] text-muted-foreground">{item.hint}</span></button>)}</div>
          <Button className="mt-4 w-full" disabled={submitting || !methods.some((item) => item.id === effectiveMethod && item.enabled)} onClick={pay}>{submitting && <Loader2 className="mr-2 size-4 animate-spin" />}Contratar {selected.name}</Button>
        </>}
      </div>}
    </div>

    <Dialog open={Boolean(pixData)} onOpenChange={(open) => !open && setPixData(null)}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Pagamento via PIX</DialogTitle><DialogDescription>Escaneie o QR Code ou copie o código.</DialogDescription></DialogHeader>{pixData && <div className="flex flex-col items-center gap-4 py-2"><div className="rounded-lg border bg-white p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pixData.qr_image_url} alt="QR Code PIX" className="size-44" />
    </div><div className="flex w-full gap-2"><div className="line-clamp-2 flex-1 break-all rounded-md bg-muted p-3 text-xs">{pixData.qr_code}</div><Button variant="outline" size="icon" onClick={() => { void navigator.clipboard.writeText(pixData.qr_code); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}</Button></div></div>}<DialogFooter><Button variant="outline" onClick={() => setPixData(null)}>Fechar</Button><Button onClick={() => router.push('/painel')}>Já paguei</Button></DialogFooter></DialogContent></Dialog>
  </div>
}

function money(value: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value) }

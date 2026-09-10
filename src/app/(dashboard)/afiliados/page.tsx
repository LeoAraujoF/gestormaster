"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { formatCurrency, cn } from "@/lib/utils"
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Clock3,
  Copy,
  Link2,
  Percent,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { MetricGrid, PageHeader, PageShell, SectionCard } from "@/components/page-layout"

const MONTHLY_COST = 20.00
const MIN_WITHDRAWAL = 50.00
const COMMISSION_RATE = 30
const HOLD_DAYS = 7

type ReferredUser = {
  id: string
  full_name: string | null
  created_at: string
}

function initialsOf(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return "?"
  return trimmed.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()
}

function monthYearOf(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
}

export default function AfiliadosPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string>("")
  const [earnings, setEarnings] = useState<any[]>([])
  const [referredUsers, setReferredUsers] = useState<ReferredUser[]>([])
  const [stats, setStats] = useState({
    totalIndicados: 0,
    saldoPendente: 0,
    saldoDisponivel: 0,
    comissaoMes: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [linkCopied, setLinkCopied] = useState(false)

  // Modals
  const [isPixOpen, setIsPixOpen] = useState(false)
  const [pixKey, setPixKey] = useState("")
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [isWithdrawing, setIsWithdrawing] = useState(false)

  const [isConvertOpen, setIsConvertOpen] = useState(false)
  const [isConverting, setIsConverting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      // 1. Busca os negócios indicados (dados reais, mesma linha já permitida por RLS)
      const { data: referred, error: referredErr } = await supabase
        .from('users')
        .select('id, full_name, created_at')
        .eq('referred_by', user.id)
        .order('created_at', { ascending: false })

      if (referredErr) throw referredErr

      // 2. Busca os extratos de comissão em R$
      const { data: comissoes, error: comissoesErr } = await supabase
        .from('affiliate_earnings')
        .select(`
          *,
          referred_user:users!referred_user_id(full_name)
        `)
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false })

      if (comissoesErr) throw comissoesErr

      let pendente = 0
      let disponivel = 0
      let comissaoMes = 0
      const now = new Date()

      comissoes?.forEach(c => {
        if (c.status === 'pending' && Number(c.amount) > 0) pendente += Number(c.amount)
        if (c.status === 'available') disponivel += Number(c.amount)
        if (c.status === 'paid' && Number(c.amount) < 0) disponivel += Number(c.amount) // Deduções (saque ou conversão)

        // Comissões recebidas no mês corrente (entradas positivas)
        const d = new Date(c.created_at)
        if (Number(c.amount) > 0 && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
          comissaoMes += Number(c.amount)
        }
      })

      setStats({
        totalIndicados: referred?.length || 0,
        saldoPendente: pendente,
        saldoDisponivel: disponivel,
        comissaoMes,
      })

      setReferredUsers(referred || [])
      setEarnings(comissoes || [])
    } catch (error: any) {
      toast.error("Erro ao carregar painel: " + (error?.message || JSON.stringify(error)))
      console.error("ERRO COMPLETO AFILIADOS:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const affiliateUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/cadastro?ref=${userId}`
    : `.../cadastro?ref=${userId}`

  function copyAffiliateLink() {
    const url = `${window.location.origin}/cadastro?ref=${userId}`

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url)
      setLinkCopied(true)
      toast.success("Link copiado! Compartilhe para ganhar comissões.")
      setTimeout(() => setLinkCopied(false), 2000)
    } else {
      // Fallback para quando acessado via IP na rede local (http não-seguro)
      const textArea = document.createElement("textarea")
      textArea.value = url
      textArea.style.position = "fixed"
      textArea.style.left = "-999999px"
      textArea.style.top = "-999999px"
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      try {
        document.execCommand('copy')
        setLinkCopied(true)
        toast.success("Link copiado! Compartilhe para ganhar comissões.")
        setTimeout(() => setLinkCopied(false), 2000)
      } catch (err) {
        console.error('Falha ao copiar link', err)
        toast.error("Não foi possível copiar automaticamente. Tente copiar manualmente.")
      }
      textArea.remove()
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(withdrawAmount)

    if (isNaN(amount) || amount < MIN_WITHDRAWAL) {
      toast.error(`O valor mínimo para saque é de ${formatCurrency(MIN_WITHDRAWAL)}.`)
      return
    }

    if (amount > stats.saldoDisponivel) {
      toast.error("Saldo insuficiente.")
      return
    }

    if (!pixKey) {
      toast.error("Informe a chave PIX.")
      return
    }

    setIsWithdrawing(true)
    try {
      const response = await fetch('/api/afiliados/sacar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, pixKey })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Erro ao solicitar saque")

      toast.success("Solicitação de saque enviada com sucesso!")
      setIsPixOpen(false)
      loadData()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsWithdrawing(false)
    }
  }

  async function handleConvert() {
    if (stats.saldoDisponivel < MONTHLY_COST) {
      toast.error(`Você precisa de pelo menos ${formatCurrency(MONTHLY_COST)} para trocar por um mês grátis.`)
      return
    }

    setIsConverting(true)
    try {
      const response = await fetch('/api/afiliados/converter', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Erro ao converter saldo")

      toast.success("Sucesso! Você ganhou +30 dias de acesso ao Lembrado Pro.")
      setIsConvertOpen(false)
      loadData()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsConverting(false)
    }
  }

  const rowDescription = (e: any) => {
    const isSaque = Number(e.amount) < 0
    if (isSaque) {
      return e.payment_id?.startsWith('withdrawal') ? 'Saque via PIX' : 'Conversão (mês grátis)'
    }
    return `Comissão · ${e.referred_user?.full_name || 'nova assinatura (link)'}`
  }

  // Total já sacado via PIX (real, derivado do próprio extrato — não é saldo, é histórico de pagamentos recebidos)
  const totalSacado = useMemo(() => {
    return earnings
      .filter((e) => Number(e.amount) < 0 && e.payment_id?.startsWith('withdrawal'))
      .reduce((sum, e) => sum + Math.abs(Number(e.amount)), 0)
  }, [earnings])

  // Comissão gerada por cada indicado (real, somada a partir do próprio extrato)
  const commissionByReferredUser = useMemo(() => {
    const map = new Map<string, number>()
    earnings.forEach((e) => {
      if (e.referred_user_id && Number(e.amount) > 0) {
        map.set(e.referred_user_id, (map.get(e.referred_user_id) || 0) + Number(e.amount))
      }
    })
    return map
  }, [earnings])

  return (
    <PageShell width="default">
      <PageHeader
        eyebrow="Programa de indicação"
        title="Afiliados"
        description="Indique o Lembrado para outros negócios e receba comissão recorrente enquanto o cliente indicado continuar ativo."
        badge={`${COMMISSION_RATE}% recorrente`}
        actions={<Button variant="outline" onClick={() => setIsPixOpen(true)}>Solicitar saque</Button>}
      />

      {/* Link de indicação */}
      <div className="overflow-hidden rounded-2xl border border-interactive bg-interactive-bg">
        <div className="flex flex-wrap items-center gap-4 px-5 py-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card text-interactive-fg">
            <Link2 className="size-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1" style={{ minWidth: 200 }}>
            <p className="text-[13.5px] font-semibold text-foreground">Seu link de indicação</p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">Cada cadastro feito por ele já entra vinculado à sua conta.</p>
          </div>
          <div className="flex min-w-[240px] flex-1 items-center gap-2">
            <div className="num h-10 min-w-0 flex-1 truncate rounded-[9px] border border-border bg-card px-3 text-xs leading-10 text-foreground">
              {affiliateUrl}
            </div>
            <Button onClick={copyAffiliateLink} className="h-10 shrink-0 gap-1.5 rounded-[9px] px-3.5 text-xs">
              {linkCopied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
              {linkCopied ? "Copiado!" : "Copiar link"}
            </Button>
          </div>
        </div>
      </div>

      {/* KPIs (5g): cards hairline com microlabel + valor mono */}
      {isLoading ? (
        <MetricGrid columns={4}>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[86px] rounded-2xl" />)}
        </MetricGrid>
      ) : (
        <MetricGrid columns={4}>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="microlabel">Indicados</p>
                <p className="num mt-2 text-[20px] font-semibold tracking-[-0.02em]">{stats.totalIndicados}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">negócios vinculados ao seu link</p>
              </div>
              <span className="shrink-0 rounded-lg bg-interactive-bg p-2 text-interactive-fg"><Users className="size-4" aria-hidden="true" /></span>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="microlabel">Comissão/mês</p>
                <p className="num mt-2 whitespace-nowrap text-[20px] font-semibold tracking-[-0.02em] text-money">
                  {formatCurrency(stats.comissaoMes)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">gerada no mês corrente</p>
              </div>
              <span className="shrink-0 rounded-lg bg-success-bg p-2 text-success-fg"><TrendingUp className="size-4" aria-hidden="true" /></span>
            </div>
          </div>
          <div className="rounded-2xl border border-warning-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="microlabel">Pendente</p>
                <p className="num mt-2 whitespace-nowrap text-[20px] font-semibold tracking-[-0.02em] text-warning">
                  {formatCurrency(stats.saldoPendente)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">libera em até {HOLD_DAYS} dias</p>
              </div>
              <span className="shrink-0 rounded-lg bg-warning-bg p-2 text-warning-fg"><Clock3 className="size-4" aria-hidden="true" /></span>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="microlabel">Saldo disponível</p>
                <p className="num mt-2 whitespace-nowrap text-[20px] font-semibold tracking-[-0.02em]">
                  {formatCurrency(stats.saldoDisponivel)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">pronto para saque</p>
              </div>
              <span className="shrink-0 rounded-lg bg-secondary p-2 text-secondary-foreground"><Wallet className="size-4" aria-hidden="true" /></span>
            </div>
          </div>
        </MetricGrid>
      )}

      {/* Como funciona: fatos reais do programa, sem faixas progressivas fictícias */}
      <SectionCard title="Como funciona a comissão" description="Regras fixas do programa, válidas para todos os afiliados.">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-start gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-interactive-bg text-interactive-fg"><Percent className="size-[15px]" aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-foreground">{COMMISSION_RATE}% recorrente</p>
              <p className="mt-0.5 text-[11px] leading-[1.5] text-muted-foreground">Sobre a mensalidade de cada indicado, todo mês em que ele estiver ativo.</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-warning-bg text-warning-fg"><Clock3 className="size-[15px]" aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-foreground">Libera em {HOLD_DAYS} dias</p>
              <p className="mt-0.5 text-[11px] leading-[1.5] text-muted-foreground">Cada comissão fica pendente por {HOLD_DAYS} dias após o pagamento do indicado, evitando reembolsos.</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-secondary text-secondary-foreground"><Wallet className="size-[15px]" aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-foreground">Saque via PIX</p>
              <p className="mt-0.5 text-[11px] leading-[1.5] text-muted-foreground">Peça o saque quando quiser, a partir de {formatCurrency(MIN_WITHDRAWAL)} de saldo disponível.</p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Indicados: negócios reais trazidos pelo link, com a comissão que cada um já gerou */}
      <SectionCard
        title="Indicados"
        description={stats.totalIndicados > 0 ? `${stats.totalIndicados} negócio${stats.totalIndicados === 1 ? "" : "s"} vinculado${stats.totalIndicados === 1 ? "" : "s"} ao seu link.` : undefined}
        contentClassName="p-0"
      >
        {isLoading ? (
          <div className="p-5 text-center text-[11.5px] text-muted-foreground">Carregando…</div>
        ) : referredUsers.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[12.5px] font-semibold">Você ainda não tem indicados</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Compartilhe seu link acima para começar.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {referredUsers.map((r) => {
              const generated = commissionByReferredUser.get(r.id) || 0
              return (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-interactive-bg text-[10.5px] font-semibold text-interactive-fg">
                    {initialsOf(r.full_name || "?")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-foreground">{r.full_name || "Negócio indicado"}</p>
                    <p className="mt-0.5 text-[10.5px] text-muted-foreground">desde {monthYearOf(r.created_at)}</p>
                  </div>
                  <span className={cn("num shrink-0 whitespace-nowrap text-[12px] font-semibold", generated > 0 ? "text-money" : "text-muted-foreground")}>
                    {generated > 0 ? `${formatCurrency(generated)} gerados` : "Sem comissão ainda"}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      {/* Extrato: linhas flat hairline, valor mono à direita */}
      <SectionCard
        title="Extrato de comissões"
        description={totalSacado > 0 ? `Entradas, liberações, conversões e saques. ${formatCurrency(totalSacado)} já sacados via PIX.` : "Entradas, liberações, conversões e saques registrados na sua conta."}
        contentClassName="p-0"
        footer={
          <div className="flex w-full items-center justify-end gap-3">
            <button
              onClick={() => setIsConvertOpen(true)}
              className="text-[11.5px] font-medium text-interactive hover:underline"
            >
              Trocar por mês grátis
            </button>
            <Button variant="outline" size="sm" onClick={() => setIsPixOpen(true)} className="h-8 text-xs">
              Solicitar saque
            </Button>
          </div>
        }
      >
        {isLoading ? (
          <div className="px-5 py-8 text-center text-[11.5px] text-muted-foreground">Carregando…</div>
        ) : earnings.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[12.5px] font-semibold">Nenhuma movimentação ainda</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Compartilhe seu link para começar a ganhar.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {earnings.map((e) => {
              const isSaque = Number(e.amount) < 0
              return (
                <div key={e.id} className="flex items-center gap-3 px-5 py-3">
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-[9px]", isSaque ? "bg-secondary text-secondary-foreground" : "bg-success-bg text-success-fg")}>
                    {isSaque ? <ArrowDownRight className="size-[15px]" aria-hidden="true" /> : <ArrowUpRight className="size-[15px]" aria-hidden="true" />}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate text-[12.5px] font-medium">{rowDescription(e)}</span>
                    <span className="num text-[10.5px] text-muted-foreground">
                      {new Date(e.created_at).toLocaleDateString('pt-BR')}
                    </span>
                    {e.status === 'pending' && (
                      <span className="flex items-center gap-1 text-[10.5px] text-warning">
                        <span className="status-dot bg-warning" /> pendente
                      </span>
                    )}
                    {e.status === 'rejected' && (
                      <span className="flex items-center gap-1 text-[10.5px] text-danger">
                        <span className="status-dot bg-danger" /> recusado
                      </span>
                    )}
                  </div>
                  <span className={cn(
                    "num shrink-0 whitespace-nowrap text-[12.5px] font-semibold",
                    isSaque ? "text-danger" : "text-money"
                  )}>
                    {isSaque ? "-" : "+"}{formatCurrency(Math.abs(e.amount)).replace("R$", "").trim()}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      {/* Modal PIX */}
      <Dialog open={isPixOpen} onOpenChange={setIsPixOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar saque (PIX)</DialogTitle>
            <DialogDescription>
              Você pode sacar seu saldo disponível direto para sua conta bancária. O valor mínimo é {formatCurrency(MIN_WITHDRAWAL)}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleWithdraw}>
            <div className="space-y-4 py-4">
              <p className="text-[11.5px] text-muted-foreground">
                Saldo disponível: <span className="num font-semibold text-money">{formatCurrency(stats.saldoDisponivel)}</span>
              </p>
              <div className="space-y-2">
                <Label htmlFor="amount">Valor do saque (R$)</Label>
                <Input
                  id="amount"
                  type="number"
                  min={MIN_WITHDRAWAL}
                  max={stats.saldoDisponivel}
                  step="0.01"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="Ex: 100.00"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pixKey">Sua chave PIX</Label>
                <Input
                  id="pixKey"
                  type="text"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder="CPF, e-mail, celular ou aleatória"
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsPixOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isWithdrawing || stats.saldoDisponivel < MIN_WITHDRAWAL}>
                {isWithdrawing ? "Processando…" : "Solicitar saque"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Converter */}
      <Dialog open={isConvertOpen} onOpenChange={setIsConvertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trocar por mês grátis</DialogTitle>
            <DialogDescription>
              Usar <strong className="num text-foreground">{formatCurrency(MONTHLY_COST)}</strong> do seu saldo para assinar o Lembrado Pro por +30 dias?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Seu saldo disponível atual é de {formatCurrency(stats.saldoDisponivel)}. Após a troca, você ficará com {formatCurrency(stats.saldoDisponivel - MONTHLY_COST)}.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsConvertOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleConvert}
              disabled={isConverting || stats.saldoDisponivel < MONTHLY_COST}
            >
              {isConverting ? "Ativando…" : "Sim, quero +1 mês"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </PageShell>
  )
}

"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { formatCurrency, cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { AccountTabs } from "@/components/account-tabs"
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
import { MetricGrid, PageHeader, PageSection, PageShell } from "@/components/page-layout"

const MONTHLY_COST = 20.00
const MIN_WITHDRAWAL = 50.00

export default function AfiliadosPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string>("")
  const [earnings, setEarnings] = useState<any[]>([])
  const [stats, setStats] = useState({
    totalIndicados: 0,
    saldoPendente: 0,
    saldoDisponivel: 0,
    comissaoMes: 0,
  })
  const [isLoading, setIsLoading] = useState(true)

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

      // 1. Busca total de indicados
      const { count: indicadosCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('referred_by', user.id)

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
        totalIndicados: indicadosCount || 0,
        saldoPendente: pendente,
        saldoDisponivel: disponivel,
        comissaoMes,
      })

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
      toast.success("Link copiado! Compartilhe para ganhar comissões.")
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
        toast.success("Link copiado! Compartilhe para ganhar comissões.")
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

  return (
    <PageShell width="default">
      <PageHeader eyebrow="Programa de indicação" title="Afiliados" description="Acompanhe comissões, saldo disponível e seu histórico de movimentações." badge="30% recorrente" actions={<Button variant="outline" onClick={() => setIsPixOpen(true)}>Solicitar saque</Button>} />
      <AccountTabs />

      {/* Link de indicação */}
      <div className="rounded-lg border border-border bg-card px-4 py-4">
        <p className="mb-2 text-[11.5px] font-medium">Seu link de indicação</p>
        <div className="flex items-center gap-2 rounded-md bg-secondary py-1.5 pl-3 pr-1.5">
          <span className="num min-w-0 flex-1 truncate text-xs text-foreground">{affiliateUrl}</span>
          <Button size="sm" onClick={copyAffiliateLink} className="h-7 shrink-0 px-3 text-xs">
            Copiar
          </Button>
        </div>
      </div>

      {/* KPIs (5g): cards hairline com microlabel + valor mono */}
      {isLoading ? (
        <MetricGrid columns={4}>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[72px] rounded-lg" />)}
        </MetricGrid>
      ) : (
        <MetricGrid columns={4}>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="microlabel">Indicados ativos</p>
            <p className="num mt-1 text-[18px] font-semibold tracking-[-0.02em]">{stats.totalIndicados}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="microlabel">Comissão/mês</p>
            <p className="num mt-1 whitespace-nowrap text-[18px] font-semibold tracking-[-0.02em] text-money">
              {formatCurrency(stats.comissaoMes)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="microlabel">Pendente</p>
            <p className="num mt-1 whitespace-nowrap text-[18px] font-semibold tracking-[-0.02em] text-warning">
              {formatCurrency(stats.saldoPendente)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="microlabel">Saldo</p>
            <p className="num mt-1 whitespace-nowrap text-[18px] font-semibold tracking-[-0.02em]">
              {formatCurrency(stats.saldoDisponivel)}
            </p>
          </div>
        </MetricGrid>
      )}

      {/* Extrato: linhas flat hairline, valor mono à direita */}
      <PageSection title="Extrato de comissões" description="Entradas, liberações, conversões e saques registrados na sua conta.">
      <div className="rounded-lg border border-border bg-card">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-[11.5px] text-muted-foreground">Carregando…</div>
        ) : earnings.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[12.5px] font-semibold">Nenhuma movimentação ainda</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Compartilhe seu link para começar a ganhar.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {earnings.map((e) => {
              const isSaque = Number(e.amount) < 0
              return (
                <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate text-[12.5px]">{rowDescription(e)}</span>
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
      </div>
      </PageSection>

      {/* Ações do extrato */}
      <div className="flex items-center justify-end gap-3">
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

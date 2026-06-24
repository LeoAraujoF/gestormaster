"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Copy, Users, Wallet, TrendingUp, DollarSign, CalendarPlus, Activity } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

const MONTHLY_COST = 20.00
const MIN_WITHDRAWAL = 50.00

export default function AfiliadosPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string>("")
  const [earnings, setEarnings] = useState<any[]>([])
  const [stats, setStats] = useState({
    totalIndicados: 0,
    saldoPendente: 0,
    saldoDisponivel: 0
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
      const { count: indicadosCount, error: indicadosErr } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('referred_by', user.id)

      // 2. Busca os extratos de comissão em R$
      const { data: comissoes, error: comissoesErr } = await supabase
        .from('affiliate_earnings')
        .select(`
          *,
          referred_user:users(full_name)
        `)
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false })

      if (comissoesErr) throw comissoesErr

      let pendente = 0
      let disponivel = 0

      comissoes?.forEach(c => {
        if (c.status === 'pending' && Number(c.amount) > 0) pendente += Number(c.amount)
        if (c.status === 'available') disponivel += Number(c.amount)
        if (c.status === 'paid' && Number(c.amount) < 0) disponivel += Number(c.amount) // Deduções (saque ou conversão)
      })

      setStats({
        totalIndicados: indicadosCount || 0,
        saldoPendente: pendente,
        saldoDisponivel: disponivel
      })
      
      setEarnings(comissoes || [])
    } catch (error: any) {
      toast.error("Erro ao carregar painel")
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  function copyAffiliateLink() {
    const url = `${window.location.origin}/cadastro?ref=${userId}`
    navigator.clipboard.writeText(url)
    toast.success("Link copiado! Compartilhe para ganhar comissões.")
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

      toast.success("Sucesso! Você ganhou +30 dias de acesso ao Gestor Pro.")
      setIsConvertOpen(false)
      loadData()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsConverting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Indique e Ganhe</h1>
          <p className="text-muted-foreground mt-1">Acumule comissões em dinheiro, saque via PIX ou troque por meses grátis.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-card bg-gradient-to-br from-primary/10 via-background to-background md:col-span-2">
          <CardHeader className="pb-2">
            <CardDescription className="text-muted-foreground font-medium flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary" /> Saldo Disponível (R$)
            </CardDescription>
            <div className="flex justify-between items-end">
              <CardTitle className="text-4xl font-bold text-primary">
                {formatCurrency(stats.saldoDisponivel)}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              <Button 
                onClick={() => setIsPixOpen(true)} 
                className="flex-1" 
                variant="default"
              >
                <DollarSign className="w-4 h-4 mr-2" />
                Sacar via PIX
              </Button>
              <Button 
                onClick={() => setIsConvertOpen(true)} 
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white" 
                variant="outline"
              >
                <CalendarPlus className="w-4 h-4 mr-2" />
                Trocar por Mês Grátis
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardDescription className="text-muted-foreground font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-500" /> Saldo Pendente
              </CardDescription>
              <CardTitle className="text-2xl font-bold">
                {formatCurrency(stats.saldoPendente)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardDescription className="text-muted-foreground font-medium flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-500" /> Cadastros Indicados
              </CardDescription>
              <CardTitle className="text-2xl font-bold">
                {stats.totalIndicados} <span className="text-sm font-normal text-muted-foreground">usuários</span>
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      </div>

      <Card className="glass-card border-primary/20">
        <CardHeader>
          <CardTitle>Seu Link de Indicação</CardTitle>
          <CardDescription>Envie este link. Você ganha 30% de comissão sempre que alguém assinar.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 bg-secondary/50 rounded-lg p-4 font-mono text-sm break-all border border-border/50 flex items-center">
              {typeof window !== 'undefined' ? `${window.location.origin}/cadastro?ref=${userId}` : `.../cadastro?ref=${userId}`}
            </div>
            <Button size="lg" onClick={copyAffiliateLink} className="sm:w-auto w-full shrink-0">
              <Copy className="w-4 h-4 mr-2" />
              Copiar Link
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Extrato Financeiro</CardTitle>
          <CardDescription>Acompanhe suas entradas de comissão e saídas.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : earnings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-lg border-dashed">
              Nenhuma movimentação ainda. Compartilhe seu link!
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {earnings.map((e) => {
                  const isSaque = Number(e.amount) < 0
                  return (
                    <TableRow key={e.id}>
                      <TableCell>{new Date(e.created_at).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell>
                        {isSaque 
                          ? e.payment_id?.startsWith('withdrawal') ? 'Saque via PIX' : 'Conversão (Mês Grátis)'
                          : `Comissão de ${e.referred_user?.full_name || 'Usuário'}`
                        }
                      </TableCell>
                      <TableCell className={`font-medium ${isSaque ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {isSaque ? '' : '+'} {formatCurrency(Math.abs(e.amount))}
                      </TableCell>
                      <TableCell>
                        {e.status === 'pending' && <Badge variant="outline" className="bg-amber-500/10 text-amber-500">Pendente</Badge>}
                        {e.status === 'available' && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500">Liberado</Badge>}
                        {e.status === 'paid' && <Badge variant="secondary">Concluído</Badge>}
                        {e.status === 'rejected' && <Badge variant="destructive">Rejeitado</Badge>}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal PIX */}
      <Dialog open={isPixOpen} onOpenChange={setIsPixOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar Saque (PIX)</DialogTitle>
            <DialogDescription>
              Você pode sacar seu saldo disponível direto para sua conta bancária. O valor mínimo é {formatCurrency(MIN_WITHDRAWAL)}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleWithdraw}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Saldo Disponível: <span className="font-bold text-emerald-500">{formatCurrency(stats.saldoDisponivel)}</span></Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Valor do Saque (R$)</Label>
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
                <Label htmlFor="pixKey">Sua Chave PIX</Label>
                <Input
                  id="pixKey"
                  type="text"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder="CPF, E-mail, Celular ou Aleatória"
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsPixOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isWithdrawing || stats.saldoDisponivel < MIN_WITHDRAWAL}>
                {isWithdrawing ? "Processando..." : "Solicitar Saque"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Converter */}
      <Dialog open={isConvertOpen} onOpenChange={setIsConvertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trocar por Mês Grátis</DialogTitle>
            <DialogDescription>
              Você deseja usar <strong className="text-primary">{formatCurrency(MONTHLY_COST)}</strong> do seu saldo em dinheiro para assinar o plano Gestor Pro por +30 dias?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Seu saldo disponível atual é de {formatCurrency(stats.saldoDisponivel)}. Após a troca, você ficará com {formatCurrency(stats.saldoDisponivel - MONTHLY_COST)}.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setIsConvertOpen(false)}>Cancelar</Button>
            <Button 
              onClick={handleConvert} 
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={isConverting || stats.saldoDisponivel < MONTHLY_COST}
            >
              {isConverting ? "Ativando..." : "Sim, Quero +1 Mês"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

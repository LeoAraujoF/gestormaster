"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ArrowLeft, Loader2, DollarSign, TrendingUp, TrendingDown, Users, CheckCircle2, Clock } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { formatCurrency } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

export default function RevendasMetricsPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [isLoading, setIsLoading] = useState(true)
  const [metrics, setMetrics] = useState({
    totalEarned: 0,
    dailyEarned: 0,
    totalProfit: 0,
    dailyProfit: 0,
    totalResellers: 0,
    pendingRequests: 0,
  })
  const [recentRequests, setRecentRequests] = useState<any[]>([])

  useEffect(() => {
    loadMetrics()
  }, [])

  async function loadMetrics() {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Obter revendedores do usuário logado
      const { data: resellers, error: resellersErr } = await supabase
        .from("resellers")
        .select("id")
        .eq("user_id", user.id)

      if (resellersErr) throw resellersErr
      
      const resellerIds = resellers?.map(r => r.id) || []
      
      if (resellerIds.length === 0) {
        setIsLoading(false)
        return
      }

      // Obter solicitações para calcular métricas
      const { data: requests, error: requestsErr } = await supabase
        .from("credit_requests")
        .select("*, resellers(name)")
        .in("reseller_id", resellerIds)
        .order("created_at", { ascending: false })

      if (requestsErr) throw requestsErr

      const allReqs = requests || []
      
      // Calcular valores
      const completedReqs = allReqs.filter(r => r.status === "completed")
      const totalEarned = completedReqs.reduce((acc, curr) => acc + Number(curr.total_value), 0)
      const totalProfit = completedReqs.reduce((acc, curr) => acc + Number(curr.net_profit || 0), 0)
      
      // Calcular valor do dia (hoje)
      const today = new Date().toISOString().split('T')[0]
      const dailyReqs = completedReqs.filter(r => r.created_at.startsWith(today))
      const dailyEarned = dailyReqs.reduce((acc, curr) => acc + Number(curr.total_value), 0)
      const dailyProfit = dailyReqs.reduce((acc, curr) => acc + Number(curr.net_profit || 0), 0)

      const pendingCount = allReqs.filter(r => r.status === "pending_payment" || r.status === "paid").length

      setMetrics({
        totalEarned,
        dailyEarned,
        totalProfit,
        dailyProfit,
        totalResellers: resellerIds.length,
        pendingRequests: pendingCount
      })

      // Últimas solicitações (historico)
      setRecentRequests(allReqs.slice(0, 10))

    } catch (error: any) {
      toast.error("Erro ao carregar métricas")
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => router.push('/revendas')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Métricas de Revenda</h1>
          <p className="text-muted-foreground mt-1">Acompanhe seu faturamento e volume de solicitações da sua rede.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-card bg-gradient-to-br from-emerald-500/10 to-transparent">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Lucro Líquido (Hoje)</CardTitle>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(metrics.dailyProfit)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total Movimentado: {formatCurrency(metrics.dailyEarned)}</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Lucro Líquido (Total)</CardTitle>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.totalProfit)}</div>
            <p className="text-xs text-muted-foreground mt-1">Total Movimentado: {formatCurrency(metrics.totalEarned)}</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Revendedores Ativos</CardTitle>
            <Users className="w-4 h-4 text-sky-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalResellers}</div>
            <p className="text-xs text-muted-foreground mt-1">Parceiros cadastrados.</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-amber-500/30">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Pendentes/Aguardando</CardTitle>
            <Clock className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-500">{metrics.pendingRequests}</div>
            <p className="text-xs text-muted-foreground mt-1">Requerem sua atenção.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Últimas Movimentações</CardTitle>
          <CardDescription>Histórico das últimas 10 solicitações de recarga da sua rede.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentRequests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Nenhuma movimentação registrada.</div>
          ) : (
            <div className="rounded-md border border-border/50">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/30">
                    <TableHead>Data</TableHead>
                    <TableHead>Revendedor</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Total Pago</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentRequests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(req.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-medium">{req.resellers?.name}</TableCell>
                      <TableCell>{req.service_name}</TableCell>
                      <TableCell className="font-semibold text-foreground">
                        {formatCurrency(req.total_value)}
                      </TableCell>
                      <TableCell>
                        {req.status === 'completed' ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Concluído</Badge>
                        ) : req.status === 'canceled' ? (
                          <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">Cancelado</Badge>
                        ) : req.status === 'paid' ? (
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">Pago (Aguardando)</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">Aguardando Pgto</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

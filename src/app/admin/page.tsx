"use client"

import { useState, useEffect } from "react"
import { 
  Users, DollarSign, Activity, MessageCircle, ShieldAlert,
  Loader2, RefreshCw, Server, Power, Smartphone
} from "lucide-react"
import { formatCurrency } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function AdminOverviewPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Data states
  const [metrics, setMetrics] = useState<any>(null)
  const [systemHealth, setSystemHealth] = useState<any>(null)

  const checkAdminAndLoadData = async () => {
    setIsLoading(true)
    try {
      // 1. Verifica se é admin pelas métricas
      const resMetrics = await fetch('/api/admin/metrics')
      if (!resMetrics.ok) {
        setIsAdmin(false)
        return
      }
      const metricsData = await resMetrics.json()
      setMetrics(metricsData)
      setIsAdmin(true)

      // 2. Carrega Saúde do Sistema
      const resHealth = await fetch('/api/admin/health')
      if (resHealth.ok) {
        const healthData = await resHealth.json()
        if (healthData.success) {
          setSystemHealth(healthData.services)
        }
      }

    } catch (e) {
      console.error(e)
      setIsAdmin(false)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    checkAdminAndLoadData()
  }, [])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-danger" />
        <p className="text-muted-foreground animate-pulse">Carregando painel master...</p>
      </div>
    )
  }

  if (isAdmin === false) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
        <ShieldAlert className="w-16 h-16 text-destructive" />
        <h2 className="text-2xl font-bold">Acesso Negado</h2>
        <p className="text-muted-foreground">Esta página é restrita ao administrador do sistema.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-start flex-col sm:flex-row gap-4">
        <div>
          <h1 className="text-[17px] font-semibold tracking-[-0.02em] mb-2 flex items-center gap-2">
            Visão Geral
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Métricas globais da plataforma e saúde das instâncias e servidores.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-500/5 rounded-bl-full -z-10" />
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 rounded-xl">
              <DollarSign className="w-5 h-5 text-emerald-500" />
            </div>
            <h3 className="font-medium text-muted-foreground">MRR Global</h3>
          </div>
          <p className="text-3xl font-bold mt-2 text-emerald-500">{formatCurrency(metrics?.totalMRR || 0)}</p>
          <p className="text-xs text-muted-foreground">Volume transacionado pelos clientes</p>
        </div>

        <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-secondary rounded-bl-full -z-10" />
          <div className="flex items-center gap-3">
            <div className="p-3 bg-secondary rounded-xl">
              <Users className="w-5 h-5 text-interactive" />
            </div>
            <h3 className="font-medium text-muted-foreground">Usuários SaaS</h3>
          </div>
          <p className="text-3xl font-bold mt-2">{metrics?.totalUsers || 0}</p>
          <p className="text-xs text-muted-foreground">{metrics?.totalActiveClients || 0} clientes finais geridos</p>
        </div>

        <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-secondary rounded-bl-full -z-10" />
          <div className="flex items-center gap-3">
            <div className="p-3 bg-secondary rounded-xl">
              <Smartphone className="w-5 h-5 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-muted-foreground">WhatsApps Conectados</h3>
          </div>
          <p className="text-3xl font-bold mt-2 text-muted-foreground">{metrics?.totalInstances || 0}</p>
          <p className="text-xs text-muted-foreground">Instâncias em banco de dados</p>
        </div>

        <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-amber-500/5 rounded-bl-full -z-10" />
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 rounded-xl">
              <MessageCircle className="w-5 h-5 text-amber-500" />
            </div>
            <h3 className="font-medium text-muted-foreground">Disparos Mês</h3>
          </div>
          <p className="text-3xl font-bold mt-2 text-amber-500">{metrics?.totalMessagesMonth || 0}</p>
          <p className="text-xs text-muted-foreground">Mensagens entregues com sucesso</p>
        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-12 mb-4 gap-4">
        <h3 className="text-xl font-bold flex items-center gap-2">
          <Activity className="w-5 h-5 text-danger" />
          Saúde da Infraestrutura
        </h3>
        <Button variant="outline" size="sm" onClick={checkAdminAndLoadData} disabled={isLoading}>
          <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
          Verificar Agora
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Database */}
        <div className="bg-card text-card-foreground border rounded-lg p-5 rounded-xl border flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-muted-foreground flex items-center gap-2">
              <Server className="w-4 h-4" /> Supabase (DB)
            </span>
            <span className={cn("flex h-3 w-3 rounded-full", systemHealth?.database?.status === 'online' ? "bg-emerald-500" : "bg-red-500")} />
          </div>
          <div>
            <p className={cn("text-xl font-bold", systemHealth?.database?.status === 'online' ? "text-emerald-500" : "text-red-500")}>
              {systemHealth?.database?.status === 'online' ? 'Online' : 'Offline'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Latência: {systemHealth?.database?.latency || 0}ms</p>
          </div>
        </div>

        {/* Redis */}
        <div className="bg-card text-card-foreground border rounded-lg p-5 rounded-xl border flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-muted-foreground flex items-center gap-2">
              <Activity className="w-4 h-4" /> Redis (Filas)
            </span>
            <span className={cn("flex h-3 w-3 rounded-full", systemHealth?.redis?.status === 'online' ? "bg-emerald-500" : "bg-red-500")} />
          </div>
          <div>
            <p className={cn("text-xl font-bold", systemHealth?.redis?.status === 'online' ? "text-emerald-500" : "text-red-500")}>
              {systemHealth?.redis?.status === 'online' ? 'Online' : 'Offline'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Latência: {systemHealth?.redis?.latency || 0}ms</p>
          </div>
        </div>

        {/* Evolution API */}
        <div className="bg-card text-card-foreground border rounded-lg p-5 rounded-xl border flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-muted-foreground flex items-center gap-2">
              <Smartphone className="w-4 h-4" /> Evolution API
            </span>
            <span className={cn("flex h-3 w-3 rounded-full", systemHealth?.evolution?.status === 'online' ? "bg-emerald-500" : "bg-red-500")} />
          </div>
          <div>
            <p className={cn("text-xl font-bold", systemHealth?.evolution?.status === 'online' ? "text-emerald-500" : "text-red-500")}>
              {systemHealth?.evolution?.status === 'online' ? 'Online' : 'Offline'}
            </p>
            <p className="text-xs text-muted-foreground mt-1 truncate" title={systemHealth?.evolution?.url}>
              {systemHealth?.evolution?.url?.replace(/^https?:\/\//, '') || 'N/A'}
            </p>
          </div>
        </div>

        {/* Server */}
        <div className="bg-card text-card-foreground border rounded-lg p-5 rounded-xl border flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-muted-foreground flex items-center gap-2">
              <Power className="w-4 h-4" /> Servidor (Node)
            </span>
            <span className="flex h-3 w-3 rounded-full bg-emerald-500" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">
              {systemHealth?.server?.memoryMb || 0} MB RAM
            </p>
            <p className="text-xs text-muted-foreground mt-1">Uptime: {systemHealth?.server?.uptime || 'N/A'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

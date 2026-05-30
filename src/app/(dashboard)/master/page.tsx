"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { 
  Users, DollarSign, Activity, MessageCircle, ShieldAlert,
  Loader2, RefreshCw, Ban, CheckCircle2, Server, Power,
  Smartphone
} from "lucide-react"
import { toast } from "sonner"
import { formatCurrency, phoneMask } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function MasterAdminPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [activeTab, setActiveTab] = useState("overview")
  const [isLoading, setIsLoading] = useState(true)

  // Data states
  const [metrics, setMetrics] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [instances, setInstances] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isBlocking, setIsBlocking] = useState<string | null>(null)
  const [systemHealth, setSystemHealth] = useState<any>(null)

  const supabase = createClient()

  useEffect(() => {
    checkAdminAndLoadData()
  }, [])

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

      // 2. Carrega Usuários
      const resUsers = await fetch('/api/admin/users')
      if (resUsers.ok) {
        const usersData = await resUsers.json()
        setUsers(usersData.users || [])
      }

      // 3. Carrega Instâncias
      const resInst = await fetch('/api/admin/instances')
      if (resInst.ok) {
        const instData = await resInst.json()
        setInstances(instData.instances || [])
      }

      // 4. Carrega Saúde do Sistema
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

  const toggleUserBlock = async (userId: string, currentBannedStatus: boolean) => {
    if (!confirm(`Tem certeza que deseja ${currentBannedStatus ? 'desbloquear' : 'bloquear'} este usuário? O login será suspenso.`)) return
    
    setIsBlocking(userId)
    try {
      const res = await fetch('/api/admin/users/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isBlocked: !currentBannedStatus })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      
      toast.success(data.message)
      // Update local state
      setUsers(users.map(u => u.id === userId ? { ...u, is_banned: !currentBannedStatus } : u))
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setIsBlocking(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-rose-500" />
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

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredInstances = instances.filter(i => 
    i.instance_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    i.user_email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-7xl mx-auto">
      <div className="flex justify-between items-start flex-col sm:flex-row gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight mb-2 flex items-center gap-2">
            <ShieldAlert className="w-8 h-8 text-rose-500" />
            Master Admin
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Visão global da plataforma, faturamento estimado e saúde das instâncias.
          </p>
        </div>
        <Button 
          onClick={() => window.open('http://localhost:3001/admin/queues', '_blank')} 
          className="bg-amber-500 hover:bg-amber-600 text-white gap-2 shrink-0"
        >
          <Activity className="w-4 h-4" />
          Ver Filas do Sistema
        </Button>
      </div>

      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-3 mb-6 bg-background/50 border border-border/50">
          <TabsTrigger value="overview" className="data-[state=active]:bg-rose-500/20 data-[state=active]:text-rose-500">
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="users" className="data-[state=active]:bg-rose-500/20 data-[state=active]:text-rose-500">
            Inquilinos (SaaS)
          </TabsTrigger>
          <TabsTrigger value="instances" className="data-[state=active]:bg-rose-500/20 data-[state=active]:text-rose-500">
            Monitor WhatsApp
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0 space-y-6">
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
              <div className="absolute right-0 top-0 w-32 h-32 bg-sky-500/5 rounded-bl-full -z-10" />
              <div className="flex items-center gap-3">
                <div className="p-3 bg-sky-500/10 rounded-xl">
                  <Users className="w-5 h-5 text-sky-500" />
                </div>
                <h3 className="font-medium text-muted-foreground">Usuários SaaS</h3>
              </div>
              <p className="text-3xl font-bold mt-2">{metrics?.totalUsers || 0}</p>
              <p className="text-xs text-muted-foreground">{metrics?.totalActiveClients || 0} clientes finais geridos</p>
            </div>

            <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2 relative overflow-hidden">
              <div className="absolute right-0 top-0 w-32 h-32 bg-indigo-500/5 rounded-bl-full -z-10" />
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-500/10 rounded-xl">
                  <Smartphone className="w-5 h-5 text-indigo-500" />
                </div>
                <h3 className="font-medium text-muted-foreground">WhatsApps Conectados</h3>
              </div>
              <p className="text-3xl font-bold mt-2 text-indigo-500">{metrics?.totalInstances || 0}</p>
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
              <Activity className="w-5 h-5 text-rose-500" />
              Saúde da Infraestrutura
            </h3>
            <Button variant="outline" size="sm" onClick={checkAdminAndLoadData} disabled={isLoading}>
              <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
              Verificar Agora
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Database */}
            <div className="glass-card p-5 rounded-xl border flex flex-col gap-3">
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
            <div className="glass-card p-5 rounded-xl border flex flex-col gap-3">
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
            <div className="glass-card p-5 rounded-xl border flex flex-col gap-3">
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
            <div className="glass-card p-5 rounded-xl border flex flex-col gap-3">
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
        </TabsContent>

        <TabsContent value="users" className="mt-0">
          <div className="glass-card rounded-xl overflow-hidden p-4">
            <div className="mb-4">
              <Input
                placeholder="Buscar usuário por email ou nome..."
                className="max-w-md bg-background/50"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Plano SaaS</TableHead>
                    <TableHead>Métricas</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Último Acesso</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => (
                    <TableRow key={u.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div className="font-semibold">{u.name}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-primary/5">{u.plan}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium text-emerald-500">{formatCurrency(u.stats.mrr)}</div>
                        <div className="text-xs text-muted-foreground">{u.stats.activeClients} clts ativos</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{u.stats.connectedInstances} on</div>
                        <div className="text-xs text-muted-foreground">{u.stats.instancesCount} total</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          {u.last_sign_in ? new Date(u.last_sign_in).toLocaleDateString('pt-BR') : 'Nunca'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {u.is_banned ? (
                          <Badge className="bg-red-500/10 text-red-500 border-0">Bloqueado</Badge>
                        ) : (
                          <Badge className="bg-emerald-500/10 text-emerald-500 border-0">Ativo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          disabled={isBlocking === u.id || u.email === 'contato@leandroaraujo.com'}
                          onClick={() => toggleUserBlock(u.id, u.is_banned)}
                          className={u.is_banned ? "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10" : "text-red-500 hover:text-red-600 hover:bg-red-500/10"}
                        >
                          {isBlocking === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : u.is_banned ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <Ban className="w-4 h-4 mr-2" />}
                          {u.is_banned ? 'Desbloquear' : 'Bloquear'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="instances" className="mt-0">
          <div className="glass-card rounded-xl overflow-hidden p-4">
             <div className="mb-4">
              <Input
                placeholder="Buscar instância..."
                className="max-w-md bg-background/50"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Instância</TableHead>
                    <TableHead>Dono (E-mail)</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Modo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criada em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInstances.map((inst) => (
                    <TableRow key={inst.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div className="font-semibold text-sky-500">{inst.instance_name}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground">{inst.user_email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{inst.phone_number ? phoneMask(inst.phone_number) : '-'}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={inst.connection_mode === 'integrated' ? 'border-sky-500/30 text-sky-500' : 'border-indigo-500/30 text-indigo-500'}>
                          {inst.connection_mode === 'integrated' ? 'Nuvem' : 'Própria'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {inst.status === 'connected' ? (
                           <Badge className="bg-emerald-500/10 text-emerald-500 border-0">Conectado</Badge>
                        ) : inst.status === 'connecting' ? (
                           <Badge className="bg-amber-500/10 text-amber-500 border-0">Conectando</Badge>
                        ) : (
                           <Badge className="bg-red-500/10 text-red-500 border-0">Desconectado</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">
                          {new Date(inst.created_at).toLocaleString('pt-BR')}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

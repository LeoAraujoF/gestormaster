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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
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
  const [selectedUser, setSelectedUser] = useState<any>(null)

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
    if (!window.confirm(`Tem certeza que deseja ${currentBannedStatus ? 'desbloquear' : 'bloquear'} este usuário?`)) return false
    
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
      return true
    } catch (e: any) {
      toast.error(e.message)
      return false
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
          onClick={() => window.open('/api/admin/queues-redirect', '_blank')} 
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
                    <TableHead>Saúde</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Último Acesso</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => (
                    <TableRow 
                      key={u.id} 
                      className="hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => setSelectedUser(u)}
                    >
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
                        {u.stats.messagesMonth < 500 ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-0" title="Uso Saudável (Normal)">
                            🟢 {u.stats.messagesMonth} msgs
                          </Badge>
                        ) : u.stats.messagesMonth <= 2000 ? (
                          <Badge className="bg-amber-500/10 text-amber-600 border-0" title="Alerta: Alto Volume">
                            🟡 {u.stats.messagesMonth} msgs
                          </Badge>
                        ) : (
                          <Badge className="bg-red-500/10 text-red-600 border-0 animate-pulse shadow-sm" title="Risco: Possível SPAMMER">
                            🔴 {u.stats.messagesMonth} msgs
                          </Badge>
                        )}
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

      {/* Tenant Profile Modal (Sheet) */}
      <Sheet open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <SheetContent className="sm:max-w-lg w-full overflow-y-auto border-l border-white/10 bg-background/95 backdrop-blur-xl p-8">
          <SheetHeader className="text-left mb-8">
            <SheetTitle className="text-3xl font-bold tracking-tight">Perfil do Inquilino</SheetTitle>
            <SheetDescription className="text-base mt-1">Visão detalhada e ações de administração.</SheetDescription>
          </SheetHeader>

          {selectedUser && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
              {/* Header Profile */}
              <div className="flex items-center gap-5 pb-6 border-b border-border/40 relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-50 blur-3xl -z-10" />
                
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center text-2xl font-bold text-white shadow-[0_0_20px_rgba(99,102,241,0.4)] shrink-0 ring-1 ring-white/20">
                  {selectedUser.name.charAt(0).toUpperCase()}
                </div>
                
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-2xl font-bold truncate tracking-tight text-foreground" title={selectedUser.name}>
                      {selectedUser.name}
                    </h3>
                    <div className="flex gap-2 shrink-0">
                      <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary">{selectedUser.plan}</Badge>
                      {selectedUser.is_banned ? (
                        <Badge className="bg-red-500/10 text-red-500 border border-red-500/20">Bloqueado</Badge>
                      ) : (
                        <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Ativo</Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-muted-foreground truncate mt-0.5" title={selectedUser.email}>{selectedUser.email}</p>
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5 opacity-80">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                    Cliente desde {new Date(selectedUser.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>

              {/* Saúde / Disparos */}
              <div className={cn(
                "relative overflow-hidden p-6 rounded-2xl border backdrop-blur-md shadow-lg transition-all duration-300",
                selectedUser.stats.messagesMonth < 500 ? "bg-emerald-500/5 border-emerald-500/20" :
                selectedUser.stats.messagesMonth <= 2000 ? "bg-amber-500/5 border-amber-500/20" :
                "bg-red-500/5 border-red-500/30"
              )}>
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <ShieldAlert className="w-24 h-24" />
                </div>
                
                <p className="text-xs font-bold mb-4 uppercase tracking-widest opacity-70">Monitoramento de SPAM</p>
                
                {selectedUser.stats.messagesMonth < 500 ? (
                  <div className="flex items-center gap-4 relative z-10">
                    <span className="flex h-5 w-5 rounded-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.6)] ring-4 ring-emerald-500/20" />
                    <div>
                      <p className="text-emerald-500 font-bold text-xl">Risco Baixo (Uso Saudável)</p>
                      <p className="text-sm opacity-80 mt-1">{selectedUser.stats.messagesMonth} mensagens disparadas neste mês.</p>
                    </div>
                  </div>
                ) : selectedUser.stats.messagesMonth <= 2000 ? (
                  <div className="flex items-center gap-4 relative z-10">
                    <span className="flex h-5 w-5 rounded-full bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.6)] ring-4 ring-amber-500/20" />
                    <div>
                      <p className="text-amber-500 font-bold text-xl">Atenção (Volume Alto)</p>
                      <p className="text-sm opacity-80 mt-1">{selectedUser.stats.messagesMonth} mensagens disparadas neste mês.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 relative z-10">
                    <span className="flex h-5 w-5 rounded-full bg-red-500 animate-pulse shadow-[0_0_25px_rgba(239,68,68,0.9)] ring-4 ring-red-500/30" />
                    <div>
                      <p className="text-red-500 font-bold text-xl">Risco Crítico (Possível SPAM)</p>
                      <p className="text-sm text-red-500/80 mt-1">{selectedUser.stats.messagesMonth} mensagens disparadas neste mês.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Grid Metrics */}
              <div className="grid grid-cols-2 gap-4">
                <div className="group relative overflow-hidden bg-background/40 p-5 rounded-2xl border border-white/5 hover:border-emerald-500/30 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(16,185,129,0.1)] hover:-translate-y-1">
                  <div className="absolute -inset-2 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity blur-xl z-0" />
                  <div className="relative z-10">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
                      <DollarSign className="w-5 h-5 text-emerald-500" />
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">Receita (MRR)</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(selectedUser.stats.mrr)}</p>
                  </div>
                </div>
                
                <div className="group relative overflow-hidden bg-background/40 p-5 rounded-2xl border border-white/5 hover:border-blue-500/30 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(59,130,246,0.1)] hover:-translate-y-1">
                  <div className="absolute -inset-2 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity blur-xl z-0" />
                  <div className="relative z-10">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center mb-3">
                      <Users className="w-5 h-5 text-blue-500" />
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">Clientes Ativos</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{selectedUser.stats.activeClients}</p>
                  </div>
                </div>
                
                <div className="group relative overflow-hidden bg-background/40 p-5 rounded-2xl border border-white/5 hover:border-sky-500/30 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(14,165,233,0.1)] hover:-translate-y-1">
                  <div className="absolute -inset-2 bg-gradient-to-br from-sky-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity blur-xl z-0" />
                  <div className="relative z-10">
                    <div className="w-10 h-10 rounded-full bg-sky-500/10 flex items-center justify-center mb-3">
                      <Smartphone className="w-5 h-5 text-sky-500" />
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">Instâncias WhatsApp</p>
                    <p className="text-2xl font-bold text-foreground mt-1">
                      {selectedUser.stats.connectedInstances} <span className="text-base text-muted-foreground font-normal">/ {selectedUser.stats.instancesCount} on</span>
                    </p>
                  </div>
                </div>
                
                <div className="group relative overflow-hidden bg-background/40 p-5 rounded-2xl border border-white/5 hover:border-indigo-500/30 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(99,102,241,0.1)] hover:-translate-y-1">
                  <div className="absolute -inset-2 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity blur-xl z-0" />
                  <div className="relative z-10">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center mb-3">
                      <MessageCircle className="w-5 h-5 text-indigo-500" />
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">Último Acesso</p>
                    <p className="text-lg font-semibold text-foreground mt-2">
                      {selectedUser.last_sign_in ? new Date(selectedUser.last_sign_in).toLocaleDateString('pt-BR') : 'Nunca'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-6 mt-2">
                <Button 
                  variant={selectedUser.is_banned ? "outline" : "destructive"}
                  size="lg"
                  className={cn(
                    "w-full flex items-center justify-center gap-2 text-sm sm:text-base font-semibold h-14 rounded-xl transition-all duration-300 shadow-lg px-2 sm:px-4", 
                    selectedUser.is_banned 
                      ? "border-emerald-500/50 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 hover:shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                      : "hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:-translate-y-0.5"
                  )}
                  disabled={isBlocking === selectedUser.id || selectedUser.email === 'contato@leandroaraujo.com'}
                  onClick={async () => {
                    const success = await toggleUserBlock(selectedUser.id, selectedUser.is_banned)
                    if (success) {
                      setSelectedUser({...selectedUser, is_banned: !selectedUser.is_banned})
                    }
                  }}
                >
                  {isBlocking === selectedUser.id ? (
                    <Loader2 className="w-5 h-5 shrink-0 animate-spin" />
                  ) : selectedUser.is_banned ? (
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                  ) : (
                    <Ban className="w-5 h-5 shrink-0" />
                  )}
                  
                  <span className="truncate">{selectedUser.is_banned ? 'Restaurar Acesso do Inquilino' : 'Suspender Inquilino Imediatamente'}</span>
                </Button>
                
                <p className="text-xs text-muted-foreground mt-4 text-center px-4 leading-relaxed opacity-70">
                  {selectedUser.is_banned 
                    ? "Ao restaurar, o inquilino poderá voltar a fazer login no sistema e usar automações." 
                    : "Isso derrubará a sessão do inquilino em tempo real e impedirá novos acessos."}
                </p>
              </div>

            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

"use client"

import { useState, useEffect, Suspense } from "react"
import { createClient } from "@/lib/supabase/client"
import { BellRing, Zap, ShieldAlert, Megaphone, Loader2, Calendar, FileText, CheckCircle2, Sparkles, Bug, ArrowUpCircle, Wrench, Plus, Save } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"

function AtualizacoesContent() {
  const [updates, setUpdates] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  
  // States for new update modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [newUpdate, setNewUpdate] = useState({ title: '', content: '', type: 'feature' })

  const searchParams = useSearchParams()
  const tab = searchParams.get("tab") || "updates"
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Verifica se é admin
    try {
      const res = await fetch('/api/admin/check')
      const data = await res.json()
      setIsAdmin(data.isAdmin)
    } catch (e) {
      setIsAdmin(false)
    }

    // 1. System Updates
    const { data: updatesData } = await supabase
      .from('system_updates')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      
    if (updatesData) setUpdates(updatesData)

    // 2. Alerts
    const newAlerts = []
    
    // WPP Check
    const { data: wppDataArray } = await supabase
      .from('evolution_instances')
      .select('status')
      .eq('user_id', user.id)
      .limit(1)

    const wppData = wppDataArray?.[0]

    if (wppData && wppData.status !== 'connected') {
      newAlerts.push({
        id: 'wpp',
        type: 'critical',
        title: 'Instância Desconectada',
        desc: 'O número de WhatsApp configurado perdeu a conexão. Suas automações estão pausadas imediatamente.',
        icon: ShieldAlert,
        action: 'Resolver Agora',
        path: '/automacao'
      })
    }

    // Clients Expiring in 5 days
    const today = new Date()
    const fiveDaysFromNow = new Date()
    fiveDaysFromNow.setDate(today.getDate() + 5)
    
    const { data: clientsData } = await supabase
      .from('clients')
      .select('id, name, due_date')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gte('due_date', today.toISOString().split('T')[0])
      .lte('due_date', fiveDaysFromNow.toISOString().split('T')[0])
      .order('due_date', { ascending: true })

    if (clientsData && clientsData.length > 0) {
      newAlerts.push({
        id: 'clients',
        type: 'warning',
        title: `${clientsData.length} Cliente(s) Vencendo`,
        desc: 'Existem mensalidades que vencem nos próximos 5 dias. Monitore os pagamentos para evitar inadimplência.',
        icon: Zap,
        action: 'Ver Clientes',
        path: '/clientes'
      })
    }

    setAlerts(newAlerts)
    setIsLoading(false)
  }

  const handlePostUpdate = async () => {
    if (!newUpdate.title || !newUpdate.content) {
      return toast.error("Preencha título e conteúdo.")
    }
    setIsSaving(true)
    try {
      const { error } = await supabase.from('system_updates').insert({
        title: newUpdate.title,
        content: newUpdate.content,
        update_type: newUpdate.type,
        is_published: true
      })
      if (error) throw error
      toast.success("Atualização publicada com sucesso!")
      setIsModalOpen(false)
      setNewUpdate({ title: '', content: '', type: 'feature' })
      loadData()
    } catch (error) {
      toast.error("Erro ao publicar atualização.")
    } finally {
      setIsSaving(false)
    }
  }

  const getTypeStyle = (type: string) => {
    switch(type) {
      case 'feature': return { label: 'Nova Funcionalidade', icon: Sparkles, color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-emerald-500/10' }
      case 'bugfix': return { label: 'Correção de Bug', icon: Bug, color: 'bg-red-500/10 text-red-500 border-red-500/20 shadow-red-500/10' }
      case 'improvement': return { label: 'Melhoria', icon: ArrowUpCircle, color: 'bg-blue-500/10 text-blue-500 border-blue-500/20 shadow-blue-500/10' }
      case 'maintenance': return { label: 'Manutenção', icon: Wrench, color: 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-amber-500/10' }
      default: return { label: 'Atualização', icon: Megaphone, color: 'bg-muted text-muted-foreground border-border shadow-none' }
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto pb-10">
      
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-sky-500/10 via-primary/5 to-background border border-border/50 p-8 shadow-sm">
        <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl -z-10" />
        
        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6 z-10 relative">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-primary text-white shadow-lg shadow-sky-500/30">
              <Megaphone className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground">Central de Notificações</h1>
              <p className="text-muted-foreground mt-1">Acompanhe as atualizações do sistema e alertas da sua conta.</p>
            </div>
          </div>

          {isAdmin && (
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
              <DialogTrigger render={
                <Button className="bg-sky-500 hover:bg-sky-600 text-white shadow-lg shadow-sky-500/20">
                  <Plus className="w-4 h-4 mr-2" /> Nova Atualização
                </Button>
              } />
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Publicar Nova Atualização</DialogTitle>
                  <DialogDescription>
                    Esta mensagem aparecerá na linha do tempo de todos os seus clientes.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Tipo de Atualização</Label>
                    <Select value={newUpdate.type} onValueChange={(val) => setNewUpdate({...newUpdate, type: val || "improvement" as any})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="feature">🚀 Nova Funcionalidade</SelectItem>
                        <SelectItem value="improvement">⬆️ Melhoria</SelectItem>
                        <SelectItem value="bugfix">🐛 Correção de Bug</SelectItem>
                        <SelectItem value="maintenance">🔧 Manutenção</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Título (Versão ou Nome)</Label>
                    <Input 
                      placeholder="Ex: Versão 2.4.0 - Novo Disparo em Massa" 
                      value={newUpdate.title}
                      onChange={(e) => setNewUpdate({...newUpdate, title: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Detalhes da Atualização</Label>
                    <Textarea 
                      placeholder="Descreva as melhorias ou correções aplicadas..." 
                      className="min-h-[120px]"
                      value={newUpdate.content}
                      onChange={(e) => setNewUpdate({...newUpdate, content: e.target.value})}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                  <Button onClick={handlePostUpdate} disabled={isSaving} className="bg-sky-500 hover:bg-sky-600 text-white">
                    {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Publicar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Tabs value={tab} className="w-full" onValueChange={(v) => router.push(`?tab=${v}`, { scroll: false })}>
        <TabsList className="bg-background/50 border border-border/50 p-1 mb-8 h-12 rounded-xl grid grid-cols-2 max-w-[400px]">
          <TabsTrigger value="updates" className="rounded-lg data-[state=active]:bg-sky-500/10 data-[state=active]:text-sky-500 h-full transition-all">
            <Megaphone className="w-4 h-4 mr-2" />
            Atualizações
          </TabsTrigger>
          <TabsTrigger value="alertas" className="rounded-lg data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500 h-full transition-all">
            <BellRing className="w-4 h-4 mr-2" />
            Alertas
            {alerts.length > 0 && (
              <Badge className="ml-2 bg-amber-500 hover:bg-amber-600 text-white border-0 shadow-sm animate-pulse">{alerts.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="alertas" className="mt-0 space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center glass-card rounded-2xl border-dashed border-2">
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6 shadow-inner">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <h3 className="text-2xl font-semibold mb-2">Tudo em Perfeita Ordem!</h3>
              <p className="text-muted-foreground max-w-md">
                Não identificamos nenhuma falha de integração ou vencimentos críticos na sua conta no momento. Pode relaxar.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {alerts.map(alert => (
                <Card key={alert.id} className={`relative overflow-hidden transition-all duration-300 hover:shadow-lg ${alert.type === 'critical' ? 'border-red-500/40 bg-red-500/5 hover:bg-red-500/10 shadow-red-500/5' : 'border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 shadow-amber-500/5'}`}>
                  {/* Glowing Edge */}
                  <div className={`absolute top-0 left-0 w-1 h-full ${alert.type === 'critical' ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]'}`} />
                  
                  <CardHeader className="pb-3 pl-8">
                    <CardTitle className="flex items-center gap-3 text-lg font-bold">
                      <div className={`p-2 rounded-xl ${alert.type === 'critical' ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500'}`}>
                        <alert.icon className="w-5 h-5" />
                      </div>
                      {alert.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pl-8 pb-6">
                    <p className={`text-sm ${alert.type === 'critical' ? 'text-red-900/70 dark:text-red-200/70' : 'text-amber-900/70 dark:text-amber-200/70'}`}>{alert.desc}</p>
                  </CardContent>
                  <CardFooter className="pl-8 pt-0">
                    <Button 
                      variant="default" 
                      onClick={() => router.push(alert.path)} 
                      className={`w-full font-medium ${alert.type === 'critical' ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}
                    >
                      {alert.action}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="updates" className="mt-0">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : updates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center glass-card rounded-2xl border-dashed border-2">
              <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
                <Megaphone className="w-10 h-10 text-muted-foreground/50" />
              </div>
              <h3 className="text-2xl font-semibold mb-2">Sem novidades por enquanto</h3>
              <p className="text-muted-foreground max-w-md">
                Nenhuma atualização registrada no momento. Nossa equipe está trabalhando duro nos bastidores para trazer novas melhorias.
              </p>
            </div>
          ) : (
            <div className="relative border-l-2 border-border/40 ml-4 md:ml-8 space-y-12 pb-10 mt-6">
              {updates.map((update) => {
                const style = getTypeStyle(update.update_type)
                const Icon = style.icon
                return (
                  <div key={update.id} className="relative pl-8 md:pl-12 group">
                    {/* Timeline Node - Animated */}
                    <div className={`absolute -left-[17px] top-0 w-8 h-8 rounded-full border-4 border-background flex items-center justify-center z-10 transition-transform duration-300 group-hover:scale-110 ${style.color}`}>
                      <div className="bg-background rounded-full w-full h-full flex items-center justify-center">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    
                    <Card className="glass-card shadow-sm transition-all duration-300 hover:shadow-md hover:border-border overflow-hidden">
                      <div className={`h-1 w-full opacity-50 ${style.color.split(' ')[0]}`} />
                      <CardHeader className="pb-3 pt-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                          <Badge variant="outline" className={`px-2.5 py-0.5 rounded-full font-medium shadow-sm ${style.color}`}>
                            {style.label}
                          </Badge>
                          <div className="flex items-center text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                            <Calendar className="w-3.5 h-3.5 mr-1.5" />
                            {new Date(update.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                          </div>
                        </div>
                        <CardTitle className="text-2xl font-bold tracking-tight">{update.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground whitespace-pre-wrap leading-relaxed">
                          {update.content}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function AtualizacoesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
      <AtualizacoesContent />
    </Suspense>
  )
}

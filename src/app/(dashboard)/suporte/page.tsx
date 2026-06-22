"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { 
  LifeBuoy, 
  MessageCircle, 
  Mail, 
  BookOpen, 
  ChevronDown, 
  ChevronUp, 
  Zap,
  Ticket,
  Plus,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Database,
  Smartphone,
  Activity
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

const faqs = [
  {
    question: "Como faço para conectar meu WhatsApp?",
    answer: "Vá até a aba 'Configurações' no menu lateral. Clique em 'Nova Conexão', dê um nome para a sua instância (ex: Meu Celular) e escaneie o QR Code que aparecerá na tela utilizando o WhatsApp do seu celular (Menu > Aparelhos Conectados)."
  },
  {
    question: "Como funcionam as mensagens automáticas?",
    answer: "Na aba 'Automações', você pode criar regras. O sistema possui um robô que roda diariamente na nuvem. Ele verifica a data de vencimento dos seus clientes e os coloca em uma fila de envio para disparar a mensagem exatamente no horário que você configurou, de forma automática e segura para não bloquear seu número."
  },
  {
    question: "Quais são as variáveis que posso usar nas mensagens?",
    answer: "Você pode usar: {{primeiro_nome}}, {{client_name}}, {{plan_value}} e {{due_date}}. Além disso, se configurar a aba 'Perfil da Empresa' na página 'Minha Conta', você também poderá usar: {{empresa}}, {{telefone_suporte}}, {{pix}} e {{titular_pix}}."
  },
  {
    question: "Posso enviar mensagens em massa manualmente?",
    answer: "Sim! Na aba 'Leads e Clientes', clique no ícone de megafone no topo da tela. Escolha para qual grupo deseja enviar (Ativos, Inativos, etc.), digite sua mensagem e clique em Enviar. O sistema fará o envio gradativo."
  },
  {
    question: "O meu fuso horário importa?",
    answer: "Sim. O sistema utiliza o fuso horário configurado na sua 'Minha Conta' para entender quando é 'hoje' ou 'amanhã' e enviar as mensagens de vencimento corretamente no seu horário local."
  }
]

export default function SuportePage() {
  const supabase = createClient()
  const router = useRouter()
  
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0)
  const [user, setUser] = useState<any>(null)
  
  // System Health States
  const [dbStatus, setDbStatus] = useState<'online' | 'checking' | 'error'>('checking')
  const [wppStatus, setWppStatus] = useState<'online' | 'checking' | 'error'>('checking')
  const [apiStatus, setApiStatus] = useState<'online' | 'checking' | 'error'>('checking')

  // Tickets State
  const [tickets, setTickets] = useState<any[]>([])
  const [isLoadingTickets, setIsLoadingTickets] = useState(true)
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newTicket, setNewTicket] = useState({ subject: '', priority: 'medium', page_url: '', description: '' })

  useEffect(() => {
    loadUserAndTickets()
    checkSystemHealth()
  }, [])

  const loadUserAndTickets = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setUser(user)
      
      const { data: userTickets } = await supabase
        .from('tickets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      
      if (userTickets) setTickets(userTickets)
    }
    setIsLoadingTickets(false)
  }

  const checkSystemHealth = async () => {
    // Check DB
    try {
      const { error } = await supabase.from('clients').select('id').limit(1)
      if (error) throw error
      setDbStatus('online')
    } catch {
      setDbStatus('error')
    }

    // Check WPP
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('evolution_instances').select('status').eq('user_id', user.id).eq('status', 'connected').limit(1)
        if (data && data.length > 0) {
          setWppStatus('online')
        } else {
          setWppStatus('error')
        }
      } else {
        setWppStatus('error')
      }
    } catch {
      setWppStatus('error')
    }

    // API is usually online if the page loads in Next.js app router client
    setApiStatus('online')
  }

  const handleCreateTicket = async () => {
    if (!newTicket.subject || !newTicket.description) {
      return toast.error("Preencha o assunto e a descrição.")
    }
    
    setIsSubmitting(true)
    try {
      const { data, error } = await supabase.from('tickets').insert({
        user_id: user.id,
        subject: newTicket.subject,
        priority: newTicket.priority,
        page_url: newTicket.page_url,
        description: newTicket.description,
        status: 'open'
      }).select().single()

      if (error) throw error

      // Add the initial message
      await supabase.from('ticket_messages').insert({
        ticket_id: data.id,
        user_id: user.id,
        content: newTicket.description,
        is_from_admin: false
      })

      toast.success("Chamado aberto com sucesso!")
      setIsNewTicketOpen(false)
      setNewTicket({ subject: '', priority: 'medium', page_url: '', description: '' })
      loadUserAndTickets()
    } catch (e: any) {
      toast.error("Erro ao abrir chamado.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const getSmartWhatsAppLink = () => {
    const phone = "5511999999999" // Coloque o telefone real de suporte
    const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || "Cliente"
    const plan = user?.user_metadata?.plan_name || "Desconhecido"
    
    const msg = `Olá, suporte! Meu nome é ${name} (Plano: ${plan}). Preciso de uma ajuda com a minha conta no Gestor Master.`
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
  }

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'open': return <Badge className="bg-sky-500 hover:bg-sky-600">Aberto</Badge>
      case 'in_progress': return <Badge className="bg-amber-500 hover:bg-amber-600">Em Análise</Badge>
      case 'resolved': return <Badge className="bg-emerald-500 hover:bg-emerald-600">Resolvido</Badge>
      case 'closed': return <Badge variant="outline" className="text-muted-foreground">Encerrado</Badge>
      default: return <Badge>{status}</Badge>
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      
      {/* Header Premium */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500/10 via-background to-background border border-border/50 p-8 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -z-10" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-sky-500/5 rounded-full blur-3xl -z-10" />
        
        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6 z-10 relative">
          <div className="flex items-center sm:items-start gap-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-indigo-500 to-sky-500 p-1 shrink-0">
              <div className="w-full h-full bg-background rounded-xl flex items-center justify-center">
                <LifeBuoy className="w-10 h-10 text-indigo-500" />
              </div>
            </div>

            <div className="text-center sm:text-left space-y-2">
              <div className="flex items-center justify-center sm:justify-start gap-3">
                <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground">
                  Central de Suporte
                </h1>
                <Badge className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20 shadow-none">Ajuda</Badge>
              </div>
              <p className="text-muted-foreground max-w-xl">
                Estamos aqui para ajudar você a extrair o máximo do Gestor. Abra chamados, encontre respostas rápidas ou fale diretamente com nossa equipe.
              </p>
            </div>
          </div>

          {/* System Health */}
          <div className="bg-background/80 backdrop-blur border border-border/50 rounded-xl p-4 shadow-sm w-full sm:w-auto">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Status do Sistema</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2"><Activity className="w-3.5 h-3.5 text-sky-500"/> <span className="text-sm font-medium">API Principal</span></div>
                {apiStatus === 'online' ? <span className="flex items-center text-xs text-emerald-500 font-bold"><span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse"/> Online</span> : <Loader2 className="w-3 h-3 animate-spin"/>}
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2"><Database className="w-3.5 h-3.5 text-indigo-500"/> <span className="text-sm font-medium">Banco de Dados</span></div>
                {dbStatus === 'online' ? <span className="flex items-center text-xs text-emerald-500 font-bold"><span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5"/> Online</span> : dbStatus === 'error' ? <span className="text-xs text-red-500">Falha</span> : <Loader2 className="w-3 h-3 animate-spin"/>}
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2"><Smartphone className="w-3.5 h-3.5 text-emerald-500"/> <span className="text-sm font-medium">Motor WhatsApp</span></div>
                {wppStatus === 'online' ? <span className="flex items-center text-xs text-emerald-500 font-bold"><span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5"/> Conectado</span> : wppStatus === 'error' ? <span className="text-xs text-amber-500">Desconectado</span> : <Loader2 className="w-3 h-3 animate-spin"/>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="tickets" className="w-full animate-in fade-in duration-700 delay-100">
        <TabsList className="bg-background/50 border border-border/50 p-1 mb-8 h-12 rounded-xl grid grid-cols-2 max-w-[400px]">
          <TabsTrigger value="tickets" className="rounded-lg data-[state=active]:bg-sky-500/10 data-[state=active]:text-sky-500 h-full transition-all">
            <Ticket className="w-4 h-4 mr-2" />
            Meus Chamados
          </TabsTrigger>
          <TabsTrigger value="faq" className="rounded-lg data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-500 h-full transition-all">
            <BookOpen className="w-4 h-4 mr-2" />
            FAQ Rápido
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tickets" className="mt-0">
          <Card className="glass-card border-sky-500/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-sky-500/5 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2" />
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-sky-500" />
                  Meus Chamados (Tickets)
                </CardTitle>
                <CardDescription>Acompanhe o status das suas solicitações ou abra um novo chamado.</CardDescription>
              </div>
              <Dialog open={isNewTicketOpen} onOpenChange={setIsNewTicketOpen}>
                <DialogTrigger render={
                  <Button className="bg-sky-500 hover:bg-sky-600 text-white shadow-lg shadow-sky-500/20">
                    <Plus className="w-4 h-4 mr-2" />
                    Abrir Chamado
                  </Button>
                } />
                <DialogContent className="sm:max-w-[500px] glass-card border-sky-500/20">
                  <DialogHeader>
                    <DialogTitle>Abrir Novo Chamado</DialogTitle>
                    <DialogDescription>Relate o problema ou dúvida que você está enfrentando.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Assunto</Label>
                      <Input placeholder="Ex: Erro ao enviar mensagem em massa" value={newTicket.subject} onChange={(e) => setNewTicket({...newTicket, subject: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Página do Erro (Opcional)</Label>
                        <Input placeholder="Ex: /automacao" value={newTicket.page_url} onChange={(e) => setNewTicket({...newTicket, page_url: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <Label>Prioridade</Label>
                        <Select value={newTicket.priority} onValueChange={(val) => setNewTicket({...newTicket, priority: val || 'medium'})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Baixa (Dúvida)</SelectItem>
                            <SelectItem value="medium">Média (Pequeno Erro)</SelectItem>
                            <SelectItem value="high">Alta (Funcionalidade Parada)</SelectItem>
                            <SelectItem value="critical">Crítica (Sistema Fora)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Descrição Detalhada</Label>
                      <Textarea placeholder="Descreva exatamente o que aconteceu..." className="min-h-[120px]" value={newTicket.description} onChange={(e) => setNewTicket({...newTicket, description: e.target.value})} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsNewTicketOpen(false)}>Cancelar</Button>
                    <Button onClick={handleCreateTicket} disabled={isSubmitting} className="bg-sky-500 hover:bg-sky-600 text-white">
                      {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Enviar Chamado
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {isLoadingTickets ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
              ) : tickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center bg-background/30 rounded-xl border border-dashed border-border/50">
                  <div className="w-16 h-16 rounded-full bg-sky-500/10 flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-8 h-8 text-sky-500" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Nenhum chamado aberto!</h3>
                  <p className="text-muted-foreground max-w-sm">
                    Você ainda não precisou acionar nosso suporte técnico. Se precisar, clique no botão acima.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {tickets.map(ticket => (
                    <div key={ticket.id} className="p-4 rounded-xl border border-border/50 bg-background/50 hover:bg-muted/30 transition-colors cursor-pointer group" onClick={() => router.push(`/suporte/ticket/${ticket.id}`)}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-lg group-hover:text-sky-500 transition-colors">{ticket.subject}</span>
                            {getStatusBadge(ticket.status)}
                            {ticket.priority === 'critical' && <Badge variant="destructive" className="animate-pulse">Urgente</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-1">{ticket.description}</p>
                        </div>
                        <div className="flex items-center text-xs text-muted-foreground whitespace-nowrap bg-background px-3 py-1.5 rounded-lg border border-border/50">
                          <Clock className="w-3.5 h-3.5 mr-1.5" />
                          {new Date(ticket.created_at).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="faq" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: FAQs */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="glass-card border-indigo-500/20 relative overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-indigo-500" />
                    Perguntas Frequentes
                  </CardTitle>
                  <CardDescription>As dúvidas mais comuns resolvidas em segundos.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {faqs.map((faq, index) => (
                    <div 
                      key={index} 
                      className={`border border-border/50 rounded-xl transition-all duration-300 overflow-hidden ${openFaqIndex === index ? 'bg-background shadow-md border-indigo-500/30' : 'bg-background/50 hover:bg-background'}`}
                    >
                      <button
                        onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
                        className="w-full flex items-center justify-between p-4 text-left font-medium"
                      >
                        <span className={openFaqIndex === index ? 'text-indigo-500' : 'text-foreground'}>
                          {faq.question}
                        </span>
                        {openFaqIndex === index ? (
                          <ChevronUp className="w-5 h-5 text-indigo-500 shrink-0" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
                        )}
                      </button>
                      
                      <div 
                        className={`px-4 pb-4 text-muted-foreground text-sm leading-relaxed transition-all duration-300 ${openFaqIndex === index ? 'opacity-100 max-h-96' : 'opacity-0 max-h-0 hidden'}`}
                      >
                        {faq.answer}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Right Column: Contact Channels */}
            <div className="space-y-6">
              <Card className="glass-card border-emerald-500/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -z-10 translate-x-1/2 -translate-y-1/2" />
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 text-emerald-500" />
                    Atendimento Rápido
                  </CardTitle>
                  <CardDescription>WhatsApp Oficial</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Para questões financeiras urgentes ou suporte direto de nossa equipe, chame no WhatsApp. O link já enviará os dados da sua conta para agilizar o atendimento!
                  </p>
                  <Button 
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 h-11"
                    onClick={() => window.open(getSmartWhatsAppLink(), '_blank')}
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Chamar no WhatsApp
                  </Button>
                </CardContent>
              </Card>

              <Card className="glass-card bg-background/30">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Mail className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm">Suporte por E-mail</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Para questões comerciais ou dúvidas mais extensas.
                      </p>
                      <a href="mailto:suporte@gestor.com.br" className="text-sm text-primary hover:underline mt-2 inline-block">
                        suporte@gestor.com.br
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

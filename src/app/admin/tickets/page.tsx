"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Ticket, Clock, User, Shield, Send, Trash2, Eye, MoreVertical, Loader2, RefreshCw, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export default function AdminTicketsPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [tickets, setTickets] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")

  const [selectedTicket, setSelectedTicket] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [adminUser, setAdminUser] = useState<any>(null)
  
  const [ticketToDelete, setTicketToDelete] = useState<string | null>(null)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const checkAdminAndLoadTickets = async () => {
    setIsLoading(true)
    try {
      const resMetrics = await fetch('/api/admin/metrics')
      if (!resMetrics.ok) {
        setIsAdmin(false)
        return
      }
      setIsAdmin(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (user) setAdminUser(user)

      const resUsers = await fetch('/api/admin/users')
      if (resUsers.ok) {
        const usersData = await resUsers.json()
        setUsers(usersData.users || [])
      }

      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false })

      if (data) setTickets(data)

    } catch (e) {
      console.error(e)
      setIsAdmin(false)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    checkAdminAndLoadTickets()
  }, [])

  useEffect(() => {
    if (selectedTicket) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, selectedTicket])

  const handleOpenTicket = async (ticket: any) => {
    setSelectedTicket(ticket)
    setMessages([])
    
    // Load messages
    const { data: msgData } = await supabase
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true })

    if (msgData) setMessages(msgData)

    // Subscribe to new messages
    const channel = supabase
      .channel(`master_ticket_${ticket.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_messages', filter: `ticket_id=eq.${ticket.id}` }, payload => {
        setMessages(prev => [...prev, payload.new])
      })
      .subscribe()

    ticket._channel = channel
  }

  const handleCloseTicketSheet = () => {
    if (selectedTicket && selectedTicket._channel) {
      supabase.removeChannel(selectedTicket._channel)
    }
    setSelectedTicket(null)
    setNewMessage("")
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !adminUser || !selectedTicket) return

    setIsSending(true)
    try {
      const { error } = await supabase.from('ticket_messages').insert({
        ticket_id: selectedTicket.id,
        user_id: adminUser.id,
        content: newMessage,
        is_from_admin: true
      })

      if (error) throw error
      setNewMessage("")
      
      const newStatus = selectedTicket.status === 'open' ? 'in_progress' : selectedTicket.status
      await supabase.from('tickets').update({ 
        updated_at: new Date().toISOString(),
        status: newStatus
      }).eq('id', selectedTicket.id)

      if (selectedTicket.status === 'open') {
        setSelectedTicket({...selectedTicket, status: 'in_progress'})
        setTickets(tickets.map(t => t.id === selectedTicket.id ? { ...t, status: 'in_progress' } : t))
      }
    } catch (e: any) {
      toast.error("Erro ao enviar mensagem.")
    } finally {
      setIsSending(false)
    }
  }

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    try {
      const { error } = await supabase.from('tickets').update({ status: newStatus }).eq('id', ticketId)
      if (error) throw error
      toast.success("Status atualizado.")
      setTickets(tickets.map(t => t.id === ticketId ? { ...t, status: newStatus } : t))
      if (selectedTicket && selectedTicket.id === ticketId) {
        setSelectedTicket({...selectedTicket, status: newStatus})
      }
    } catch {
      toast.error("Erro ao atualizar status.")
    }
  }

  const executeDeleteTicket = async () => {
    if (!ticketToDelete) return;

    try {
      await supabase.from('ticket_messages').delete().eq('ticket_id', ticketToDelete)
      const { error } = await supabase.from('tickets').delete().eq('id', ticketToDelete)
      if (error) throw error
      
      toast.success("Chamado excluído com sucesso.")
      setTickets(tickets.filter(t => t.id !== ticketToDelete))
      if (selectedTicket && selectedTicket.id === ticketToDelete) {
        handleCloseTicketSheet()
      }
    } catch (e) {
      toast.error("Erro ao excluir o chamado.")
    } finally {
      setTicketToDelete(null)
    }
  }

  const getTicketStatusBadge = (status: string) => {
    switch(status) {
      case 'open': return <Badge className="bg-sky-500">Aberto</Badge>
      case 'in_progress': return <Badge className="bg-amber-500">Em Análise</Badge>
      case 'resolved': return <Badge className="bg-emerald-500">Resolvido</Badge>
      case 'closed': return <Badge variant="outline">Encerrado</Badge>
      default: return <Badge>{status}</Badge>
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
      </div>
    )
  }

  if (isAdmin === false) return <div>Acesso Negado</div>

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-start sm:items-center flex-col sm:flex-row gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight mb-2 flex items-center gap-2">
            Chamados de Suporte
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Acompanhe e responda as dúvidas dos clientes.
          </p>
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden p-4">
        <div className="mb-4 flex justify-between gap-4">
          <Input
            placeholder="Buscar chamado por assunto..."
            className="max-w-md bg-background/50"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Button variant="outline" size="icon" onClick={checkAdminAndLoadTickets} title="Recarregar Chamados">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        <div className="overflow-x-auto">
          {tickets.filter(t => !searchTerm || t.subject.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 mb-4 text-muted-foreground/50" />
              <p>Nenhum chamado encontrado.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50 border rounded-md">
              {tickets.filter(t => !searchTerm || t.subject.toLowerCase().includes(searchTerm.toLowerCase())).map(ticket => {
                const ticketUser = users.find(u => u.id === ticket.user_id)
                const userName = ticketUser ? ticketUser.name : `ID: ${ticket.user_id.substring(0,8)}`
                const shortTicketId = ticket.id.substring(0, 6).toUpperCase()

                return (
                  <div key={ticket.id} className="p-4 hover:bg-muted/30 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-muted-foreground font-mono">#{shortTicketId}</Badge>
                        <span className="font-semibold text-lg">{ticket.subject}</span>
                        {getTicketStatusBadge(ticket.status)}
                        {ticket.priority === 'critical' && <Badge variant="destructive" className="animate-pulse">Urgente</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">{ticket.description}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Atualizado: {new Date(ticket.updated_at).toLocaleString('pt-BR')}</span>
                        <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> Cliente: <span className="font-medium text-foreground">{userName}</span></span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      <Button variant="outline" size="sm" onClick={() => handleOpenTicket(ticket)}>
                        <Eye className="w-4 h-4 mr-2" /> Responder
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger className={buttonVariants({ variant: "ghost", size: "icon", className: "h-8 w-8" })}>
                          <MoreVertical className="w-4 h-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleStatusChange(ticket.id, 'in_progress')}>Marcar Em Análise</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleStatusChange(ticket.id, 'resolved')}>Marcar Resolvido</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleStatusChange(ticket.id, 'closed')}>Encerrar Chamado</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setTicketToDelete(ticket.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50">Excluir Chamado</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <Sheet open={!!selectedTicket} onOpenChange={(open) => !open && handleCloseTicketSheet()}>
        <SheetContent className="sm:max-w-xl w-full overflow-hidden border-l border-white/10 bg-background/95 backdrop-blur-xl p-0 flex flex-col">
          {selectedTicket && (() => {
            const ticketUser = users.find(u => u.id === selectedTicket.user_id)
            const userName = ticketUser ? ticketUser.name : `ID: ${selectedTicket.user_id.substring(0,8)}`
            const shortTicketId = selectedTicket.id.substring(0, 6).toUpperCase()

            return (
              <>
                <SheetHeader className="text-left px-6 py-6 border-b border-border/40 bg-muted/5">
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <Ticket className="w-5 h-5 text-primary" />
                        <SheetTitle className="text-xl leading-tight pr-6">{selectedTicket.subject}</SheetTitle>
                      </div>
                      <SheetDescription className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                        <Badge variant="outline" className="font-mono bg-background">#{shortTicketId}</Badge>
                        <span className="flex items-center gap-1 font-medium text-foreground ml-1"><User className="w-3 h-3" /> {userName}</span>
                      </SheetDescription>
                    </div>
                  </div>
                </SheetHeader>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col bg-background/50">
                {messages.map((msg, i) => {
                  const isMe = msg.is_from_admin
                  return (
                    <div key={i} className={`flex flex-col w-full max-w-[85%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
                      <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                        {isMe ? 'Você (Admin)' : 'Cliente'}
                        {isMe && <Shield className="w-3 h-3 text-amber-500" />}
                      </div>
                      <div className={`p-4 rounded-2xl ${isMe ? 'bg-amber-500 text-white rounded-tr-sm shadow-md' : 'bg-background border border-border/50 rounded-tl-sm shadow-sm'}`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} className="h-1" />
              </div>

              <div className="p-4 bg-background border-t border-border/50 z-10">
                {selectedTicket.status === 'closed' || selectedTicket.status === 'resolved' ? (
                  <div className="text-center py-4 text-sm text-muted-foreground bg-muted/20 rounded-lg">
                    Este chamado foi encerrado ou resolvido.
                  </div>
                ) : (
                  <div className="flex items-end gap-3">
                    <Textarea 
                      placeholder="Digite sua resposta..." 
                      className="min-h-[60px] max-h-[150px] resize-none"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                    />
                    <Button 
                      onClick={handleSendMessage} 
                      disabled={isSending || !newMessage.trim()} 
                      className="h-[60px] px-6 shrink-0 bg-amber-500 hover:bg-amber-600 text-white"
                    >
                      {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )})()}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!ticketToDelete} onOpenChange={(open) => !open && setTicketToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-500">Excluir Chamado</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este chamado e todo seu histórico de mensagens? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteTicket} className="bg-red-500 hover:bg-red-600 text-white">
              Confirmar Exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

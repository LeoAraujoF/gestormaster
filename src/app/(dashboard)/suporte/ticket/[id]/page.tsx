"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter, useParams } from "next/navigation"
import { 
  ArrowLeft,
  Send,
  Loader2,
  Ticket,
  Clock,
  User,
  Shield
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

export default function TicketDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  
  const ticketId = params.id as string
  const [ticket, setTicket] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [user, setUser] = useState<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadTicket()
  }, [ticketId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadTicket = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)

    if (!user) return

    // Load ticket details
    const { data: ticketData, error: ticketError } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', ticketId)
      .eq('user_id', user.id)
      .single()

    if (ticketError || !ticketData) {
      toast.error("Chamado não encontrado.")
      router.push('/suporte')
      return
    }

    setTicket(ticketData)

    // Load messages
    const { data: msgData } = await supabase
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })

    if (msgData) setMessages(msgData)
    setIsLoading(false)

    // Subscribe to new messages (Optional for real-time)
    const channel = supabase
      .channel(`ticket_${ticketId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_messages', filter: `ticket_id=eq.${ticketId}` }, payload => {
        setMessages(prev => [...prev, payload.new])
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !user || !ticket) return

    setIsSending(true)
    try {
      const { error } = await supabase.from('ticket_messages').insert({
        ticket_id: ticket.id,
        user_id: user.id,
        content: newMessage,
        is_from_admin: false
      })

      if (error) throw error
      setNewMessage("")
      
      // Update ticket updated_at
      await supabase.from('tickets').update({ updated_at: new Date().toISOString() }).eq('id', ticket.id)

    } catch (e: any) {
      toast.error("Erro ao enviar mensagem.")
    } finally {
      setIsSending(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'open': return <Badge className="bg-interactive">Aberto</Badge>
      case 'in_progress': return <Badge className="bg-amber-500">Em Análise</Badge>
      case 'resolved': return <Badge className="bg-emerald-500">Resolvido</Badge>
      case 'closed': return <Badge variant="outline">Encerrado</Badge>
      default: return <Badge>{status}</Badge>
    }
  }

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <Button variant="ghost" onClick={() => router.push('/suporte')} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Voltar para Suporte
      </Button>

      <Card>
        <CardHeader className="border-b border-border/50 pb-6">
          <div className="flex flex-col sm:flex-row justify-between gap-4 sm:items-center">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <Ticket className="w-5 h-5 text-primary" />
                <CardTitle className="text-xl">{ticket.subject}</CardTitle>
              </div>
              <CardDescription className="flex items-center gap-2">
                <Clock className="w-3 h-3" />
                Aberto em {new Date(ticket.created_at).toLocaleString('pt-BR')}
                {ticket.page_url && ` • Página: ${ticket.page_url}`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {ticket.priority === 'critical' && <Badge variant="destructive">Urgente</Badge>}
              {getStatusBadge(ticket.status)}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="h-[500px] overflow-y-auto p-6 space-y-6 flex flex-col bg-muted/10">
            {messages.map((msg, i) => {
              const isMe = !msg.is_from_admin
              return (
                <div key={i} className={`flex flex-col w-full max-w-[80%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
                  <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                    {isMe ? 'Você' : 'Suporte Master'}
                    {!isMe && <Shield className="w-3 h-3 text-emerald-500" />}
                  </div>
                  <div className={`p-4 rounded-2xl ${isMe ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-background border border-border/50 rounded-tl-sm shadow-sm'}`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1 opacity-70">
                    {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-background border-t border-border/50 rounded-b-xl">
            {ticket.status === 'closed' || ticket.status === 'resolved' ? (
              <div className="text-center py-4 text-sm text-muted-foreground bg-muted/20 rounded-lg">
                Este chamado foi encerrado. Caso precise de mais ajuda, abra um novo chamado.
              </div>
            ) : (
              <div className="flex items-end gap-3">
                <Textarea 
                  placeholder="Digite sua mensagem..." 
                  className="min-h-[60px] max-h-[150px] resize-none"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                />
                <Button 
                  onClick={handleSendMessage} 
                  disabled={isSending || !newMessage.trim()} 
                  className="h-[60px] px-6 shrink-0"
                >
                  {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

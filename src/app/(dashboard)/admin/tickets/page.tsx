"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { 
  Ticket, 
  Search, 
  Filter, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  MoreVertical,
  Eye
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { toast } from "sonner"

export default function AdminTicketsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [tickets, setTickets] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, open, resolved
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadTickets()
  }, [])

  const loadTickets = async () => {
    // Busca todos os tickets com os dados do usuário (via view ou relacionamento se houver)
    // No Supabase auth.users não pode ser joinado facilmente via client na mesma query, 
    // então pegamos os tickets e tentaremos mostrar pelo menos o subject.
    // Em um sistema real Master Admin, o ideal é usar o Service Role no servidor.
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      toast.error("Erro ao carregar tickets.")
    } else if (data) {
      setTickets(data)
    }
    setIsLoading(false)
  }

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase.from('tickets').update({ status: newStatus }).eq('id', id)
      if (error) throw error
      toast.success("Status atualizado.")
      loadTickets()
    } catch {
      toast.error("Erro ao atualizar status.")
    }
  }

  const filteredTickets = tickets.filter(t => {
    if (filter === 'open' && t.status !== 'open' && t.status !== 'in_progress') return false
    if (filter === 'resolved' && t.status !== 'resolved' && t.status !== 'closed') return false
    if (search && !t.subject.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'open': return <Badge className="bg-sky-500">Aberto</Badge>
      case 'in_progress': return <Badge className="bg-amber-500">Em Análise</Badge>
      case 'resolved': return <Badge className="bg-emerald-500">Resolvido</Badge>
      case 'closed': return <Badge variant="outline">Encerrado</Badge>
      default: return <Badge>{status}</Badge>
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground flex items-center gap-2">
            <Ticket className="w-8 h-8 text-primary" />
            Gestão de Chamados
          </h1>
          <p className="text-muted-foreground mt-1">
            Administre os tickets de suporte abertos pelos seus clientes.
          </p>
        </div>
      </div>

      <Card className="glass-card">
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por assunto..." 
                className="pl-9 w-full"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')}>Todos</Button>
              <Button variant={filter === 'open' ? 'default' : 'outline'} onClick={() => setFilter('open')}>Abertos</Button>
              <Button variant={filter === 'resolved' ? 'default' : 'outline'} onClick={() => setFilter('resolved')}>Resolvidos</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : filteredTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 mb-4 text-muted-foreground/50" />
              <p>Nenhum chamado encontrado.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredTickets.map(ticket => (
                <div key={ticket.id} className="p-4 sm:p-6 hover:bg-muted/30 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-lg">{ticket.subject}</span>
                      {getStatusBadge(ticket.status)}
                      {ticket.priority === 'critical' && <Badge variant="destructive" className="animate-pulse">Urgente</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">{ticket.description}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Atualizado: {new Date(ticket.updated_at).toLocaleString('pt-BR')}</span>
                      <span>Cliente ID: {ticket.user_id.substring(0,8)}...</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <Button variant="outline" size="sm" onClick={() => router.push(`/admin/tickets/${ticket.id}`)}>
                      <Eye className="w-4 h-4 mr-2" /> Responder
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleStatusChange(ticket.id, 'in_progress')}>Marcar Em Análise</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(ticket.id, 'resolved')}>Marcar Resolvido</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(ticket.id, 'closed')}>Encerrar Chamado</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

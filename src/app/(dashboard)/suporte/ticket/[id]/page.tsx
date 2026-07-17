"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import type { RealtimeChannel, User } from "@supabase/supabase-js"
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  FileText,
  Loader2,
  MessageSquareText,
  Send,
  ShieldCheck,
} from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { PageHeader, PageShell } from "@/components/page-layout"
import { toast } from "sonner"

type TicketStatus = "open" | "in_progress" | "resolved" | "closed"
type TicketPriority = "low" | "medium" | "high" | "critical"

type SupportTicket = {
  id: string
  subject: string
  page_url: string | null
  status: TicketStatus | string
  priority: TicketPriority | string
  created_at: string
  updated_at: string | null
}

type TicketMessage = {
  id?: string
  content: string
  created_at: string
  is_from_admin: boolean
}

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Aberto",
  in_progress: "Em análise",
  resolved: "Resolvido",
  closed: "Encerrado",
}

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
}

function formatDateTime(value: string | null) {
  if (!value) return "Não informado"
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-0 font-medium",
        status === "open" && "bg-blue-500/10 text-blue-700 dark:text-blue-300",
        status === "in_progress" && "bg-amber-500/10 text-amber-700 dark:text-amber-300",
        status === "resolved" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        status === "closed" && "bg-muted text-muted-foreground",
      )}
    >
      {STATUS_LABELS[status as TicketStatus] ?? status}
    </Badge>
  )
}

export default function TicketDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const ticketId = params.id as string
  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [messages, setMessages] = useState<TicketMessage[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    let channel: RealtimeChannel | null = null

    const loadTicket = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (!active) return
      setUser(currentUser)

      if (!currentUser) {
        setIsLoading(false)
        return
      }

      const { data: ticketData, error: ticketError } = await supabase
        .from("tickets")
        .select("*")
        .eq("id", ticketId)
        .eq("user_id", currentUser.id)
        .single()

      if (!active) return
      if (ticketError || !ticketData) {
        toast.error("Chamado não encontrado.")
        router.push("/suporte")
        return
      }

      setTicket(ticketData as SupportTicket)

      const { data: messageData } = await supabase
        .from("ticket_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true })

      if (!active) return
      if (messageData) setMessages(messageData as TicketMessage[])
      setIsLoading(false)

      channel = supabase
        .channel(`ticket_${ticketId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${ticketId}` }, (payload) => {
          if (active) setMessages((current) => [...current, payload.new as TicketMessage])
        })
        .subscribe()
    }

    queueMicrotask(() => void loadTicket())

    return () => {
      active = false
      if (channel) void supabase.removeChannel(channel)
    }
  }, [router, supabase, ticketId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !user || !ticket) return

    setIsSending(true)
    try {
      const { error } = await supabase.from("ticket_messages").insert({
        ticket_id: ticket.id,
        user_id: user.id,
        content: newMessage,
        is_from_admin: false,
      })

      if (error) throw error
      setNewMessage("")

      await supabase.from("tickets").update({ updated_at: new Date().toISOString() }).eq("id", ticket.id)
    } catch {
      toast.error("Erro ao enviar mensagem.")
    } finally {
      setIsSending(false)
    }
  }

  if (isLoading) {
    return (
      <PageShell width="default">
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3" aria-live="polite">
          <Loader2 className="size-6 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Carregando chamado…</p>
        </div>
      </PageShell>
    )
  }

  if (!ticket) return null

  const isClosed = ticket.status === "closed" || ticket.status === "resolved"

  return (
    <PageShell width="default">
      <PageHeader
        eyebrow={`Chamado #${ticket.id.slice(0, 6).toUpperCase()}`}
        title={ticket.subject}
        description="Acompanhe o histórico completo e mantenha todas as informações desta solicitação no mesmo lugar."
        badge={STATUS_LABELS[ticket.status as TicketStatus] ?? ticket.status}
        actions={
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => router.push("/suporte")}>
            <ArrowLeft className="size-4" aria-hidden="true" /> Voltar ao suporte
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <Card className="order-2 overflow-hidden border-border lg:order-1">
          <CardHeader className="border-b border-border bg-muted/20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2 text-base"><MessageSquareText className="size-4 text-primary" aria-hidden="true" /> Conversa</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={ticket.status} />
                <Badge variant="outline">Prioridade {PRIORITY_LABELS[ticket.priority as TicketPriority] ?? ticket.priority}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex h-[min(56dvh,560px)] min-h-80 flex-col gap-5 overflow-y-auto bg-muted/10 p-4 sm:p-6" aria-live="polite">
              {messages.length === 0 && (
                <div className="m-auto rounded-xl border border-dashed border-border px-5 py-8 text-center">
                  <MessageSquareText className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold">Nenhuma mensagem registrada</p>
                  <p className="mt-1 text-xs text-muted-foreground">Envie uma mensagem para adicionar contexto ao chamado.</p>
                </div>
              )}
              {messages.map((message, index) => {
                const isRequester = !message.is_from_admin
                return (
                  <div key={message.id ?? `${message.created_at}-${index}`} className={cn("flex w-full max-w-[92%] flex-col sm:max-w-[78%]", isRequester ? "self-end items-end" : "self-start items-start")}>
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      {!isRequester && <ShieldCheck className="size-3 text-emerald-600" aria-hidden="true" />}
                      {isRequester ? "Você" : "Equipe de suporte"}
                    </div>
                    <div className={cn("rounded-2xl px-4 py-3", isRequester ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm border border-border bg-card shadow-sm")}>
                      <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                    </div>
                    <span className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(message.created_at)}</span>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-border bg-card p-3 sm:p-4">
              {isClosed ? (
                <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground">
                  Este chamado foi {ticket.status === "resolved" ? "resolvido" : "encerrado"}. Abra um novo chamado se precisar de outro acompanhamento.
                </div>
              ) : (
                <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <label htmlFor="ticket-reply" className="sr-only">Responder ao chamado</label>
                    <Textarea
                      id="ticket-reply"
                      placeholder="Escreva uma resposta. Enter envia; Shift + Enter cria uma linha."
                      className="min-h-20 max-h-40 resize-y"
                      value={newMessage}
                      onChange={(event) => setNewMessage(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault()
                          void handleSendMessage()
                        }
                      }}
                    />
                  </div>
                  <Button onClick={handleSendMessage} disabled={isSending || !newMessage.trim()} className="min-h-11 sm:min-h-20 sm:w-24">
                    {isSending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                    <span className="sm:sr-only">Enviar mensagem</span>
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="order-1 space-y-4 lg:order-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Detalhes do chamado</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div><p className="font-medium">Aberto em</p><p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(ticket.created_at)}</p></div>
              </div>
              <div className="flex items-start gap-3">
                <Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div><p className="font-medium">Última atualização</p><p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(ticket.updated_at ?? ticket.created_at)}</p></div>
              </div>
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0"><p className="font-medium">Página relacionada</p><p className="mt-0.5 break-all text-xs text-muted-foreground">{ticket.page_url || "Não informada"}</p></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/[0.025]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4 text-primary" aria-hidden="true" /> Histórico protegido</CardTitle>
            </CardHeader>
            <CardContent><p className="text-xs leading-5 text-muted-foreground">Respostas e atualizações deste chamado permanecem registradas aqui para preservar o contexto do atendimento.</p></CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  )
}

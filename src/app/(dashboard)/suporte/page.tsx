"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileText,
  LifeBuoy,
  Loader2,
  MessageSquareText,
  Plus,
  Search,
  Smartphone,
  Ticket,
} from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { logAuditClient } from "@/lib/audit-client"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { MetricGrid, PageHeader, PageShell } from "@/components/page-layout"
import { toast } from "sonner"

type TicketStatus = "open" | "in_progress" | "resolved" | "closed"
type TicketPriority = "low" | "medium" | "high" | "critical"

type SupportTicket = {
  id: string
  subject: string
  description: string
  page_url: string | null
  status: TicketStatus | string
  priority: TicketPriority | string
  created_at: string
  updated_at: string | null
}

type FaqCategory = "Primeiros passos" | "Automação" | "Financeiro" | "Conta" | "Suporte"

type FaqItem = {
  id: string
  category: FaqCategory
  question: string
  answer: string
  keywords: string
  href?: string
  action?: string
}

const FAQ_CATEGORIES = ["Todos", "Primeiros passos", "Automação", "Financeiro", "Conta", "Suporte"] as const

const FAQS: FaqItem[] = [
  {
    id: "inicio",
    category: "Primeiros passos",
    question: "Por onde começo a acompanhar minha operação?",
    answer: "Use o Painel para ver o resultado do dia, valores recebidos, próximos vencimentos e filas que exigem ação. Em Clientes, acompanhe crescimento, perdas, qualidade da base e a situação individual de cada cliente.",
    keywords: "painel dashboard clientes carteira crescimento vencimentos",
    href: "/painel",
    action: "Abrir Painel",
  },
  {
    id: "conectar-whatsapp",
    category: "Automação",
    question: "Como conecto um número de WhatsApp?",
    answer: "Abra Automação e selecione “Conectar número”. Depois de criar a conexão, escaneie o QR Code exibido no cartão do número usando a opção Aparelhos conectados do WhatsApp. O cartão muda para Online quando a conexão estiver pronta.",
    keywords: "whatsapp conectar numero qr code aparelhos conectados instancia chip",
    href: "/automacao",
    action: "Ir para Automação",
  },
  {
    id: "mensagens-automaticas",
    category: "Automação",
    question: "O que é necessário para as mensagens automáticas funcionarem?",
    answer: "É necessário ter pelo menos um número Online e manter a mensagem ou etapa da régua ativa. Na Visão geral da Central de Automação você configura mensagens e horários; em Logs acompanha itens em andamento, enviados e falhas.",
    keywords: "mensagens automaticas regra regua horario logs fila falha envio",
    href: "/automacao",
    action: "Revisar automações",
  },
  {
    id: "disparo-massa",
    category: "Automação",
    question: "Onde faço um disparo em massa?",
    answer: "Na Central de Automação, abra a aba Disparo em massa. Selecione o público disponível para sua conta, revise a estimativa, escreva a mensagem e, se desejar, defina uma data. Antes da confirmação, o sistema apresenta uma prévia dos contatos elegíveis, adiados e bloqueados.",
    keywords: "disparo massa campanha publico ativos inativos vencidos serviço agendar prévia",
    href: "/automacao",
    action: "Abrir Central de Automação",
  },
  {
    id: "variaveis",
    category: "Automação",
    question: "Quais variáveis posso usar nas mensagens?",
    answer: "Dados do cliente: {{primeiro_nome}}, {{client_name}}, {{plan_value}} e {{due_date}}. Dados configurados em Minha conta > Empresa & PIX: {{empresa}}, {{telefone_suporte}}, {{pix}}, {{titular_pix}}, {{banco_pix}} e {{link_canal}}. Se um dado da empresa não estiver preenchido, a variável correspondente ficará sem conteúdo.",
    keywords: "variáveis primeiro nome cliente valor vencimento empresa telefone suporte pix titular banco canal",
    href: "/minha-conta",
    action: "Configurar Empresa & PIX",
  },
  {
    id: "fuso-horario",
    category: "Conta",
    question: "Como o fuso horário afeta os envios?",
    answer: "Os disparos automáticos usam o fuso definido em Minha conta > Empresa & PIX. Essa configuração determina o horário local usado pelas regras; revise-a antes de ativar mensagens programadas.",
    keywords: "fuso horario timezone utc brasil portugal disparos programados",
    href: "/minha-conta",
    action: "Revisar fuso horário",
  },
  {
    id: "cobranca-inteligente",
    category: "Financeiro",
    question: "A Cobrança inteligente começa a enviar assim que eu abro a página?",
    answer: "Não. A página começa em modo de simulação e não envia mensagens nessa etapa. Você pode revisar perfis, horários e mensagens; os envios só ficam ativos depois de uma decisão separada e explícita. O recurso está disponível conforme o plano da conta.",
    keywords: "cobrança inteligente simulação ativar envios perfis horarios pro master",
    href: "/cobranca-inteligente",
    action: "Abrir Cobrança inteligente",
  },
  {
    id: "aquecimento",
    category: "Automação",
    question: "Por que o Aquecimento pede dois números?",
    answer: "O motor de aquecimento precisa de pelo menos dois números conectados e ativados para executar os ciclos entre instâncias. Números desconectados não podem participar. A maturidade exibida é uma estimativa operacional baseada no tempo de cadastro, e não uma medição externa da reputação do número.",
    keywords: "aquecimento dois numeros conectados maturidade reputação chip instancia",
    href: "/aquecimento",
    action: "Ver Aquecimento",
  },
  {
    id: "status-chamado",
    category: "Suporte",
    question: "Como acompanho a resposta de um chamado?",
    answer: "Abra Meus chamados nesta página e selecione a solicitação. Os status usados são Aberto, Em análise, Resolvido e Encerrado. Você pode enviar novas mensagens enquanto o chamado estiver aberto ou em análise; chamados resolvidos ou encerrados ficam disponíveis para consulta.",
    keywords: "ticket chamado resposta status aberto analise resolvido encerrado mensagem",
  },
  {
    id: "bom-chamado",
    category: "Suporte",
    question: "O que devo informar para receber ajuda mais rápido?",
    answer: "Informe um assunto objetivo, a página em que ocorreu, o que você tentou fazer, o resultado obtido, o resultado esperado e qualquer mensagem de erro visível. Escolha prioridade crítica somente quando o sistema estiver indisponível para a operação.",
    keywords: "abrir chamado descrição erro prioridade crítica sistema fora passos",
  },
]

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

const normalizeText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

function formatDate(value: string | null) {
  if (!value) return "Data não informada"
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
}

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status as TicketStatus] ?? status
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
      {label}
    </Badge>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const label = PRIORITY_LABELS[priority as TicketPriority] ?? priority
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium",
        priority === "critical" && "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
        priority === "high" && "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
      )}
    >
      {label}
    </Badge>
  )
}

export default function SuportePage() {
  const [supabase] = useState(() => createClient())
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [isLoadingTickets, setIsLoadingTickets] = useState(true)
  const [whatsappStatus, setWhatsappStatus] = useState<"checking" | "connected" | "disconnected">("checking")
  const [activeTab, setActiveTab] = useState("help")
  const [faqSearch, setFaqSearch] = useState("")
  const [faqCategory, setFaqCategory] = useState<(typeof FAQ_CATEGORIES)[number]>("Todos")
  const [openFaqId, setOpenFaqId] = useState<string | null>(FAQS[0].id)
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newTicket, setNewTicket] = useState({ subject: "", priority: "medium", page_url: "", description: "" })

  const loadSupportData = useCallback(async () => {
    setIsLoadingTickets(true)
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    setUser(currentUser)

    if (!currentUser) {
      setTickets([])
      setWhatsappStatus("disconnected")
      setIsLoadingTickets(false)
      return
    }

    const [ticketsResult, whatsappResult] = await Promise.all([
      supabase
        .from("tickets")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("evolution_instances")
        .select("status")
        .eq("user_id", currentUser.id)
        .eq("status", "connected")
        .limit(1),
    ])

    if (ticketsResult.data) setTickets(ticketsResult.data as SupportTicket[])
    setWhatsappStatus(whatsappResult.data?.length ? "connected" : "disconnected")
    setIsLoadingTickets(false)
  }, [supabase])

  useEffect(() => {
    queueMicrotask(() => void loadSupportData())
  }, [loadSupportData])

  const handleCreateTicket = async () => {
    if (!newTicket.subject.trim() || !newTicket.description.trim()) {
      toast.error("Preencha o assunto e a descrição.")
      return
    }
    if (!user) {
      toast.error("Não foi possível identificar sua conta. Atualize a página e tente novamente.")
      return
    }

    setIsSubmitting(true)
    try {
      const { data, error } = await supabase.from("tickets").insert({
        user_id: user.id,
        subject: newTicket.subject,
        priority: newTicket.priority,
        page_url: newTicket.page_url,
        description: newTicket.description,
        status: "open",
      }).select().single()

      if (error) throw error
      logAuditClient({ action: "ticket.create", resource: "tickets", resource_id: data.id, details: { subject: newTicket.subject } })

      await supabase.from("ticket_messages").insert({
        ticket_id: data.id,
        user_id: user.id,
        content: newTicket.description,
        is_from_admin: false,
      })

      toast.success("Chamado aberto com sucesso!")
      setIsNewTicketOpen(false)
      setNewTicket({ subject: "", priority: "medium", page_url: "", description: "" })
      setActiveTab("tickets")
      await loadSupportData()
    } catch {
      toast.error("Erro ao abrir chamado.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const activeTickets = tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status))
  const inProgressTickets = tickets.filter((ticket) => ticket.status === "in_progress")
  const resolvedTickets = tickets.filter((ticket) => ["resolved", "closed"].includes(ticket.status))
  const criticalTickets = activeTickets.filter((ticket) => ticket.priority === "critical")
  const normalizedQuery = normalizeText(faqSearch.trim())
  const filteredFaqs = FAQS.filter((faq) => {
    const matchesCategory = faqCategory === "Todos" || faq.category === faqCategory
    const searchable = normalizeText(`${faq.question} ${faq.answer} ${faq.keywords}`)
    return matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery))
  })

  return (
    <PageShell width="default">
      <PageHeader
        eyebrow="Atendimento e ajuda"
        title="Central de suporte"
        description="Encontre uma orientação confiável, abra um chamado com contexto e acompanhe cada resposta em um só lugar."
        badge={activeTickets.length === 1 ? "1 chamado ativo" : `${activeTickets.length} chamados ativos`}
        actions={
          <Button className="w-full sm:w-auto" onClick={() => setIsNewTicketOpen(true)}>
            <Plus className="size-4" aria-hidden="true" /> Novo chamado
          </Button>
        }
      />

      <MetricGrid columns={4}>
        <Card className={cn("border-border", activeTickets.length > 0 && "border-blue-500/25")}>
          <CardContent className="flex items-start justify-between p-4">
            <div>
              <p className="microlabel">Chamados ativos</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{isLoadingTickets ? "—" : activeTickets.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">abertos ou em análise</p>
            </div>
            <span className="rounded-lg bg-blue-500/10 p-2 text-blue-700 dark:text-blue-300"><Ticket className="size-4" aria-hidden="true" /></span>
          </CardContent>
        </Card>
        <Card className={cn("border-border", inProgressTickets.length > 0 && "border-amber-500/25")}>
          <CardContent className="flex items-start justify-between p-4">
            <div>
              <p className="microlabel">Em análise</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{isLoadingTickets ? "—" : inProgressTickets.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">com a equipe de suporte</p>
            </div>
            <span className="rounded-lg bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300"><Clock3 className="size-4" aria-hidden="true" /></span>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="flex items-start justify-between p-4">
            <div>
              <p className="microlabel">Histórico concluído</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{isLoadingTickets ? "—" : resolvedTickets.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">resolvidos ou encerrados</p>
            </div>
            <span className="rounded-lg bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4" aria-hidden="true" /></span>
          </CardContent>
        </Card>
        <Card className={cn("border-border", whatsappStatus === "disconnected" && "border-amber-500/25")}>
          <CardContent className="flex items-start justify-between p-4">
            <div>
              <p className="microlabel">Canal de envio</p>
              <p className="mt-2 text-base font-semibold tracking-tight">
                {whatsappStatus === "checking" ? "Verificando…" : whatsappStatus === "connected" ? "Disponível" : "Indisponível"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">ao menos um número online</p>
            </div>
            <span className={cn("rounded-lg p-2", whatsappStatus === "connected" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300")}>
              {whatsappStatus === "checking" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-label="Verificando conexão" /> : <Smartphone className="size-4" aria-hidden="true" />}
            </span>
          </CardContent>
        </Card>
      </MetricGrid>

      {criticalTickets.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-700 dark:text-red-300" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">{criticalTickets.length === 1 ? "1 chamado crítico está ativo" : `${criticalTickets.length} chamados críticos estão ativos`}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Acompanhe o histórico antes de abrir outra solicitação sobre o mesmo problema.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setActiveTab("tickets")}>Ver chamados</Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid h-12 w-full grid-cols-2 border bg-muted/50 p-1 sm:max-w-[430px]">
          <TabsTrigger value="help" className="h-full gap-2 rounded-lg">
            <BookOpen className="size-4" aria-hidden="true" /> Central de ajuda
          </TabsTrigger>
          <TabsTrigger value="tickets" className="h-full gap-2 rounded-lg">
            <Ticket className="size-4" aria-hidden="true" /> Meus chamados
            {activeTickets.length > 0 && <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[9px] font-semibold text-background">{activeTickets.length}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="help" className="mt-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <Card className="overflow-hidden border-border">
              <CardHeader className="border-b border-border bg-muted/20">
                <div className="flex items-start gap-3">
                  <span className="rounded-lg bg-primary/10 p-2 text-primary"><CircleHelp className="size-4" aria-hidden="true" /></span>
                  <div>
                    <CardTitle className="text-lg">Como podemos ajudar?</CardTitle>
                    <CardDescription className="mt-1">As respostas abaixo foram revisadas conforme as telas e os recursos atuais.</CardDescription>
                  </div>
                </div>
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    value={faqSearch}
                    onChange={(event) => setFaqSearch(event.target.value)}
                    className="h-11 pl-9"
                    placeholder="Busque por WhatsApp, PIX, disparo, chamado…"
                    aria-label="Buscar na central de ajuda"
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Categorias da central de ajuda">
                  {FAQ_CATEGORIES.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setFaqCategory(category)}
                      aria-pressed={faqCategory === category}
                      className={cn(
                        "min-h-9 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                        faqCategory === category ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="p-3 sm:p-5">
                <p className="mb-3 text-xs text-muted-foreground" aria-live="polite">
                  {filteredFaqs.length === 1 ? "1 orientação encontrada" : `${filteredFaqs.length} orientações encontradas`}
                </p>
                {filteredFaqs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
                    <Search className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
                    <p className="mt-3 text-sm font-semibold">Nenhuma orientação encontrada</p>
                    <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">Tente outro termo ou abra um chamado informando a página e o que você precisa fazer.</p>
                    <Button className="mt-4" size="sm" onClick={() => setIsNewTicketOpen(true)}>Abrir chamado</Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredFaqs.map((faq) => {
                      const isOpen = openFaqId === faq.id
                      const panelId = `faq-panel-${faq.id}`
                      return (
                        <div key={faq.id} className={cn("overflow-hidden rounded-xl border transition-colors motion-reduce:transition-none", isOpen ? "border-primary/25 bg-primary/[0.025]" : "border-border bg-card")}>
                          <button
                            type="button"
                            onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                            aria-expanded={isOpen}
                            aria-controls={panelId}
                            className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          >
                            <span className="min-w-0">
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{faq.category}</span>
                              <span className="mt-1 block text-sm font-semibold leading-5">{faq.question}</span>
                            </span>
                            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", isOpen && "rotate-180")} aria-hidden="true" />
                          </button>
                          {isOpen && (
                            <div id={panelId} className="border-t border-border/70 px-4 py-4">
                              <p className="text-sm leading-6 text-muted-foreground">{faq.answer}</p>
                              {faq.href && faq.action && (
                                <Button nativeButton={false} render={<Link href={faq.href} />} variant="link" className="mt-3 h-auto px-0 text-sm">
                                  {faq.action} <ArrowRight className="size-3.5" aria-hidden="true" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="border-primary/20">
                <CardHeader>
                  <span className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><LifeBuoy className="size-4" aria-hidden="true" /></span>
                  <CardTitle className="text-base">Não encontrou a resposta?</CardTitle>
                  <CardDescription>Abra um chamado. O histórico e as respostas ficam vinculados à sua conta nesta central.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full" onClick={() => setIsNewTicketOpen(true)}>
                    <MessageSquareText className="size-4" aria-hidden="true" /> Abrir novo chamado
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><FileText className="size-4 text-muted-foreground" aria-hidden="true" /> Antes de enviar</CardTitle>
                  <CardDescription>Inclua contexto suficiente para reduzir perguntas adicionais.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 text-sm text-muted-foreground">
                    {["Página em que ocorreu", "Ação que você tentou executar", "Resultado obtido e esperado", "Mensagem de erro exibida"].map((item) => (
                      <li key={item} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />{item}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {whatsappStatus === "disconnected" && (
                <Card className="border-amber-500/25 bg-amber-500/[0.035]">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base"><Smartphone className="size-4 text-amber-700 dark:text-amber-300" aria-hidden="true" /> WhatsApp desconectado</CardTitle>
                    <CardDescription>Se a dúvida for sobre envios, reconecte o número antes de abrir um chamado.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button nativeButton={false} render={<Link href="/automacao" />} variant="outline" className="w-full">Revisar conexão</Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tickets" className="mt-5">
          <Card className="overflow-hidden border-border">
            <CardHeader className="flex flex-col gap-4 border-b border-border bg-muted/20 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg"><Ticket className="size-4 text-primary" aria-hidden="true" /> Meus chamados</CardTitle>
                <CardDescription className="mt-1">Abra uma solicitação para acompanhar respostas e manter o contexto registrado.</CardDescription>
              </div>
              <Button className="w-full sm:w-auto" onClick={() => setIsNewTicketOpen(true)}><Plus className="size-4" aria-hidden="true" /> Novo chamado</Button>
            </CardHeader>
            <CardContent className="p-3 sm:p-5">
              {isLoadingTickets ? (
                <div className="space-y-3" aria-label="Carregando chamados" aria-live="polite">
                  {[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl border border-border bg-muted/50 motion-reduce:animate-none" />)}
                </div>
              ) : tickets.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-5 py-12 text-center">
                  <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-5" aria-hidden="true" /></span>
                  <h3 className="mt-4 text-base font-semibold">Nenhum chamado registrado</h3>
                  <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">Consulte a Central de ajuda ou abra uma solicitação se precisar de acompanhamento.</p>
                  <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                    <Button variant="outline" onClick={() => setActiveTab("help")}>Consultar ajuda</Button>
                    <Button onClick={() => setIsNewTicketOpen(true)}>Abrir chamado</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {tickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => router.push(`/suporte/ticket/${ticket.id}`)}
                      className="group w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/25 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[10px] text-muted-foreground">#{ticket.id.slice(0, 6).toUpperCase()}</span>
                            <StatusBadge status={ticket.status} />
                            <PriorityBadge priority={ticket.priority} />
                          </div>
                          <p className="mt-2 truncate text-sm font-semibold group-hover:text-primary">{ticket.subject}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{ticket.description}</p>
                        </div>
                        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-border pt-3 text-xs text-muted-foreground sm:block sm:border-0 sm:pt-0 sm:text-right">
                          <span className="block">Última atualização</span>
                          <span className="mt-1 flex items-center gap-1 font-medium text-foreground sm:justify-end"><Clock3 className="size-3" aria-hidden="true" />{formatDate(ticket.updated_at ?? ticket.created_at)}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isNewTicketOpen} onOpenChange={setIsNewTicketOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>Abrir novo chamado</DialogTitle>
            <DialogDescription>Descreva o contexto para que a equipe entenda o problema sem depender de várias perguntas adicionais.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="ticket-subject">Assunto</Label>
              <Input id="ticket-subject" placeholder="Ex: WhatsApp desconectou durante os envios" value={newTicket.subject} onChange={(event) => setNewTicket({ ...newTicket, subject: event.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ticket-page">Página relacionada <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <Input id="ticket-page" placeholder="Ex: /automacao" value={newTicket.page_url} onChange={(event) => setNewTicket({ ...newTicket, page_url: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-priority">Prioridade</Label>
                <Select value={newTicket.priority} onValueChange={(value) => setNewTicket({ ...newTicket, priority: value || "medium" })}>
                  <SelectTrigger id="ticket-priority"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa · dúvida ou orientação</SelectItem>
                    <SelectItem value="medium">Média · problema com alternativa</SelectItem>
                    <SelectItem value="high">Alta · função importante parada</SelectItem>
                    <SelectItem value="critical">Crítica · sistema indisponível</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ticket-description">Descrição detalhada</Label>
              <Textarea
                id="ticket-description"
                placeholder="O que você tentou fazer? O que aconteceu? O que esperava? Inclua a mensagem de erro, se houver."
                className="min-h-36 resize-y"
                value={newTicket.description}
                onChange={(event) => setNewTicket({ ...newTicket, description: event.target.value })}
              />
            </div>
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
              Prioridade crítica deve ser usada quando o sistema estiver indisponível para a operação. Para dúvidas e orientações, use baixa ou média.
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsNewTicketOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateTicket} disabled={isSubmitting || !newTicket.subject.trim() || !newTicket.description.trim()}>
              {isSubmitting && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              Enviar chamado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}

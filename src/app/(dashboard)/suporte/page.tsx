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
  Clock3,
  FileText,
  LifeBuoy,
  Loader2,
  Plus,
  Search,
  Smartphone,
  ThumbsDown,
  ThumbsUp,
  Ticket,
} from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { logAuditClient } from "@/lib/audit-client"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { PageHeader, PageShell, SectionCard } from "@/components/page-layout"
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
        "rounded-[5px] border-transparent font-mono text-[9px] font-bold uppercase tracking-[0.03em]",
        status === "open" && "bg-interactive-bg text-interactive-fg",
        status === "in_progress" && "bg-warning-bg text-warning-fg",
        status === "resolved" && "bg-success-bg text-success-fg",
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
        "rounded-[5px] font-medium",
        priority === "critical" && "border-danger-border bg-danger-bg text-danger-fg",
        priority === "high" && "border-warning-border bg-warning-bg text-warning-fg",
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
  const [planName, setPlanName] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("help")
  const [faqSearch, setFaqSearch] = useState("")
  const [faqCategory, setFaqCategory] = useState<(typeof FAQ_CATEGORIES)[number]>("Todos")
  const [openFaqId, setOpenFaqId] = useState<string | null>(FAQS[0].id)
  const [faqVotes, setFaqVotes] = useState<Record<string, "yes" | "no">>({})
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

    const [ticketsResult, whatsappResult, entitlementResult] = await Promise.all([
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
      fetch("/api/entitlements", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])

    if (ticketsResult.data) setTickets(ticketsResult.data as SupportTicket[])
    setWhatsappStatus(whatsappResult.data?.length ? "connected" : "disconnected")
    if (entitlementResult?.plan) setPlanName(entitlementResult.plan.charAt(0).toUpperCase() + entitlementResult.plan.slice(1))
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

  const voteFaq = (id: string, helpful: boolean) => {
    setFaqVotes((prev) => ({ ...prev, [id]: helpful ? "yes" : "no" }))
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
  const categoryCounts = FAQ_CATEGORIES.map((category) => ({
    key: category,
    count: category === "Todos" ? FAQS.length : FAQS.filter((faq) => faq.category === category).length,
  }))

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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={cn("rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]", activeTickets.length > 0 && "border-interactive/25")}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="microlabel">Chamados ativos</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{isLoadingTickets ? "—" : activeTickets.length}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">abertos ou em análise</p>
            </div>
            <span className="rounded-lg bg-interactive-bg p-2 text-interactive-fg"><Ticket className="size-4" aria-hidden="true" /></span>
          </div>
        </div>
        <div className={cn("rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]", inProgressTickets.length > 0 && "border-warning-border")}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="microlabel">Em análise</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{isLoadingTickets ? "—" : inProgressTickets.length}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">com a equipe de suporte</p>
            </div>
            <span className="rounded-lg bg-warning-bg p-2 text-warning-fg"><Clock3 className="size-4" aria-hidden="true" /></span>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="microlabel">Histórico concluído</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{isLoadingTickets ? "—" : resolvedTickets.length}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">resolvidos ou encerrados</p>
            </div>
            <span className="rounded-lg bg-success-bg p-2 text-success-fg"><CheckCircle2 className="size-4" aria-hidden="true" /></span>
          </div>
        </div>
        <div className={cn("rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]", whatsappStatus === "disconnected" && "border-warning-border")}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="microlabel">Canal de envio</p>
              <p className="mt-2 text-base font-semibold tracking-tight">
                {whatsappStatus === "checking" ? "Verificando…" : whatsappStatus === "connected" ? "Disponível" : "Indisponível"}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">ao menos um número online</p>
            </div>
            <span className={cn("rounded-lg p-2", whatsappStatus === "connected" ? "bg-success-bg text-success-fg" : "bg-warning-bg text-warning-fg")}>
              {whatsappStatus === "checking" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-label="Verificando conexão" /> : <Smartphone className="size-4" aria-hidden="true" />}
            </span>
          </div>
        </div>
      </div>

      {criticalTickets.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-danger-border bg-danger-bg px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger-fg" aria-hidden="true" />
            <div>
              <p className="text-[13px] font-semibold text-danger-fg">{criticalTickets.length === 1 ? "1 chamado crítico está ativo" : `${criticalTickets.length} chamados críticos estão ativos`}</p>
              <p className="mt-0.5 text-[11px] text-danger-fg/80">Acompanhe o histórico antes de abrir outra solicitação sobre o mesmo problema.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setActiveTab("tickets")} className="h-8 shrink-0 text-xs">Ver chamados</Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid h-11 w-full grid-cols-2 rounded-[10px] border border-border bg-muted p-1 sm:max-w-[380px]">
          <TabsTrigger value="help" className="h-full gap-1.5 rounded-[7px] text-[13px]">
            <BookOpen className="size-3.5" aria-hidden="true" /> Respostas rápidas
          </TabsTrigger>
          <TabsTrigger value="tickets" className="h-full gap-1.5 rounded-[7px] text-[13px]">
            <Ticket className="size-3.5" aria-hidden="true" /> Meus chamados
            {activeTickets.length > 0 && <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[9px] font-semibold text-background">{activeTickets.length}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="help" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,1fr)] lg:items-start">
            <div className="flex min-w-0 flex-col gap-3.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={faqSearch}
                  onChange={(event) => setFaqSearch(event.target.value)}
                  className="h-11 rounded-[10px] pl-9 text-[13px]"
                  placeholder="Buscar na base de conhecimento…"
                  aria-label="Buscar na central de ajuda"
                />
              </div>

              <div className="flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Categorias da central de ajuda">
                {categoryCounts.map(({ key, count }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFaqCategory(key)}
                    aria-pressed={faqCategory === key}
                    className={cn(
                      "min-h-[30px] shrink-0 rounded-[8px] border px-2.5 text-[11.5px] transition-colors motion-reduce:transition-none",
                      faqCategory === key
                        ? "border-interactive bg-interactive-bg font-semibold text-interactive-fg"
                        : "border-border bg-card font-medium text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {key} <span className="font-mono opacity-70">{count}</span>
                  </button>
                ))}
              </div>

              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                {filteredFaqs.length === 0 ? (
                  <div className="px-5 py-12 text-center">
                    <Search className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
                    <p className="mt-3 text-[13px] font-semibold">Nada encontrado</p>
                    <p className="mx-auto mt-1.5 max-w-md text-[11.5px] leading-[1.55] text-muted-foreground">
                      Não achamos resposta para “{faqSearch.trim()}”. Abra um chamado e resolvemos com você.
                    </p>
                    <Button size="sm" className="mt-3.5 h-[34px] px-3.5 text-xs" onClick={() => setIsNewTicketOpen(true)}>Abrir chamado</Button>
                  </div>
                ) : (
                  filteredFaqs.map((faq) => {
                    const isOpen = openFaqId === faq.id
                    const vote = faqVotes[faq.id]
                    const panelId = `faq-panel-${faq.id}`
                    return (
                      <div key={faq.id} className="border-b border-border last:border-b-0">
                        <button
                          type="button"
                          onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                          aria-expanded={isOpen}
                          aria-controls={panelId}
                          className="flex w-full items-center gap-3 px-[18px] py-[15px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          <span className="shrink-0 rounded-[5px] bg-secondary px-1.5 py-[3px] font-mono text-[9px] font-bold uppercase tracking-[0.03em] text-secondary-foreground">
                            {faq.category}
                          </span>
                          <span className={cn("min-w-0 flex-1 text-[13px] text-foreground", isOpen ? "font-semibold" : "font-medium")}>{faq.question}</span>
                          <ChevronDown className={cn("size-[15px] shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", isOpen && "rotate-180")} aria-hidden="true" />
                        </button>
                        {isOpen && (
                          <div id={panelId} className="px-[18px] pb-4">
                            <p className="max-w-[640px] text-[12.5px] leading-[1.65] text-muted-foreground">{faq.answer}</p>
                            <div className="mt-3 flex flex-wrap items-center gap-2.5">
                              {faq.href && faq.action && (
                                <Button
                                  nativeButton={false}
                                  render={<Link href={faq.href} />}
                                  variant="link"
                                  className="h-auto px-0 text-[12.5px]"
                                >
                                  {faq.action} <ArrowRight className="size-3.5" aria-hidden="true" />
                                </Button>
                              )}
                              <span className="text-[10.5px] text-muted-foreground">Isso resolveu?</span>
                              <button
                                type="button"
                                onClick={() => voteFaq(faq.id, true)}
                                className={cn(
                                  "flex h-[26px] items-center gap-1 rounded-[6px] border px-2.5 text-[11px] font-semibold",
                                  vote === "yes" ? "border-money bg-success-bg text-success-fg" : "border-border bg-card text-muted-foreground",
                                )}
                              >
                                <ThumbsUp className="size-3" aria-hidden="true" /> Sim
                              </button>
                              <button
                                type="button"
                                onClick={() => voteFaq(faq.id, false)}
                                className={cn(
                                  "flex h-[26px] items-center gap-1 rounded-[6px] border px-2.5 text-[11px] font-semibold",
                                  vote === "no" ? "border-danger-border bg-danger-bg text-danger-fg" : "border-border bg-card text-muted-foreground",
                                )}
                              >
                                <ThumbsDown className="size-3" aria-hidden="true" /> Não
                              </button>
                              {vote && <span className="text-[10.5px] font-semibold text-money">Obrigado pelo retorno!</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3.5">
              <SectionCard
                title="Seu plano"
                description={planName ?? "—"}
                headerAction={<span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-interactive-bg text-interactive-fg"><LifeBuoy className="size-[15px]" aria-hidden="true" /></span>}
                footer={
                  <Button
                    variant="outline"
                    onClick={() => router.push("/planos")}
                    className="h-[34px] w-full rounded-[8px] text-xs font-medium"
                  >
                    Comparar planos
                  </Button>
                }
              >
                <p className="text-[11px] leading-[1.55] text-muted-foreground">
                  Abra um chamado ou consulte a base de conhecimento — o histórico e as respostas ficam vinculados à sua conta.
                </p>
              </SectionCard>

              <SectionCard
                title="Antes de enviar"
                description="Inclua contexto suficiente para reduzir perguntas adicionais."
                headerAction={<span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-secondary text-secondary-foreground"><FileText className="size-[15px]" aria-hidden="true" /></span>}
              >
                <ul className="flex flex-col gap-2.5 text-[12px] text-muted-foreground">
                  {["Página em que ocorreu", "Ação que você tentou executar", "Resultado obtido e esperado", "Mensagem de erro exibida"].map((item) => (
                    <li key={item} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-money" aria-hidden="true" />{item}</li>
                  ))}
                </ul>
              </SectionCard>

              {whatsappStatus === "disconnected" && (
                <SectionCard
                  className="border-warning-border"
                  title="WhatsApp desconectado"
                  description="Se a dúvida for sobre envios, reconecte o número antes de abrir um chamado."
                  headerAction={<span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-warning-bg text-warning-fg"><Smartphone className="size-[15px]" aria-hidden="true" /></span>}
                  footer={
                    <Button nativeButton={false} render={<Link href="/automacao" />} variant="outline" className="h-[34px] w-full rounded-[8px] text-xs font-medium">
                      Revisar conexão
                    </Button>
                  }
                />
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tickets" className="mt-4">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-[14.5px] font-semibold text-foreground"><Ticket className="size-4 text-interactive-fg" aria-hidden="true" /> Meus chamados</h2>
                <p className="mt-[3px] text-[11.5px] text-muted-foreground">Abra uma solicitação para acompanhar respostas e manter o contexto registrado.</p>
              </div>
              <Button size="sm" className="h-8 w-full text-xs sm:w-auto" onClick={() => setIsNewTicketOpen(true)}><Plus className="size-3.5" aria-hidden="true" /> Novo chamado</Button>
            </div>
            <div className="p-3.5 sm:p-5">
              {isLoadingTickets ? (
                <div className="space-y-3" aria-label="Carregando chamados" aria-live="polite">
                  {[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl border border-border bg-muted/50 motion-reduce:animate-none" />)}
                </div>
              ) : tickets.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-5 py-12 text-center">
                  <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-success-bg text-success-fg"><CheckCircle2 className="size-5" aria-hidden="true" /></span>
                  <h3 className="mt-4 text-[15px] font-semibold">Nenhum chamado registrado</h3>
                  <p className="mx-auto mt-1 max-w-md text-[13px] leading-[1.55] text-muted-foreground">Consulte a Central de ajuda ou abra uma solicitação se precisar de acompanhamento.</p>
                  <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setActiveTab("help")}>Consultar ajuda</Button>
                    <Button size="sm" className="h-8 text-xs" onClick={() => setIsNewTicketOpen(true)}>Abrir chamado</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {tickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => router.push(`/suporte/ticket/${ticket.id}`)}
                      className="group w-full rounded-[11px] border border-border bg-card px-[18px] py-[15px] text-left transition-colors hover:border-interactive/25 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[10px] text-muted-foreground">#{ticket.id.slice(0, 6).toUpperCase()}</span>
                            <StatusBadge status={ticket.status} />
                            <PriorityBadge priority={ticket.priority} />
                          </div>
                          <p className="mt-1.5 truncate text-[13px] font-semibold group-hover:text-interactive-fg">{ticket.subject}</p>
                          <p className="mt-1 line-clamp-2 text-[11.5px] leading-[1.5] text-muted-foreground">{ticket.description}</p>
                        </div>
                        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-border pt-2.5 text-[11px] text-muted-foreground sm:block sm:border-0 sm:pt-0 sm:text-right">
                          <span className="block">Última atualização</span>
                          <span className="mt-1 flex items-center gap-1 font-medium text-foreground sm:justify-end"><Clock3 className="size-3" aria-hidden="true" />{formatDate(ticket.updated_at ?? ticket.created_at)}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isNewTicketOpen} onOpenChange={setIsNewTicketOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Abrir chamado</DialogTitle>
            <DialogDescription>Descreva o contexto para que a equipe entenda o problema sem depender de várias perguntas adicionais.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="ticket-subject" className="text-[11.5px]">Assunto</Label>
              <Input id="ticket-subject" className="h-9 text-[12.5px]" placeholder="Ex: WhatsApp desconectou durante os envios" value={newTicket.subject} onChange={(event) => setNewTicket({ ...newTicket, subject: event.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ticket-page" className="text-[11.5px]">Página relacionada <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <Input id="ticket-page" className="h-9 text-[12.5px]" placeholder="Ex: /automacao" value={newTicket.page_url} onChange={(event) => setNewTicket({ ...newTicket, page_url: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ticket-priority" className="text-[11.5px]">Prioridade</Label>
                <Select value={newTicket.priority} onValueChange={(value) => setNewTicket({ ...newTicket, priority: value || "medium" })}>
                  <SelectTrigger id="ticket-priority" className="h-9 text-[12.5px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa · dúvida ou orientação</SelectItem>
                    <SelectItem value="medium">Média · problema com alternativa</SelectItem>
                    <SelectItem value="high">Alta · função importante parada</SelectItem>
                    <SelectItem value="critical">Crítica · sistema indisponível</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ticket-description" className="text-[11.5px]">Descrição detalhada</Label>
              <Textarea
                id="ticket-description"
                placeholder="O que você tentou fazer? O que aconteceu? O que esperava? Inclua a mensagem de erro, se houver."
                className="min-h-36 resize-y text-[12.5px]"
                value={newTicket.description}
                onChange={(event) => setNewTicket({ ...newTicket, description: event.target.value })}
              />
            </div>
            <div className="rounded-[9px] border border-border bg-muted px-3 py-2.5 text-[11.5px] leading-[1.5] text-muted-foreground">
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

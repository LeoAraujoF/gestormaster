"use client"

import { useState, useEffect, useRef, type ReactNode } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import {
  ShieldAlert, Download, Upload, Loader2, Trash2, KeyRound, Lock, ChevronRight,
  User, Building2, SlidersHorizontal, Bell, Shield, Users, Database,
} from "lucide-react"
import { toast } from "sonner"
import { logAuditClient } from "@/lib/audit-client"
import { normalizeClientPhone } from "@/lib/phone"
import { useOrganization } from "@/components/providers/organization-provider"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { ComingSoon, PageHeader, PageShell, SectionCard } from "@/components/page-layout"
import { cn } from "@/lib/utils"
import {
  deleteProtectedResource,
  fetchSecurityPinStatus,
  SecurityPinApiError,
} from "@/lib/security-pin-client"

const TIMEZONES = [
  { value: "-03:00", label: "Horário de Brasília (UTC-3)" },
  { value: "-04:00", label: "Amazonas / NY (UTC-4)" },
  { value: "-05:00", label: "Acre (UTC-5)" },
  { value: "+01:00", label: "Portugal (Lisboa)" },
  { value: "+00:00", label: "Londres (UTC+0)" },
]

const SECTIONS = [
  { key: "perfil", label: "Perfil", icon: User, upcoming: false },
  { key: "seguranca", label: "Segurança", icon: Shield, upcoming: false },
  { key: "dados", label: "Dados", icon: Database, upcoming: false },
  { key: "operacao", label: "Operação", icon: SlidersHorizontal, upcoming: true },
  { key: "notificacoes", label: "Notificações", icon: Bell, upcoming: true },
  { key: "equipe", label: "Equipe", icon: Users, upcoming: true },
] as const

type SectionKey = (typeof SECTIONS)[number]["key"]

const NOTIF_EVENTS = [
  { key: "due", label: "Vencimentos do dia", description: "Clientes que vencem hoje" },
  { key: "overdue", label: "Cliente ficou vencido", description: "Passou da tolerância de atraso" },
  { key: "payment", label: "Pagamento confirmado", description: "PIX ou cartão com baixa automática" },
  { key: "failure", label: "Falha de automação", description: "Chip desconectado ou envio não entregue" },
  { key: "lead", label: "Novo lead recebido", description: "Entrada por qualquer canal" },
]

const OPS_TOGGLES = [
  { key: "autoRenew", label: "Renovação automática sugerida", description: "Ao confirmar pagamento, já propõe o próximo vencimento." },
  { key: "blockOnOverdue", label: "Suspender acesso ao vencer", description: "Marca o cliente como suspenso assim que passa da tolerância." },
  { key: "roundValues", label: "Arredondar valores no cadastro", description: "Ajusta centavos para o múltiplo mais próximo de R$ 0,50." },
  { key: "requireWhatsapp", label: "Exigir WhatsApp no cadastro", description: "Impede salvar cliente sem número — garante a cobrança automática." },
]

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  member: "Membro",
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function initialsOf(name: string) {
  const clean = name.includes("@") ? name.split("@")[0].replace(/[._]/g, " ") : name
  const parts = clean.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  if (parts.length === 0) return "?"
  return parts.map((p) => p[0]).join("").toUpperCase()
}

function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <Label htmlFor={htmlFor} className="block text-[11.5px] font-medium text-secondary-foreground">
      {children}
    </Label>
  )
}

/**
 * Aponta para a tela que é dona do assunto, em vez de duplicar o formulário aqui.
 * Cada campo tem um único lugar de edição — ver PLANO_IMPLEMENTACAO_UX.md, Etapa 59.
 */
function PointerCard({
  icon: Icon,
  title,
  description,
  href,
  cta,
}: {
  icon: React.ElementType
  title: string
  description: string
  href: string
  cta: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-card/60"
    >
      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-xl bg-interactive-bg text-interactive-fg">
        <Icon className="size-[15px]" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-foreground">{title}</p>
        <p className="mt-[3px] text-[11.5px] leading-[1.5] text-muted-foreground">{description}</p>
      </div>
      <span className="flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-interactive">
        {cta}
        <ChevronRight className="size-3.5" aria-hidden="true" />
      </span>
    </Link>
  )
}

export default function ConfiguracoesPage() {
  const supabase = createClient()
  const { role: orgRole } = useOrganization()
  const [user, setUser] = useState<any>(null)
  const [hasPin, setHasPin] = useState(false)
  const [isCheckingUser, setIsCheckingUser] = useState(true)
  const [userPlan, setUserPlan] = useState<string>("Desconhecido")
  const [isAdmin, setIsAdmin] = useState(false)
  const [section, setSection] = useState<SectionKey>("perfil")

  // PIN States (somente leitura aqui — criação/troca vive em /minha-conta)
  const [pinLockedUntil, setPinLockedUntil] = useState<string | null>(null)

  // Export States
  const [isExporting, setIsExporting] = useState(false)

  // Import States
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)

  // Danger Zone States
  const [isDangerDialogOpen, setIsDangerDialogOpen] = useState(false)
  const [dangerPin, setDangerPin] = useState("")
  const [isDeletingAll, setIsDeletingAll] = useState(false)

  // Perfil (user_metadata: full_name, personal_phone, timezone)
  const [fullName, setFullName] = useState("")
  const [personalPhone, setPersonalPhone] = useState("")
  const [timezone, setTimezone] = useState("-03:00")
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        setUserPlan(user.user_metadata?.plan_name || "Desconhecido")
        setFullName(user.user_metadata?.full_name || "")
        setPersonalPhone(user.user_metadata?.personal_phone || "")
        setTimezone(user.user_metadata?.timezone || "-03:00")

        try {
          const pinStatus = await fetchSecurityPinStatus()
          setHasPin(pinStatus.configured)
          setPinLockedUntil(pinStatus.lockedUntil)
        } catch {
          setHasPin(false)
          setPinLockedUntil(null)
        }

        try {
          const res = await fetch('/api/admin/check')
          const adminData = await res.json()
          setIsAdmin(adminData.isAdmin)
        } catch {
          setIsAdmin(false)
        }
      }
      setIsCheckingUser(false)
    }
    loadUser()
  }, [])

  const handleSaveProfile = async () => {
    setIsSavingProfile(true)
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: fullName, personal_phone: personalPhone, timezone },
      })
      if (error) throw error
      window.dispatchEvent(new CustomEvent("gestor:timezone-change", { detail: { timezone } }))
      toast.success("Perfil atualizado com sucesso!")
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Erro ao salvar o perfil."))
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleExport = async () => {
    if (userPlan === "Lite" && !isAdmin) {
      toast.info("A Exportação de Backup é um recurso exclusivo do Plano Pro e Plus.")
      return
    }

    setIsExporting(true)
    try {
      const { data: clients, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false })
      if (error) throw error

      if (!clients || clients.length === 0) {
        toast.info("Nenhum cliente para exportar.")
        return
      }

      const mappedClients = clients.map(c => ({
        "Nome": c.name,
        "Usuario": c.username || "",
        "Telefone": c.phone || "",
        "Valor do Plano": c.plan_value || 0,
        "Telas": c.screens || 1,
        "Vencimento": c.due_date ? c.due_date.split('T')[0] : "",
        "Status": c.status === 'active' ? 'Ativo' : c.status === 'vencido' ? 'Vencido' : c.status === 'inactive' ? 'Inativo' : c.status,
        "Observacao": c.observation || "",
        "Descricao": c.description || ""
      }))

      const Papa = (await import("papaparse")).default
      const csv = Papa.unparse(mappedClients)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `gestor_clientes_${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success("Exportação concluída!")
    } catch (e: any) {
      toast.error("Erro ao exportar clientes.")
    } finally {
      setIsExporting(false)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (userPlan === "Lite" && !isAdmin) {
      toast.info("A Importação de clientes é um recurso exclusivo do Plano Pro e Plus.")
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    const file = e.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    const Papa = (await import("papaparse")).default
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as any[]
          if (rows.length === 0) throw new Error("O arquivo CSV está vazio.")

          const inserts = rows.map((row, index) => {
            const name = row.Nome ?? row.nome ?? row.name ?? row.Name ?? "Sem Nome"
            const username = row.Usuario ?? row.usuario ?? row.username ?? row.Username ?? null
            const phone = row.Telefone ?? row.telefone ?? row.phone ?? row.Phone ?? null
            const normalizedPhone = normalizeClientPhone(phone)
            if (phone != null && String(phone).trim() && !normalizedPhone.phone_e164) {
              throw new Error(`Telefone inválido na linha ${index + 2}. Use o formato +DDI, por exemplo +1 202 555 0123.`)
            }

            const rawPlan = row["Valor do Plano"] ?? row.valor ?? row.plan_value ?? row.PlanValue
            const plan_value = rawPlan !== undefined && rawPlan !== null && rawPlan !== ""
              ? parseFloat(rawPlan.toString().replace(',', '.'))
              : 0

            const rawScreens = row.Telas ?? row.telas ?? row.screens ?? row.Screens
            const screens = rawScreens !== undefined && rawScreens !== null && rawScreens !== ""
              ? parseInt(rawScreens.toString())
              : 1

            const rawDate = row.Vencimento ?? row.vencimento ?? row.due_date ?? row.DueDate
            let due_date = new Date().toISOString().split('T')[0]
            if (rawDate) {
              try {
                const parsedDate = new Date(rawDate)
                if (!isNaN(parsedDate.getTime())) {
                  due_date = parsedDate.toISOString().split('T')[0]
                }
              } catch (err) {}
            }

            const status = row.Status ?? row.status ?? 'active'
            const observation = row.Observacao ?? row["Observação"] ?? row.observacao ?? row["observação"] ?? row.observation ?? row.notes ?? row.notas ?? null
            const description = row.Descricao ?? row["Descrição"] ?? row.descricao ?? row["descrição"] ?? row.description ?? row.Description ?? null

            return {
              user_id: user.id,
              name,
              username,
              ...normalizedPhone,
              plan_value,
              screens,
              due_date,
              status,
              observation,
              description
            }
          })

          const { error } = await supabase.from('clients').insert(inserts)
          if (error) throw error
          logAuditClient({ action: 'config.import_clients', resource: 'clients', details: { count: inserts.length } })

          toast.success(`${inserts.length} clientes importados com sucesso!`)
          if (fileInputRef.current) fileInputRef.current.value = ""
        } catch (err: any) {
          toast.error("Erro na importação: Verifique as colunas do seu CSV. " + err.message)
        } finally {
          setIsImporting(false)
        }
      },
      error: (error) => {
        toast.error("Erro ao ler o arquivo CSV.")
        setIsImporting(false)
      }
    })
  }

  const handleDeleteAll = async () => {
    if (dangerPin.length !== 4) return toast.error("Digite os 4 dígitos do PIN.")

    setIsDeletingAll(true)
    try {
      await deleteProtectedResource({ resource: 'clients', scope: 'all', pin: dangerPin })

      toast.success("Banco de dados completamente zerado.")
      setIsDangerDialogOpen(false)
      setDangerPin("")
    } catch (error) {
      setDangerPin("")
      if (error instanceof SecurityPinApiError && error.lockedUntil) {
        setPinLockedUntil(error.lockedUntil)
      }
      toast.error(error instanceof SecurityPinApiError ? error.message : "Erro ao limpar banco de dados.")
    } finally {
      setIsDeletingAll(false)
    }
  }

  if (isCheckingUser) {
    return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>
  }

  const isPinLocked = Boolean(pinLockedUntil)
  const isPlanGated = userPlan === "Lite" && !isAdmin
  const displayName = fullName || user?.email?.split("@")[0] || "Você"
  const roleLabel = orgRole ? (ROLE_LABELS[orgRole] || orgRole) : "Proprietário"
  const inputCls = "h-9 rounded-[7px] border-input px-3 text-[12.5px]"
  const selectTriggerCls = "h-9 w-full rounded-[7px] border-input px-3 text-[12.5px] [&_svg]:size-3.5"

  return (
    <PageShell width="wide" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeader
        eyebrow="Workspace"
        title="Configurações"
        description="Seu perfil, preferências de operação, equipe e dados da conta."
      />

      <div className="grid min-w-0 items-start gap-5 md:grid-cols-[196px_minmax(0,1fr)]">
          {/* Settings nav */}
          <nav className="flex gap-1 overflow-x-auto pb-1 md:sticky md:top-20 md:flex-col md:gap-0.5 md:overflow-visible md:pb-0" aria-label="Seções de configurações">
            {SECTIONS.map((sec) => {
              const Icon = sec.icon
              const active = section === sec.key
              return (
                <button
                  key={sec.key}
                  type="button"
                  onClick={() => setSection(sec.key)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-[38px] shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[9px] px-2.5 text-[13px] transition-colors md:w-full",
                    active
                      ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                      : "font-medium text-muted-foreground hover:bg-card/60 hover:text-foreground"
                  )}
                >
                  <span className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-[7px]",
                    active ? "bg-interactive-bg text-interactive-fg" : "text-muted-foreground"
                  )}>
                    <Icon className="size-3.5" />
                  </span>
                  {sec.label}
                  {sec.upcoming && (
                    <span
                      className="ml-auto size-1.5 shrink-0 rounded-full bg-warning"
                      title="Em breve"
                      aria-label="Em breve"
                    />
                  )}
                </button>
              )
            })}
          </nav>

          {/* Panels */}
          <div className="min-w-0 space-y-4">
            {section === "perfil" && (
              <div className="flex flex-col gap-4">
              <SectionCard
                title="Perfil pessoal"
                description="Como você aparece no sistema e recebe comunicações."
                footer={
                  <Button size="sm" onClick={handleSaveProfile} disabled={isSavingProfile} className="ml-auto h-8 px-3.5 text-xs">
                    {isSavingProfile && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                    Salvar
                  </Button>
                }
              >
                <div className="flex flex-col gap-5">
                  <div className="flex flex-wrap items-center gap-3.5">
                    <Avatar size="lg" className="size-[60px]">
                      <AvatarFallback className="bg-interactive-bg text-[21px] font-bold text-interactive-fg">
                        {initialsOf(displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 space-y-1.5">
                      <p className="text-[13px] font-semibold text-foreground">Foto do perfil</p>
                      <p className="text-[11px] text-muted-foreground">PNG ou JPG, no máximo 2 MB</p>
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        <Button type="button" variant="outline" disabled className={cn(inputCls, "h-[30px] px-2.5 text-[11.5px] font-medium")}>
                          Enviar imagem
                        </Button>
                        <ComingSoon />
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="fullName">Nome completo</FieldLabel>
                      <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" className={inputCls} />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="profileEmail">E-mail</FieldLabel>
                      <Input id="profileEmail" value={user?.email || ""} disabled className={inputCls} />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="personalPhone">WhatsApp pessoal</FieldLabel>
                      <Input id="personalPhone" value={personalPhone} onChange={(e) => setPersonalPhone(e.target.value)} placeholder="+55 11 99999-9999" className={inputCls} />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="timezone">Fuso horário</FieldLabel>
                      <Select value={timezone} onValueChange={(val) => val && setTimezone(val)}>
                        <SelectTrigger id="timezone" className={selectTriggerCls}>
                          <SelectValue placeholder="Selecione o fuso horário" />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <PointerCard
                icon={Building2}
                title="Dados da empresa, PIX e canal de avisos"
                description="Nome do negócio, WhatsApp de suporte e chave PIX viram variáveis nas mensagens automáticas."
                href="/minha-conta"
                cta="Minha conta"
              />
              </div>
            )}

            {section === "operacao" && (
              <SectionCard
                title="Padrões de operação"
                headerBadge={<ComingSoon />}
                description="Valores pré-preenchidos ao cadastrar clientes e cobranças — ainda não são aplicados automaticamente ao cadastro."
                contentClassName="opacity-70"
              >
                <div className="flex flex-col gap-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <FieldLabel>Ciclo padrão de cobrança</FieldLabel>
                      <Select value="monthly" disabled>
                        <SelectTrigger className={selectTriggerCls}><SelectValue placeholder="Mensal" /></SelectTrigger>
                        <SelectContent><SelectItem value="monthly">Mensal</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel>Forma de pagamento preferida</FieldLabel>
                      <Select value="pix" disabled>
                        <SelectTrigger className={selectTriggerCls}><SelectValue placeholder="PIX" /></SelectTrigger>
                        <SelectContent><SelectItem value="pix">PIX</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <p className="microlabel">Tolerância de atraso</p>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex h-9 w-[150px] shrink-0 items-center overflow-hidden rounded-[8px] border border-input">
                        <span className="flex h-full flex-1 items-center justify-center text-secondary-foreground">−</span>
                        <span className="w-[62px] text-center font-mono text-[12.5px] font-semibold">3 dias</span>
                        <span className="flex h-full flex-1 items-center justify-center text-secondary-foreground">+</span>
                      </div>
                      <p className="min-w-[200px] flex-1 text-[11px] leading-[1.5] text-muted-foreground">O cliente só é marcado como vencido 3 dias após a data.</p>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    {OPS_TOGGLES.map((t) => (
                      <div key={t.key} className="flex items-start gap-3 border-b border-border py-3.5 last:border-b-0">
                        <Switch checked={false} disabled className="mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-[12.5px] font-semibold text-foreground">{t.label}</p>
                          <p className="mt-[3px] text-[11px] leading-[1.5] text-muted-foreground">{t.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </SectionCard>
            )}

            {section === "notificacoes" && (
              <SectionCard
                title="O que você quer receber"
                headerBadge={<ComingSoon />}
                description="Escolha o canal de cada tipo de aviso — central de notificações ainda não está disponível."
                contentClassName={cn("p-0 opacity-70")}
                footer={
                  <>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-foreground">Resumo diário da operação</p>
                      <p className="mt-[3px] text-[11px] text-muted-foreground">Um e-mail por dia com vencimentos, recebimentos e falhas.</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <Input type="time" defaultValue="08:00" disabled className={cn(inputCls, "w-auto font-mono")} />
                      <Switch checked={false} disabled />
                    </div>
                  </>
                }
              >
                <div className="grid grid-cols-[minmax(0,1fr)_48px_48px_48px] items-center gap-2 border-b border-border px-5 py-2.5 sm:grid-cols-[minmax(0,1fr)_56px_56px_56px]">
                  <span className="microlabel">Evento</span>
                  <span className="microlabel text-center">App</span>
                  <span className="microlabel text-center">E-mail</span>
                  <span className="microlabel text-center">Zap</span>
                </div>
                {NOTIF_EVENTS.map((ev) => (
                  <div key={ev.key} className="grid grid-cols-[minmax(0,1fr)_48px_48px_48px] items-center gap-2 border-b border-border px-5 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_56px_56px_56px]">
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-foreground">{ev.label}</p>
                      <p className="mt-[3px] text-[10.5px] text-muted-foreground">{ev.description}</p>
                    </div>
                    <div className="flex justify-center"><Switch checked={false} disabled /></div>
                    <div className="flex justify-center"><Switch checked={false} disabled /></div>
                    <div className="flex justify-center"><Switch checked={false} disabled /></div>
                  </div>
                ))}
              </SectionCard>
            )}

            {section === "seguranca" && (
              <div className="flex flex-col gap-4">
                <PointerCard
                  icon={KeyRound}
                  title="Senha e Cofre PIN"
                  description="Trocar a senha de acesso e criar ou alterar o PIN de 4 dígitos ficam em Minha conta."
                  href="/minha-conta"
                  cta="Minha conta"
                />

                <SectionCard
                  title="Verificação em duas etapas"
                  headerBadge={<ComingSoon />}
                  description="Protege o acesso mesmo se a senha for descoberta."
                  footer={
                    <>
                      <span className="text-[11.5px] text-muted-foreground">Código do app autenticador a cada novo acesso</span>
                      <Switch checked={false} disabled />
                    </>
                  }
                />

                <SectionCard
                  title="Sessões ativas"
                  headerBadge={<ComingSoon label="Lista completa em breve" />}
                  description="Por enquanto, mostramos apenas a sessão que você está usando agora."
                >
                  <div className="flex items-center gap-2.5 rounded-[11px] border border-border p-3.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-secondary text-secondary-foreground">
                      <Shield className="size-[15px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[12.5px] font-semibold text-foreground">Este dispositivo</p>
                        <Badge variant="outline" className="rounded-md border-transparent bg-success-bg text-[9px] font-semibold uppercase tracking-[0.06em] text-success-fg">Atual</Badge>
                      </div>
                      <p className="mt-[3px] truncate font-mono text-[10px] text-muted-foreground">{user?.email}</p>
                    </div>
                  </div>
                </SectionCard>
              </div>
            )}

            {section === "equipe" && (
              <SectionCard
                title="Equipe"
                description="Hoje sua conta é individual — convites para colaboradores chegam em breve."
                headerAction={
                  <div className="flex items-center gap-2">
                    <Button size="sm" disabled className="h-8 gap-1.5 px-3 text-xs">
                      <Users className="size-3.5" /> Convidar
                    </Button>
                    <ComingSoon />
                  </div>
                }
              >
                <div className="flex items-center gap-3 rounded-[11px] border border-border p-3.5">
                  <Avatar size="default" className="size-[34px]">
                    <AvatarFallback className="bg-interactive-bg text-[11.5px] font-semibold text-interactive-fg">
                      {initialsOf(displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-[12.5px] font-semibold text-foreground">{displayName}</p>
                    </div>
                    <p className="mt-[3px] truncate text-[10.5px] text-muted-foreground">{user?.email}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 rounded-md text-[9px] font-semibold uppercase tracking-[0.06em]">Você</Badge>
                  <Badge variant="outline" className="shrink-0 rounded-md text-[11px] font-medium">{roleLabel}</Badge>
                </div>
              </SectionCard>
            )}

            {section === "dados" && (
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <SectionCard
                    title={
                      <span className="flex items-center gap-2">
                        <Download className="size-4 text-interactive" aria-hidden="true" />
                        Exportar dados
                        {isPlanGated && <Lock className="size-3.5 text-muted-foreground" aria-label="Disponível nos planos Pro e Master" />}
                      </span>
                    }
                    description="Baixe toda a sua lista de clientes para uma planilha Excel (CSV)."
                  >
                    <p className="mb-4 text-[12px] leading-[1.55] text-muted-foreground">
                      Recomendamos fazer a exportação semanalmente como backup ou para usar os dados em outras ferramentas.
                    </p>
                    <Button onClick={handleExport} disabled={isExporting} className="h-8 w-full text-xs">
                      {isExporting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Download className="mr-1.5 size-3.5" />}
                      Baixar backup CSV
                    </Button>
                  </SectionCard>

                  <SectionCard
                    title={
                      <span className="flex items-center gap-2">
                        <Upload className="size-4 text-money" aria-hidden="true" />
                        Importar de CSV
                        {isPlanGated && <Lock className="size-3.5 text-muted-foreground" aria-label="Disponível nos planos Pro e Master" />}
                      </span>
                    }
                    description="Traga sua base de clientes de outro sistema para a Lembrado."
                  >
                    <p className="mb-4 text-[12px] leading-[1.55] text-muted-foreground">
                      O arquivo precisa ter a primeira linha com o nome das colunas (Ex: name, phone, plan_value, due_date).
                    </p>
                    <Input
                      type="file"
                      accept=".csv"
                      ref={fileInputRef}
                      className={cn(inputCls, "cursor-pointer bg-background/50")}
                      disabled={isImporting}
                      onChange={handleImport}
                    />
                  </SectionCard>
                </div>

                <SectionCard
                  title="Backup automático"
                  description="Cópia diária guardada por 30 dias."
                  headerAction={
                    <div className="flex items-center gap-2">
                      <Switch checked={false} disabled />
                      <ComingSoon />
                    </div>
                  }
                />

                <div className="overflow-hidden rounded-2xl border border-danger-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                  <div className="border-b border-danger-border bg-danger-bg px-5 py-3.5">
                    <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-danger-fg">
                      <ShieldAlert className="size-4" /> Zona de risco
                    </h2>
                    <p className="mt-[3px] text-[11px] text-danger-fg/85">Ações irreversíveis — confirmação obrigatória</p>
                  </div>
                  <div className="p-5">
                    {isPinLocked && (
                      <p className="mb-4 rounded-md border border-danger-border bg-danger-bg p-3 text-[12px] text-danger-fg">
                        O PIN foi bloqueado após três erros. Aguarde 15 minutos para excluir novamente.
                      </p>
                    )}
                    {!hasPin && (
                      <p className="mb-4 flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted p-3 text-[12px] text-muted-foreground">
                        <KeyRound className="size-3.5 shrink-0" aria-hidden="true" />
                        Esta ação exige o Cofre PIN.
                        <Link href="/minha-conta" className="font-medium text-interactive hover:underline">
                          Criar meu PIN em Minha conta
                        </Link>
                      </p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold text-foreground">Apagar todos os clientes</p>
                        <p className="mt-[3px] text-[11px] leading-[1.5] text-muted-foreground">Remove clientes, cobranças e histórico associado. Não há como desfazer.</p>
                      </div>
                      <Button
                        variant="destructive"
                        onClick={() => setIsDangerDialogOpen(true)}
                        disabled={!hasPin || isPinLocked}
                        className="h-8 shrink-0 rounded-[7px] border border-danger-border bg-danger-bg px-3.5 text-xs font-semibold text-danger-fg hover:bg-danger-bg/80"
                      >
                        Apagar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
      </div>

      {/* Danger Zone Password Dialog */}
      <Dialog open={isDangerDialogOpen} onOpenChange={(open) => {
        setIsDangerDialogOpen(open)
        if (!open) setDangerPin("")
      }}>
        <DialogContent className="border-danger-border sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-danger-fg">
              <ShieldAlert className="size-5" aria-hidden="true" /> Autenticação necessária
            </DialogTitle>
            <DialogDescription>
              Para apagar toda a base de clientes, confirme sua identidade digitando o PIN do Cofre.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-6">
            <InputOTP maxLength={4} value={dangerPin} onChange={setDangerPin}>
              <InputOTPGroup>
                <InputOTPSlot index={0} className="border-danger-border" />
                <InputOTPSlot index={1} className="border-danger-border" />
                <InputOTPSlot index={2} className="border-danger-border" />
                <InputOTPSlot index={3} className="border-danger-border" />
              </InputOTPGroup>
            </InputOTP>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDangerDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteAll} disabled={isPinLocked || dangerPin.length !== 4 || isDeletingAll}>
              {isDeletingAll ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
              Deletar permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}

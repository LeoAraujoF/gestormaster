"use client"
// AutomaÃ§Ã£o â€” direÃ§Ã£o 2a (design_handoff/Automacao.dc.html + GUIA-AUTOMACAO-E-MODAIS PARTE 1)

import { useState, useEffect, useCallback, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { useConfirm } from "@/components/providers/confirm-provider"
import { Activity, CircleCheckBig, CircleX, Clock3, Copy, Image as ImageIcon, Loader2, MoreHorizontal, PhoneOff, QrCode, RotateCcw, Send, Shield, Smartphone, Star, Trash2, Wifi, WifiOff, X } from "lucide-react"
import { toast } from "sonner"
import { QRCodeSVG } from "qrcode.react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { phoneMask, cn } from "@/lib/utils"
import { logAuditClient } from "@/lib/audit-client"
import { usePlan } from "@/components/providers/plan-provider"
import { normalizeWhatsAppNumber } from "@/lib/phone"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { AutomationNavigation } from "@/components/automation-navigation"
import { MetricGrid, PageHeader, PageShell } from "@/components/page-layout"

const externalConnectionSchema = z.object({
  baseUrl: z.string().url("URL inválida (ex: http://192.168.1.100:8080)"),
  apiKey: z.string().min(5, "API Key é obrigatória"),
  instanceName: z.string().min(2, "Nome da instância obrigatório"),
})
type ExternalConnectionForm = z.infer<typeof externalConnectionSchema>
type ConnectionMethod = 'pairing' | 'qr'

const clientErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Erro de conexão'

const getDefaultTemplate = (type: string) => {
  const base = "{OlÃ¡|Oi|Tudo bem} {{primeiro_nome}}?\\n"
  const pixStr = "\\n\\nCaso deseje pagar via pix, segue os dados abaixo:\\nChave pix: {{pix}}\\nTitular: {{titular_pix}}\\nBanco: {{banco_pix}}\\n\\nSe tiver alguma dÃºvida, entre em contato conosco!\\n\\nAtenciosamente,\\nEquipe {{empresa}}"
  const defaults: Record<string, string> = {
    before_due: base + "Seu plano vence amanhÃ£, deseja renovar lo?" + pixStr,
    on_due: base + "Lembrando que o vencimento do seu plano Ã© hoje! Deseja renovar?" + pixStr,
    after_due: base + "Identificamos que seu plano venceu e encontra-se pendente. Deseja reativÃ¡-lo?" + pixStr,
    renewal: "{OlÃ¡|Oi|Tudo Ã³timo} {{primeiro_nome}}!\\nMuito obrigado por renovar seu plano conosco. Sua confianÃ§a Ã© essencial!\\n\\nSe tiver alguma dÃºvida, entre em contato conosco!\\n\\nAtenciosamente,\\nEquipe {{empresa}}\\n\\nNÃ£o esqueÃ§a de seguir nosso canal para nÃ£o ficar de fora de promoÃ§Ãµes e novidades!\\nLink: {{link_canal}}",
    promotion: base + "Temos uma oferta imperdÃ­vel para vocÃª! [Insira sua promoÃ§Ã£o aqui]\\n\\nAtenciosamente,\\nEquipe {{empresa}}",
    quick_message: base + "Passando para lembrar do seu plano no valor de R$ {{plan_value}}. \\n\\nAcesso RÃ¡pido ao Suporte: {{telefone_suporte}}\\n\\nAtenciosamente,\\nEquipe {{empresa}}",
    activation: "OlÃ¡ {{primeiro_nome}}! Seja muito bem-vindo(a)! ðŸŒŸ\\nSeu plano foi ativado com sucesso em nosso sistema!\\n\\nSalva esse nÃºmero aqui, ele serÃ¡ o nosso canal oficial de suporte tÃ©cnico e onde vocÃª receberÃ¡ seus avisos de vencimento, ok? ðŸ¤\\n\\nðŸ’° Valor do Plano: R$ {{plan_value}}\\nðŸ“… Seu Vencimento: {{due_date}}\\n\\nðŸŽ *PROMOÃ‡ÃƒO INDIQUE E GANHE*\\nSabia que vocÃª pode ganhar meses grÃ¡tis? Ã‰ muito simples: indicou um amigo e ele fechou com a gente, o seu prÃ³ximo mÃªs sai 100% DE GRAÃ‡A! Sem sorteio, indicou, ganhou! ðŸš€\\n\\nðŸ“± *NOSSO CANAL EXCLUSIVO*\\nNÃ£o fique de fora das novidades, manutenÃ§Ãµes programadas e promoÃ§Ãµes relÃ¢mpago! Entre agora no nosso canal oficial para clientes:\\nðŸ‘‰ {{link_canal}}\\n\\nQualquer dÃºvida, Ã© sÃ³ nos chamar por aqui. Aproveite!"
  }
  if (type === 'activation') {
    return "Ola {{primeiro_nome}}! Seja bem-vindo(a).\n\nSeu plano foi ativado com sucesso em nosso sistema.\n\nEste numero sera usado apenas para suporte tecnico e avisos operacionais autorizados. Se precisar de ajuda, responda esta mensagem.\n\nEquipe {{empresa}}"
  }
  return defaults[type] || defaults.before_due
}

// Mapa de cores por tipo (GUIA 1.7)
const STEP_TYPES: Record<string, string> = { before_due: 'Antes do vencimento', on_due: 'No dia do vencimento', after_due: 'Após o vencimento' }
const TEMPLATE_TYPES: Record<string, string> = { renewal: 'Renovação', activation: 'Boas-vindas', quick_message: 'Mensagem rápida', promotion: 'Promoção' }
const STARTER_SYSTEM_TYPES: Record<string, string> = { renewal: 'Renovação', activation: 'Boas-vindas', quick_message: 'Mensagem rápida' }
const LOG_TYPE: Record<string, string> = { before_due: 'Aviso prévio', on_due: 'No vencimento', after_due: 'Atraso', renewal: 'Renovação', activation: 'Boas-vindas', promotion: 'Promoção', quick_message: 'Msg rápida' }
const TYPE_DOT: Record<string, string> = { before_due: 'var(--interactive)', on_due: 'var(--warning)', after_due: 'var(--danger)', renewal: 'var(--money)', activation: 'var(--money)', quick_message: 'var(--money)', promotion: '#7a5af8' }
const VARS = ['{{primeiro_nome}}', '{{plan_value}}', '{{due_date}}', '{{pix}}', '{{titular_pix}}', '{{banco_pix}}', '{{empresa}}', '{{link_canal}}']

type LogDisplayStatus = 'pending' | 'deferred' | 'sent' | 'failed'
type AlertHistoryLog = { status?: unknown; contact_decision?: unknown }

function getLogDisplayStatus(log: AlertHistoryLog): LogDisplayStatus {
  const status = String(log.status || '').toLowerCase()
  if (status === 'pending' && log.contact_decision === 'deferred') return 'deferred'
  if (['accepted', 'sent', 'delivered', 'read'].includes(status)) return 'sent'
  if (['failed', 'cancelled', 'canceled'].includes(status)) return 'failed'
  return 'pending'
}

// Etiquetas dos templates (protÃ³tipo): cores por significado
const BADGES = ['PIX', 'LOGIN', 'CAMPANHA', 'PROMO', 'AVISO'] as const
const BADGE_CLS: Record<string, string> = {
  PIX: 'bg-secondary text-secondary-foreground',
  LOGIN: 'bg-secondary text-secondary-foreground',
  CAMPANHA: 'bg-accent text-accent-foreground',
  PROMO: 'bg-[#efe9ff] text-[#5b3fd4] dark:bg-[#2d2440] dark:text-[#b5a3f5]',
  AVISO: 'bg-danger-bg text-danger-fg',
}

const isStepType = (t: string) => ['before_due', 'on_due', 'after_due'].includes(t)

type CollectionCoordination = {
  enabled: boolean
  eligibility: { tracked: number; billable: number; readyForSend: number; withoutPositiveValue: number; withoutPhone: number }
}

// Toggle 22Ã—12 (design Â§7)
function MiniToggle({ on, onClick, disabled }: { on: boolean; onClick: (e: React.MouseEvent) => void; disabled?: boolean }) {
  return (
    <span
      onClick={disabled ? undefined : onClick}
      className={cn("inline-flex w-[22px] h-[12px] shrink-0 rounded-full p-[1px] cursor-pointer transition-colors", on ? "bg-money" : "bg-input", disabled && "opacity-50 cursor-not-allowed")}
    >
      <span className={cn("w-[10px] h-[10px] rounded-full bg-white transition-[margin]", on ? "ml-[10px]" : "ml-0")} />
    </span>
  )
}

// Stepper âˆ’/valor/+ (GUIA 1.4)
function NumStepper({ value, onDown, onUp }: { value: number; onDown: () => void; onUp: () => void }) {
  return (
    <div className="flex items-center overflow-hidden rounded-[7px] border border-input">
      <button type="button" onClick={onDown} aria-label="Diminuir valor" className="w-[30px] bg-muted py-[7px] text-sm text-secondary-foreground hover:bg-secondary">−</button>
      <span className="num flex-1 text-center text-[12px] font-semibold">{value}</span>
      <button type="button" onClick={onUp} aria-label="Aumentar valor" className="w-[30px] bg-muted py-[7px] text-sm text-secondary-foreground hover:bg-secondary">+</button>
    </div>
  )
}

export default function AutomacaoPage() {
  const confirm = useConfirm()
  const plan = usePlan()
  const isStarter = plan.plan === 'starter'
  const [activeTab, setActiveTab] = useState<'overview' | 'mass' | 'logs'>('overview')
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'loading' | 'error'>('loading')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [connectionMode, setConnectionMode] = useState<'integrated' | 'external'>('integrated')
  const [connectionMethod, setConnectionMethod] = useState<ConnectionMethod>('pairing')
  const [pairingPhone, setPairingPhone] = useState('')
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [pairingFallbackQr, setPairingFallbackQr] = useState<string | null>(null)
  const [connectionInstanceName, setConnectionInstanceName] = useState<string | null>(null)
  const [instances, setInstances] = useState<any[]>([])
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false)

  const [automations, setAutomations] = useState<any[]>([])
  const [ruleEstimates, setRuleEstimates] = useState<Record<string, number | string>>({})
  const [collectionCoordination, setCollectionCoordination] = useState<CollectionCoordination | null>(null)
  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false)
  const [dlgKind, setDlgKind] = useState<'step' | 'auto'>('step')
  const [editingRule, setEditingRule] = useState<any | null>(null)
  const [isSubmittingRule, setIsSubmittingRule] = useState(false)
  const [ruleForm, setRuleForm] = useState({ alert_type: 'before_due', days: 3, send_time: '09:00', message_template: getDefaultTemplate('before_due'), is_active: true })

  // Templates livres (message_templates): nome + etiqueta + mensagem
  const [templates, setTemplates] = useState<any[]>([])
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null)
  const [isSubmittingTemplate, setIsSubmittingTemplate] = useState(false)
  const [templateForm, setTemplateForm] = useState({ title: '', badge: 'PIX', message: '', is_active: true })

  // Logs
  const [logs, setLogs] = useState<any[]>([])
  const [logFilter, setLogFilter] = useState<'pending' | 'sent' | 'failed' | 'all'>('pending')
  const [isLogsLoading, setIsLogsLoading] = useState(false)
  const [isBulkActioning, setIsBulkActioning] = useState(false)
  const [retryingLogIds, setRetryingLogIds] = useState<Set<string>>(new Set())
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [isTestingPhone, setIsTestingPhone] = useState(false)

  // Anti-ban + chamadas
  const [antiBanConfig, setAntiBanConfig] = useState({ min_delay: 10, max_delay: 25 })
  const [isSavingAntiBan, setIsSavingAntiBan] = useState(false)
  const [rejectCalls, setRejectCalls] = useState(false)
  const [rejectCallsMessage, setRejectCallsMessage] = useState("As chamadas de voz e vÃ­deo estÃ£o desativadas para este nÃºmero. Por favor, envie uma mensagem de texto.")
  const [isSavingCallSettings, setIsSavingCallSettings] = useState(false)

  // Disparo em massa
  const [massAudience, setMassAudience] = useState<string>('all')
  const [massServiceId, setMassServiceId] = useState<string>('')
  const [massImage, setMassImage] = useState<File | null>(null)
  const [massMessage, setMassMessage] = useState<string>('OlÃ¡ {{primeiro_nome}}, temos uma oferta especial para vocÃª!')
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null)
  const [isSendingMass, setIsSendingMass] = useState(false)
  const [estimatedAudience, setEstimatedAudience] = useState<number | null>(null)
  const [services, setServices] = useState<any[]>([])

  const supabase = useMemo(() => createClient(), [])

  const { register: regConn, handleSubmit: handleConnSubmit, formState: { errors: connErrs }, setValue: setConnValue } = useForm<ExternalConnectionForm>({
    resolver: zodResolver(externalConnectionSchema),
    defaultValues: { baseUrl: "", apiKey: "", instanceName: "" }
  })

  /* â€”â€”â€”â€”â€” carga inicial â€”â€”â€”â€”â€” */
  useEffect(() => {
    checkAdminStatus()
    loadSettings()
    loadAutomations()
    loadTemplates()
    loadLogs()
    loadServices()
    if (!isStarter) loadCollectionCoordination()
  }, [])

  async function loadCollectionCoordination() {
    try {
      const response = await fetch('/api/intelligent-collections')
      if (!response.ok) return
      const data = await response.json()
      setCollectionCoordination({
        enabled: Boolean(data.settings?.enabled),
        eligibility: data.eligibility || { tracked: 0, billable: 0, readyForSend: 0, withoutPositiveValue: 0, withoutPhone: 0 },
      })
    } catch (error) {
      console.error('Falha ao carregar coordenação da cobrança inteligente:', error)
    }
  }

  /* â€”â€”â€”â€”â€” templates livres (message_templates) â€”â€”â€”â€”â€” */
  const loadTemplates = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('message_templates').select('*').eq('user_id', user.id).order('created_at', { ascending: true })
    if (data) setTemplates(data)
  }

  const openTemplateDialog = (tpl: any | null) => {
    setEditingTemplate(tpl)
    if (tpl) setTemplateForm({ title: tpl.title, badge: tpl.badge, message: tpl.message, is_active: tpl.is_active })
    else setTemplateForm({ title: '', badge: 'PIX', message: 'OlÃ¡ {{primeiro_nome}}, ', is_active: true })
    setIsTemplateDialogOpen(true)
  }

  const handleTemplateSubmit = async () => {
    if (!templateForm.title.trim()) return toast.error("DÃª um nome ao template.")
    if (!templateForm.message.trim()) return toast.error("Escreva a mensagem do template.")
    setIsSubmittingTemplate(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const payload = { user_id: user.id, title: templateForm.title.trim(), badge: templateForm.badge, message: templateForm.message, is_active: templateForm.is_active }
      if (editingTemplate) {
        const { error } = await supabase.from('message_templates').update(payload).eq('id', editingTemplate.id)
        if (error) throw error
        toast.success("Template atualizado.")
      } else {
        const { error } = await supabase.from('message_templates').insert(payload)
        if (error) throw error
        toast.success("Template criado.")
      }
      setIsTemplateDialogOpen(false)
      loadTemplates()
    } catch (e: any) { toast.error(e.message || "Erro ao salvar template.") } finally { setIsSubmittingTemplate(false) }
  }

  const deleteTemplate = async (id: string) => {
    await supabase.from('message_templates').delete().eq('id', id)
    toast.success("Template removido.")
    setIsTemplateDialogOpen(false)
    loadTemplates()
  }

  const activeTemplates = templates.filter(t => t.is_active)

  const checkAdminStatus = async () => {
    try {
      const res = await fetch('/api/admin/check')
      const data = await res.json()
      setIsAdmin(data.isAdmin)
      if (data.isAdmin) setConnectionMode('integrated')
    } catch (e) { setIsAdmin(false) }
  }

  const loadSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('evolution_instances').select('*').eq('user_id', user.id).order('created_at', { ascending: true })
      if (data && data.length > 0) {
        setInstances(data)
        const first = data[0]
        if (first.connection_mode === 'external') {
          setConnValue('baseUrl', first.base_url || '')
          setConnValue('apiKey', first.api_key || '')
          setConnectionMode('external')
        } else setConnectionMode('integrated')
        setAntiBanConfig({ min_delay: first.min_delay || 10, max_delay: first.max_delay || 25 })
        if (first.reject_calls !== undefined) setRejectCalls(first.reject_calls)
        if (first.reject_calls_message) setRejectCallsMessage(first.reject_calls_message)
        setStatus(data.some((i: any) => i.status === 'connected') ? 'connected' : 'disconnected')
        checkConnectionStatus()
        if (data.some((i: any) => i.status === 'disconnected' || i.qr_code)) {
          const interval = setInterval(checkConnectionStatus, 5000)
          return () => clearInterval(interval)
        }
      } else {
        setStatus('disconnected')
        setInstances([])
      }
    } catch (e) { setStatus('error') }
  }

  const checkConnectionStatus = async () => {
    try {
      const res = await fetch('/api/evolution/status')
      const data = await res.json()
      if (data.instances) setInstances(data.instances)
      setStatus(data.status)
    } catch (e) { console.error("Status check failed") }
  }

  const loadServices = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('services').select('*').eq('user_id', user.id)
    if (data) setServices(data)
  }

  /* â€”â€”â€”â€”â€” pÃºblico estimado â€”â€”â€”â€”â€” */
  useEffect(() => {
    const calculateAudience = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      let query = supabase.from('clients').select('id', { count: 'exact' }).eq('user_id', user.id)
      if (massAudience === 'active') query = query.eq('status', 'active')
      if (massAudience === 'inactive') query = query.eq('status', 'inactive')
      if (massAudience === 'expired') query = query.eq('status', 'vencido')
      if (massAudience === 'service' && massServiceId) {
        const { data } = await supabase.from('client_services').select('id').eq('service_id', massServiceId)
        if (data) { setEstimatedAudience(data.length); return }
      }
      if (massAudience === 'service' && !massServiceId) { setEstimatedAudience(0); return }
      const { count } = await query
      setEstimatedAudience(count || 0)
    }
    calculateAudience()
  }, [massAudience, massServiceId])

  /* â€”â€”â€”â€”â€” conexÃ£o â€”â€”â€”â€”â€” */
  const getPairingPhone = () => {
    if (connectionMethod !== 'pairing') return undefined
    const normalizedPhone = normalizeWhatsAppNumber(pairingPhone)
    if (!normalizedPhone) {
      toast.error('Informe um WhatsApp válido com código do país, por exemplo +55 11 99999-9999.')
      return null
    }
    return normalizedPhone
  }

  const handleConnectionResponse = async (responseData: {
    pairingCode?: string | null
    base64?: string | null
    instanceName?: string | null
  }) => {
    setConnectionInstanceName(responseData.instanceName || null)

    if (connectionMethod === 'pairing') {
      if (responseData.pairingCode) {
        setPairingCode(responseData.pairingCode)
        setPairingFallbackQr(responseData.base64 || null)
        toast.success('Código de pareamento gerado.')
      } else if (responseData.base64) {
        setPairingFallbackQr(responseData.base64)
        toast.warning('O código não ficou disponível. Use o QR Code alternativo.')
      } else {
        throw new Error('A Evolution não retornou um código de conexão. Tente novamente.')
      }
      await loadSettings()
      return
    }

    toast.success("Instância gerada! Escaneie o QR Code no card do chip.")
    setIsConnectDialogOpen(false)
    setConnectionInstanceName(null)
    await loadSettings()
  }

  const resetConnectionResult = () => {
    setPairingCode(null)
    setPairingFallbackQr(null)
  }

  const copyPairingCode = async () => {
    if (!pairingCode) return
    try {
      await navigator.clipboard.writeText(pairingCode)
      toast.success('Código copiado.')
    } catch {
      toast.error('Não foi possível copiar. Selecione o código manualmente.')
    }
  }

  const handleConnectDialogChange = (open: boolean) => {
    setIsConnectDialogOpen(open)
    if (!open) {
      resetConnectionResult()
      setConnectionInstanceName(null)
    }
  }

  const handleIntegratedConnect = async () => {
    const normalizedPhone = getPairingPhone()
    if (normalizedPhone === null) return
    setIsConnecting(true)
    try {
      const res = await fetch('/api/evolution/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'integrated',
          connectionMethod,
          phone: normalizedPhone,
          instanceName: connectionInstanceName || undefined,
        })
      })
      const responseData = await res.json()
      if (!res.ok) throw new Error(responseData.error || 'Erro de conexão')
      await handleConnectionResponse(responseData)
    } catch (error: unknown) { toast.error(clientErrorMessage(error)) } finally { setIsConnecting(false) }
  }

  const onExternalConnectSubmit = async (data: ExternalConnectionForm) => {
    const normalizedPhone = getPairingPhone()
    if (normalizedPhone === null) return
    setIsConnecting(true)
    try {
      const res = await fetch('/api/evolution/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'external',
          connectionMethod,
          phone: normalizedPhone,
          ...data,
        })
      })
      const responseData = await res.json()
      if (!res.ok) throw new Error(responseData.error || 'Erro de conexão')
      await handleConnectionResponse(responseData)
    } catch (error: unknown) { toast.error(clientErrorMessage(error)) } finally { setIsConnecting(false) }
  }

  const handleDisconnect = async (instanceName: string) => {
    if (!await confirm({ title: "Desconectar WhatsApp", description: "Os disparos serÃ£o interrompidos atÃ© vocÃª conectar novamente.", variant: "warning" })) return
    setIsConnecting(true)
    try {
      const res = await fetch('/api/evolution/logout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName })
      })
      if (!res.ok) throw new Error("Erro ao desconectar")
      toast.success("WhatsApp desconectado com sucesso!")
      loadSettings()
    } catch (error: any) { toast.error(error.message) } finally { setIsConnecting(false) }
  }

  const handleDeleteInstance = async (id: string, instanceName: string) => {
    if (!await confirm({ title: "Remover chip", description: `Remover permanentemente o chip "${instanceName}" e limpar o servidor?`, variant: "destructive" })) return
    setIsConnecting(true)
    try {
      const res = await fetch('/api/evolution/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName })
      })
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Erro ao remover")
      }
      toast.success("Limpeza profunda concluÃ­da! InstÃ¢ncia removida.")
      loadSettings()
    } catch (e: any) { toast.error(e.message || "Erro fatal ao remover instÃ¢ncia") } finally { setIsConnecting(false) }
  }

  const handleSetPrimary = async (instanceName: string) => {
    setIsConnecting(true)
    try {
      const res = await fetch('/api/evolution/set-primary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName })
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message)
        setInstances(prev => prev.map(inst => ({ ...inst, is_primary: inst.instance_name === instanceName })))
      } else toast.error(data.error || 'Erro ao definir instÃ¢ncia primÃ¡ria.')
    } catch (error) { toast.error('Erro de conexÃ£o ao definir instÃ¢ncia primÃ¡ria.') } finally { setIsConnecting(false) }
  }

  /* â€”â€”â€”â€”â€” anti-ban + chamadas â€”â€”â€”â€”â€” */
  const handleSaveAntiBan = async () => {
    setIsSavingAntiBan(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("NÃ£o autenticado")
      const { error } = await supabase
        .from('evolution_instances')
        .update({
          min_delay: antiBanConfig.min_delay,
          max_delay: antiBanConfig.max_delay,
          message_min_interval_ms: antiBanConfig.min_delay * 1000,
        })
        .eq('user_id', user.id)
      if (error) throw error
      logAuditClient({ action: 'antiban.update', resource: 'evolution_instances', details: { min_delay: antiBanConfig.min_delay, max_delay: antiBanConfig.max_delay } })
      toast.success("ConfiguraÃ§Ãµes antibloqueio salvas!")
    } catch (error) { toast.error("Erro ao salvar configuraÃ§Ãµes.") } finally { setIsSavingAntiBan(false) }
  }

  const handleSaveCallSettings = async (nextReject?: boolean) => {
    setIsSavingCallSettings(true)
    try {
      const res = await fetch('/api/evolution/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reject_calls: nextReject ?? rejectCalls, reject_calls_message: rejectCallsMessage })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success("Bloqueio de chamadas atualizado!")
    } catch (e: any) { toast.error(e.message || "Erro ao salvar") } finally { setIsSavingCallSettings(false) }
  }

  /* â€”â€”â€”â€”â€” rÃ©gua + templates (automations) â€”â€”â€”â€”â€” */
  const loadAutomations = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: rules } = await supabase.from('automations').select('*').eq('user_id', user.id)
    if (rules) {
      setAutomations(rules)
      const { data: clients } = await supabase.from('clients').select('status, due_date').eq('user_id', user.id).in('status', ['active', 'vencido'])
      if (clients) {
        const estimates: Record<string, number | string> = {}
        const tzOffsetStr = user.user_metadata?.timezone || "-03:00"
        const nowUtc = new Date()
        const sign = tzOffsetStr.startsWith('-') ? -1 : 1
        const [hh, mm] = tzOffsetStr.replace(/[+-]/, '').split(':').map(Number)
        const offsetMs = sign * ((hh * 3600) + (mm * 60)) * 1000
        const localNow = new Date(nowUtc.getTime() + offsetMs)
        const todayStrLocal = localNow.toISOString().split('T')[0]
        const today = new Date(`${todayStrLocal}T12:00:00Z`)
        rules.forEach(rule => {
          if (!isStepType(rule.alert_type)) { estimates[rule.id] = 'Manual'; return }
          if (!rule.is_active) { estimates[rule.id] = 0; return }
          let count = 0
          clients.forEach(c => {
            if (!c.due_date) return
            const due = new Date(`${c.due_date}T12:00:00Z`)
            const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000)
            if (rule.alert_type === 'before_due' && diffDays === Math.abs(rule.days_offset)) count++
            if (rule.alert_type === 'on_due' && diffDays === 0) count++
            if (rule.alert_type === 'after_due' && diffDays === -Math.abs(rule.days_offset)) count++
          })
          estimates[rule.id] = count
        })
        setRuleEstimates(estimates)
      }
    }
  }

  const openStep = (rule: any | null) => {
    setDlgKind('step')
    setEditingRule(rule)
    if (rule) setRuleForm({ alert_type: rule.alert_type, days: Math.max(1, Math.abs(rule.days_offset || 1)), send_time: (rule.send_time || '09:00').slice(0, 5), message_template: rule.message_template, is_active: rule.is_active })
    else setRuleForm({ alert_type: 'before_due', days: 3, send_time: '09:00', message_template: getDefaultTemplate('before_due'), is_active: true })
    setIsRuleDialogOpen(true)
  }

  const openAuto = (rule: any | null) => {
    setDlgKind('auto')
    setEditingRule(rule)
    if (rule) setRuleForm({ alert_type: rule.alert_type, days: 1, send_time: (rule.send_time || '09:00').slice(0, 5), message_template: rule.message_template, is_active: rule.is_active })
    else setRuleForm({ alert_type: 'quick_message', days: 1, send_time: '09:00', message_template: getDefaultTemplate('quick_message'), is_active: true })
    setIsRuleDialogOpen(true)
  }

  const handleRuleSubmit = async () => {
    if (isStarter && dlgKind === 'step') return toast.error('A rÃ©gua financeira estÃ¡ disponÃ­vel nos planos Pro e Master.')
    if (isStarter && !(ruleForm.alert_type in STARTER_SYSTEM_TYPES)) return toast.error('Tipo de mensagem disponÃ­vel somente nos planos Pro e Master.')
    if (isStarter && autoRules.some(rule => rule.alert_type === ruleForm.alert_type && rule.id !== editingRule?.id)) {
      return toast.error('JÃ¡ existe uma mensagem deste tipo. Edite a configuraÃ§Ã£o existente.')
    }
    setIsSubmittingRule(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      // Sinal do offset: antes = negativo, depois = positivo, demais = 0
      const days_offset = ruleForm.alert_type === 'before_due' ? -Math.abs(ruleForm.days)
        : ruleForm.alert_type === 'after_due' ? Math.abs(ruleForm.days) : 0
      const payload = {
        user_id: user.id,
        alert_type: ruleForm.alert_type,
        days_offset,
        send_time: ruleForm.send_time,
        message_template: ruleForm.message_template,
        is_active: ruleForm.is_active
      }
      if (editingRule) {
        const { error } = await supabase.from('automations').update(payload).eq('id', editingRule.id)
        if (error) throw error
        logAuditClient({ action: 'automation.update', resource: 'automations', resource_id: editingRule.id, details: { alert_type: ruleForm.alert_type } })
        toast.success(dlgKind === 'step' ? "Etapa atualizada." : "Mensagem automÃ¡tica atualizada.")
      } else {
        const { error } = await supabase.from('automations').insert(payload)
        if (error) throw error
        logAuditClient({ action: 'automation.create', resource: 'automations', details: { alert_type: ruleForm.alert_type } })
        toast.success(dlgKind === 'step' ? "Etapa adicionada Ã  rÃ©gua." : "Mensagem automÃ¡tica criada.")
      }
      setIsRuleDialogOpen(false)
      loadAutomations()
    } catch (e) { toast.error("Erro ao salvar.") } finally { setIsSubmittingRule(false) }
  }

  const deleteRule = async (id: string) => {
    await supabase.from('automations').delete().eq('id', id)
    logAuditClient({ action: 'automation.delete', resource: 'automations', resource_id: id })
    toast.success("Item removido.")
    setIsRuleDialogOpen(false)
    loadAutomations()
  }

  const toggleRuleActive = async (rule: any) => {
    await supabase.from('automations').update({ is_active: !rule.is_active }).eq('id', rule.id)
    loadAutomations()
  }

  // RÃ©gua master: liga/desliga todas as etapas de uma vez
  const stepRules = automations.filter(r => isStepType(r.alert_type)).sort((a, b) => {
    const off = (r: any) => r.alert_type === 'before_due' ? -Math.abs(r.days_offset) : r.alert_type === 'after_due' ? Math.abs(r.days_offset) : 0
    return off(a) - off(b)
  })
  const autoRules = automations.filter(r => !isStepType(r.alert_type))
  const visibleAutoRules = isStarter ? autoRules.filter(rule => rule.alert_type in STARTER_SYSTEM_TYPES) : autoRules
  const reguaActive = stepRules.length > 0 && stepRules.every(r => r.is_active)

  const toggleRegua = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const next = !reguaActive
    await supabase.from('automations').update({ is_active: next })
      .eq('user_id', user.id).in('alert_type', ['before_due', 'on_due', 'after_due'])
    toast.success(next ? "RÃ©gua ativada." : "RÃ©gua pausada.")
    loadAutomations()
  }

  const dayLabel = (r: any) => {
    if (r.alert_type === 'before_due') return `D-${Math.abs(r.days_offset || 1)}`
    if (r.alert_type === 'after_due') return `D+${Math.abs(r.days_offset || 1)}`
    return 'D-0'
  }

  /* â€”â€”â€”â€”â€” logs â€”â€”â€”â€”â€” */
  const loadLogs = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLogsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('alert_history')
        .select(`*, client:clients(name), automation:automations(alert_type)`)
        .eq('user_id', user.id)
        .order('scheduled_at', { ascending: false })
      if (data) setLogs(data)
    } catch (e) { console.error(e) } finally { if (showLoading) setIsLogsLoading(false) }
  }, [supabase])

  useEffect(() => {
    if (activeTab !== 'logs') return
    const intervalId = window.setInterval(() => { void loadLogs(false) }, 5000)
    return () => window.clearInterval(intervalId)
  }, [activeTab, loadLogs])

  const handleResendLog = async (id: string) => {
    setRetryingLogIds((current) => new Set(current).add(id))
    try {
      const response = await fetch('/api/evolution/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertHistoryId: id, force: true }),
      })
      const data = await response.json().catch(() => ({}))
      if (response.status === 409 && data.status === 'already_queued') {
        toast.info(data.message || 'Esta mensagem já está na fila.')
      } else if (!response.ok) {
        throw new Error(data.message || data.error || 'Não foi possível reenviar a mensagem.')
      } else {
        logAuditClient({ action: 'alert.retry', resource: 'alert_history', resource_id: id })
        toast.success(data.message || 'Mensagem colocada novamente na fila.')
      }
      loadLogs(false)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível reenviar a mensagem.')
    } finally {
      setRetryingLogIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }
  const handleCancelLog = async (id: string) => {
    await supabase.from('alert_history').update({ status: 'failed', error_message: 'Cancelado pelo usuÃ¡rio' }).eq('id', id)
    logAuditClient({ action: 'alert.cancel', resource: 'alert_history', resource_id: id })
    toast.success("Cancelado.")
    loadLogs()
  }
  const handleDeleteLog = async (id: string) => {
    await supabase.from('alert_history').delete().eq('id', id)
    logAuditClient({ action: 'alert.delete', resource: 'alert_history', resource_id: id })
    toast.success("Registro removido.")
    loadLogs()
  }

  const handleBulkAction = async (action: 'resend_failed' | 'cancel_pending' | 'clear_all') => {
    setIsBulkActioning(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      if (action === 'resend_failed') {
        const failedIds = logs
          .filter((log) => getLogDisplayStatus(log) === 'failed')
          .map((log) => log.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
        if (failedIds.length === 0) {
          toast.info("Nenhuma falha disponível para reenvio.")
          return
        }
        const summary = { queued: 0, alreadyQueued: 0, alreadySent: 0, skipped: 0, errors: 0 }
        for (let index = 0; index < failedIds.length; index += 200) {
          const response = await fetch('/api/evolution/retry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alertHistoryIds: failedIds.slice(index, index + 200), force: true }),
          })
          const data = await response.json().catch(() => ({}))
          if (!response.ok && !data.summary) throw new Error(data.message || data.error || 'Não foi possível reenviar as falhas.')
          for (const key of Object.keys(summary) as (keyof typeof summary)[]) summary[key] += Number(data.summary?.[key] || 0)
        }
        logAuditClient({ action: 'alert.batch_retry', resource: 'alert_history' })
        toast.success(`${summary.queued} falha(s) colocada(s) novamente na fila.`)
      } else if (action === 'cancel_pending') {
        const { error } = await supabase.from('alert_history')
          .update({ status: 'failed', error_message: 'Cancelado em lote' })
          .eq('status', 'pending').eq('user_id', user.id)
        if (error) throw error
        logAuditClient({ action: 'alert.batch_cancel', resource: 'alert_history' })
        toast.success("Pendentes cancelados.")
      } else {
        const { error } = await supabase.from('alert_history').delete().eq('user_id', user.id)
        if (error) throw error
        logAuditClient({ action: 'alert.clear_all', resource: 'alert_history' })
        toast.success("HistÃ³rico limpo.")
      }
      loadLogs()
    } catch (e: any) { toast.error("Erro na aÃ§Ã£o em lote: " + e.message) } finally { setIsBulkActioning(false) }
  }

  const handleTestConnection = async () => {
    if (!testPhone) return toast.error("Digite um telefone para teste")
    setIsTestingPhone(true)
    try {
      const res = await fetch('/api/evolution/test-connection', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao testar conexÃ£o')
      toast.success("Mensagem de teste enviada!")
      setIsTestDialogOpen(false)
    } catch (e: any) { toast.error(e.message) } finally { setIsTestingPhone(false) }
  }

  /* â€”â€”â€”â€”â€” disparo em massa â€”â€”â€”â€”â€” */
  const handleSendMass = async () => {
    const previewRes = await fetch('/api/evolution/send-mass', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'preview', audience: massAudience, serviceId: massServiceId,
        messageTemplate: massMessage, scheduledAt: scheduledAt ? scheduledAt.toISOString() : null
      })
    })
    const previewData = await previewRes.json()
    if (!previewRes.ok) return toast.error(previewData.error || 'NÃ£o foi possÃ­vel calcular a prÃ©via.')
    const preview = previewData.preview
    if (!await confirm({
      title: "Disparo em massa",
      description: `${preview.eligible} elegÃ­veis, ${preview.deferred} serÃ£o adiados por contato prioritÃ¡rio e ${preview.blocked} estÃ£o bloqueados pelo limite do plano. Deseja confirmar?`,
    })) return
    setIsSendingMass(true)
    try {
      let mediaUrl = null
      if (massImage) {
        const fileExt = massImage.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`
        const { error: uploadErr } = await supabase.storage
          .from('mass_media')
          .upload(`banners/${fileName}`, massImage, { cacheControl: '3600', upsert: false })
        if (uploadErr) throw new Error("Erro ao fazer upload da imagem: " + uploadErr.message)
        const { data: { publicUrl } } = supabase.storage.from('mass_media').getPublicUrl(`banners/${fileName}`)
        mediaUrl = publicUrl
      }
      const res = await fetch('/api/evolution/send-mass', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          audience: massAudience, serviceId: massServiceId, messageTemplate: massMessage,
          mediaUrl, delaySeconds: 5, scheduledAt: scheduledAt ? scheduledAt.toISOString() : null
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(data.message)
      setActiveTab('logs')
      loadLogs()
    } catch (e: any) { toast.error(e.message) } finally { setIsSendingMass(false) }
  }

  /* â€”â€”â€”â€”â€” derivados â€”â€”â€”â€”â€” */
  const onlineCount = instances.filter(i => i.status === 'connected').length
  const anyOnline = onlineCount > 0
  const pendingCount = logs.filter(l => getLogDisplayStatus(l) === 'pending').length
  const failedCount = logs.filter(l => getLogDisplayStatus(l) === 'failed').length
  const sentCount = logs.filter(l => getLogDisplayStatus(l) === 'sent').length
  const activeAutomationCount = automations.filter(rule => rule.is_active).length
  const filteredLogs = logs.filter(l => logFilter === 'all' || getLogDisplayStatus(l) === logFilter)

  const bulk = logFilter === 'failed'
    ? { label: 'Reenviar todos', action: 'resend_failed' as const, cls: 'border-money/40 bg-success-bg text-success-fg' }
    : logFilter === 'pending'
      ? { label: 'Cancelar todos', action: 'cancel_pending' as const, cls: 'border-warning-border bg-warning-bg text-warning-fg' }
      : { label: 'Limpar histÃ³rico', action: 'clear_all' as const, cls: 'border-danger-border bg-danger-bg text-danger-fg' }

  const insertVar = (v: string, target: 'form' | 'mass') => {
    if (target === 'form') setRuleForm(f => ({ ...f, message_template: f.message_template + (f.message_template.endsWith(' ') || !f.message_template ? '' : ' ') + v }))
    else setMassMessage(m => m + (m.endsWith(' ') || !m ? '' : ' ') + v)
  }

  if (isAdmin === null) {
    return (
      <PageShell>
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-10 w-96" />
        <div className="flex gap-4"><Skeleton className="h-24 flex-1" /><Skeleton className="h-24 flex-1" /></div>
        <div className="flex gap-4"><Skeleton className="h-72 flex-[1.4]" /><Skeleton className="h-72 flex-1" /></div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      {/* HEADER */}
      <PageHeader
        title="Automação"
        description="Acompanhe a operação, mantenha seus canais saudáveis e aja rapidamente sobre filas e falhas."
        eyebrow={
          <span className={cn("flex items-center gap-1.5 font-medium", anyOnline ? "text-money" : "text-danger")}>
            <Activity className="size-3.5" aria-hidden="true" />
            Central de automação
          </span>
        }
        badge={anyOnline ? `${onlineCount} online` : "Operação pausada"}
        actions={
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="outline" size="sm" onClick={() => setIsTestDialogOpen(true)} className="min-h-10 flex-1 sm:flex-none">
              <Send className="size-4" aria-hidden="true" /> Testar envio
            </Button>
            <Button size="sm" onClick={() => setIsConnectDialogOpen(true)} className="min-h-10 flex-1 sm:flex-none">
              <Wifi className="size-4" aria-hidden="true" /> Conectar número
            </Button>
          </div>
        }
      />

      <AutomationNavigation active="central" />

      {isStarter && (
        <div className="mb-4 rounded-lg border border-accent bg-interactive-bg px-3.5 py-3 text-[11.5px] text-interactive-fg">
          <b>Automação Básica:</b> disparos, promoções, templates e agendamentos para até {plan.limits.clients ?? 100} clientes. Régua financeira avançada, segmentação e métricas de conversão exigem Pro ou Master.
        </div>
      )}

      {collectionCoordination?.enabled && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-money/25 bg-success-bg px-4 py-3 text-success-fg">
          <Shield className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">Cobrança inteligente coordenando esta régua</p>
            <p className="mt-0.5 text-xs leading-relaxed opacity-90">Avisos antes e no vencimento são gerenciados pelos perfis inteligentes. Etapas após o vencimento continuam como recuperação complementar e só enviam quando não houver uma etapa inteligente no mesmo dia. {collectionCoordination.eligibility.withoutPositiveValue} cliente(s) com plano de R$ 0,00 permanecem fora das cobranças.</p>
          </div>
        </div>
      )}

      <MetricGrid columns={4}>
        <div className={cn("rounded-xl border bg-card p-4", anyOnline ? "border-money/30" : "border-danger-border")}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="microlabel">Conexões online</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{onlineCount}<span className="text-base font-medium text-muted-foreground">/{instances.length}</span></p>
              <p className="mt-1 text-xs text-muted-foreground">{anyOnline ? "Canal disponível para envios" : "Conecte um número para operar"}</p>
            </div>
            <span className={cn("rounded-lg p-2", anyOnline ? "bg-success-bg text-success-fg" : "bg-danger-bg text-danger-fg")}>
              {anyOnline ? <Wifi className="size-4" aria-hidden="true" /> : <WifiOff className="size-4" aria-hidden="true" />}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="microlabel">Automações ativas</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{activeAutomationCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">de {automations.length} configurações</p>
            </div>
            <span className="rounded-lg bg-interactive-bg p-2 text-interactive-fg"><Activity className="size-4" aria-hidden="true" /></span>
          </div>
        </div>
        <button type="button" onClick={() => { setLogFilter('pending'); setActiveTab('logs') }} className="rounded-xl border border-warning-border bg-card p-4 text-left transition-colors hover:bg-warning-bg/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="microlabel">Na fila</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{pendingCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">Clique para acompanhar</p>
            </div>
            <span className="rounded-lg bg-warning-bg p-2 text-warning-fg"><Clock3 className="size-4" aria-hidden="true" /></span>
          </div>
        </button>
        <button type="button" onClick={() => { setLogFilter('failed'); setActiveTab('logs') }} className={cn("rounded-xl border bg-card p-4 text-left transition-colors hover:bg-danger-bg/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none", failedCount > 0 ? "border-danger-border" : "border-border")}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="microlabel">Falhas recentes</p>
              <p className={cn("mt-2 text-2xl font-semibold tracking-tight", failedCount > 0 && "text-danger-fg")}>{failedCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">{failedCount > 0 ? "Exige revisão" : `${sentCount} envios concluídos`}</p>
            </div>
            <span className={cn("rounded-lg p-2", failedCount > 0 ? "bg-danger-bg text-danger-fg" : "bg-success-bg text-success-fg")}>
              {failedCount > 0 ? <CircleX className="size-4" aria-hidden="true" /> : <CircleCheckBig className="size-4" aria-hidden="true" />}
            </span>
          </div>
        </button>
      </MetricGrid>

      {!anyOnline && (
        <div className="flex flex-col gap-3 rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-fg sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Os disparos estão pausados</p>
            <p className="mt-0.5 text-xs opacity-80">Nenhuma instância está online. Suas configurações continuam preservadas.</p>
          </div>
          <Button size="sm" onClick={() => setIsConnectDialogOpen(true)} className="shrink-0">Conectar agora</Button>
        </div>
      )}

      {/* TABS segmentadas */}
      <div className="max-w-full overflow-x-auto">
      <div role="tablist" aria-label="Áreas da Central de Automação" className="grid min-w-[500px] grid-cols-3 gap-1 rounded-xl border border-border bg-muted/50 p-1">
        {([
          { k: 'overview', l: 'Visão geral' },
          { k: 'mass', l: 'Disparo em massa' },
          { k: 'logs', l: 'Logs', badge: pendingCount > 0 ? String(pendingCount) : '' },
        ] as { k: typeof activeTab; l: string; badge?: string }[]).map(t => (
          <button
            key={t.k}
            onClick={() => setActiveTab(t.k)}
            role="tab"
            aria-selected={activeTab === t.k}
            className={cn(
              "flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-[background-color,color,box-shadow] motion-reduce:transition-none",
              activeTab === t.k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
            )}
          >
            {t.l}
            {t.badge && <span className="num rounded bg-warning-bg px-1 text-[9px] font-semibold text-warning-fg">{t.badge}</span>}
          </button>
        ))}
      </div>
      </div>

      {/* ============ VISÃƒO GERAL ============ */}
      {activeTab === 'overview' && (
        <div role="tabpanel" className="space-y-5">
          {/* Cards de instÃ¢ncia */}
          <div className="flex flex-wrap gap-3.5">
            {instances.map((inst, idx) => {
              const online = inst.status === 'connected'
              const qr = !online && !!inst.qr_code
              return (
                <div key={inst.id} className={cn(
                  "min-w-[280px] flex-1 rounded-lg border bg-card p-3.5",
                  online ? "border-money/30" : qr ? "border-warning-border" : "border-border"
                )}>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "num flex size-[34px] shrink-0 items-center justify-center rounded-lg text-[13px] font-bold",
                      online ? "bg-success-bg text-success-fg" : qr ? "bg-warning-bg text-warning-fg" : "bg-secondary text-muted-foreground"
                    )}>
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-semibold">{inst.instance_name}</span>
                        {inst.is_primary && <Star className="size-3 shrink-0 fill-warning text-warning" />}
                      </div>
                      <div className="num truncate text-[10.5px] text-muted-foreground">
                        {inst.phone_number ? phoneMask(inst.phone_number) : qr ? 'aguardando conexão · escaneie o QR' : '—'}
                      </div>
                    </div>
                    <span className={cn("flex items-center gap-1.5 text-[10.5px] font-semibold", online ? "text-money" : qr ? "text-warning-fg" : "text-muted-foreground")}>
                      <span className={cn("status-dot", online ? "bg-money" : qr ? "bg-warning" : "bg-input")} />
                      {online ? 'Online' : qr ? 'Conectando' : 'Offline'}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger aria-label={`Abrir ações de ${inst.instance_name}`} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {online && !inst.is_primary && (
                          <DropdownMenuItem onClick={() => handleSetPrimary(inst.instance_name)}>Tornar principal</DropdownMenuItem>
                        )}
                        {online && (
                          <DropdownMenuItem onClick={() => handleDisconnect(inst.instance_name)}>Desconectar</DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => handleDeleteInstance(inst.id, inst.instance_name)}>
                          Excluir chip
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* QR fica no card â€” nÃ£o Ã© modal (GUIA 1.4) */}
                  {qr && (
                    <div className="mt-3 flex flex-col items-center gap-2 border-t border-border pt-3">
                      <div className="rounded-lg border border-border bg-white p-2.5">
                        {inst.qr_code.includes('data:image') || inst.qr_code.length > 500 ? (
                          <img
                            src={inst.qr_code.startsWith('data:image') ? inst.qr_code : `data:image/png;base64,${inst.qr_code}`}
                            alt="QR Code"
                            className="size-[150px]"
                          />
                        ) : (
                          <QRCodeSVG value={inst.qr_code} size={150} />
                        )}
                      </div>
                      <p className="flex items-center gap-1.5 text-[10.5px] text-warning-fg">
                        <Loader2 className="size-3 animate-spin" /> Aguardando leitura…
                      </p>
                    </div>
                  )}
                </div>
              )
            })}

            <button
              onClick={() => setIsConnectDialogOpen(true)}
              className="flex min-w-[150px] flex-none items-center justify-center gap-1.5 rounded-lg border border-dashed border-input bg-muted p-3.5 text-[11.5px] font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <span className="text-sm leading-none">+</span> Novo chip
            </button>
          </div>

          {/* RÃ©gua + Templates */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            {/* RÃ‰GUA */}
            {!isStarter && <div className="min-w-0 flex-[1.4] rounded-lg border border-border bg-card p-4">
              <div className="mb-0.5 flex items-center">
                <span className="text-[13px] font-semibold">Régua de cobrança</span>
                <span className={cn("ml-auto flex cursor-pointer items-center gap-1.5 text-[10.5px] font-semibold", reguaActive ? "text-money" : "text-muted-foreground")} onClick={toggleRegua}>
                  <MiniToggle on={reguaActive} onClick={() => {}} />
                  {reguaActive ? 'Ativa' : 'Pausada'}
                </span>
              </div>
              <p className="mb-4 text-[10.5px] text-muted-foreground">mensagens automáticas em volta do vencimento</p>

              {stepRules.length === 0 ? (
                <p className="py-5 text-center text-[11px] text-muted-foreground">Nenhuma etapa na régua. Adicione a primeira abaixo.</p>
              ) : (
                <div className="flex flex-col">
                  {stepRules.map((r, idx) => {
                    const dot = TYPE_DOT[r.alert_type]
                    const active = r.is_active
                    const impact = ruleEstimates[r.id]
                    const managedByIntelligent = Boolean(collectionCoordination?.enabled && r.alert_type !== 'after_due')
                    const complementaryRecovery = Boolean(collectionCoordination?.enabled && r.alert_type === 'after_due')
                    return (
                      <div key={r.id} onClick={() => openStep(r)} className="flex cursor-pointer gap-2.5">
                        <div className="flex flex-col items-center">
                          <span className="mt-[3px] size-[9px] flex-none rounded-full" style={{ background: dot }} />
                          {idx < stepRules.length - 1 && <span className="w-px flex-1 bg-border" />}
                        </div>
                        <div className={cn("min-w-0 flex-1", idx < stepRules.length - 1 && "pb-3.5", !active && "opacity-55")}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="num text-[10px] font-semibold" style={{ color: dot }}>{dayLabel(r)}</span>
                            <span className="text-[11.5px] font-semibold">{STEP_TYPES[r.alert_type]}</span>
                            {!active && <span className="microlabel rounded bg-secondary px-1 !text-[8.5px]">pausada</span>}
                            {managedByIntelligent && <span className="rounded bg-interactive-bg px-1.5 py-0.5 text-[9px] font-semibold text-interactive-fg">Gerenciada pela inteligente</span>}
                            {complementaryRecovery && <span className="rounded bg-success-bg px-1.5 py-0.5 text-[9px] font-semibold text-success-fg">Recuperação complementar</span>}
                            {typeof impact === 'number' && impact > 0 && !managedByIntelligent && (
                              <span className="num rounded bg-interactive-bg px-1 text-[9px] font-semibold text-interactive-fg">{impact} hoje</span>
                            )}
                            <span className="num ml-auto text-[10px] text-muted-foreground">{(r.send_time || '').slice(0, 5)}</span>
                          </div>
                          <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">{r.message_template}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="mt-3 border-t border-border pt-2.5">
                <button onClick={() => openStep(null)} className="text-[11px] font-medium text-interactive hover:underline">
                  + Adicionar etapa
                </button>
              </div>
            </div>}

            {/* TEMPLATES (livres: nome + etiqueta + mensagem) */}
            <div className="min-w-0 flex-1 space-y-4">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3 flex items-center">
                  <span className="text-[13px] font-semibold">Templates</span>
                  <button onClick={() => openTemplateDialog(null)} className="ml-auto text-[11px] font-medium text-interactive hover:underline">+ Novo</button>
                </div>
                {templates.length === 0 ? (
                  <p className="py-5 text-center text-[11px] text-muted-foreground">Nenhum template. Crie mensagens reutilizáveis para a régua e o disparo em massa.</p>
                ) : (
                  templates.map(t => (
                    <div key={t.id} onClick={() => openTemplateDialog(t)} className="mb-2 cursor-pointer rounded-[7px] border border-border p-2.5 transition-colors hover:bg-muted">
                      <div className="mb-1 flex items-center gap-1.5">
                        <span className="text-[11.5px] font-semibold">{t.title}</span>
                        <span className={cn("num rounded px-1.5 text-[9px] font-medium", BADGE_CLS[t.badge] || BADGE_CLS.PIX)}>{t.badge}</span>
                        {!t.is_active && <span className="microlabel rounded bg-danger-bg px-1 !text-[8.5px] !text-danger-fg">off</span>}
                        <button
                          onClick={(e) => { e.stopPropagation(); setActiveTab('mass'); setMassMessage(t.message); toast.success('Template carregado no disparo.') }}
                          className="ml-auto rounded-[5px] border border-input bg-card px-2 py-0.5 text-[10px] font-medium text-secondary-foreground hover:bg-muted"
                        >
                          Usar
                        </button>
                      </div>
                      <p className="truncate text-[10.5px] leading-normal text-muted-foreground">{t.message}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Mensagens automÃ¡ticas do robÃ´ (boas-vindas, renovaÃ§Ã£oâ€¦) */}
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-1 flex items-center">
                  <span className="text-[13px] font-semibold">Robô do sistema</span>
                  <button onClick={() => openAuto(null)} className="ml-auto text-[11px] font-medium text-interactive hover:underline">+ Nova</button>
                </div>
                <p className="mb-3 text-[10.5px] text-muted-foreground">{isStarter ? 'controle básico de boas-vindas, renovação e mensagem rápida' : 'disparadas por eventos: boas-vindas, renovação, promoção…'}</p>
                {visibleAutoRules.length === 0 ? (
                  <p className="py-3 text-center text-[11px] text-muted-foreground">Nenhuma mensagem automática.</p>
                ) : (
                  visibleAutoRules.map(r => (
                    <div key={r.id} onClick={() => openAuto(r)} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted">
                      <span className="size-[7px] shrink-0 rounded-full" style={{ background: TYPE_DOT[r.alert_type] }} />
                      <span className={cn("flex-1 truncate text-[11.5px] font-medium", !r.is_active && "text-muted-foreground line-through")}>
                        {TEMPLATE_TYPES[r.alert_type] || r.alert_type}
                      </span>
                      <MiniToggle on={r.is_active} onClick={(e) => { e.stopPropagation(); toggleRuleActive(r) }} />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Anti-ban + Chamadas */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
            <div className="flex-1 rounded-lg border border-border bg-card p-4">
              <div className="mb-0.5 flex items-center gap-2">
                <Shield className="size-3.5 text-warning" />
                <span className="text-[12.5px] font-semibold">Antibloqueio</span>
                <span className="num ml-auto text-[10px] font-semibold text-muted-foreground">{antiBanConfig.min_delay}–{antiBanConfig.max_delay}s</span>
              </div>
              <p className="mb-3 text-[10.5px] text-muted-foreground">intervalo aleatório entre cada mensagem</p>
              <div className="flex gap-2.5">
                <div className="flex-1">
                  <p className="mb-1 text-[10px] font-medium text-secondary-foreground">Mínimo (s)</p>
                  <NumStepper
                    value={antiBanConfig.min_delay}
                    onDown={() => setAntiBanConfig(c => ({ ...c, min_delay: Math.max(5, c.min_delay - 1) }))}
                    onUp={() => setAntiBanConfig(c => ({ ...c, min_delay: Math.min(c.min_delay + 1, c.max_delay) }))}
                  />
                </div>
                <div className="flex-1">
                  <p className="mb-1 text-[10px] font-medium text-secondary-foreground">Máximo (s)</p>
                  <NumStepper
                    value={antiBanConfig.max_delay}
                    onDown={() => setAntiBanConfig(c => ({ ...c, max_delay: Math.max(c.min_delay, c.max_delay - 1) }))}
                    onUp={() => setAntiBanConfig(c => ({ ...c, max_delay: c.max_delay + 1 }))}
                  />
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleSaveAntiBan} disabled={isSavingAntiBan} className="mt-3 h-7 w-full text-[11px]">
                {isSavingAntiBan && <Loader2 className="mr-1 size-3 animate-spin" />} Salvar anti-ban
              </Button>
            </div>

            <div className="flex-1 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2.5">
                <PhoneOff className="size-3.5 text-danger" />
                <div className="flex-1">
                  <p className="text-[12.5px] font-semibold">Bloquear chamadas</p>
                  <p className="mt-px text-[10.5px] text-muted-foreground">recusa ligações automaticamente</p>
                </div>
                <MiniToggle on={rejectCalls} disabled={isSavingCallSettings} onClick={() => { const next = !rejectCalls; setRejectCalls(next); handleSaveCallSettings(next) }} />
              </div>
              {rejectCalls && (
                <div className="mt-3 space-y-2">
                  <Textarea
                    value={rejectCallsMessage}
                    onChange={(e) => setRejectCallsMessage(e.target.value)}
                    placeholder="Mensagem automática ao recusar…"
                    className="min-h-[52px] resize-none text-[11px]"
                  />
                  <Button variant="outline" size="sm" onClick={() => handleSaveCallSettings()} disabled={isSavingCallSettings} className="h-7 w-full text-[11px]">
                    {isSavingCallSettings && <Loader2 className="mr-1 size-3 animate-spin" />} Salvar mensagem
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============ DISPARO EM MASSA ============ */}
      {activeTab === 'mass' && (
        <div role="tabpanel" className="max-w-[760px]">
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3.5">
              <p className="text-[14px] font-semibold tracking-[-0.01em]">Disparo em massa</p>
              <p className="mt-1 text-[11px] leading-normal text-muted-foreground">Envie para um grupo de clientes de uma vez, respeitando o intervalo anti-ban.</p>
            </div>
            <div className="p-4">
              <p className="mb-1.5 text-[11px] font-medium text-secondary-foreground">Público-alvo</p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {[
                  { k: 'all', l: 'Todos os clientes' },
                  { k: 'active', l: 'Apenas ativos' },
                  { k: 'inactive', l: 'Apenas inativos' },
                  { k: 'expired', l: 'Vencimento atrasado' },
                  ...(!isStarter ? [{ k: 'service', l: 'Por serviço' }] : []),
                ].map(a => (
                  <button
                    key={a.k}
                    onClick={() => setMassAudience(a.k)}
                    className={cn(
                      "rounded-[7px] px-3 py-1.5 text-[11.5px] font-medium transition-colors",
                      massAudience === a.k ? "border-[1.5px] border-primary bg-primary text-primary-foreground" : "border border-input bg-card text-secondary-foreground hover:bg-muted"
                    )}
                  >
                    {a.l}
                  </button>
                ))}
              </div>
              {massAudience === 'service' && (
                <div className="mb-3">
                  <Select value={massServiceId} onValueChange={(v) => setMassServiceId(v ?? '')}>
                    <SelectTrigger className="h-9 w-full text-xs">
                      <SelectValue placeholder="Escolha o serviço">{services.find(s => s.id === massServiceId)?.name || 'Escolha o serviço'}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="mb-4 flex items-center gap-2 rounded-lg border border-accent bg-interactive-bg px-3 py-2 text-[11.5px] text-interactive-fg">
                <b>Público estimado:</b> {estimatedAudience ?? '…'} clientes.
              </div>

              {activeTemplates.length > 0 && (
                <>
                  <p className="mb-1.5 text-[11px] font-medium text-secondary-foreground">Usar um template</p>
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {activeTemplates.map(t => (
                      <button
                        key={t.id}
                        onClick={() => { setMassMessage(t.message); toast.success(`Template "${t.title}" aplicado.`) }}
                        className="rounded-md border border-input bg-card px-2.5 py-1.5 text-[11px] font-medium text-secondary-foreground transition-colors hover:bg-muted"
                      >
                        {t.title}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <p className="mb-1.5 text-[11px] font-medium text-secondary-foreground">Mensagem</p>
              <Textarea
                value={massMessage}
                onChange={(e) => setMassMessage(e.target.value)}
                placeholder="Escreva a mensagem…"
                className="min-h-[100px] text-xs leading-relaxed"
              />
              <div className="my-2 rounded-lg border border-border bg-muted px-3 py-2.5">
                <p className="mb-1.5 text-[10.5px] font-medium text-muted-foreground">Inserir variável:</p>
                <div className="flex flex-wrap gap-1.5">
                  {VARS.map(v => (
                    <button key={v} onClick={() => insertVar(v, 'mass')} className="num rounded-[5px] border border-accent bg-interactive-bg px-1.5 py-0.5 text-[10px] font-medium text-interactive-fg hover:brightness-95">
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Banner opcional (dropzone) */}
              <div className="mb-3">
                <p className="mb-1.5 text-[11px] font-medium text-secondary-foreground">Banner (opcional)</p>
                {massImage ? (
                  <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted px-3 py-2.5">
                    <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px] font-medium">{massImage.name}</p>
                      <p className="num text-[10px] text-muted-foreground">{(massImage.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <button onClick={() => setMassImage(null)} className="rounded p-1 text-muted-foreground hover:text-danger"><X className="size-3.5" /></button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-muted px-3 py-4 text-[11px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
                    <ImageIcon className="size-3.5" /> Anexar imagem (jpg/png)
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => setMassImage(e.target.files?.[0] || null)} />
                  </label>
                )}
              </div>

              <div className="rounded-lg border border-border bg-muted px-3.5 py-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11.5px] font-medium"><Clock3 className="size-3.5 text-interactive" aria-hidden="true" /> Agendar (opcional)</p>
                <Input
                  type="datetime-local"
                  onChange={(e) => setScheduledAt(e.target.value ? new Date(e.target.value) : null)}
                  className="num h-9 bg-card text-[11.5px]"
                />
              </div>
            </div>
            <div className="border-t border-border bg-muted px-4 py-3.5">
              <button
                onClick={handleSendMass}
                disabled={!anyOnline || isSendingMass}
                className={cn(
                  "w-full rounded-lg py-2.5 text-[12.5px] font-semibold text-white transition-[filter]",
                  anyOnline ? "bg-money hover:brightness-95" : "cursor-not-allowed bg-input text-muted-foreground"
                )}
              >
                {isSendingMass ? <Loader2 className="mx-auto size-4 animate-spin" /> : anyOnline ? 'Iniciar disparo em massa' : 'Conecte um número primeiro'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ LOGS ============ */}
      {activeTab === 'logs' && (
        <div role="tabpanel" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-4 py-3">
            <div className="min-w-[160px] flex-1">
              <p className="text-[13px] font-semibold">Histórico de disparos</p>
              <p className="mt-px text-[10.5px] text-muted-foreground">programados, enviados e falhas</p>
            </div>
            <div className="flex gap-0.5 rounded-[7px] bg-secondary p-0.5">
              {([
                { k: 'pending', l: 'Em andamento' }, { k: 'sent', l: 'Sucesso' }, { k: 'failed', l: 'Erro' }, { k: 'all', l: 'Todos' },
              ] as { k: typeof logFilter; l: string }[]).map(f => (
                <button
                  key={f.k}
                  onClick={() => setLogFilter(f.k)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                    logFilter === f.k ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,.07)]" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.l}
                </button>
              ))}
            </div>
            <button
              onClick={() => handleBulkAction(bulk.action)}
              disabled={isBulkActioning}
              className={cn("rounded-[7px] border px-3 py-1.5 text-[11px] font-medium transition-[filter] hover:brightness-95", bulk.cls)}
            >
              {bulk.label}
            </button>
          </div>

          {/* Nota anti-ban sÃ³ no filtro "Em andamento" (GUIA 1.8) */}
          {logFilter === 'pending' && filteredLogs.length > 0 && (
            <div className="border-b border-warning-border bg-warning-bg px-4 py-2 text-[10.5px] text-warning-fg">
              O horário agendado é o <b>início</b> — as mensagens saem gradualmente respeitando o delay anti-ban ({antiBanConfig.min_delay}–{antiBanConfig.max_delay}s).
            </div>
          )}

          {/* header da tabela */}
          <div className="microlabel hidden gap-2.5 border-b border-border bg-muted px-4 py-2 !text-[9px] md:flex">
            <span className="flex-[1.2]">CLIENTE</span>
            <span className="w-[100px]">ETAPA</span>
            <span className="w-[110px]">PROGRAMADO</span>
            <span className="w-[90px]">STATUS</span>
            <span className="w-[80px] text-right">AÇÕES</span>
          </div>

          {isLogsLoading ? (
            <div className="space-y-0 divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-3.5 flex-[1.2]" /><Skeleton className="h-3 w-[100px]" /><Skeleton className="h-3 w-[110px]" /><Skeleton className="h-5 w-[70px] rounded" />
                </div>
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="px-4 py-10 text-center"><p className="microlabel">Nenhum log neste filtro</p></div>
          ) : (
            filteredLogs.map((log) => {
              const displayStatus = getLogDisplayStatus(log)
              const st = ({
                pending: ['Na fila', 'bg-warning-bg text-warning-fg'],
                deferred: ['Adiado', 'bg-interactive-bg text-interactive-fg'],
                sent: ['Enviado', 'bg-success-bg text-success-fg'],
                failed: ['Falhou', 'bg-danger-bg text-danger-fg'],
              } as Record<LogDisplayStatus, [string, string]>)[displayStatus]
              const sched = log.scheduled_at
                ? `${new Date(log.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${new Date(log.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                : '—'
              return (
                <div key={log.id} className="grid grid-cols-2 gap-x-3 gap-y-3 border-b border-border px-4 py-3 last:border-0 md:flex md:items-center md:gap-2.5 md:py-2.5">
                  <div className="col-span-2 min-w-0 md:flex-[1.2]">
                    <p className="truncate text-xs font-medium">{log.client?.name || 'Cliente removido'}</p>
                    {log.error_message && <p className="mt-px truncate text-[10px] text-danger">{log.error_message}</p>}
                    {displayStatus === 'deferred' && <p className="mt-px truncate text-[10px] text-interactive-fg">Adiado por uma cobrança prioritária</p>}
                  </div>
                  <span className="min-w-0 text-[11px] text-secondary-foreground md:w-[100px] md:truncate">
                    <span className="microlabel mb-1 block md:hidden">Etapa</span>
                    {LOG_TYPE[log.automation?.alert_type] || '—'}
                  </span>
                  <span className="num text-[10.5px] text-muted-foreground md:w-[110px]"><span className="microlabel mb-1 block md:hidden">Programado</span>{sched}</span>
                  <span className="md:w-[90px]">
                    <span className="microlabel mb-1 block md:hidden">Status</span>
                    <span
                      className={cn("inline-flex rounded px-2 py-0.5 text-[10px] font-semibold", st[1])}
                      title={log.status === 'accepted' ? 'A Evolution API aceitou o envio; a confirmação de entrega pode chegar depois.' : undefined}
                    >
                      {st[0]}
                    </span>
                  </span>
                  <span className="flex items-end justify-end gap-1 md:w-[80px]">
                    <span className="sr-only">Ações</span>
                    {(displayStatus === 'failed' || displayStatus === 'pending') && (
                      <button
                        onClick={() => void handleResendLog(log.id)}
                        disabled={retryingLogIds.has(log.id)}
                        title={displayStatus === 'pending' ? 'Forçar reenvio' : 'Reenviar mensagem'}
                        aria-label={`${displayStatus === 'pending' ? 'Forçar reenvio' : 'Reenviar mensagem'} de ${log.client?.name || 'cliente removido'}`}
                        className="inline-flex size-[30px] items-center justify-center rounded-md border border-input bg-card text-money hover:bg-muted disabled:cursor-wait disabled:opacity-60"
                      >
                        {retryingLogIds.has(log.id) ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <RotateCcw className="size-3.5" aria-hidden="true" />}
                      </button>
                    )}
                    {displayStatus === 'pending' && (
                      <button onClick={() => handleCancelLog(log.id)} title="Cancelar" aria-label={`Cancelar mensagem de ${log.client?.name || 'cliente removido'}`} className="inline-flex size-[30px] items-center justify-center rounded-md border border-input bg-card text-warning hover:bg-muted"><X className="size-3.5" aria-hidden="true" /></button>
                    )}
                    <button onClick={() => handleDeleteLog(log.id)} title="Excluir" aria-label={`Excluir registro de ${log.client?.name || 'cliente removido'}`} className="inline-flex size-[30px] items-center justify-center rounded-md border border-input bg-card text-danger-fg hover:bg-muted"><Trash2 className="size-3.5" aria-hidden="true" /></button>
                  </span>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ============ DIÃLOGO etapa/template ============ */}
      <Dialog open={isRuleDialogOpen} onOpenChange={setIsRuleDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[500px] max-w-[95vw] overflow-y-auto sm:max-w-none">
          <DialogHeader className="flex-row items-center gap-2.5 space-y-0">
            <span className={cn("flex size-[30px] items-center justify-center rounded-lg text-sm", dlgKind === 'step' ? "bg-warning-bg" : "bg-accent")}>
              {dlgKind === 'step' ? 'â±' : 'âš¡'}
            </span>
            <div>
              <DialogTitle className="text-[13.5px] font-semibold">
                {editingRule ? 'Editar ' : 'Nova '}{dlgKind === 'step' ? 'etapa da régua' : 'mensagem automática'}
              </DialogTitle>
              <DialogDescription className="mt-px text-[10.5px]">
                {dlgKind === 'step' ? 'quando e o que o robô envia' : 'disparada por evento do sistema'}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label className="text-[11px]">{dlgKind === 'step' ? 'Momento' : 'Tipo'}</Label>
              <Select value={ruleForm.alert_type} onValueChange={(v) => v && setRuleForm(f => ({ ...f, alert_type: v, message_template: editingRule ? f.message_template : getDefaultTemplate(v) }))}>
                <SelectTrigger className="h-9 w-full text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(dlgKind === 'step' ? STEP_TYPES : isStarter ? STARTER_SYSTEM_TYPES : TEMPLATE_TYPES).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {dlgKind === 'step' && (
              <div className="flex gap-3">
                {(ruleForm.alert_type === 'before_due' || ruleForm.alert_type === 'after_due') && (
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-[11px]">Dias de diferença</Label>
                    <NumStepper
                      value={ruleForm.days}
                      onDown={() => setRuleForm(f => ({ ...f, days: Math.max(1, f.days - 1) }))}
                      onUp={() => setRuleForm(f => ({ ...f, days: Math.min(30, f.days + 1) }))}
                    />
                  </div>
                )}
                <div className="flex-1 space-y-1.5">
                  <Label className="text-[11px]">Horário</Label>
                  <Input type="time" value={ruleForm.send_time} onChange={(e) => setRuleForm(f => ({ ...f, send_time: e.target.value }))} className="num h-9 text-xs" />
                </div>
              </div>
            )}

            {/* Usar um template criado (preenche a mensagem) */}
            {activeTemplates.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-[11px]">Usar um template</Label>
                <div className="flex flex-wrap gap-1.5">
                  {activeTemplates.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => { setRuleForm(f => ({ ...f, message_template: t.message })); toast.success(`Template "${t.title}" aplicado.`) }}
                      className="flex items-center gap-1.5 rounded-md border border-input bg-card px-2.5 py-1 text-[10.5px] font-medium text-secondary-foreground transition-colors hover:bg-muted"
                    >
                      {t.title}
                      <span className={cn("num rounded px-1 text-[8.5px]", BADGE_CLS[t.badge] || BADGE_CLS.PIX)}>{t.badge}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-[11px]">Mensagem</Label>
              <Textarea
                value={ruleForm.message_template}
                onChange={(e) => setRuleForm(f => ({ ...f, message_template: e.target.value }))}
                placeholder="Escreva o template…"
                className="min-h-[96px] text-xs leading-relaxed"
              />
            </div>
            <div className="rounded-lg border border-border bg-muted px-3 py-2.5">
              <p className="mb-1.5 text-[10.5px] font-medium text-muted-foreground">Inserir variável:</p>
              <div className="flex flex-wrap gap-1.5">
                {VARS.map(v => (
                  <button key={v} type="button" onClick={() => insertVar(v, 'form')} className="num rounded-[5px] border border-accent bg-interactive-bg px-1.5 py-0.5 text-[10px] font-medium text-interactive-fg hover:brightness-95">
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted px-3 py-2.5">
              <div className="flex-1">
                <p className="text-xs font-medium">Ativo</p>
                <p className="mt-px text-[10.5px] text-muted-foreground">se desativado, o robô ignora este item</p>
              </div>
              <MiniToggle on={ruleForm.is_active} onClick={() => setRuleForm(f => ({ ...f, is_active: !f.is_active }))} />
            </div>
          </div>

          <DialogFooter className="flex-row items-center justify-between sm:justify-between">
            {editingRule ? (
              <button onClick={() => deleteRule(editingRule.id)} className="text-[11.5px] font-medium text-danger-fg hover:underline">Excluir</button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsRuleDialogOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleRuleSubmit} disabled={isSubmittingRule}>
                {isSubmittingRule && <Loader2 className="mr-1.5 size-3.5 animate-spin" />} Salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ DIÃLOGO template (nome + etiqueta + mensagem) ============ */}
      <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[500px] max-w-[95vw] overflow-y-auto sm:max-w-none">
          <DialogHeader className="flex-row items-center gap-2.5 space-y-0">
            <span className="flex size-[30px] items-center justify-center rounded-lg bg-accent text-sm">âœ‰</span>
            <div>
              <DialogTitle className="text-[13.5px] font-semibold">
                {editingTemplate ? 'Editar template' : 'Novo template'}
              </DialogTitle>
              <DialogDescription className="mt-px text-[10.5px]">mensagem reutilizável na régua e no disparo em massa</DialogDescription>
            </div>
          </DialogHeader>

          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label className="text-[11px]">Nome</Label>
              <Input
                value={templateForm.title}
                onChange={(e) => setTemplateForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Cobrança padrão"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]">Etiqueta</Label>
              <Select value={templateForm.badge} onValueChange={(v) => v && setTemplateForm(f => ({ ...f, badge: v }))}>
                <SelectTrigger className="h-9 w-full text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BADGES.map(b => (
                    <SelectItem key={b} value={b}>
                      <span className={cn("num rounded px-1.5 py-0.5 text-[9px] font-medium", BADGE_CLS[b])}>{b}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]">Mensagem</Label>
              <Textarea
                value={templateForm.message}
                onChange={(e) => setTemplateForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Escreva o template…"
                className="min-h-[96px] text-xs leading-relaxed"
              />
            </div>
            <div className="rounded-lg border border-border bg-muted px-3 py-2.5">
              <p className="mb-1.5 text-[10.5px] font-medium text-muted-foreground">Inserir variável:</p>
              <div className="flex flex-wrap gap-1.5">
                {VARS.map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setTemplateForm(f => ({ ...f, message: f.message + (f.message.endsWith(' ') || !f.message ? '' : ' ') + v }))}
                    className="num rounded-[5px] border border-accent bg-interactive-bg px-1.5 py-0.5 text-[10px] font-medium text-interactive-fg hover:brightness-95"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted px-3 py-2.5">
              <div className="flex-1">
                <p className="text-xs font-medium">Ativo</p>
                <p className="mt-px text-[10.5px] text-muted-foreground">se desativado, não aparece nos seletores</p>
              </div>
              <MiniToggle on={templateForm.is_active} onClick={() => setTemplateForm(f => ({ ...f, is_active: !f.is_active }))} />
            </div>
          </div>

          <DialogFooter className="flex-row items-center justify-between sm:justify-between">
            {editingTemplate ? (
              <button onClick={() => deleteTemplate(editingTemplate.id)} className="text-[11.5px] font-medium text-danger-fg hover:underline">Excluir</button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsTemplateDialogOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleTemplateSubmit} disabled={isSubmittingTemplate}>
                {isSubmittingTemplate && <Loader2 className="mr-1.5 size-3.5 animate-spin" />} Salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ DIÃLOGO conectar nÃºmero ============ */}
      <Dialog open={isConnectDialogOpen} onOpenChange={handleConnectDialogChange}>
        <DialogContent className="w-[440px] max-w-[95vw] sm:max-w-none">
          <DialogHeader>
            <DialogTitle className="text-[13.5px] font-semibold">Conectar número</DialogTitle>
            <DialogDescription className="text-[10.5px]">
              {pairingCode
                ? 'Digite este código no WhatsApp para concluir a conexão.'
                : 'Escolha a infraestrutura e a forma de conectar seu WhatsApp.'}
            </DialogDescription>
          </DialogHeader>

          {pairingCode || pairingFallbackQr ? (
            <div className="space-y-4" aria-live="polite">
              {pairingCode ? (
                <>
                  <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
                    <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Código de pareamento
                    </p>
                    <p className="num mt-2 select-all text-2xl font-semibold tracking-[0.22em] text-foreground">
                      {pairingCode.match(/.{1,4}/g)?.join(' ') || pairingCode}
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={copyPairingCode} className="mt-3">
                      <Copy className="mr-1.5 size-3.5" /> Copiar código
                    </Button>
                  </div>
                  <ol className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
                    <li><strong className="text-foreground">1.</strong> Abra o WhatsApp no telefone informado.</li>
                    <li><strong className="text-foreground">2.</strong> Acesse Aparelhos conectados e toque em Conectar aparelho.</li>
                    <li><strong className="text-foreground">3.</strong> Escolha Conectar com número de telefone e digite o código.</li>
                  </ol>
                  <p className="text-[10.5px] text-muted-foreground">
                    O código é temporário. O status do chip será atualizado automaticamente após a conexão.
                  </p>
                </>
              ) : (
                <div className="space-y-3 rounded-lg border border-border bg-muted/50 p-5 text-center">
                  <QrCode className="mx-auto size-8 text-muted-foreground" />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    A Evolution não retornou o código de pareamento. Feche esta janela e use o QR Code alternativo exibido no card do chip.
                  </p>
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button type="button" variant="outline" onClick={() => handleConnectDialogChange(false)}>
                  Fechar
                </Button>
                {connectionMode === 'integrated' && (
                  <Button type="button" onClick={handleIntegratedConnect} disabled={isConnecting}>
                    {isConnecting && <Loader2 className="mr-2 size-4 animate-spin" />} Gerar outro código
                  </Button>
                )}
              </div>
              {connectionMode === 'external' && (
                <p className="text-center text-[10.5px] text-muted-foreground">
                  Para gerar outro código na API própria, feche e envie novamente os dados da instância.
                </p>
              )}
            </div>
          ) : (
            <>
          <div className="flex w-fit gap-0.5 rounded-md bg-secondary p-0.5" aria-label="Infraestrutura da conexão">
            {(['integrated', 'external'] as const).map(m => (
              <button
                type="button"
                key={m}
                aria-pressed={connectionMode === m}
                onClick={() => {
                  setConnectionMode(m)
                  setConnectionInstanceName(null)
                }}
                className={cn(
                  "rounded-[5px] px-3 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  connectionMode === m ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,.06)]" : "text-muted-foreground"
                )}
              >
                {m === 'integrated' ? 'API do sistema' : 'API própria'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2" aria-label="Método de conexão">
            {([
              { value: 'pairing' as const, label: 'Código', icon: Smartphone },
              { value: 'qr' as const, label: 'QR Code', icon: QrCode },
            ]).map(({ value, label, icon: Icon }) => (
              <button
                type="button"
                key={value}
                aria-pressed={connectionMethod === value}
                onClick={() => {
                  setConnectionMethod(value)
                  resetConnectionResult()
                }}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  connectionMethod === value
                    ? "border-foreground/25 bg-secondary text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>

          {connectionMethod === 'pairing' && (
            <div className="space-y-1.5">
              <Label htmlFor="pairing-phone" className="text-[11px]">Número do WhatsApp</Label>
              <Input
                id="pairing-phone"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+55 11 99999-9999"
                value={pairingPhone}
                onChange={(event) => setPairingPhone(event.target.value)}
                className="num h-9 text-xs"
              />
              <p className="text-[10.5px] text-muted-foreground">Use o DDI. Ex.: +55 11 99999-9999 ou +1 202 555 0123.</p>
            </div>
          )}

          {connectionMode === 'integrated' ? (
            <div className="space-y-3">
              <p className="rounded-md bg-muted px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                Geramos a instância automaticamente na nossa infraestrutura e acompanhamos o status até conectar.
              </p>
              <Button onClick={handleIntegratedConnect} disabled={isConnecting} className="w-full">
                {isConnecting && <Loader2 className="mr-2 size-4 animate-spin" />}
                {connectionMethod === 'pairing' ? 'Gerar código de pareamento' : 'Gerar QR Code'}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleConnSubmit(onExternalConnectSubmit)} className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[11px]">URL da sua Evolution API</Label>
                <Input placeholder="http://192.168.1.100:8080" className="h-9 text-xs" {...regConn("baseUrl")} />
                {connErrs.baseUrl && <p className="text-[10.5px] text-danger">{connErrs.baseUrl.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">API Key global</Label>
                <Input type="password" placeholder="sua chave" className="num h-9 text-xs" {...regConn("apiKey")} />
                {connErrs.apiKey && <p className="text-[10.5px] text-danger">{connErrs.apiKey.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Nome da instância</Label>
                <Input placeholder="ex: chip-disparos" className="h-9 text-xs" {...regConn("instanceName")} />
                {connErrs.instanceName && <p className="text-[10.5px] text-danger">{connErrs.instanceName.message}</p>}
              </div>
              <Button type="submit" disabled={isConnecting} className="w-full">
                {isConnecting && <Loader2 className="mr-2 size-4 animate-spin" />}
                {connectionMethod === 'pairing' ? 'Gerar código de pareamento' : 'Gerar QR Code'}
              </Button>
            </form>
          )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ============ DIÃLOGO testar disparo ============ */}
      <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
        <DialogContent className="w-[400px] max-w-[95vw] sm:max-w-none">
          <DialogHeader>
            <DialogTitle className="text-[13.5px] font-semibold">Testar disparo</DialogTitle>
            <DialogDescription className="text-[10.5px]">Envia uma mensagem de teste para conferir a conexão.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-[11px]">WhatsApp de destino</Label>
            <Input
              placeholder="(11) 99999-9999"
              value={testPhone}
              onChange={(e) => setTestPhone(phoneMask(e.target.value))}
              className="num h-9 text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsTestDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleTestConnection} disabled={isTestingPhone}>
              {isTestingPhone && <Loader2 className="mr-1.5 size-3.5 animate-spin" />} Enviar teste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}

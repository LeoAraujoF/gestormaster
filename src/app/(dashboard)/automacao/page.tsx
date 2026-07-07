"use client"
// Automação — direção 2a (design_handoff/Automacao.dc.html + GUIA-AUTOMACAO-E-MODAIS PARTE 1)

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useConfirm } from "@/components/providers/confirm-provider"
import { Loader2, Star, MoreHorizontal, Shield, PhoneOff, Image as ImageIcon, X } from "lucide-react"
import { toast } from "sonner"
import { QRCodeSVG } from "qrcode.react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { phoneMask, cn } from "@/lib/utils"
import { logAuditClient } from "@/lib/audit-client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"

const externalConnectionSchema = z.object({
  baseUrl: z.string().url("URL inválida (ex: http://192.168.1.100:8080)"),
  apiKey: z.string().min(5, "API Key é obrigatória"),
  instanceName: z.string().min(2, "Nome da instância obrigatório"),
})
type ExternalConnectionForm = z.infer<typeof externalConnectionSchema>

const getDefaultTemplate = (type: string) => {
  const base = "{Olá|Oi|Tudo bem} {{primeiro_nome}}?\\n"
  const pixStr = "\\n\\nCaso deseje pagar via pix, segue os dados abaixo:\\nChave pix: {{pix}}\\nTitular: {{titular_pix}}\\nBanco: {{banco_pix}}\\n\\nSe tiver alguma dúvida, entre em contato conosco!\\n\\nAtenciosamente,\\nEquipe {{empresa}}"
  const defaults: Record<string, string> = {
    before_due: base + "Seu plano vence amanhã, deseja renovar lo?" + pixStr,
    on_due: base + "Lembrando que o vencimento do seu plano é hoje! Deseja renovar?" + pixStr,
    after_due: base + "Identificamos que seu plano venceu e encontra-se pendente. Deseja reativá-lo?" + pixStr,
    renewal: "{Olá|Oi|Tudo ótimo} {{primeiro_nome}}!\\nMuito obrigado por renovar seu plano conosco. Sua confiança é essencial!\\n\\nSe tiver alguma dúvida, entre em contato conosco!\\n\\nAtenciosamente,\\nEquipe {{empresa}}\\n\\nNão esqueça de seguir nosso canal para não ficar de fora de promoções e novidades!\\nLink: {{link_canal}}",
    promotion: base + "Temos uma oferta imperdível para você! [Insira sua promoção aqui]\\n\\nAtenciosamente,\\nEquipe {{empresa}}",
    quick_message: base + "Passando para lembrar do seu plano no valor de R$ {{plan_value}}. \\n\\nAcesso Rápido ao Suporte: {{telefone_suporte}}\\n\\nAtenciosamente,\\nEquipe {{empresa}}",
    activation: "Olá {{primeiro_nome}}! Seja muito bem-vindo(a)! 🌟\\nSeu plano foi ativado com sucesso em nosso sistema!\\n\\nSalva esse número aqui, ele será o nosso canal oficial de suporte técnico e onde você receberá seus avisos de vencimento, ok? 🤝\\n\\n💰 Valor do Plano: R$ {{plan_value}}\\n📅 Seu Vencimento: {{due_date}}\\n\\n🎁 *PROMOÇÃO INDIQUE E GANHE*\\nSabia que você pode ganhar meses grátis? É muito simples: indicou um amigo e ele fechou com a gente, o seu próximo mês sai 100% DE GRAÇA! Sem sorteio, indicou, ganhou! 🚀\\n\\n📱 *NOSSO CANAL EXCLUSIVO*\\nNão fique de fora das novidades, manutenções programadas e promoções relâmpago! Entre agora no nosso canal oficial para clientes:\\n👉 {{link_canal}}\\n\\nQualquer dúvida, é só nos chamar por aqui. Aproveite!"
  }
  return defaults[type] || defaults.before_due
}

// Mapa de cores por tipo (GUIA 1.7)
const STEP_TYPES: Record<string, string> = { before_due: 'Antes do vencimento', on_due: 'No dia do vencimento', after_due: 'Após o vencimento' }
const TEMPLATE_TYPES: Record<string, string> = { renewal: 'Renovação', activation: 'Boas-vindas', quick_message: 'Mensagem rápida', promotion: 'Promoção' }
const LOG_TYPE: Record<string, string> = { before_due: 'Aviso prévio', on_due: 'No vencimento', after_due: 'Atraso', renewal: 'Renovação', activation: 'Boas-vindas', promotion: 'Promoção', quick_message: 'Msg rápida' }
const TYPE_DOT: Record<string, string> = { before_due: 'var(--interactive)', on_due: 'var(--warning)', after_due: 'var(--danger)', renewal: 'var(--money)', activation: 'var(--money)', quick_message: 'var(--money)', promotion: '#7a5af8' }
const VARS = ['{{primeiro_nome}}', '{{plan_value}}', '{{due_date}}', '{{pix}}', '{{titular_pix}}', '{{banco_pix}}', '{{empresa}}', '{{link_canal}}']

// Etiquetas dos templates (protótipo): cores por significado
const BADGES = ['PIX', 'LOGIN', 'CAMPANHA', 'PROMO', 'AVISO'] as const
const BADGE_CLS: Record<string, string> = {
  PIX: 'bg-secondary text-secondary-foreground',
  LOGIN: 'bg-secondary text-secondary-foreground',
  CAMPANHA: 'bg-accent text-accent-foreground',
  PROMO: 'bg-[#efe9ff] text-[#5b3fd4] dark:bg-[#2d2440] dark:text-[#b5a3f5]',
  AVISO: 'bg-danger-bg text-danger-fg',
}

const isStepType = (t: string) => ['before_due', 'on_due', 'after_due'].includes(t)

// Toggle 22×12 (design §7)
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

// Stepper −/valor/+ (GUIA 1.4)
function NumStepper({ value, onDown, onUp }: { value: number; onDown: () => void; onUp: () => void }) {
  return (
    <div className="flex items-center overflow-hidden rounded-[7px] border border-input">
      <button type="button" onClick={onDown} className="w-[30px] bg-muted py-[7px] text-sm text-secondary-foreground hover:bg-secondary">–</button>
      <span className="num flex-1 text-center text-[12px] font-semibold">{value}</span>
      <button type="button" onClick={onUp} className="w-[30px] bg-muted py-[7px] text-sm text-secondary-foreground hover:bg-secondary">+</button>
    </div>
  )
}

export default function AutomacaoPage() {
  const confirm = useConfirm()
  const [activeTab, setActiveTab] = useState<'overview' | 'mass' | 'logs'>('overview')
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'loading' | 'error'>('loading')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [connectionMode, setConnectionMode] = useState<'integrated' | 'external'>('external')
  const [instances, setInstances] = useState<any[]>([])
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false)

  const [automations, setAutomations] = useState<any[]>([])
  const [ruleEstimates, setRuleEstimates] = useState<Record<string, number | string>>({})
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
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [isTestingPhone, setIsTestingPhone] = useState(false)

  // Anti-ban + chamadas
  const [antiBanConfig, setAntiBanConfig] = useState({ min_delay: 10, max_delay: 25 })
  const [isSavingAntiBan, setIsSavingAntiBan] = useState(false)
  const [rejectCalls, setRejectCalls] = useState(false)
  const [rejectCallsMessage, setRejectCallsMessage] = useState("As chamadas de voz e vídeo estão desativadas para este número. Por favor, envie uma mensagem de texto.")
  const [isSavingCallSettings, setIsSavingCallSettings] = useState(false)

  // Disparo em massa
  const [massAudience, setMassAudience] = useState<string>('all')
  const [massServiceId, setMassServiceId] = useState<string>('')
  const [massImage, setMassImage] = useState<File | null>(null)
  const [massMessage, setMassMessage] = useState<string>('Olá {{primeiro_nome}}, temos uma oferta especial para você!')
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null)
  const [isSendingMass, setIsSendingMass] = useState(false)
  const [estimatedAudience, setEstimatedAudience] = useState<number | null>(null)
  const [services, setServices] = useState<any[]>([])

  const supabase = createClient()

  const { register: regConn, handleSubmit: handleConnSubmit, formState: { errors: connErrs }, setValue: setConnValue } = useForm<ExternalConnectionForm>({
    resolver: zodResolver(externalConnectionSchema),
    defaultValues: { baseUrl: "", apiKey: "", instanceName: "" }
  })

  /* ————— carga inicial ————— */
  useEffect(() => {
    checkAdminStatus()
    loadSettings()
    loadAutomations()
    loadTemplates()
    loadLogs()
    loadServices()
  }, [])

  /* ————— templates livres (message_templates) ————— */
  const loadTemplates = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('message_templates').select('*').eq('user_id', user.id).order('created_at', { ascending: true })
    if (data) setTemplates(data)
  }

  const openTemplateDialog = (tpl: any | null) => {
    setEditingTemplate(tpl)
    if (tpl) setTemplateForm({ title: tpl.title, badge: tpl.badge, message: tpl.message, is_active: tpl.is_active })
    else setTemplateForm({ title: '', badge: 'PIX', message: 'Olá {{primeiro_nome}}, ', is_active: true })
    setIsTemplateDialogOpen(true)
  }

  const handleTemplateSubmit = async () => {
    if (!templateForm.title.trim()) return toast.error("Dê um nome ao template.")
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

  /* ————— público estimado ————— */
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

  /* ————— conexão ————— */
  const handleIntegratedConnect = async () => {
    setIsConnecting(true)
    try {
      const res = await fetch('/api/evolution/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'integrated' })
      })
      const responseData = await res.json()
      if (!res.ok) throw new Error(responseData.error || 'Erro de conexão')
      toast.success("Instância gerada! Escaneie o QR Code no card do chip.")
      setIsConnectDialogOpen(false)
      loadSettings()
    } catch (error: any) { toast.error(error.message) } finally { setIsConnecting(false) }
  }

  const onExternalConnectSubmit = async (data: ExternalConnectionForm) => {
    setIsConnecting(true)
    try {
      const res = await fetch('/api/evolution/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'external', ...data })
      })
      const responseData = await res.json()
      if (!res.ok) throw new Error(responseData.error || 'Erro de conexão')
      toast.success("Instância conectada! Escaneie o QR Code no card do chip.")
      setIsConnectDialogOpen(false)
      loadSettings()
    } catch (error: any) { toast.error(error.message) } finally { setIsConnecting(false) }
  }

  const handleDisconnect = async (instanceName: string) => {
    if (!await confirm({ title: "Desconectar WhatsApp", description: "Os disparos serão interrompidos até você conectar novamente.", variant: "warning" })) return
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
      toast.success("Limpeza profunda concluída! Instância removida.")
      loadSettings()
    } catch (e: any) { toast.error(e.message || "Erro fatal ao remover instância") } finally { setIsConnecting(false) }
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
      } else toast.error(data.error || 'Erro ao definir instância primária.')
    } catch (error) { toast.error('Erro de conexão ao definir instância primária.') } finally { setIsConnecting(false) }
  }

  /* ————— anti-ban + chamadas ————— */
  const handleSaveAntiBan = async () => {
    setIsSavingAntiBan(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Não autenticado")
      const { error } = await supabase
        .from('evolution_instances')
        .update({ min_delay: antiBanConfig.min_delay, max_delay: antiBanConfig.max_delay })
        .eq('user_id', user.id)
      if (error) throw error
      logAuditClient({ action: 'antiban.update', resource: 'evolution_instances', details: { min_delay: antiBanConfig.min_delay, max_delay: antiBanConfig.max_delay } })
      toast.success("Configurações antibloqueio salvas!")
    } catch (error) { toast.error("Erro ao salvar configurações.") } finally { setIsSavingAntiBan(false) }
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

  /* ————— régua + templates (automations) ————— */
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
        toast.success(dlgKind === 'step' ? "Etapa atualizada." : "Mensagem automática atualizada.")
      } else {
        const { error } = await supabase.from('automations').insert(payload)
        if (error) throw error
        logAuditClient({ action: 'automation.create', resource: 'automations', details: { alert_type: ruleForm.alert_type } })
        toast.success(dlgKind === 'step' ? "Etapa adicionada à régua." : "Mensagem automática criada.")
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

  // Régua master: liga/desliga todas as etapas de uma vez
  const stepRules = automations.filter(r => isStepType(r.alert_type)).sort((a, b) => {
    const off = (r: any) => r.alert_type === 'before_due' ? -Math.abs(r.days_offset) : r.alert_type === 'after_due' ? Math.abs(r.days_offset) : 0
    return off(a) - off(b)
  })
  const autoRules = automations.filter(r => !isStepType(r.alert_type))
  const reguaActive = stepRules.length > 0 && stepRules.every(r => r.is_active)

  const toggleRegua = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const next = !reguaActive
    await supabase.from('automations').update({ is_active: next })
      .eq('user_id', user.id).in('alert_type', ['before_due', 'on_due', 'after_due'])
    toast.success(next ? "Régua ativada." : "Régua pausada.")
    loadAutomations()
  }

  const dayLabel = (r: any) => {
    if (r.alert_type === 'before_due') return `D-${Math.abs(r.days_offset || 1)}`
    if (r.alert_type === 'after_due') return `D+${Math.abs(r.days_offset || 1)}`
    return 'D-0'
  }

  /* ————— logs ————— */
  const loadLogs = async () => {
    setIsLogsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('alert_history')
        .select(`*, client:clients(name), automation:automations(alert_type)`)
        .eq('user_id', user.id)
        .order('scheduled_at', { ascending: false })
      if (data) setLogs(data)
    } catch (e) { console.error(e) } finally { setIsLogsLoading(false) }
  }

  const handleResendLog = async (id: string) => {
    await supabase.from('alert_history').update({ status: 'pending', error_message: null }).eq('id', id)
    logAuditClient({ action: 'alert.retry', resource: 'alert_history', resource_id: id })
    toast.success("Reenviado para a fila.")
    loadLogs()
  }
  const handleCancelLog = async (id: string) => {
    await supabase.from('alert_history').update({ status: 'failed', error_message: 'Cancelado pelo usuário' }).eq('id', id)
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
        const { error } = await supabase.from('alert_history')
          .update({ status: 'pending', error_message: null, scheduled_at: new Date().toISOString() })
          .eq('status', 'failed').eq('user_id', user.id)
        if (error) throw error
        logAuditClient({ action: 'alert.batch_retry', resource: 'alert_history' })
        toast.success("Falhas reenviadas para a fila.")
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
        toast.success("Histórico limpo.")
      }
      loadLogs()
    } catch (e: any) { toast.error("Erro na ação em lote: " + e.message) } finally { setIsBulkActioning(false) }
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
      if (!res.ok) throw new Error(data.error || 'Erro ao testar conexão')
      toast.success("Mensagem de teste enviada!")
      setIsTestDialogOpen(false)
    } catch (e: any) { toast.error(e.message) } finally { setIsTestingPhone(false) }
  }

  /* ————— disparo em massa ————— */
  const handleSendMass = async () => {
    if (!await confirm({
      title: "Disparo em massa",
      description: "Iniciar o disparo para os clientes do público selecionado? A mensagem irá pelo WhatsApp respeitando o intervalo anti-ban.",
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

  /* ————— derivados ————— */
  const onlineCount = instances.filter(i => i.status === 'connected').length
  const anyOnline = onlineCount > 0
  const pendingCount = logs.filter(l => l.status === 'pending').length
  const filteredLogs = logs.filter(l => logFilter === 'all' || l.status === logFilter)

  const bulk = logFilter === 'failed'
    ? { label: 'Reenviar todos', action: 'resend_failed' as const, cls: 'border-money/40 bg-success-bg text-success-fg' }
    : logFilter === 'pending'
      ? { label: 'Cancelar todos', action: 'cancel_pending' as const, cls: 'border-warning-border bg-warning-bg text-warning-fg' }
      : { label: 'Limpar histórico', action: 'clear_all' as const, cls: 'border-danger-border bg-danger-bg text-danger-fg' }

  const insertVar = (v: string, target: 'form' | 'mass') => {
    if (target === 'form') setRuleForm(f => ({ ...f, message_template: f.message_template + (f.message_template.endsWith(' ') || !f.message_template ? '' : ' ') + v }))
    else setMassMessage(m => m + (m.endsWith(' ') || !m ? '' : ' ') + v)
  }

  if (isAdmin === null) {
    return (
      <div className="mx-auto max-w-[1000px] space-y-4 pb-10">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-10 w-96" />
        <div className="flex gap-4"><Skeleton className="h-24 flex-1" /><Skeleton className="h-24 flex-1" /></div>
        <div className="flex gap-4"><Skeleton className="h-72 flex-[1.4]" /><Skeleton className="h-72 flex-1" /></div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1000px] pb-14">
      {/* HEADER */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <h1 className="text-[19px] font-semibold tracking-[-0.025em]">Automação</h1>
        <span className={cn("ml-1 flex items-center gap-1.5 text-[11.5px] font-medium", anyOnline ? "text-money" : "text-danger")}>
          <span className={cn("status-dot", anyOnline ? "bg-money" : "bg-danger")} />
          {anyOnline ? `${onlineCount} de ${instances.length} instância${instances.length > 1 ? 's' : ''} online` : 'Nenhuma instância online'}
        </span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => setIsTestDialogOpen(true)} className="h-8 text-[11.5px]">
          Testar disparo
        </Button>
        <Button size="sm" onClick={() => setIsConnectDialogOpen(true)} className="h-8 gap-1 text-[11.5px]">
          <span className="text-[13px] leading-none">+</span> Conectar número
        </Button>
      </div>

      {/* TABS segmentadas */}
      <div className="mb-5 flex w-fit gap-0.5 rounded-lg bg-secondary p-[3px]">
        {([
          { k: 'overview', l: 'Visão geral' },
          { k: 'mass', l: 'Disparo em massa' },
          { k: 'logs', l: 'Logs', badge: pendingCount > 0 ? String(pendingCount) : '' },
        ] as { k: typeof activeTab; l: string; badge?: string }[]).map(t => (
          <button
            key={t.k}
            onClick={() => setActiveTab(t.k)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-medium transition-colors",
              activeTab === t.k ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.l}
            {t.badge && <span className="num rounded bg-warning-bg px-1 text-[9px] font-semibold text-warning-fg">{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* ============ VISÃO GERAL ============ */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Cards de instância */}
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
                      <DropdownMenuTrigger className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {online && !inst.is_primary && (
                          <DropdownMenuItem onClick={() => handleSetPrimary(inst.instance_name)}>★ Tornar principal</DropdownMenuItem>
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

                  {/* QR fica no card — não é modal (GUIA 1.4) */}
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

          {/* Régua + Templates */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            {/* RÉGUA */}
            <div className="min-w-0 flex-[1.4] rounded-lg border border-border bg-card p-4">
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
                    return (
                      <div key={r.id} onClick={() => openStep(r)} className="flex cursor-pointer gap-2.5">
                        <div className="flex flex-col items-center">
                          <span className="mt-[3px] size-[9px] flex-none rounded-full" style={{ background: dot }} />
                          {idx < stepRules.length - 1 && <span className="w-px flex-1 bg-border" />}
                        </div>
                        <div className={cn("min-w-0 flex-1", idx < stepRules.length - 1 && "pb-3.5", !active && "opacity-55")}>
                          <div className="flex items-center gap-2">
                            <span className="num text-[10px] font-semibold" style={{ color: dot }}>{dayLabel(r)}</span>
                            <span className="text-[11.5px] font-semibold">{STEP_TYPES[r.alert_type]}</span>
                            {!active && <span className="microlabel rounded bg-secondary px-1 !text-[8.5px]">pausada</span>}
                            {typeof impact === 'number' && impact > 0 && (
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
            </div>

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

              {/* Mensagens automáticas do robô (boas-vindas, renovação…) */}
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-1 flex items-center">
                  <span className="text-[13px] font-semibold">Robô do sistema</span>
                  <button onClick={() => openAuto(null)} className="ml-auto text-[11px] font-medium text-interactive hover:underline">+ Nova</button>
                </div>
                <p className="mb-3 text-[10.5px] text-muted-foreground">disparadas por eventos: boas-vindas, renovação, promoção…</p>
                {autoRules.length === 0 ? (
                  <p className="py-3 text-center text-[11px] text-muted-foreground">Nenhuma mensagem automática.</p>
                ) : (
                  autoRules.map(r => (
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
        <div className="max-w-[640px]">
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
                  { k: 'service', l: 'Por serviço' },
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
                ◎ <b>Público estimado:</b> {estimatedAudience ?? '…'} clientes.
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
                <p className="mb-2 flex items-center gap-1.5 text-[11.5px] font-medium"><span className="text-interactive">◷</span> Agendar (opcional)</p>
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
        <div className="overflow-hidden rounded-lg border border-border bg-card">
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

          {/* Nota anti-ban só no filtro "Em andamento" (GUIA 1.8) */}
          {logFilter === 'pending' && filteredLogs.length > 0 && (
            <div className="border-b border-warning-border bg-warning-bg px-4 py-2 text-[10.5px] text-warning-fg">
              O horário agendado é o <b>início</b> — as mensagens saem gradualmente respeitando o delay anti-ban ({antiBanConfig.min_delay}–{antiBanConfig.max_delay}s).
            </div>
          )}

          {/* header da tabela */}
          <div className="microlabel flex gap-2.5 border-b border-border bg-muted px-4 py-2 !text-[9px]">
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
              const st = ({
                pending: ['Na fila', 'bg-warning-bg text-warning-fg'],
                sent: ['Enviado', 'bg-success-bg text-success-fg'],
                failed: ['Falhou', 'bg-danger-bg text-danger-fg'],
              } as Record<string, [string, string]>)[log.status] || [log.status, 'bg-secondary']
              const sched = log.scheduled_at
                ? `${new Date(log.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${new Date(log.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                : '—'
              return (
                <div key={log.id} className="flex items-center gap-2.5 border-b border-border px-4 py-2.5 last:border-0">
                  <div className="min-w-0 flex-[1.2]">
                    <p className="truncate text-xs font-medium">{log.client?.name || 'Cliente removido'}</p>
                    {log.error_message && <p className="mt-px truncate text-[10px] text-danger">{log.error_message}</p>}
                  </div>
                  <span className="w-[100px] truncate text-[11px] text-secondary-foreground">
                    {LOG_TYPE[log.automation?.alert_type] || '—'}
                  </span>
                  <span className="num w-[110px] text-[10.5px] text-muted-foreground">{sched}</span>
                  <span className="w-[90px]">
                    <span className={cn("inline-flex rounded px-2 py-0.5 text-[10px] font-semibold", st[1])}>{st[0]}</span>
                  </span>
                  <span className="flex w-[80px] justify-end gap-1">
                    {log.status !== 'sent' && (
                      <button onClick={() => handleResendLog(log.id)} title="Reenviar" className="size-[26px] rounded-md border border-input bg-card text-xs text-money hover:bg-muted">↻</button>
                    )}
                    {log.status === 'pending' && (
                      <button onClick={() => handleCancelLog(log.id)} title="Cancelar" className="size-[26px] rounded-md border border-input bg-card text-xs text-warning hover:bg-muted">✕</button>
                    )}
                    <button onClick={() => handleDeleteLog(log.id)} title="Excluir" className="size-[26px] rounded-md border border-input bg-card text-xs text-danger-fg hover:bg-muted">🗑</button>
                  </span>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ============ DIÁLOGO etapa/template ============ */}
      <Dialog open={isRuleDialogOpen} onOpenChange={setIsRuleDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[500px] max-w-[95vw] overflow-y-auto sm:max-w-none">
          <DialogHeader className="flex-row items-center gap-2.5 space-y-0">
            <span className={cn("flex size-[30px] items-center justify-center rounded-lg text-sm", dlgKind === 'step' ? "bg-warning-bg" : "bg-accent")}>
              {dlgKind === 'step' ? '⏱' : '⚡'}
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
                  {Object.entries(dlgKind === 'step' ? STEP_TYPES : TEMPLATE_TYPES).map(([k, l]) => (
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

      {/* ============ DIÁLOGO template (nome + etiqueta + mensagem) ============ */}
      <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[500px] max-w-[95vw] overflow-y-auto sm:max-w-none">
          <DialogHeader className="flex-row items-center gap-2.5 space-y-0">
            <span className="flex size-[30px] items-center justify-center rounded-lg bg-accent text-sm">✉</span>
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

      {/* ============ DIÁLOGO conectar número ============ */}
      <Dialog open={isConnectDialogOpen} onOpenChange={setIsConnectDialogOpen}>
        <DialogContent className="w-[440px] max-w-[95vw] sm:max-w-none">
          <DialogHeader>
            <DialogTitle className="text-[13.5px] font-semibold">Conectar número</DialogTitle>
            <DialogDescription className="text-[10.5px]">Gere um novo chip e escaneie o QR code com o WhatsApp.</DialogDescription>
          </DialogHeader>

          <div className="flex w-fit gap-0.5 rounded-md bg-secondary p-0.5">
            {(['integrated', 'external'] as const).map(m => (
              <button
                key={m}
                onClick={() => setConnectionMode(m)}
                className={cn(
                  "rounded-[5px] px-3 py-1.5 text-[11px] font-medium transition-colors",
                  connectionMode === m ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,.06)]" : "text-muted-foreground"
                )}
              >
                {m === 'integrated' ? 'API do sistema' : 'API própria'}
              </button>
            ))}
          </div>

          {connectionMode === 'integrated' ? (
            <div className="space-y-3">
              <p className="rounded-md bg-muted px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                Geramos a instância automaticamente na nossa infraestrutura. Depois é só escanear o QR que aparece no card do chip.
              </p>
              <Button onClick={handleIntegratedConnect} disabled={isConnecting} className="w-full">
                {isConnecting && <Loader2 className="mr-2 size-4 animate-spin" />} Gerar instância automática
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
                {isConnecting && <Loader2 className="mr-2 size-4 animate-spin" />} Conectar instância
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ============ DIÁLOGO testar disparo ============ */}
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
    </div>
  )
}

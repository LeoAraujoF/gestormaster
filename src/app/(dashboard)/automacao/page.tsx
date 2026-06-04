"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { QrCode, Smartphone, Wifi, WifiOff, Loader2, Save, Plus, Edit2, Trash2, Bot, BellRing, Shield, ShieldAlert, ExternalLink, Lock, Zap, RefreshCcw, XCircle, List, LogOut, PhoneOff, CheckCircle2, Clock, Megaphone, Rocket, Mailbox, Send, Activity, Users, Target, Star, Play } from "lucide-react"
import { toast } from "sonner"
import { QRCodeSVG } from "qrcode.react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { phoneMask } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { UpgradeModal } from "@/components/global-upgrade-modal"
import { PricingModal } from "@/components/pricing-modal"

const externalConnectionSchema = z.object({
  baseUrl: z.string().url("URL inválida (ex: http://192.168.1.100:8080)"),
  apiKey: z.string().min(5, "API Key é obrigatória"),
  instanceName: z.string().min(2, "Nome da instância obrigatório"),
})

type ExternalConnectionForm = z.infer<typeof externalConnectionSchema>

const getDefaultTemplate = (type: string) => {
  const base = "{Olá|Oi|Tudo bem} {{primeiro_nome}}?\\n"
  const pixStr = "\\n\\nCaso deseje pagar via pix, segue os dados abaixo:\\nChave pix é {{pix}}\\nTitular: {{titular_pix}}\\n\\nSe tiver alguma dúvida, entre em contato conosco!\\n\\nAtenciosamente,\\nEquipe {{empresa}}"
  
  const defaults: Record<string, string> = {
    before_due: base + "Seu plano vence amanhã, deseja renovar lo?" + pixStr,
    on_due: base + "Lembrando que o vencimento do seu plano é hoje! Deseja renovar?" + pixStr,
    after_due: base + "Identificamos que seu plano venceu e encontra-se pendente. Deseja reativá-lo?" + pixStr,
    renewal: "{Olá|Oi|Tudo ótimo} {{primeiro_nome}}!\\nMuito obrigado por renovar seu plano conosco. Sua confiança é essencial!\\n\\nSe tiver alguma dúvida, entre em contato conosco!\\n\\nAtenciosamente,\\nEquipe {{empresa}}",
    promotion: base + "Temos uma oferta imperdível para você! [Insira sua promoção aqui]\\n\\nAtenciosamente,\\nEquipe {{empresa}}",
    quick_message: base + "Passando para lembrar do seu plano no valor de R$ {{plan_value}}. \\n\\nAcesso Rápido ao Suporte: {{telefone_suporte}}\\n\\nAtenciosamente,\\nEquipe {{empresa}}"
  }
  return defaults[type] || defaults.before_due
}

export default function AutomacaoPage() {
  const [activeTab, setActiveTab] = useState("connection")
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false)
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'loading' | 'error'>('loading')
  const [qrCodeData, setQrCodeData] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null) // null = loading
  const [userPlan, setUserPlan] = useState<string | null>(null)
  const [connectionMode, setConnectionMode] = useState<'integrated' | 'external'>('external')
  const [instances, setInstances] = useState<any[]>([])
  const [isAddingInstance, setIsAddingInstance] = useState(false)
  
  const [automations, setAutomations] = useState<any[]>([])
  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<any | null>(null)
  const [isSubmittingRule, setIsSubmittingRule] = useState(false)
  
  // Dashboard & Radar state
  const [globalMetrics, setGlobalMetrics] = useState({ sent: 0, pending: 0, failed: 0 })
  const [estimatedAudience, setEstimatedAudience] = useState<number | null>(null)

  // Logs state
  const [logs, setLogs] = useState<any[]>([])
  const [logFilter, setLogFilter] = useState<'pending' | 'sent' | 'failed' | 'all'>('pending')
  const [isLogsLoading, setIsLogsLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [isTestingPhone, setIsTestingPhone] = useState(false)
  const [isBulkActioning, setIsBulkActioning] = useState(false)

  // Anti-Ban state
  const [antiBanConfig, setAntiBanConfig] = useState({ min_delay: 10, max_delay: 25 })
  const [isSavingAntiBan, setIsSavingAntiBan] = useState(false)

  // Call Settings state
  const [rejectCalls, setRejectCalls] = useState(false)
  const [rejectCallsMessage, setRejectCallsMessage] = useState("As chamadas de voz e vídeo estão desativadas para este número. Por favor, envie uma mensagem de texto.")
  const [isSavingCallSettings, setIsSavingCallSettings] = useState(false)

  const supabase = createClient()

  const { register: regConn, handleSubmit: handleConnSubmit, formState: { errors: connErrs }, setValue: setConnValue } = useForm<ExternalConnectionForm>({
    resolver: zodResolver(externalConnectionSchema),
    defaultValues: { baseUrl: "", apiKey: "", instanceName: "" }
  })

  const [ruleForm, setRuleForm] = useState({
    alert_type: "before_due" as string,
    days_offset: -1,
    send_time: "09:00",
    message_template: getDefaultTemplate("before_due"),
    is_active: true
  })

  // Mass message state
  const [massAudience, setMassAudience] = useState<string>("all")
  const [massServiceId, setMassServiceId] = useState<string>("")
  const [massMessage, setMassMessage] = useState<string>("Olá {{primeiro_nome}}, temos uma oferta especial para você!")
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null)
  const [isSendingMass, setIsSendingMass] = useState(false)
  const [services, setServices] = useState<any[]>([])

  useEffect(() => {
    const calculateAudience = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      let query = supabase.from('clients').select('id', { count: 'exact' }).eq('user_id', user.id)
      
      if (massAudience === 'active') query = query.eq('status', 'active')
      if (massAudience === 'inactive') query = query.eq('status', 'inactive')
      if (massAudience === 'expired') {
        const today = new Date().toISOString().split('T')[0]
        query = query.lt('due_date', today).eq('status', 'active')
      }
      if (massAudience === 'service' && massServiceId) {
        const { data } = await supabase.from('client_services').select('id').eq('service_id', massServiceId)
        if (data) {
          setEstimatedAudience(data.length)
          return
        }
      }

      if (massAudience === 'service' && !massServiceId) {
        setEstimatedAudience(0)
        return
      }
      
      const { count } = await query
      setEstimatedAudience(count || 0)
    }
    
    calculateAudience()
  }, [massAudience, massServiceId])

  const loadServices = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('services').select('*').eq('user_id', user.id)
    if (data) setServices(data)
  }

  const handleSendMass = async () => {
    if (!confirm("Tem certeza que deseja iniciar o disparo em massa?")) return
    setIsSendingMass(true)
    try {
      const res = await fetch('/api/evolution/send-mass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audience: massAudience,
          serviceId: massServiceId,
          messageTemplate: massMessage,
          delaySeconds: 5,
          scheduledAt: scheduledAt ? scheduledAt.toISOString() : null
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(data.message)
      setActiveTab("logs") // Redirect to logs to see it working
      loadLogs()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setIsSendingMass(false)
    }
  }

  useEffect(() => {
    checkAdminStatus()
    loadSettings()
    loadAutomations()
    loadLogs()
    loadServices()
  }, [])

  const checkAdminStatus = async () => {
    try {
      const res = await fetch('/api/admin/check')
      const data = await res.json()
      setIsAdmin(data.isAdmin)
      if (data.isAdmin) {
        setConnectionMode('integrated')
      }
    } catch (e) {
      setIsAdmin(false)
    }
  }

  const loadSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setUserPlan(user.user_metadata?.plan_name || "Desconhecido")

      const { data, error } = await supabase.from('evolution_instances').select('*').eq('user_id', user.id).order('created_at', { ascending: true })
      
      if (data && data.length > 0) {
        setInstances(data)
        const first = data[0]
        
        if (first.connection_mode === 'external') {
          setConnValue('baseUrl', first.base_url || '')
          setConnValue('apiKey', first.api_key || '')
          setConnValue('instanceName', '')
          setConnectionMode('external')
        } else {
          setConnectionMode('integrated')
        }
        
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
    } catch (e) {
      setStatus('error')
    }
  }

  const checkConnectionStatus = async () => {
    try {
      const res = await fetch('/api/evolution/status')
      const data = await res.json()
      if (data.instances) {
        setInstances(data.instances)
      }
      setStatus(data.status)
    } catch (e) {
      console.error("Status check failed")
    }
  }

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
      toast.success("Configurações antibloqueio salvas!")
    } catch (error) {
      toast.error("Erro ao salvar configurações.")
    } finally {
      setIsSavingAntiBan(false)
    }
  }

  // Integrated mode connect (admin or future paid users)
  const handleIntegratedConnect = async () => {
    setIsConnecting(true)
    try {
      const res = await fetch('/api/evolution/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'integrated' })
      })
      
      const responseData = await res.json()
      if (!res.ok) throw new Error(responseData.error || 'Erro de conexão')
      
      toast.success("Instância gerada! Escaneie o QR Code no seu novo Card.")
      setIsAddingInstance(false)
      loadSettings() // Recarrega a grade para puxar o novo chip com QR Code
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsConnecting(false)
    }
  }

  // External mode connect (client's own API)
  const onExternalConnectSubmit = async (data: ExternalConnectionForm) => {
    setIsConnecting(true)
    try {
      const res = await fetch('/api/evolution/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'external', ...data })
      })
      
      const responseData = await res.json()
      if (!res.ok) throw new Error(responseData.error || 'Erro de conexão')
      
      toast.success("Instância conectada! Escaneie o QR Code no seu novo Card.")
      setIsAddingInstance(false)
      loadSettings() // Recarrega a grade para puxar o novo chip com QR Code
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsConnecting(false)
    }
  }

  // Disconnect from instance
  const handleDisconnect = async (instanceName: string) => {
    if (!confirm("Tem certeza que deseja desconectar este número?")) return
    setIsConnecting(true)
    try {
      const res = await fetch('/api/evolution/logout', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName })
      })
      if (!res.ok) throw new Error("Erro ao desconectar")
      toast.success("WhatsApp desconectado com sucesso!")
      loadSettings()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDeleteInstance = async (id: string, instanceName: string) => {
    if (!confirm(`Tem certeza que deseja remover permanentemente o chip "${instanceName}" do sistema e limpar o servidor?`)) return
    setIsConnecting(true)
    try {
      const res = await fetch('/api/evolution/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName })
      })
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Erro ao remover")
      }
      toast.success("Limpeza profunda concluída! Instância removida.")
      loadSettings()
    } catch (e: any) {
      toast.error(e.message || "Erro fatal ao remover instância")
    } finally {
      setIsConnecting(false)
    }
  }

  const handleSetPrimary = async (instanceName: string) => {
    setIsConnecting(true)
    try {
      const res = await fetch('/api/evolution/set-primary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName })
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message)
        // Update state locally
        setInstances(prev => prev.map(inst => ({
          ...inst,
          is_primary: inst.instance_name === instanceName
        })))
      } else {
        toast.error(data.error || 'Erro ao definir instância primária.')
      }
    } catch (error) {
      toast.error('Erro de conexão ao definir instância primária.')
    } finally {
      setIsConnecting(false)
    }
  }

  // Automations CRUD
  const [ruleEstimates, setRuleEstimates] = useState<Record<string, number | string>>({})

  const loadAutomations = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: rules } = await supabase.from('automations').select('*').eq('user_id', user.id)
    if (rules) {
      setAutomations(rules)
      
      const { data: clients } = await supabase.from('clients').select('status, due_date').eq('user_id', user.id).eq('status', 'active')
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
          if (['quick_message', 'renewal', 'promotion'].includes(rule.alert_type)) {
            estimates[rule.id] = 'Manual'
            return
          }
          if (!rule.is_active) {
            estimates[rule.id] = 0
            return
          }
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

  const loadLogs = async () => {
    setIsLogsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const { data } = await supabase
        .from('alert_history')
        .select(`
          *,
          client:clients(name),
          automation:automations(alert_type)
        `)
        .eq('user_id', user.id)
        .order('scheduled_at', { ascending: false })
        
      if (data) {
        setLogs(data)
        const currentMonth = new Date().getMonth()
        const currentYear = new Date().getFullYear()
        const thisMonthLogs = data.filter((log: any) => {
          const d = new Date(log.created_at)
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear
        })

        setGlobalMetrics({
          sent: thisMonthLogs.filter((l: any) => l.status === 'sent').length,
          pending: thisMonthLogs.filter((l: any) => l.status === 'pending').length,
          failed: thisMonthLogs.filter((l: any) => l.status === 'failed').length,
        })
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsLogsLoading(false)
    }
  }

  const handleResendLog = async (id: string) => {
    try {
      await supabase.from('alert_history').update({ status: 'pending', error_message: null }).eq('id', id)
      toast.success("Alerta reenviado para a fila!")
      loadLogs()
    } catch (e) {
      toast.error("Erro ao reenviar alerta.")
    }
  }

  const handleCancelLog = async (id: string) => {
    try {
      await supabase.from('alert_history').update({ status: 'failed', error_message: 'Cancelado pelo usuário' }).eq('id', id)
      toast.success("Alerta cancelado!")
      loadLogs()
    } catch (e) {
      toast.error("Erro ao cancelar alerta.")
    }
  }

  const handleDeleteLog = async (id: string) => {
    try {
      await supabase.from('alert_history').delete().eq('id', id)
      toast.success("Registro removido!")
      loadLogs()
    } catch (e) {
      toast.error("Erro ao remover registro.")
    }
  }

  const handleBulkAction = async (action: 'resend_failed' | 'cancel_pending' | 'clear_all') => {
    setIsBulkActioning(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      if (action === 'resend_failed') {
        const { error } = await supabase.from('alert_history')
          .update({ status: 'pending', error_message: null, scheduled_at: new Date().toISOString() })
          .eq('status', 'failed')
          .eq('user_id', user.id)
        if (error) throw error
        toast.success("Falhas reativadas para fila!")
      } else if (action === 'cancel_pending') {
        const { error } = await supabase.from('alert_history')
          .update({ status: 'failed', error_message: 'Cancelado em lote' })
          .eq('status', 'pending')
          .eq('user_id', user.id)
        if (error) throw error
        toast.success("Envios pendentes cancelados!")
      } else if (action === 'clear_all') {
        const { error } = await supabase.from('alert_history')
          .delete()
          .eq('user_id', user.id)
        if (error) throw error
        toast.success("Histórico limpo!")
      }
      loadLogs()
    } catch (e: any) {
      toast.error("Erro na ação em lote: " + e.message)
    } finally {
      setIsBulkActioning(false)
    }
  }

  const handleTestConnection = async () => {
    if (!testPhone) return toast.error("Digite um telefone para teste")
    setIsTestingPhone(true)
    try {
      const res = await fetch('/api/evolution/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao testar conexão')
      toast.success("Mensagem de teste enviada!")
      setIsTestDialogOpen(false)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setIsTestingPhone(false)
    }
  }

  const handleRuleSubmit = async () => {
    setIsSubmittingRule(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const payload = {
        user_id: user.id,
        alert_type: ruleForm.alert_type,
        days_offset: Number(ruleForm.days_offset),
        send_time: ruleForm.send_time,
        message_template: ruleForm.message_template,
        is_active: ruleForm.is_active
      }

      if (editingRule) {
        const { error } = await supabase.from('automations').update(payload).eq('id', editingRule.id)
        if (error) throw error
        toast.success("Regra atualizada!")
      } else {
        const { error } = await supabase.from('automations').insert(payload)
        if (error) throw error
        toast.success("Nova regra criada!")
      }
      setIsRuleDialogOpen(false)
      loadAutomations()
    } catch (e) {
      toast.error("Erro ao salvar regra.")
    } finally {
      setIsSubmittingRule(false)
    }
  }

  const handleSaveCallSettings = async () => {
    setIsSavingCallSettings(true)
    try {
      const res = await fetch('/api/evolution/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reject_calls: rejectCalls, reject_calls_message: rejectCallsMessage })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success("Configurações de bloqueio de chamada salvas com sucesso!")
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar")
    } finally {
      setIsSavingCallSettings(false)
    }
  }

  const deleteRule = async (id: string) => {
    await supabase.from('automations').delete().eq('id', id)
    toast.success("Regra removida!")
    loadAutomations()
  }

  // Loading state for admin check
  if (isAdmin === null || userPlan === null) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">Carregando configurações...</p>
      </div>
    )
  }

  const getRuleIcon = (type: string) => {
    switch (type) {
      case 'before_due': return <Clock className="w-4 h-4 text-sky-500" />
      case 'on_due': return <BellRing className="w-4 h-4 text-amber-500" />
      case 'after_due': return <ShieldAlert className="w-4 h-4 text-red-500" />
      case 'renewal': return <RefreshCcw className="w-4 h-4 text-emerald-500" />
      case 'promotion': return <Rocket className="w-4 h-4 text-violet-500" />
      case 'quick_message': return <Send className="w-4 h-4 text-emerald-500" />
      default: return <Bot className="w-4 h-4 text-muted-foreground" />
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto">
      {userPlan === "Lite" && !isAdmin && (
        <UpgradeModal 
          open={true} 
          onOpenChange={() => {}} 
          featureName="Automação & WhatsApp API" 
          description="Acesse o modo Nuvem, crie regras de cobrança 100% automáticas e envie mensagens em massa para sua base."
          redirectOnClose={true}
        />
      )}
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight mb-2">Automação WhatsApp</h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          {isAdmin 
            ? "Gerencie sua conexão WhatsApp e configure alertas automáticos."
            : "Conecte seu WhatsApp e configure alertas automáticos de vencimento."
          }
        </p>
      </div>

      {/* Global Bot KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-2">
        <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-500/5 rounded-bl-full -z-10" />
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
            <h3 className="font-medium text-muted-foreground">Disparos de Sucesso</h3>
          </div>
          <p className="text-3xl font-bold mt-2">{globalMetrics.sent}</p>
          <p className="text-xs text-muted-foreground">Mensagens entregues neste mês</p>
        </div>

        <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 rounded-xl">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <h3 className="font-medium text-muted-foreground">Na Fila (Aguardando)</h3>
          </div>
          <p className="text-3xl font-bold mt-2 text-amber-500">{globalMetrics.pending}</p>
          <p className="text-xs text-muted-foreground">Programadas para disparo</p>
        </div>

        <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-red-500/5 rounded-bl-full -z-10" />
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-500/10 rounded-xl">
              <XCircle className="w-5 h-5 text-red-500" />
            </div>
            <h3 className="font-medium text-muted-foreground">Falhas Recentes</h3>
          </div>
          <p className="text-3xl font-bold mt-2 text-red-500">{globalMetrics.failed}</p>
          <p className="text-xs text-muted-foreground">Não entregues (bloqueio ou erro)</p>
        </div>
      </div>

      <Tabs defaultValue="connection" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-3xl grid-cols-4 mb-6 bg-background/50 border border-border/50">
          <TabsTrigger value="connection" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Conexão
          </TabsTrigger>
          <TabsTrigger value="rules" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Regras
          </TabsTrigger>
          <TabsTrigger value="mass" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Disparo em Massa
          </TabsTrigger>
          <TabsTrigger value="logs" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connection" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            
            {/* LEFT COLUMN — Global Settings & Add Form */}
            <div className="space-y-6">
              {(instances.length === 0 || isAddingInstance) ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">{instances.length === 0 ? "Conectar Primeiro Chip" : "Adicionar Novo Chip"}</h3>
                    {instances.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setIsAddingInstance(false)} className="text-muted-foreground hover:text-foreground">
                        Cancelar
                      </Button>
                    )}
                  </div>

                  {instances.length === 0 ? (
                    <Tabs value={connectionMode} onValueChange={(val: any) => setConnectionMode(val)} className="w-full">
                      <TabsList className="grid w-full grid-cols-2 mb-4 bg-background/50 border border-border/50">
                        <TabsTrigger value="integrated" className="data-[state=active]:bg-sky-500/10 data-[state=active]:text-sky-500">API do Sistema</TabsTrigger>
                        <TabsTrigger value="external" className="data-[state=active]:bg-sky-500/10 data-[state=active]:text-sky-500">API Própria</TabsTrigger>
                      </TabsList>
                      <TabsContent value="integrated">
                        <Card className="glass-card border-sky-500/20">
                          <CardHeader>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/15">
                                <Shield className="w-5 h-5 text-sky-500" />
                              </div>
                              <div>
                                <CardTitle className="flex items-center gap-2">
                                  Modo Nuvem (Sistema)
                                  <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/20 text-[10px]">Recomendado</Badge>
                                </CardTitle>
                                <CardDescription>Hospedado automaticamente pela nossa infraestrutura.</CardDescription>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 mb-4">
                              <div className="flex items-start gap-3">
                                <Zap className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                                <div className="text-sm">
                                  <p className="font-medium text-emerald-500 mb-1">Criação Instantânea</p>
                                  <p className="text-muted-foreground text-xs leading-relaxed">Uma nova instância será gerada na nuvem. Nenhuma configuração manual de servidor é necessária.</p>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                          <CardFooter>
                            <Button onClick={handleIntegratedConnect} disabled={isConnecting} className="w-full bg-sky-500 hover:bg-sky-600 text-white" size="lg">
                              {isConnecting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <QrCode className="w-5 h-5 mr-2" />}
                              Gerar Instância Automática
                            </Button>
                          </CardFooter>
                        </Card>
                      </TabsContent>
                      <TabsContent value="external">
                        <Card className="glass-card">
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <ExternalLink className="w-5 h-5 text-sky-500" />
                              Conexão com API Própria
                            </CardTitle>
                            <CardDescription>Conecte usando os dados do seu servidor Evolution API particular.</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <form id="external-connect-form" onSubmit={handleConnSubmit(onExternalConnectSubmit)} className="space-y-4">
                              <div className="space-y-2">
                                <Label htmlFor="baseUrl">Base URL da API</Label>
                                <Input id="baseUrl" placeholder="http://seu-ip:8080" {...regConn("baseUrl")} className="bg-background/50" />
                                {connErrs.baseUrl && <p className="text-xs text-destructive">{connErrs.baseUrl.message}</p>}
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="apiKey">Global API Key</Label>
                                <Input id="apiKey" type="password" placeholder="Sua chave secreta" {...regConn("apiKey")} className="bg-background/50" />
                                {connErrs.apiKey && <p className="text-xs text-destructive">{connErrs.apiKey.message}</p>}
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="instanceName">Nome da Instância</Label>
                                <Input id="instanceName" placeholder="ex: chip-vendas-1" {...regConn("instanceName")} className="bg-background/50" />
                              </div>
                            </form>
                          </CardContent>
                          <CardFooter>
                            <Button type="submit" form="external-connect-form" disabled={isConnecting} className="w-full bg-sky-500 hover:bg-sky-600 text-white">
                              {isConnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <QrCode className="w-4 h-4 mr-2" />}
                              Conectar à API
                            </Button>
                          </CardFooter>
                        </Card>
                      </TabsContent>
                    </Tabs>
                  ) : connectionMode === 'integrated' ? (
                    <Card className="glass-card border-sky-500/20">
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/15">
                            <Shield className="w-5 h-5 text-sky-500" />
                          </div>
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              Modo Nuvem (Sistema)
                            </CardTitle>
                            <CardDescription>Conexão travada neste modo (Sua primeira escolha).</CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 mb-4">
                          <div className="flex items-start gap-3">
                            <Zap className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                            <div className="text-sm">
                              <p className="font-medium text-emerald-500 mb-1">Criação Instantânea</p>
                              <p className="text-muted-foreground text-xs leading-relaxed">Uma nova instância será gerada na nuvem. Você precisará apenas escanear o QR Code.</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter>
                        <Button onClick={handleIntegratedConnect} disabled={isConnecting} className="w-full bg-sky-500 hover:bg-sky-600 text-white" size="lg">
                          {isConnecting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <QrCode className="w-5 h-5 mr-2" />}
                          Gerar Instância Automática
                        </Button>
                      </CardFooter>
                    </Card>
                  ) : (
                    <Card className="glass-card">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <ExternalLink className="w-5 h-5 text-sky-500" />
                          Conexão com API Própria
                        </CardTitle>
                        <CardDescription>Conexão travada neste modo (Sua primeira escolha).</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <form id="external-connect-form" onSubmit={handleConnSubmit(onExternalConnectSubmit)} className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="baseUrl">Base URL da API</Label>
                            <Input id="baseUrl" placeholder="http://seu-ip:8080" {...regConn("baseUrl")} className="bg-background/50" />
                            {connErrs.baseUrl && <p className="text-xs text-destructive">{connErrs.baseUrl.message}</p>}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="apiKey">Global API Key</Label>
                            <Input id="apiKey" type="password" placeholder="Sua chave secreta" {...regConn("apiKey")} className="bg-background/50" />
                            {connErrs.apiKey && <p className="text-xs text-destructive">{connErrs.apiKey.message}</p>}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="instanceName">Nome do Novo Chip</Label>
                            <Input id="instanceName" placeholder="ex: chip-vendas-2" {...regConn("instanceName")} className="bg-background/50" />
                          </div>
                        </form>
                      </CardContent>
                      <CardFooter>
                        <Button type="submit" form="external-connect-form" disabled={isConnecting} className="w-full bg-sky-500 hover:bg-sky-600 text-white">
                          {isConnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <QrCode className="w-4 h-4 mr-2" />}
                          Conectar à API
                        </Button>
                      </CardFooter>
                    </Card>
                  )}
                </div>
              ) : (
                <Card className="glass-card animate-in fade-in slide-in-from-left-4 duration-300">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-emerald-500/10 rounded-lg">
                        <Rocket className="w-5 h-5 text-emerald-500" />
                      </div>
                      <CardTitle className="text-xl">Fazenda de Chips</CardTitle>
                    </div>
                    <CardDescription>
                      Você possui {instances.length} chip(s) configurado(s). O sistema usa todos eles em <strong>revezamento (Roleta)</strong> para evitar bloqueios no WhatsApp.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {userPlan === "Plus" || isAdmin ? (
                      instances.length >= 5 && !isAdmin ? (
                        <div className="p-4 bg-emerald-500/10 rounded-lg text-center border border-emerald-500/20">
                          <Smartphone className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                          <p className="text-sm font-medium text-emerald-600 mb-1">Limite Atingido</p>
                          <p className="text-xs text-emerald-600/80">O Plano Plus permite no máximo 5 chips na Fazenda.</p>
                        </div>
                      ) : (
                        <Button onClick={() => setIsAddingInstance(true)} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-md hover:shadow-lg transition-all">
                          <Plus className="w-4 h-4 mr-2" /> Adicionar Novo Chip
                        </Button>
                      )
                    ) : userPlan === "Pro" ? (
                      instances.length >= 3 ? (
                        <div className="p-4 bg-sky-500/10 rounded-lg text-center border border-sky-500/20">
                          <Smartphone className="w-6 h-6 text-sky-500 mx-auto mb-2" />
                          <p className="text-sm font-medium text-sky-600 mb-1">Limite Atingido</p>
                          <p className="text-xs text-sky-600/80">O Plano Pro permite no máximo 3 chips na Fazenda.</p>
                          <Button onClick={() => setIsPricingModalOpen(true)} variant="outline" className="text-sky-600 border-sky-500/30 hover:bg-sky-500/20 w-full mt-3">Fazer Upgrade para Plus</Button>
                        </div>
                      ) : (
                        <Button onClick={() => setIsAddingInstance(true)} className="w-full bg-sky-500 hover:bg-sky-600 text-white shadow-md hover:shadow-lg transition-all">
                          <Plus className="w-4 h-4 mr-2" /> Adicionar Novo Chip
                        </Button>
                      )
                    ) : (
                      <div className="p-4 bg-amber-500/10 rounded-lg text-center border border-amber-500/20">
                        <Lock className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                        <p className="text-sm font-medium text-amber-600 mb-1">Integração Bloqueada</p>
                        <p className="text-xs text-amber-600/80 mb-3">Seu plano atual não permite conectar chips.</p>
                        <Button onClick={() => setIsPricingModalOpen(true)} variant="outline" className="text-amber-600 border-amber-500/30 hover:bg-amber-500/20 w-full">Fazer Upgrade</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card className="glass-card">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-amber-500" />
                    Antibloqueio Global (Anti-Ban)
                  </CardTitle>
                  <CardDescription>
                    Configure o atraso aleatório aplicado em todos os chips durante os disparos.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Atraso Mínimo (seg)</Label>
                      <Input 
                        type="number" 
                        min="5" 
                        value={antiBanConfig.min_delay} 
                        onChange={e => setAntiBanConfig({...antiBanConfig, min_delay: Number(e.target.value)})}
                        className="bg-background/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Atraso Máximo (seg)</Label>
                      <Input 
                        type="number" 
                        min={antiBanConfig.min_delay} 
                        value={antiBanConfig.max_delay} 
                        onChange={e => setAntiBanConfig({...antiBanConfig, max_delay: Number(e.target.value)})}
                        className="bg-background/50"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Sorteamos um tempo entre o Mínimo e o Máximo antes de cada envio.</p>
                </CardContent>
                <CardFooter className="flex flex-col sm:flex-row gap-3">
                  <Button onClick={handleSaveAntiBan} disabled={isSavingAntiBan} variant="outline" className="w-full sm:w-1/2 border-sky-500/20 text-sky-600 hover:bg-sky-500/5">
                    {isSavingAntiBan ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Salvar Anti-Ban
                  </Button>
                  <Button onClick={() => setIsTestDialogOpen(true)} variant="secondary" className="w-full sm:w-1/2 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-0">
                    <RefreshCcw className="w-4 h-4 mr-2" /> Testar Disparo
                  </Button>
                </CardFooter>
              </Card>

              <Card className="glass-card">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <PhoneOff className="w-5 h-5 text-red-500" />
                    Bloqueio de Chamadas
                  </CardTitle>
                  <CardDescription>
                    Rejeita chamadas recebidas em qualquer um dos chips conectados.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-border/50 p-3 bg-background/50">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Rejeitar Ligações</Label>
                      <p className="text-xs text-muted-foreground">Derruba a ligação e envia o texto abaixo.</p>
                    </div>
                    <Switch checked={rejectCalls} onCheckedChange={setRejectCalls} />
                  </div>
                  {rejectCalls && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                      <Label>Mensagem de Recusa</Label>
                      <Textarea 
                        value={rejectCallsMessage}
                        onChange={e => setRejectCallsMessage(e.target.value)}
                        className="bg-background/50 resize-none h-20"
                        placeholder="Mensagem..."
                      />
                    </div>
                  )}
                </CardContent>
                <CardFooter>
                  <Button onClick={handleSaveCallSettings} disabled={isSavingCallSettings} variant="outline" className="w-full border-red-500/20 text-red-600 hover:bg-red-500/5">
                    {isSavingCallSettings ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Salvar Configuração de Chamadas
                  </Button>
                </CardFooter>
              </Card>
            </div>

            {/* RIGHT COLUMN — Instance Grid */}
            <div className="space-y-6">
              {instances.length === 0 && (
                <Card className="glass-card flex flex-col items-center justify-center p-12 text-center h-full border-dashed border-2 bg-muted/10">
                  <Smartphone className="w-16 h-16 text-muted-foreground/30 mb-4" />
                  <h3 className="text-xl font-medium text-foreground mb-2">Nenhum Chip Conectado</h3>
                  <p className="text-muted-foreground text-sm max-w-[250px]">Preencha os dados ao lado ou use o modo integrado para conectar seu primeiro WhatsApp.</p>
                </Card>
              )}

              {instances.map((instance) => (
                <Card key={instance.id} className={`glass-card flex flex-col relative overflow-hidden transition-all duration-300 ${instance.status === 'connected' ? 'border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.05)]' : 'border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.05)]'}`}>
                  {/* Background decoration */}
                  <div className={`absolute -right-10 -top-10 w-32 h-32 rounded-full opacity-10 blur-2xl ${instance.status === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  
                  <CardHeader className="pb-4 relative z-10 border-b border-border/50">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-lg">
                        <Smartphone className="w-5 h-5 text-sky-500" />
                        {instance.instance_name}
                        {instance.is_primary && (
                          <div className="flex items-center ml-2 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 text-xs font-medium border border-amber-500/20" title="Número Principal (Suporte)">
                            <Star className="w-3 h-3 fill-amber-500 mr-1" /> Principal
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {instance.status === 'connected' && !instance.is_primary && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10" 
                            title="Definir como Número Principal"
                            onClick={() => handleSetPrimary(instance.instance_name)}
                            disabled={isConnecting}
                          >
                            <Star className="w-4 h-4" />
                          </Button>
                        )}
                        <Badge variant="outline" className={instance.status === 'connected' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400'}>
                          {instance.status === 'connected' ? 'Online' : 'Desconectado'}
                        </Badge>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center justify-center p-6 text-center relative z-10">
                    
                    {instance.status === 'connected' && (
                      <div className="animate-in zoom-in duration-300 flex flex-col items-center">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center relative mb-4">
                          <div className="absolute inset-0 rounded-full border-4 border-emerald-500/30 animate-ping opacity-50" />
                          <Wifi className="w-7 h-7 text-emerald-500 relative z-10" />
                        </div>
                        <h3 className="text-lg font-bold text-emerald-500 mb-1">Chip Operante</h3>
                        {instance.instanceData?.instance?.owner && (
                          <div className="text-sm font-medium mb-1">
                            {phoneMask(instance.instanceData.instance.owner.replace('@s.whatsapp.net', ''))}
                          </div>
                        )}
                        <p className="text-muted-foreground text-xs mb-6 max-w-[250px]">Pronto para enviar mensagens e participar da roleta de distribuição.</p>
                        <Button variant="outline" size="sm" className="text-red-500 hover:text-red-500 hover:bg-red-500/10 border-red-500/20 w-full max-w-[200px]" onClick={() => handleDisconnect(instance.instance_name)} disabled={isConnecting}>
                          {isConnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogOut className="w-4 h-4 mr-2" />} Desconectar
                        </Button>
                      </div>
                    )}

                    {(instance.status === 'disconnected' || instance.status === 'error') && !instance.qr_code && (
                      <div className="animate-in fade-in duration-300 flex flex-col items-center">
                        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                          <WifiOff className="w-7 h-7 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-semibold mb-1">Desconectado</h3>
                        <p className="text-muted-foreground text-xs mb-6 max-w-[250px]">Esse chip caiu ou foi deslogado. Gere um novo QR Code caso queira usá-lo ou remova-o do sistema.</p>
                        <Button variant="outline" size="sm" className="text-red-500 hover:text-red-500 hover:bg-red-500/10 border-red-500/20 w-full max-w-[200px]" onClick={() => handleDeleteInstance(instance.id, instance.instance_name)} disabled={isConnecting}>
                          {isConnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} Excluir Instância
                        </Button>
                      </div>
                    )}

                    {instance.qr_code && (
                      <div className="space-y-4 animate-in zoom-in duration-300 flex flex-col items-center">
                        <p className="text-xs text-muted-foreground max-w-[250px]">Escaneie o código abaixo com o WhatsApp que deseja vincular a <strong>{instance.instance_name}</strong>.</p>
                        <div className="bg-white p-3 rounded-xl shadow-xl inline-block">
                          {instance.qr_code.includes('data:image') || instance.qr_code.length > 500 ? (
                            <img src={instance.qr_code.startsWith('data:image') ? instance.qr_code : `data:image/png;base64,${instance.qr_code}`} alt="QR Code" className="w-[180px] h-[180px]" />
                          ) : (
                            <QRCodeSVG value={instance.qr_code} size={180} />
                          )}
                        </div>
                        <p className="text-xs font-medium text-sky-500 animate-pulse flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> Aguardando leitura...
                        </p>
                        <Button variant="ghost" size="sm" className="mt-4 text-red-500 hover:text-red-500 hover:bg-red-500/10 w-full max-w-[180px]" onClick={() => handleDeleteInstance(instance.id, instance.instance_name)} disabled={isConnecting}>
                          {isConnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} Cancelar e Excluir
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

          </div>
        </TabsContent>

        <TabsContent value="rules" className="mt-0">
          {/* No-support warning for non-admin with external mode */}
          {!isAdmin && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <p className="text-xs text-amber-500/90">
                  <span className="font-semibold">Configuração exclusiva</span> — Estas automações são gerenciadas por você. O administrador não oferece suporte para configurações externas.
                </p>
              </div>
            </div>
          )}

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div>
                <CardTitle className="text-xl">Regras de Automação</CardTitle>
                <CardDescription>Defina quando e o que o bot deve enviar.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  onClick={async () => {
                    toast.info("Executando robô de automação...");
                    try {
                      const res = await fetch('/api/admin/force-cron', { method: 'POST' });
                      if (!res.ok) throw new Error("Erro na API");
                      toast.success("Robô executado! Verifique a aba Logs.");
                      loadLogs();
                    } catch(e) {
                      toast.error("Erro ao executar robô.");
                    }
                  }} 
                  size="sm" 
                  variant="outline" 
                  className="text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/10"
                >
                  <Play className="w-4 h-4 mr-1" /> Forçar Robô (Teste)
                </Button>
                <Button onClick={() => { setEditingRule(null); setRuleForm({ alert_type: "before_due", days_offset: -1, send_time: "09:00", message_template: getDefaultTemplate("before_due"), is_active: true }); setIsRuleDialogOpen(true); }} size="sm">
                  <Plus className="w-4 h-4 mr-1" /> Nova Regra
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {automations.length === 0 ? (
                <div className="text-center py-10">
                  <BellRing className="w-10 h-10 mx-auto text-muted-foreground mb-3 opacity-50" />
                  <p className="text-muted-foreground">Nenhuma regra de automação configurada.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo de Alerta</TableHead>
                      <TableHead>Quando</TableHead>
                      <TableHead>Impacto (Hoje)</TableHead>
                      <TableHead>Mensagem (Preview)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {automations.map(rule => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-muted/50 rounded-md">
                              {getRuleIcon(rule.alert_type)}
                            </div>
                            {rule.alert_type === 'before_due' ? 'Aviso Prévio' : 
                             rule.alert_type === 'on_due' ? 'No Dia do Vencimento' : 
                             rule.alert_type === 'after_due' ? 'Aviso de Atraso' : 
                             rule.alert_type === 'renewal' ? 'Renovação' : 
                             rule.alert_type === 'quick_message' ? 'Mensagem Rápida (1 Clique)' : 'Promoção'}
                          </div>
                        </TableCell>
                        <TableCell>
                          {(rule.alert_type === 'renewal' || rule.alert_type === 'promotion') 
                            ? <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-0">Disparo Imediato</Badge>
                            : rule.alert_type === 'quick_message'
                            ? <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-0">Ação Manual (Botão)</Badge>
                            : rule.alert_type === 'before_due' ? `${Math.abs(rule.days_offset || 1)} dia(s) antes às ${rule.send_time.slice(0,5)}` 
                            : rule.alert_type === 'after_due' ? `${Math.abs(rule.days_offset || 1)} dia(s) depois às ${rule.send_time.slice(0,5)}` 
                            : `No dia exato às ${rule.send_time.slice(0,5)}`
                          }
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-sky-500/5 border-sky-500/20 text-sky-600 dark:text-sky-400 gap-1 font-medium">
                            <Activity className="w-3 h-3" />
                            {ruleEstimates[rule.id] !== undefined ? ruleEstimates[rule.id] : '-'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
                          {rule.message_template}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={rule.is_active ? 'border-primary text-primary' : ''}>
                            {rule.is_active ? 'Ativa' : 'Pausada'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => { setEditingRule(rule); setRuleForm(rule); setIsRuleDialogOpen(true); }}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteRule(rule.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-0">
          <Card className="glass-card">
            <CardHeader className="pb-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-xl">Logs de Disparo</CardTitle>
                  <CardDescription>Acompanhe os alertas programados, enviados e falhas.</CardDescription>
                  {logFilter === 'pending' && logs.filter(l => l.status === 'pending').length > 0 && (
                    <div className="mt-2 text-xs text-amber-600 dark:text-amber-500 bg-amber-500/10 p-2 rounded-md border border-amber-500/20 flex items-start gap-2">
                      <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                      <p>
                        O horário agendado é o <strong>horário de início</strong>. Para proteger seu número contra banimentos do WhatsApp, as mensagens na fila são enviadas gradualmente respeitando o seu Delay Anti-Ban configurado ({antiBanConfig.min_delay} a {antiBanConfig.max_delay}s).
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-1 items-start sm:items-center">
                  <div className="flex flex-wrap gap-1 bg-muted/50 p-1 rounded-lg">
                    <Button variant={logFilter === 'pending' ? 'default' : 'ghost'} size="sm" onClick={() => setLogFilter('pending')} className="h-8">Em andamento</Button>
                    <Button variant={logFilter === 'sent' ? 'default' : 'ghost'} size="sm" onClick={() => setLogFilter('sent')} className="h-8">Sucesso</Button>
                    <Button variant={logFilter === 'failed' ? 'default' : 'ghost'} size="sm" onClick={() => setLogFilter('failed')} className="h-8">Erro</Button>
                    <Button variant={logFilter === 'all' ? 'default' : 'ghost'} size="sm" onClick={() => setLogFilter('all')} className="h-8 text-muted-foreground">Todos</Button>
                  </div>
                  
                  {/* Bulk Actions Menu */}
                  <div className="flex flex-wrap gap-1">
                    <Button variant="outline" size="sm" className="h-8 text-xs bg-red-500/5 hover:bg-red-500/10 text-red-500 border-red-500/20" onClick={() => handleBulkAction('clear_all')} disabled={isBulkActioning}>
                      <Trash2 className="w-3 h-3 mr-1" /> Limpar Histórico
                    </Button>
                    {logFilter === 'failed' && (
                      <Button variant="outline" size="sm" className="h-8 text-xs bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-500 border-emerald-500/20" onClick={() => handleBulkAction('resend_failed')} disabled={isBulkActioning}>
                        <RefreshCcw className="w-3 h-3 mr-1" /> Reenviar Todos
                      </Button>
                    )}
                    {logFilter === 'pending' && (
                      <Button variant="outline" size="sm" className="h-8 text-xs bg-amber-500/5 hover:bg-amber-500/10 text-amber-500 border-amber-500/20" onClick={() => handleBulkAction('cancel_pending')} disabled={isBulkActioning}>
                        <XCircle className="w-3 h-3 mr-1" /> Cancelar Todos
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLogsLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Alerta</TableHead>
                        <TableHead>Criado em</TableHead>
                        <TableHead>Programado</TableHead>
                        <TableHead>Finalizado</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.filter(l => logFilter === 'all' || l.status === logFilter).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                            <List className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            Nenhum log encontrado para este filtro.
                          </TableCell>
                        </TableRow>
                      ) : (
                        logs.filter(l => logFilter === 'all' || l.status === logFilter).map(log => (
                          <TableRow key={log.id}>
                            <TableCell className="font-medium whitespace-nowrap">{log.client?.name || 'Desconhecido'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {log.automation?.alert_type === 'before_due' ? 'Aviso Prévio' : 
                               log.automation?.alert_type === 'on_due' ? 'No Vencimento' : 
                               log.automation?.alert_type === 'after_due' ? 'Atraso' : 
                               log.automation?.alert_type === 'renewal' ? 'Renovação' : 'Promoção'}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {new Date(log.created_at).toLocaleString('pt-BR')}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {log.scheduled_at ? new Date(log.scheduled_at).toLocaleString('pt-BR') : '-'}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {log.sent_at ? new Date(log.sent_at).toLocaleString('pt-BR') : '-'}
                            </TableCell>
                            <TableCell>
                              {log.status === 'pending' && <Badge variant="outline" className="text-amber-500 border-amber-500/20 bg-amber-500/10">Na Fila</Badge>}
                              {log.status === 'sent' && <Badge variant="outline" className="text-emerald-500 border-emerald-500/20 bg-emerald-500/10">Sucesso</Badge>}
                              {log.status === 'failed' && (
                                <div className="flex flex-col gap-1">
                                  <Badge variant="outline" className="text-red-500 border-red-500/20 bg-red-500/10 w-fit">Falhou</Badge>
                                  <span className="text-[10px] text-red-500 max-w-[150px] truncate" title={log.error_message || ''}>{log.error_message}</span>
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              {log.status !== 'sent' && (
                                <Button variant="ghost" size="icon" title="Reenviar/Tentar novamente" onClick={() => handleResendLog(log.id)}>
                                  <RefreshCcw className="w-4 h-4 text-emerald-500" />
                                </Button>
                              )}
                              {log.status === 'pending' && (
                                <Button variant="ghost" size="icon" title="Cancelar envio" onClick={() => handleCancelLog(log.id)}>
                                  <XCircle className="w-4 h-4 text-amber-500" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" title="Excluir log" onClick={() => handleDeleteLog(log.id)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mass" className="mt-0">
          <Card className="glass-card max-w-3xl mx-auto">
            <CardHeader>
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 mb-4 mx-auto">
                <Bot className="w-6 h-6 text-emerald-500" />
              </div>
              <CardTitle className="text-center text-xl">Disparo em Massa</CardTitle>
              <CardDescription className="text-center">
                Envie mensagens automáticas para grupos de clientes de uma só vez (promoções, cobranças, etc).
                O sistema respeitará um intervalo entre as mensagens para evitar bloqueios no WhatsApp.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Público-Alvo</Label>
                <Select value={massAudience} onValueChange={(v) => setMassAudience(v ?? "all")}>
                  <SelectTrigger className="w-full bg-background/50">
                    <SelectValue placeholder="Selecione quem receberá a mensagem">
                      {massAudience === 'all' && 'Todos os Clientes (com telefone válido)'}
                      {massAudience === 'active' && 'Apenas Clientes Ativos'}
                      {massAudience === 'inactive' && 'Apenas Clientes Inativos'}
                      {massAudience === 'expired' && 'Clientes com Vencimento Atrasado'}
                      {massAudience === 'service' && 'Clientes de um Serviço Específico'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Clientes (com telefone válido)</SelectItem>
                    <SelectItem value="active">Apenas Clientes Ativos</SelectItem>
                    <SelectItem value="inactive">Apenas Clientes Inativos</SelectItem>
                    <SelectItem value="expired">Clientes com Vencimento Atrasado</SelectItem>
                    <SelectItem value="service">Clientes de um Serviço Específico</SelectItem>
                  </SelectContent>
                </Select>
                {estimatedAudience !== null && (
                  <div className="mt-2 flex items-center gap-2 text-sm bg-sky-500/10 text-sky-600 dark:text-sky-400 p-3 rounded-lg border border-sky-500/20">
                    <Target className="w-4 h-4 flex-shrink-0" />
                    <span><strong>🎯 Público Estimado:</strong> {estimatedAudience} cliente{estimatedAudience !== 1 && 's'} receberão esta mensagem.</span>
                  </div>
                )}
              </div>

              {massAudience === 'service' && (
                <div className="space-y-2 animate-in fade-in zoom-in duration-300">
                  <Label>Selecione o Serviço</Label>
                  <Select value={massServiceId} onValueChange={(v) => setMassServiceId(v ?? "")}>
                    <SelectTrigger className="w-full bg-background/50">
                      <SelectValue placeholder="Escolha um serviço...">
                        {services.find(s => s.id === massServiceId)?.name}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {services.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Mensagem</Label>
                <Textarea 
                  className="min-h-[150px] bg-background/50 resize-y"
                  value={massMessage}
                  onChange={(e) => setMassMessage(e.target.value)}
                  placeholder="Escreva sua mensagem aqui..."
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Variáveis suportadas: <code className="bg-muted px-1 rounded text-primary">{"{{"}primeiro_nome{"}}"}</code>, <code className="bg-muted px-1 rounded text-primary">{"{{"}client_name{"}}"}</code>, <code className="bg-muted px-1 rounded text-primary">{"{{"}plan_value{"}}"}</code>, <code className="bg-muted px-1 rounded text-primary">{"{{"}due_date{"}}"}</code>
                </p>
              </div>

              <div className="space-y-2 mt-4 p-4 border rounded-xl bg-muted/20">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-primary" />
                  <Label>Agendar Disparo (Opcional)</Label>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  Deixe em branco para enviar imediatamente, ou escolha uma data futura.
                </p>
                <Input 
                  type="datetime-local" 
                  className="bg-background/50"
                  value={scheduledAt ? new Date(scheduledAt.getTime() - scheduledAt.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""}
                  onChange={(e) => setScheduledAt(e.target.value ? new Date(e.target.value) : null)}
                  min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                />
              </div>
            </CardContent>
            <CardFooter className="bg-muted/10 border-t flex flex-col items-stretch pt-6 gap-4">
              <Button 
                onClick={handleSendMass} 
                disabled={isSendingMass || status !== 'connected' || (massAudience === 'service' && !massServiceId)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isSendingMass ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bot className="w-4 h-4 mr-2" />}
                {status !== 'connected' ? "WhatsApp Desconectado" : "Iniciar Disparo em Massa"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Rule Dialog */}
      <Dialog open={isRuleDialogOpen} onOpenChange={setIsRuleDialogOpen}>
        <DialogContent className="glass-card sm:max-w-[550px] border-primary/20 overflow-hidden">
          <DialogHeader className="relative">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
            <DialogTitle className="flex items-center gap-3 text-xl">
               <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                 <Bot className="w-5 h-5 text-primary" />
               </div>
               {editingRule ? 'Editar Regra de Automação' : 'Nova Regra de Automação'}
            </DialogTitle>
            <DialogDescription className="pt-3 text-base">
              Configure os detalhes do disparo automático para seus clientes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-4 relative z-10">
            <div className="space-y-2">
              <Label className="text-foreground font-medium">Gatilho do Alerta</Label>
              <Select value={ruleForm.alert_type} onValueChange={(v) => {
                const type = v ?? 'before_due'
                setRuleForm({
                  ...ruleForm, 
                  alert_type: type,
                  message_template: getDefaultTemplate(type)
                })
              }}>
                <SelectTrigger className="w-full bg-background/80 h-10 border-border/50 focus:ring-primary/30 focus:border-primary/50">
                  <SelectValue>
                    {ruleForm.alert_type === 'before_due' && '⏳ Antes do Vencimento'}
                    {ruleForm.alert_type === 'on_due' && '⚠️ No Dia do Vencimento'}
                    {ruleForm.alert_type === 'after_due' && '❌ Após Vencimento (Atraso)'}
                    {ruleForm.alert_type === 'renewal' && '✅ Agradecimento de Renovação'}
                    {ruleForm.alert_type === 'promotion' && '🚀 Disparo de Promoção'}
                    {ruleForm.alert_type === 'quick_message' && '⚡ Mensagem Rápida (Botão)'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="before_due">⏳ Antes do Vencimento</SelectItem>
                  <SelectItem value="on_due">⚠️ No Dia do Vencimento</SelectItem>
                  <SelectItem value="after_due">❌ Após Vencimento (Atraso)</SelectItem>
                  <SelectItem value="renewal">✅ Agradecimento de Renovação</SelectItem>
                  <SelectItem value="promotion">🚀 Disparo de Promoção</SelectItem>
                  <SelectItem value="quick_message">⚡ Mensagem Rápida (Botão)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {(ruleForm.alert_type === 'before_due' || ruleForm.alert_type === 'after_due') && (
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">Dias de Diferença</Label>
                  <Input 
                    type="number" 
                    value={Math.abs(ruleForm.days_offset)} 
                    onChange={e => {
                      const val = Number(e.target.value)
                      setRuleForm({
                        ...ruleForm, 
                        days_offset: ruleForm.alert_type === 'before_due' ? -val : val
                      })
                    }}
                    className="bg-background/80 h-10 border-border/50 focus-visible:ring-primary/50"
                    min={1}
                    max={30}
                  />
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    Quantos dias {ruleForm.alert_type === 'before_due' ? 'antes' : 'depois'} da fatura?
                  </p>
                </div>
              )}
              
              {ruleForm.alert_type !== 'quick_message' && (
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">Horário Padrão</Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      type="time" 
                      value={ruleForm.send_time} 
                      onChange={e => setRuleForm({...ruleForm, send_time: e.target.value})}
                      className="bg-background/80 h-10 pl-9 border-border/50 focus-visible:ring-primary/50"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight">Que horas enviar?</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-foreground font-medium">Template da Mensagem</Label>
              </div>
              <Textarea 
                value={ruleForm.message_template} 
                onChange={e => setRuleForm({...ruleForm, message_template: e.target.value})}
                className="min-h-[120px] resize-none bg-background/80 border-border/50 focus-visible:ring-primary/50 text-sm leading-relaxed p-3"
                placeholder="Escreva sua mensagem aqui..."
              />
              <div className="bg-primary/5 border border-primary/10 rounded-lg p-3 mt-2">
                <p className="text-xs text-primary/80 font-medium mb-2">Variáveis Inteligentes (Copie e Cole):</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="bg-background cursor-pointer hover:bg-primary hover:text-white transition-colors select-all border-primary/20 text-primary">{"{{primeiro_nome}}"}</Badge>
                  <Badge variant="outline" className="bg-background cursor-pointer hover:bg-primary hover:text-white transition-colors select-all border-primary/20 text-primary">{"{{client_name}}"}</Badge>
                  <Badge variant="outline" className="bg-background cursor-pointer hover:bg-primary hover:text-white transition-colors select-all border-primary/20 text-primary">{"{{plan_value}}"}</Badge>
                  <Badge variant="outline" className="bg-background cursor-pointer hover:bg-primary hover:text-white transition-colors select-all border-primary/20 text-primary">{"{{due_date}}"}</Badge>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-background/40">
              <div className="space-y-0.5">
                <Label className="text-base">Regra Ativa</Label>
                <p className="text-sm text-muted-foreground">Se desativado, o bot irá ignorar este alerta.</p>
              </div>
              <Switch 
                checked={ruleForm.is_active} 
                onCheckedChange={v => setRuleForm({...ruleForm, is_active: v})} 
              />
            </div>
          </div>

          <DialogFooter className="pt-6 relative z-10 border-t border-border/50 mt-4">
            <Button variant="outline" onClick={() => setIsRuleDialogOpen(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={handleRuleSubmit} disabled={isSubmittingRule} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20">
              {isSubmittingRule ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bot className="w-4 h-4 mr-2" />}
              Salvar Regra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Connection Dialog */}
      <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
        <DialogContent className="glass-card sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Disparo de Teste</DialogTitle>
            <DialogDescription>
              Envie uma mensagem de teste para o seu próprio WhatsApp para verificar se a conexão está funcionando.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Seu Número de WhatsApp (com DDD)</Label>
              <Input 
                placeholder="Ex: 11999999999" 
                value={testPhone} 
                onChange={e => setTestPhone(e.target.value)} 
                className="bg-background/50"
              />
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setIsTestDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleTestConnection} disabled={isTestingPhone}>
              {isTestingPhone && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar Teste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PricingModal open={isPricingModalOpen} onOpenChange={setIsPricingModalOpen} />
    </div>
  )
}

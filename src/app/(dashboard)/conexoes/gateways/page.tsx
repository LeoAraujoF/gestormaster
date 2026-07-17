"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Sparkles, CreditCard, CheckCircle2, AlertCircle, Copy, Check, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useConfirm } from "@/components/providers/confirm-provider"
import { ConnectionsNavigation } from "@/components/connections-navigation"
import { PageHeader, PageShell } from "@/components/page-layout"

const AVAILABLE_INTEGRATIONS = [
  {
    id: "mercadopago",
    name: "Mercado Pago",
    description: "PIX automático + baixa de pagamento",
    initials: "MP",
    color: "text-[#009EE3]",
    bg: "bg-[#009EE3]/10",
    fields: [
      { key: "access_token", label: "Access Token (Mercado Pago)", type: "password", placeholder: "APP_USR-..." }
    ]
  },
  {
    id: "typebot",
    name: "Typebot",
    description: "Fluxos visuais e atendimento automatizado",
    initials: "TB",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    fields: [
      { key: "viewer_url", label: "URL do Viewer (Typebot)", type: "url", placeholder: "https://viewer.typebot.io" },
      { key: "typebot_name", label: "Nome Público do Typebot", type: "text", placeholder: "meu-fluxo-v1" }
    ]
  },
  {
    id: "ai_assistant",
    name: "Assistente de I.A.",
    description: "Robô super inteligente (OpenAI, Groq)",
    initials: "IA",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    fields: [
      { key: "api_key", label: "API Key (Chave do Provedor)", type: "password", placeholder: "sk-..." },
      { key: "model", label: "Modelo (Ex: gpt-4o, llama3-70b)", type: "text", placeholder: "gpt-4o-mini" },
      { key: "prompt", label: "Prompt Base do Robô", type: "text", placeholder: "Você é um atendente simpático..." }
    ]
  }
]

export default function GatewaysPage() {
  const confirm = useConfirm()
  const supabase = createClient()
  
  const [userId, setUserId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  
  const [integrations, setIntegrations] = useState<any[]>([])
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [isIntegrationModalOpen, setIsIntegrationModalOpen] = useState(false)
  const [integrationFormData, setIntegrationFormData] = useState<Record<string, string>>({})
  const [isSavingIntegration, setIsSavingIntegration] = useState(false)
  const [copiedWebhook, setCopiedWebhook] = useState(false)

  const [apiKeys, setApiKeys] = useState<any[]>([])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const resIntegrations = await fetch('/api/integrations')
      if (resIntegrations.ok) {
        const dataInt = await resIntegrations.json()
        setIntegrations(dataInt.integrations || [])
      }
      
      const { data: keys } = await supabase.from('api_keys').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      if (keys) setApiKeys(keys)
      
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const getIntegrationData = (providerId: string) => integrations.find(i => i.provider === providerId)

  const handleOpenIntegrationModal = (providerId: string) => {
    const existingData = getIntegrationData(providerId)
    setSelectedProvider(providerId)
    setIntegrationFormData(existingData ? existingData.credentials : {})
    setIsIntegrationModalOpen(true)
  }

  const handleSaveIntegration = async () => {
    if (!selectedProvider) return
    setIsSavingIntegration(true)
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          credentials: integrationFormData,
          is_active: true
        })
      })
      if (res.ok) {
        toast.success("Integração conectada com sucesso!")
        loadData()
        setIsIntegrationModalOpen(false)
      } else {
        toast.error("Erro ao conectar integração.")
      }
    } catch (e) {
      toast.error("Erro interno ao salvar integração.")
    } finally {
      setIsSavingIntegration(false)
    }
  }

  const handleDisconnectIntegration = async (providerId: string) => {
    if (!await confirm({ title: "Desconectar Integração", description: "Certeza?", variant: "warning" })) return
    try {
      const res = await fetch(`/api/integrations?provider=${providerId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success("Integração removida.")
        loadData()
      } else {
        toast.error("Erro ao remover integração.")
      }
    } catch (e) {
      toast.error("Erro ao remover.")
    }
  }
  
  const handleGenerateKey = async () => {
      try {
        const res = await fetch('/api/admin/apikeys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Chave de API Principal' })
        })
        if (res.ok) {
          toast.success("Chave gerada com sucesso!")
          loadData()
        } else {
          toast.error("Erro ao gerar chave.")
        }
      } catch (e) {
        toast.error("Erro interno.")
      }
  }
  
  const handleRevokeKey = async (id: string) => {
      if (!await confirm({ title: "Revogar chave?", description: "Isso quebrará as integrações atuais.", variant: "warning" })) return
      try {
        const res = await fetch(`/api/admin/apikeys?id=${id}`, { method: 'DELETE' })
        if (res.ok) {
          toast.success("Chave revogada.")
          loadData()
        }
      } catch (e) {
         toast.error("Erro ao revogar chave.")
      }
  }

  const activeProviderDef = AVAILABLE_INTEGRATIONS.find(i => i.id === selectedProvider)
  const mpIntegration = getIntegrationData("mercadopago")

  return (
    <PageShell width="default">
      <PageHeader eyebrow="Integrações" title="Gateways e API" description="Acompanhe conexões, identifique configurações pendentes e gerencie credenciais com segurança." badge={`${integrations.filter((item) => item.is_active).length} ativas`} />
      <ConnectionsNavigation active="gateways" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* PAGAMENTOS / GATEWAYS */}
        <div className="space-y-4">
          <h2 className="microlabel text-muted-foreground uppercase">Pagamentos & Gatilhos</h2>
          
          <div className="space-y-3">
            {/* Mercado Pago */}
            {mpIntegration && mpIntegration.is_active ? (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="size-10 bg-[#009EE3]/10 text-[#009EE3] rounded-lg flex items-center justify-center font-bold text-[13px]">
                      MP
                    </div>
                    <div>
                      <h3 className="font-semibold text-[15px]">Mercado Pago</h3>
                      <p className="text-[12px] text-muted-foreground truncate max-w-[160px]">PIX automático</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500">
                      <span className="size-1.5 rounded-full bg-emerald-500"></span> Ativo
                    </div>
                    <button onClick={() => handleOpenIntegrationModal('mercadopago')} className="text-[10px] text-muted-foreground hover:text-foreground hover:underline">Configurar</button>
                  </div>
                </div>
              </div>
            ) : (
              <button 
                onClick={() => handleOpenIntegrationModal('mercadopago')}
                className="w-full rounded-xl border border-dashed border-border bg-card/50 p-4 text-[13px] font-medium text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
              >
                + Conectar Mercado Pago
              </button>
            )}
            
            {/* Typebot */}
            {getIntegrationData('typebot')?.is_active ? (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="size-10 bg-blue-500/10 text-blue-500 rounded-lg flex items-center justify-center font-bold text-[13px]">
                      TB
                    </div>
                    <div>
                      <h3 className="font-semibold text-[15px]">Typebot</h3>
                      <p className="text-[12px] text-muted-foreground truncate max-w-[160px]">Fluxos visuais</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500">
                      <span className="size-1.5 rounded-full bg-emerald-500"></span> Ativo
                    </div>
                    <button onClick={() => handleOpenIntegrationModal('typebot')} className="text-[10px] text-muted-foreground hover:text-foreground hover:underline">Configurar</button>
                  </div>
                </div>
              </div>
            ) : (
                <button 
                onClick={() => handleOpenIntegrationModal('typebot')}
                className="w-full rounded-xl border border-dashed border-border bg-card/50 p-4 text-[13px] font-medium text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
              >
                + Conectar Typebot
              </button>
            )}
            
            {/* OpenAI / Groq */}
            {getIntegrationData('ai_assistant')?.is_active ? (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="size-10 bg-emerald-500/10 text-emerald-500 rounded-lg flex items-center justify-center font-bold text-[13px]">
                      IA
                    </div>
                    <div>
                      <h3 className="font-semibold text-[15px]">Assistente de I.A.</h3>
                      <p className="text-[12px] text-muted-foreground truncate max-w-[160px]">Atendimento robô</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500">
                      <span className="size-1.5 rounded-full bg-emerald-500"></span> Ativo
                    </div>
                    <button onClick={() => handleOpenIntegrationModal('ai_assistant')} className="text-[10px] text-muted-foreground hover:text-foreground hover:underline">Configurar</button>
                  </div>
                </div>
              </div>
            ) : (
                <button 
                onClick={() => handleOpenIntegrationModal('ai_assistant')}
                className="w-full rounded-xl border border-dashed border-border bg-card/50 p-4 text-[13px] font-medium text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
              >
                + Conectar I.A.
              </button>
            )}
          </div>
        </div>

        {/* API DESENVOLVEDOR */}
        <div className="space-y-4">
          <h2 className="microlabel text-muted-foreground uppercase">API &middot; Desenvolvedor</h2>
          
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-[15px]">Chaves de API</h3>
                <p className="text-[12px] text-muted-foreground">N8N, Typebot, Make</p>
              </div>
              {!apiKeys.length && (
                <button onClick={handleGenerateKey} className="text-[12px] font-semibold text-interactive hover:underline">
                  + Gerar
                </button>
              )}
            </div>
            
            {apiKeys.length > 0 ? (
              apiKeys.map(k => (
                <div key={k.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg bg-secondary/50 p-3 mt-2">
                  <code className="text-[12px] font-mono text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap max-w-[180px]">
                    {k.key.substring(0, 8)}...{k.key.substring(k.key.length - 4)}
                  </code>
                  <div className="flex items-center gap-3 shrink-0">
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(k.key)
                        toast.success("Chave copiada!")
                      }} 
                      className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                    >
                      copiar
                    </button>
                    <button onClick={() => handleRevokeKey(k.id)} className="text-[11px] font-medium text-red-500 hover:text-red-600">
                      revogar
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center rounded-lg bg-secondary/30 p-3 text-[12px] text-muted-foreground">
                Nenhuma chave ativa.
              </div>
            )}
          </div>
        </div>
        
      </div>

      <Dialog open={isIntegrationModalOpen} onOpenChange={setIsIntegrationModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {activeProviderDef ? `Configurar ${activeProviderDef.name}` : 'Configurar'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
             {activeProviderDef?.fields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  type={field.type}
                  placeholder={field.placeholder}
                  value={integrationFormData[field.key] || ""}
                  onChange={(e) => setIntegrationFormData({ ...integrationFormData, [field.key]: e.target.value })}
                />
              </div>
            ))}
            
            {activeProviderDef?.id === 'mercadopago' && userId && (
              <div className="mt-2 p-3 bg-muted/50 border border-border/50 rounded-lg space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Configuração no Mercado Pago</p>
                <p className="text-[10px] text-muted-foreground">Copie a URL abaixo e cole no campo "Notificações Webhook" do Mercado Pago.</p>
                <div className="flex items-center gap-2 mt-1">
                  <Input readOnly className="h-8 text-xs bg-background/50 font-mono" value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/mercadopago?orgId=${userId}`} />
                  <Button 
                    type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" 
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/mercadopago?orgId=${userId}`)
                      setCopiedWebhook(true)
                      setTimeout(() => setCopiedWebhook(false), 2000)
                    }}
                  >
                    {copiedWebhook ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex items-center justify-between w-full">
            {getIntegrationData(activeProviderDef?.id || '')?.is_active ? (
              <Button type="button" variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-500/10" onClick={() => { setIsIntegrationModalOpen(false); handleDisconnectIntegration(activeProviderDef!.id); }}>
                Desconectar
              </Button>
            ) : <div />}
            <div className="flex items-center gap-2">
               <Button variant="outline" onClick={() => setIsIntegrationModalOpen(false)}>Cancelar</Button>
               <Button onClick={handleSaveIntegration} disabled={isSavingIntegration}>
                 {isSavingIntegration ? "Salvando..." : "Salvar"}
               </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
    </PageShell>
  )
}

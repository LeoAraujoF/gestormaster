"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { format } from "date-fns"
import { toast } from "sonner"
import { Sparkles, CreditCard, CheckCircle2, AlertCircle, Copy, Check, Bot, KeyRound, Plus, Lock, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
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

type ApiKey = {
  id: string
  name: string
  created_at: string
  last_used_at: string | null
}

// "loading" | "ready" (lista carregada) | "locked" (plano sem developer_api)
// | "missing" (tabela api_keys ainda não criada) | "error"
type KeysStatus = "loading" | "ready" | "locked" | "missing" | "error"

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

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [keysStatus, setKeysStatus] = useState<KeysStatus>("loading")
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [isCreatingKey, setIsCreatingKey] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)

  const fetchApiKeys = async () => {
    try {
      const res = await fetch('/api/developer/keys')
      if (res.status === 403) {
        setApiKeys([])
        setKeysStatus("locked")
        return
      }
      if (!res.ok) {
        setKeysStatus("error")
        return
      }
      const data = await res.json()
      if (data.missingTable) {
        setApiKeys([])
        setKeysStatus("missing")
        return
      }
      setApiKeys(data.keys || [])
      setKeysStatus("ready")
    } catch (e) {
      console.error(e)
      setKeysStatus("error")
    }
  }

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

      await fetchApiKeys()

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
  
  const handleOpenKeyModal = () => {
    setNewKeyName("")
    setCreatedKey(null)
    setCopiedKey(false)
    setIsKeyModalOpen(true)
  }

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast.error("Dê um nome para identificar esta chave.")
      return
    }
    setIsCreatingKey(true)
    try {
      const res = await fetch('/api/developer/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setCreatedKey(data.key.plainToken)
        setNewKeyName("")
        toast.success("Chave gerada com sucesso!")
        fetchApiKeys()
      } else {
        toast.error(data.error || "Erro ao gerar chave.")
      }
    } catch (e) {
      toast.error("Erro interno ao gerar chave.")
    } finally {
      setIsCreatingKey(false)
    }
  }

  const handleCopyCreatedKey = () => {
    if (!createdKey) return
    navigator.clipboard.writeText(createdKey)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
    toast.success("Chave copiada.")
  }

  const handleRevokeKey = async (key: ApiKey) => {
      if (!await confirm({
        title: "Revogar chave?",
        description: `"${key.name}" deixará de funcionar imediatamente e as automações que a usam vão parar.`,
        variant: "destructive"
      })) return
      try {
        const res = await fetch(`/api/developer/keys?id=${key.id}`, { method: 'DELETE' })
        if (res.ok) {
          toast.success("Chave revogada.")
          fetchApiKeys()
        } else {
          toast.error("Erro ao revogar chave.")
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
              <div className="rounded-[16px] border border-border bg-card p-4">
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
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-money">
                      <span className="status-dot bg-money"></span> Ativo
                    </div>
                    <button onClick={() => handleOpenIntegrationModal('mercadopago')} className="text-[10px] text-muted-foreground hover:text-foreground hover:underline">Configurar</button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => handleOpenIntegrationModal('mercadopago')}
                className="w-full rounded-[16px] border border-dashed border-border bg-card/50 p-4 text-[13px] font-medium text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
              >
                + Conectar Mercado Pago
              </button>
            )}

            {/* Typebot */}
            {getIntegrationData('typebot')?.is_active ? (
              <div className="rounded-[16px] border border-border bg-card p-4">
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
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-money">
                      <span className="status-dot bg-money"></span> Ativo
                    </div>
                    <button onClick={() => handleOpenIntegrationModal('typebot')} className="text-[10px] text-muted-foreground hover:text-foreground hover:underline">Configurar</button>
                  </div>
                </div>
              </div>
            ) : (
                <button
                onClick={() => handleOpenIntegrationModal('typebot')}
                className="w-full rounded-[16px] border border-dashed border-border bg-card/50 p-4 text-[13px] font-medium text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
              >
                + Conectar Typebot
              </button>
            )}

            {/* OpenAI / Groq */}
            {getIntegrationData('ai_assistant')?.is_active ? (
              <div className="rounded-[16px] border border-border bg-card p-4">
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
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-money">
                      <span className="status-dot bg-money"></span> Ativo
                    </div>
                    <button onClick={() => handleOpenIntegrationModal('ai_assistant')} className="text-[10px] text-muted-foreground hover:text-foreground hover:underline">Configurar</button>
                  </div>
                </div>
              </div>
            ) : (
                <button
                onClick={() => handleOpenIntegrationModal('ai_assistant')}
                className="w-full rounded-[16px] border border-dashed border-border bg-card/50 p-4 text-[13px] font-medium text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
              >
                + Conectar I.A.
              </button>
            )}
          </div>
        </div>

        {/* API DESENVOLVEDOR */}
        <div className="space-y-4">
          <h2 className="microlabel text-muted-foreground uppercase">API &middot; Desenvolvedor</h2>
          
          <div className="overflow-hidden rounded-[16px] border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-secondary text-secondary-foreground">
                  <KeyRound className="size-[15px]" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-[14px]">Chaves de API</h3>
                  <p className="text-[11px] text-muted-foreground">N8N, Typebot, Make</p>
                </div>
              </div>
              {keysStatus === "ready" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-[30px] shrink-0 gap-1.5 px-2.5 text-[11.5px] font-medium"
                  onClick={handleOpenKeyModal}
                >
                  <Plus className="size-3" aria-hidden="true" />
                  Gerar
                </Button>
              )}
            </div>

            {keysStatus === "loading" ? (
              <div className="p-6 space-y-2" aria-busy="true">
                <div className="h-[52px] animate-pulse rounded-[9px] bg-secondary" />
                <div className="h-[52px] animate-pulse rounded-[9px] bg-secondary" />
                <span className="sr-only">Carregando chaves de API</span>
              </div>
            ) : keysStatus === "locked" ? (
              <div className="p-6 text-center">
                <span className="mx-auto flex size-9 items-center justify-center rounded-[10px] bg-secondary text-secondary-foreground">
                  <Lock className="size-4" aria-hidden="true" />
                </span>
                <p className="mt-3 text-[12.5px] font-semibold text-foreground">Disponível no plano Master</p>
                <p className="mt-1 text-[11px] text-muted-foreground">A API de desenvolvedor libera chaves para N8N, Make e scripts próprios.</p>
              </div>
            ) : keysStatus === "missing" || keysStatus === "error" ? (
              <div className="p-6 text-center">
                <span className="mx-auto flex size-9 items-center justify-center rounded-[10px] bg-warning-bg text-warning-fg">
                  <TriangleAlert className="size-4" aria-hidden="true" />
                </span>
                <p className="mt-3 text-[12.5px] font-semibold text-foreground">
                  {keysStatus === "missing" ? "Recurso ainda não habilitado" : "Não foi possível carregar as chaves"}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {keysStatus === "missing"
                    ? "A tabela de chaves de API ainda não existe neste banco. Fale com o suporte."
                    : "Tente novamente em instantes."}
                </p>
              </div>
            ) : apiKeys.length > 0 ? (
              <ul className="divide-y divide-border">
                {apiKeys.map(k => (
                  <li key={k.id} className="flex flex-col gap-2.5 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-semibold text-foreground">{k.name}</p>
                      <p className="microlabel mt-1.5 text-muted-foreground">chave oculta · visível só na criação</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1">
                        <span className="num text-[10px] text-muted-foreground">
                          criada {format(new Date(k.created_at), "dd/MM/yyyy")}
                        </span>
                        <span className="num text-[10px] text-muted-foreground">
                          último uso {k.last_used_at ? format(new Date(k.last_used_at), "dd/MM/yyyy") : "nunca"}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevokeKey(k)}
                      className="h-7 shrink-0 self-start rounded-md px-2 text-[11px] font-semibold text-danger hover:bg-danger-bg sm:self-auto"
                    >
                      revogar
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-6 text-center">
                <p className="text-[12.5px] font-semibold text-foreground">Nenhuma chave ativa</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Gere uma chave para conectar N8N, Make ou seus próprios scripts.</p>
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
                    {copiedWebhook ? <Check className="w-4 h-4 text-money" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex items-center justify-between w-full">
            {getIntegrationData(activeProviderDef?.id || '')?.is_active ? (
              <Button type="button" variant="ghost" className="text-danger hover:text-danger hover:bg-danger-bg" onClick={() => { setIsIntegrationModalOpen(false); handleDisconnectIntegration(activeProviderDef!.id); }}>
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

      <Dialog open={isKeyModalOpen} onOpenChange={setIsKeyModalOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Nova chave de API</DialogTitle>
            <DialogDescription>A chave completa aparece uma única vez.</DialogDescription>
          </DialogHeader>

          {createdKey ? (
            <div className="rounded-[10px] border border-warning-border bg-warning-bg p-3">
              <p className="text-[11px] font-semibold text-warning-fg">Copie agora — não será exibida novamente</p>
              <code className="mt-2 block break-all rounded-md bg-card p-2.5 font-mono text-[11px] text-foreground">
                {createdKey}
              </code>
              <Button
                type="button"
                variant="outline"
                className="mt-2.5 h-8 w-full text-[11.5px] font-medium"
                onClick={handleCopyCreatedKey}
              >
                {copiedKey ? <Check className="size-3.5 text-money" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
                {copiedKey ? "Copiado!" : "Copiar chave"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-1">
              <div className="space-y-2">
                <Label htmlFor="new-api-key-name">Nome da chave</Label>
                <Input
                  id="new-api-key-name"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Ex: Automação N8N"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter" && !isCreatingKey) handleCreateKey() }}
                />
              </div>
              <div className="rounded-[10px] border border-border bg-secondary/40 p-3">
                <p className="microlabel text-muted-foreground">Permissão</p>
                <p className="mt-1 text-[11.5px] text-secondary-foreground">
                  Acesso total à API — o envio de mensagens é autenticado por <code className="font-mono">Bearer</code> nesta chave.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsKeyModalOpen(false)}>
              {createdKey ? "Já copiei e guardei" : "Cancelar"}
            </Button>
            {!createdKey && (
              <Button onClick={handleCreateKey} disabled={isCreatingKey}>
                {isCreatingKey ? "Gerando..." : "Gerar chave"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </PageShell>
  )
}

"use client"

import { useEffect, useState } from "react"
import { Plug, Bot, Sparkles, CreditCard, ChevronRight, CheckCircle2, AlertCircle, Tv } from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { useFeatureFlags } from "@/components/providers/feature-flags-provider"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

const AVAILABLE_INTEGRATIONS = [
  {
    id: "ai_assistant",
    name: "Assistente de I.A. Universal",
    description: "Crie um robô super inteligente com OpenAI (ChatGPT), Anthropic, Groq ou DeepSeek.",
    icon: Sparkles,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    fields: [
      { key: "api_key", label: "API Key (Chave do Provedor)", type: "password", placeholder: "sk-..." },
      { key: "model", label: "Modelo (Ex: gpt-4o, llama3-70b)", type: "text", placeholder: "gpt-4o-mini" },
      { key: "base_url", label: "Base URL (Opcional - Para provedores customizados)", type: "url", placeholder: "https://api.groq.com/openai/v1" },
      { key: "prompt", label: "Prompt Base do Robô", type: "text", placeholder: "Você é um atendente simpático da empresa X..." }
    ]
  },
  {
    id: "typebot",
    name: "Typebot",
    description: "Conecte seus fluxos visuais do Typebot para capturar leads e automatizar o atendimento passo a passo.",
    icon: Bot,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    fields: [
      { key: "viewer_url", label: "URL do Viewer (Typebot)", type: "url", placeholder: "https://viewer.typebot.io" },
      { key: "typebot_name", label: "Nome Público do Typebot", type: "text", placeholder: "meu-fluxo-v1" }
    ]
  },
  {
    id: "mercadopago",
    name: "Mercado Pago",
    description: "Emita cobranças, gere links de Pix e envie recibos automáticos para seus clientes via WhatsApp.",
    icon: CreditCard,
    color: "text-sky-500",
    bg: "bg-sky-500/10",
    fields: [
      { key: "access_token", label: "Access Token (Mercado Pago)", type: "password", placeholder: "APP_USR-..." }
    ]
  },
  {
    id: "tvdc_iptv",
    name: "Painel TVdeCasa",
    description: "Sincronize seus clientes, datas de vencimento e senhas diretamente do seu painel IPTV.",
    icon: Tv,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    isRedirect: true,
    redirectUrl: "/integracoes/paineis",
    fields: []
  }
]

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [missingTable, setMissingTable] = useState(false)
  
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [servicesList, setServicesList] = useState<any[]>([])
  const supabase = createClient()
  const router = useRouter()
  const { flags } = useFeatureFlags()

  const fetchServices = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('services').select('id, name, cost').eq('user_id', user.id)
    if (data) setServicesList(data)
  }

  const fetchIntegrations = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/integrations')
      if (res.ok) {
        const data = await res.json()
        if (data.missingTable) {
          setMissingTable(true)
        } else {
          setIntegrations(data.integrations || [])
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchIntegrations()
    fetchServices()
  }, [])

  const getIntegrationData = (providerId: string) => {
    return integrations.find(i => i.provider === providerId)
  }

  const handleOpenModal = (providerId: string) => {
    const providerDef = AVAILABLE_INTEGRATIONS.find(p => p.id === providerId)
    if (providerDef?.isRedirect) {
      router.push(providerDef.redirectUrl!)
      return
    }
    const existingData = getIntegrationData(providerId)
    setSelectedProvider(providerId)
    setFormData(existingData ? existingData.credentials : {})
    setIsModalOpen(true)
  }

  const handleToggleActive = async (providerId: string, isActive: boolean) => {
    const existingData = getIntegrationData(providerId)
    if (!existingData) return
    
    setIsSaving(true)
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: providerId,
          credentials: existingData.credentials,
          is_active: isActive
        })
      })
      if (res.ok) {
        toast.success(`Integração ${isActive ? 'ativada' : 'pausada'}.`)
        fetchIntegrations()
      } else {
        toast.error("Erro ao alterar status.")
      }
    } catch (e) {
      toast.error("Erro interno.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleSave = async () => {
    if (!selectedProvider) return
    setIsSaving(true)

    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          credentials: formData,
          is_active: true
        })
      })
      const data = await res.json()

      if (res.ok && data.success) {
        toast.success("Integração conectada com sucesso!")
        fetchIntegrations()
        setIsModalOpen(false)
      } else {
        toast.error(data.error || "Erro ao conectar integração.")
      }
    } catch (e) {
      toast.error("Erro interno ao salvar.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDisconnect = async (providerId: string) => {
    if (!confirm("Tem certeza que deseja desconectar esta integração?")) return

    try {
      const res = await fetch(`/api/integrations?provider=${providerId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success("Integração removida.")
        fetchIntegrations()
      } else {
        toast.error("Erro ao remover integração.")
      }
    } catch (e) {
      toast.error("Erro ao remover.")
    }
  }

  const activeProviderDef = AVAILABLE_INTEGRATIONS.find(i => i.id === selectedProvider)

  return (
    <div className="flex flex-col space-y-8 p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Plug className="w-8 h-8 text-emerald-500" />
            Hub de Integrações
          </h2>
          <p className="text-muted-foreground mt-1">Conecte facilmente o Gestor Master a ferramentas poderosas com poucos cliques.</p>
        </div>

        <Sheet>
          <SheetTrigger render={<Button variant="outline" className="gap-2 shrink-0" />}>
            <Sparkles className="w-4 h-4" />
            Ver Tutorial de Uso
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-6 sm:p-10">
            <SheetHeader className="mb-8">
              <SheetTitle className="text-2xl">Tutorial de Integrações</SheetTitle>
              <SheetDescription className="text-base mt-2">
                Descubra como transformar o seu Gestor Master em uma máquina de vendas e atendimento.
              </SheetDescription>
            </SheetHeader>
            
            <div className="space-y-10 pb-10">
              {/* Assistente IA */}
              <div className="space-y-4">
                <h3 className="text-xl font-semibold flex items-center gap-2 text-emerald-500">
                  <Sparkles className="w-6 h-6" /> Assistente de I.A. Universal
                </h3>
                <p className="text-base text-muted-foreground leading-relaxed">O cérebro da sua operação. Conecte IAs como ChatGPT, Claude ou Groq para responder seus clientes 24 horas por dia.</p>
                <div className="bg-muted/30 border border-border/50 p-6 rounded-xl space-y-4 text-sm leading-relaxed">
                  <p><strong>✨ Vantagem:</strong> O robô tem memória (lembra das últimas 10 mensagens) e atende milhares de pessoas ao mesmo tempo sem custo de servidor local.</p>
                  <div>
                    <p className="font-semibold mb-2">Modo de Uso:</p>
                    <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                      <li>Gere sua API Key no painel da OpenAI ou da Groq.</li>
                      <li>Preencha a Chave, escolha o Modelo (ex: <code>gpt-4o-mini</code>).</li>
                      <li>Escreva o "Prompt Base" (a personalidade do robô). Ex: <em>"Você é o atendente de uma pizzaria..."</em></li>
                      <li>Salve e mande uma mensagem pro WhatsApp. O robô já vai assumir!</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Typebot */}
              <div className="space-y-4">
                <h3 className="text-xl font-semibold flex items-center gap-2 text-blue-500">
                  <Bot className="w-6 h-6" /> Fluxos Typebot
                </h3>
                <p className="text-base text-muted-foreground leading-relaxed">Crie menus interativos visuais de "Arraste e Solte" (ex: Digite 1 para X, 2 para Y).</p>
                <div className="bg-muted/30 border border-border/50 p-6 rounded-xl space-y-4 text-sm leading-relaxed">
                  <p><strong>✨ Vantagem:</strong> Custo zero de processamento no nosso Gestor Master. A integração é nativa, enviando botões e áudios falsos ("gravando...") perfeitamente.</p>
                  <div>
                    <p className="font-semibold mb-2">Modo de Uso:</p>
                    <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                      <li>Crie sua conta no Typebot (ou use seu Typebot self-hosted).</li>
                      <li>Copie o "Nome Público" do fluxo que você criou.</li>
                      <li>Cole a URL e o Nome no painel e salve.</li>
                      <li>Qualquer novo número que mandar mensagem entrará no fluxo automaticamente.</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Mercado Pago */}
              <div className="space-y-4">
                <h3 className="text-xl font-semibold flex items-center gap-2 text-sky-500">
                  <CreditCard className="w-6 h-6" /> Pix Automático (Mercado Pago)
                </h3>
                <p className="text-base text-muted-foreground leading-relaxed">Cobre clientes pelo WhatsApp e receba a notificação de pagamento instantânea.</p>
                <div className="bg-muted/30 border border-border/50 p-6 rounded-xl space-y-4 text-sm leading-relaxed">
                  <p><strong>✨ Vantagem:</strong> Ao gerar o Pix, nosso webhook "escuta" o pagamento e dispara o recibo automaticamente pelo WhatsApp do cliente que pagou.</p>
                  <div>
                    <p className="font-semibold mb-2">Modo de Uso:</p>
                    <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                      <li>Vá no Mercado Pago Developers e gere o seu <code>Access Token</code> (APP_USR-...).</li>
                      <li>Salve no painel.</li>
                      <li>No Typebot (ou no seu CRM), faça uma requisição <code>POST</code> para <code>/api/pix/gerar</code> enviando o <code>valor</code> e <code>telefone_pagador</code>.</li>
                      <li>O sistema envia o Pix e espera o pagamento pra mandar o recibo!</li>
                    </ul>
                  </div>
                </div>
              </div>

            </div>
          </SheetContent>
        </Sheet>
      </div>

      {missingTable && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-amber-500 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Tabela de Integrações não encontrada
            </CardTitle>
            <CardDescription>
              O administrador ainda não criou a tabela `integrations` no banco de dados. 
              Por favor, crie-a para começar a conectar aplicativos.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {AVAILABLE_INTEGRATIONS
          .filter(provider => flags[`integration_${provider.id}`] !== false)
          .map((provider) => {
          const integrationData = getIntegrationData(provider.id)
          const isConnected = !!integrationData

          return (
            <Card key={provider.id} className={`relative overflow-hidden transition-all duration-200 hover:shadow-md ${isConnected && integrationData.is_active ? 'border-emerald-500/50' : isConnected ? 'border-amber-500/50' : ''}`}>
              {isConnected && (
                <div className={`absolute top-0 right-0 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg flex items-center gap-1 ${integrationData.is_active ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                  {integrationData.is_active ? (
                    <><CheckCircle2 className="w-3 h-3" /> ATIVO</>
                  ) : (
                    <><AlertCircle className="w-3 h-3" /> PAUSADO</>
                  )}
                </div>
              )}
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl ${provider.bg}`}>
                    <provider.icon className={`w-6 h-6 ${provider.color}`} />
                  </div>
                  <CardTitle className="text-xl">{provider.name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {provider.description}
                </p>
              </CardContent>
              <CardFooter className="pt-4 border-t bg-secondary/10 flex justify-between">
                {isConnected ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Switch 
                        checked={integrationData.is_active}
                        onCheckedChange={(checked) => handleToggleActive(provider.id, checked)}
                        disabled={missingTable || isSaving}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-red-500" onClick={() => handleDisconnect(provider.id)} disabled={missingTable}>
                        Excluir
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleOpenModal(provider.id)} disabled={missingTable}>
                        Configurar
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button className="w-full gap-2" onClick={() => handleOpenModal(provider.id)} disabled={missingTable}>
                    Conectar Agora <ChevronRight className="w-4 h-4" />
                  </Button>
                )}
              </CardFooter>
            </Card>
          )
        })}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {activeProviderDef && <activeProviderDef.icon className={`w-5 h-5 ${activeProviderDef.color}`} />}
              Conectar {activeProviderDef?.name}
            </DialogTitle>
            <DialogDescription>
              Insira as credenciais abaixo para ativar esta integração no seu sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {activeProviderDef?.fields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>{field.label}</Label>
                {field.type === 'select' ? (
                  <Select 
                    value={formData[field.key] || "none"} 
                    onValueChange={(v) => setFormData({ ...formData, [field.key]: v === "none" ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={field.placeholder} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem vínculo automático</SelectItem>
                      {servicesList.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={field.key}
                    type={field.type}
                    placeholder={field.placeholder}
                    value={formData[field.key] || ""}
                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Salvar e Conectar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

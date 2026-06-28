"use client"

import { useState, useEffect } from "react"
import { Lock, Key, Shield, RefreshCcw, Eye, EyeOff, Save, Webhook, CheckCircle2, Loader2, Copy, Check } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import { useConfirm } from "@/components/providers/confirm-provider"

interface SecuritySettings {
  id: string
  hmac_secret: string
  require_signature: boolean
  rotated_at: string
  created_at: string
  updated_at: string
}

const PROTECTED_ENDPOINTS = [
  {
    name: "Callbacks Evolution API",
    path: "/api/evolution/webhook",
    status: "protected" as const,
    method: "Token + HMAC SHA-256"
  },
  {
    name: "Stripe Webhooks",
    path: "/api/stripe/webhook",
    status: "protected" as const,
    method: "Stripe Signature (nativa)"
  },
  {
    name: "PIXGO Webhooks",
    path: "/api/pixgo/webhook",
    status: "protected" as const,
    method: "HMAC SHA-256 (nativa)"
  },
  {
    name: "MercadoPago Webhooks",
    path: "/api/webhooks/mercadopago",
    status: "protected" as const,
    method: "Validação API MercadoPago (Seguro)"
  }
]

export default function SecurityPage() {
  const confirm = useConfirm()
  const [settings, setSettings] = useState<SecuritySettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showSecret, setShowSecret] = useState(false)
  const [isRotating, setIsRotating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [requireSignature, setRequireSignature] = useState(true)
  const [copied, setCopied] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/security')
      if (res.ok) {
        const data = await res.json()
        setSettings(data)
        setRequireSignature(data.require_signature)
      } else {
        toast.error("Erro ao carregar configurações de segurança")
      }
    } catch (e) {
      toast.error("Erro ao conectar com o servidor")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRotateSecret = async () => {
    if (!await confirm({
      title: "Rotacionar Secret HMAC",
      description: "Ao gerar um novo secret, todas as integrações que utilizam o secret anterior precisarão ser atualizadas. Deseja continuar?",
      variant: "warning",
      confirmText: "Sim, Rotacionar"
    })) return

    setIsRotating(true)
    try {
      const res = await fetch('/api/admin/security/rotate', { method: 'POST' })
      const data = await res.json()
      
      if (res.ok && data.success) {
        setSettings(prev => prev ? { ...prev, hmac_secret: data.hmac_secret, rotated_at: data.rotated_at } : prev)
        setShowSecret(true)
        toast.success("Novo secret HMAC gerado com sucesso! Copie-o agora.")
      } else {
        toast.error(data.error || "Erro ao rotacionar secret")
      }
    } catch (e) {
      toast.error("Erro ao rotacionar secret")
    } finally {
      setIsRotating(false)
    }
  }

  const handleSaveSecurity = async () => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/admin/security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ require_signature: requireSignature })
      })
      const data = await res.json()
      
      if (res.ok && data.success) {
        setHasChanges(false)
        toast.success("Configurações de segurança salvas com sucesso!")
      } else {
        toast.error(data.error || "Erro ao salvar configurações")
      }
    } catch (e) {
      toast.error("Erro ao salvar configurações")
    } finally {
      setIsSaving(false)
    }
  }

  const handleCopySecret = () => {
    if (settings?.hmac_secret) {
      navigator.clipboard.writeText(settings.hmac_secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success("Secret copiado para a área de transferência!")
    }
  }

  const handleToggleSignature = (checked: boolean) => {
    setRequireSignature(checked)
    setHasChanges(checked !== settings?.require_signature)
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    } catch { return '—' }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Lock className="w-8 h-8 text-red-500" />
            Segurança & Webhooks
          </h2>
          <p className="text-muted-foreground mt-1">Gerenciamento de chaves secretas (HMAC) e políticas de validação de endpoints.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Painel Principal de Configuração HMAC */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-muted-foreground" />
              Chaves de Assinatura de Webhooks (HMAC)
            </CardTitle>
            <CardDescription>
              O sistema utiliza HMAC SHA-256 para assinar os webhooks enviados aos seus clientes. 
              Eles devem utilizar este secret para validar que a requisição partiu genuinamente do Gestor Master.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Secret de Assinatura Atual</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input 
                    type={showSecret ? "text" : "password"} 
                    value={settings?.hmac_secret || ''} 
                    readOnly 
                    className="font-mono bg-secondary/50 pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                <Button variant="outline" size="icon" onClick={handleCopySecret} title="Copiar secret">
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </Button>
                <Button variant="outline" onClick={handleRotateSecret} disabled={isRotating}>
                  <RefreshCcw className={`w-4 h-4 mr-2 ${isRotating ? "animate-spin" : ""}`} />
                  Rotacionar
                </Button>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Última rotação: {settings?.rotated_at ? formatDate(settings.rotated_at) : '—'}</span>
                <span>•</span>
                <span>Dica: Rotacione o secret a cada 90 dias ou caso suspeite de vazamento.</span>
              </div>
            </div>

            <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-lg flex items-start gap-3">
              <Shield className="w-5 h-5 text-red-500 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-red-600 dark:text-red-400">Aplicação Rigorosa de Assinatura</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Se habilitado, o sistema rejeitará qualquer webhook recebido da Evolution que não contenha a assinatura correta no cabeçalho ou que tente forjar dados.
                </p>
                <div className="flex items-center gap-2 mt-4">
                  <Switch 
                    id="require-signature" 
                    checked={requireSignature}
                    onCheckedChange={handleToggleSignature}
                  />
                  <Label htmlFor="require-signature" className="font-medium">
                    Exigir validação criptográfica (Recomendado)
                  </Label>
                </div>
              </div>
            </div>

          </CardContent>
          <CardFooter className="border-t bg-secondary/10 px-6 py-4 flex justify-end">
            <Button onClick={handleSaveSecurity} disabled={isSaving || !hasChanges}>
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar Alterações
            </Button>
          </CardFooter>
        </Card>

        {/* Resumo de Endpoints Protegidos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Webhook className="w-5 h-5 text-muted-foreground" />
              Endpoints Protegidos
            </CardTitle>
            <CardDescription>Rotas ativas e seu nível de proteção</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {PROTECTED_ENDPOINTS.map((endpoint) => (
                <div key={endpoint.path} className={`flex items-center justify-between p-3 border rounded-lg ${
                  endpoint.status === 'partial' ? 'border-dashed bg-secondary/20' : ''
                }`}>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm">{endpoint.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{endpoint.path}</div>
                    <div className="text-xs text-muted-foreground/70 mt-0.5">{endpoint.method}</div>
                  </div>
                  {endpoint.status === 'protected' ? (
                    <Badge variant="default" className="bg-emerald-500 ml-2 flex-shrink-0">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Protegido
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-500 border-amber-500 ml-2 flex-shrink-0">
                      Parcial
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}

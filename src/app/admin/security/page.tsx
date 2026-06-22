"use client"

import { useState } from "react"
import { Lock, Key, Shield, RefreshCcw, Eye, EyeOff, Save, Webhook } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"

export default function SecurityPage() {
  const [showSecret, setShowSecret] = useState(false)
  const [isRotating, setIsRotating] = useState(false)
  
  // Mocks para a interface
  const [hmacSecret, setHmacSecret] = useState("whsec_5f9a2b3c4d5e6f7g8h9i0j1k2l3m4n5o")
  const [requireSignature, setRequireSignature] = useState(true)

  const handleRotateSecret = () => {
    setIsRotating(true)
    setTimeout(() => {
      // Gera um mock simulado de secret
      const randomString = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
      setHmacSecret(`whsec_${randomString}`)
      setIsRotating(false)
      toast.success("Novo secret HMAC gerado com sucesso!")
    }, 1000)
  }

  const handleSaveSecurity = () => {
    toast.success("Configurações de segurança salvas (Simulação).")
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
                    value={hmacSecret} 
                    readOnly 
                    className="font-mono bg-secondary/50"
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
                <Button variant="outline" onClick={handleRotateSecret} disabled={isRotating}>
                  <RefreshCcw className={`w-4 h-4 mr-2 ${isRotating ? "animate-spin" : ""}`} />
                  Rotacionar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Dica: Rotacione o secret a cada 90 dias ou caso suspeite de vazamento.
              </p>
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
                    onCheckedChange={setRequireSignature}
                  />
                  <Label htmlFor="require-signature" className="font-medium">
                    Exigir validação criptográfica (Recomendado)
                  </Label>
                </div>
              </div>
            </div>

          </CardContent>
          <CardFooter className="border-t bg-secondary/10 px-6 py-4 flex justify-end">
            <Button onClick={handleSaveSecurity}>
              <Save className="w-4 h-4 mr-2" />
              Salvar Alterações
            </Button>
          </CardFooter>
        </Card>

        {/* Resumo de Integrações */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Webhook className="w-5 h-5 text-muted-foreground" />
              Endpoints Protegidos
            </CardTitle>
            <CardDescription>Rotas ativas sob proteção HMAC</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <div className="font-medium text-sm">Callbacks Evolution API</div>
                  <div className="text-xs text-muted-foreground">/api/webhooks/evolution</div>
                </div>
                <Badge variant="default" className="bg-emerald-500">Protegido</Badge>
              </div>
              
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <div className="font-medium text-sm">Integração Asaas/Stripe</div>
                  <div className="text-xs text-muted-foreground">/api/webhooks/payments</div>
                </div>
                <Badge variant="default" className="bg-emerald-500">Protegido</Badge>
              </div>

              <div className="flex items-center justify-between p-3 border border-dashed rounded-lg bg-secondary/20">
                <div>
                  <div className="font-medium text-sm text-muted-foreground">Endpoints de Clientes</div>
                  <div className="text-xs text-muted-foreground">Envio Externo</div>
                </div>
                <Badge variant="outline" className="text-amber-500 border-amber-500">Em Breve</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}

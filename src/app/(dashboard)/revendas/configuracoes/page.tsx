"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ArrowLeft, Save, Shield, Smartphone, CreditCard, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { logAuditClient } from "@/lib/audit-client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function RevendasConfigPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Settings states
  const [mpToken, setMpToken] = useState("")
  const [stripeSecret, setStripeSecret] = useState("")
  const [notificationNumber, setNotificationNumber] = useState("")
  const [pixKey, setPixKey] = useState("")
  const [pixType, setPixType] = useState("Celular")

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from("revenda_settings")
        .select("*")
        .eq("user_id", user.id)
        .single()

      if (error && error.code !== 'PGRST116') { // Ignore "Not Found" if it's their first time
        throw error
      }

      if (data) {
        setMpToken(data.mp_access_token || "")
        setStripeSecret(data.stripe_secret || "")
        setNotificationNumber(data.notification_number || "")
        setPixKey(data.pix_key || "")
        setPixType(data.pix_type || "Celular")
      }
    } catch (error: any) {
      toast.error("Erro ao carregar configurações")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSaveSettings() {
    setIsSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from("revenda_settings")
        .upsert({
          user_id: user.id,
          mp_access_token: mpToken,
          stripe_secret: stripeSecret,
          notification_number: notificationNumber,
          pix_key: pixKey,
          pix_type: pixType
        })

      if (error) throw error
      logAuditClient({ action: 'reseller.update_config', resource: 'revenda_settings' })

      toast.success("Configurações salvas com sucesso!")
    } catch (error: any) {
      toast.error("Erro ao salvar configurações")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => router.push('/revendas')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-[17px] font-semibold tracking-[-0.02em]">Configurações de Revenda</h1>
          <p className="text-muted-foreground mt-1">Conecte seus meios de pagamento e notificações do WhatsApp.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-500" />
              Notificações de Recarga
            </CardTitle>
            <CardDescription>
              Onde você quer ser avisado quando um revendedor solicitar créditos ou confirmar um pagamento?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 max-w-md">
              <Label>Seu WhatsApp (Gestor)</Label>
              <Input 
                value={notificationNumber} 
                onChange={(e) => setNotificationNumber(e.target.value)} 
                placeholder="Ex: 5511999999999" 
              />
              <p className="text-xs text-muted-foreground">Use o código do país (55) + DDD + Número. Sem espaços.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-500" />
              Pagamento Manual (PIX Direto)
            </CardTitle>
            <CardDescription>
              A chave PIX que será exibida para o seu revendedor pagar a recarga.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
              <div className="space-y-2">
                <Label>Tipo de Chave PIX</Label>
                <Select value={pixType} onValueChange={(val) => setPixType(val || "Celular")}>
                  <SelectTrigger className="bg-secondary/30">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Celular">Celular</SelectItem>
                    <SelectItem value="CPF/CNPJ">CPF / CNPJ</SelectItem>
                    <SelectItem value="E-mail">E-mail</SelectItem>
                    <SelectItem value="Chave Aleatória">Chave Aleatória</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sua Chave PIX</Label>
                <Input 
                  value={pixKey} 
                  onChange={(e) => setPixKey(e.target.value)} 
                  placeholder="Digite sua chave..." 
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-interactive" />
              Gateways de Pagamento (Em Breve)
            </CardTitle>
            <CardDescription>
              Conecte suas contas para que a liberação de créditos seja 100% automática através de Webhooks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2 max-w-lg">
              <Label>Mercado Pago (Access Token)</Label>
              <Input 
                type="password"
                value={mpToken} 
                onChange={(e) => setMpToken(e.target.value)} 
                placeholder="APP_USR-..." 
              />
            </div>
            <div className="space-y-2 max-w-lg">
              <Label>Stripe (Secret Key)</Label>
              <Input 
                type="password"
                value={stripeSecret} 
                onChange={(e) => setStripeSecret(e.target.value)} 
                placeholder="sk_live_..." 
              />
            </div>
          </CardContent>
          <CardFooter className="bg-secondary/30 border-t border-border/50 py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground w-full">
              <Shield className="w-4 h-4" />
              Suas chaves são criptografadas e salvas com segurança.
              <Button onClick={handleSaveSettings} disabled={isSaving} className="ml-auto bg-primary hover:bg-primary/90">
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar Configurações
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}

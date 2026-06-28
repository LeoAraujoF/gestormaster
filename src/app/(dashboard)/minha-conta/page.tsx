"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Lock, CreditCard, Shield, UserCircle, Loader2, KeyRound, ExternalLink, Zap, Users, Smartphone, Palette, CheckCircle2, AlertTriangle, Monitor, Moon, Sun, MonitorSmartphone, Building2, Save, Settings2 } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PricingModal } from "@/components/pricing-modal"

export default function MinhaContaPage() {
  const router = useRouter()
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false)
  const supabase = createClient()
  const { theme, setTheme } = useTheme()
  
  // States - Senha
  const [oldPassword, setOldPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  // Stripe Checkout
  const [isCheckoutLoading, setIsCheckoutLoading] = useState<string | null>(null) // Guarda o priceId que está carregando
  const [isPortalLoading, setIsPortalLoading] = useState(false)

  // User Data
  const [userEmail, setUserEmail] = useState("")
  const [userName, setUserName] = useState("")
  const [planName, setPlanName] = useState("")
  const [planExpiresAt, setPlanExpiresAt] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState<boolean>(false)
  const [instancesCount, setInstancesCount] = useState(0)
  const [clientsCount, setClientsCount] = useState(0)

  // States - PIN
  const [hasPin, setHasPin] = useState(false)
  const [savedPin, setSavedPin] = useState("")
  const [oldPin, setOldPin] = useState("")
  const [newPin, setNewPin] = useState("")
  const [isSavingPin, setIsSavingPin] = useState(false)

  // States - Company Profile
  const [companyName, setCompanyName] = useState("")
  const [supportPhone, setSupportPhone] = useState("")
  const [pixKey, setPixKey] = useState("")
  const [pixName, setPixName] = useState("")
  const [pixBank, setPixBank] = useState("")
  const [whatsappChannelLink, setWhatsappChannelLink] = useState("")
  const [timezone, setTimezone] = useState("-03:00")
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  // Initialization
  useEffect(() => {
    checkUserMetadata()
  }, [])

  const checkUserMetadata = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setUserEmail(user.email || "")
      setUserName(user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário")
      setPlanName(user.user_metadata?.plan_name || "Free")
      setPlanExpiresAt(user.user_metadata?.plan_expires_at || null)
      
      if (user.user_metadata?.security_pin) {
        setHasPin(true)
        setSavedPin(user.user_metadata.security_pin)
      }

      if (user.user_metadata) {
        setCompanyName(user.user_metadata.company_name || "")
        setSupportPhone(user.user_metadata.support_phone || "")
        setPixKey(user.user_metadata.pix_key || "")
        setPixName(user.user_metadata.pix_name || "")
        setPixBank(user.user_metadata.pix_bank || "")
        setWhatsappChannelLink(user.user_metadata.whatsapp_channel_link || "")
        setTimezone(user.user_metadata.timezone || "-03:00")
      }

      // Check admin status dynamically
      try {
        const res = await fetch('/api/admin/check')
        const data = await res.json()
        setIsAdmin(data.isAdmin)
      } catch (e) {
        setIsAdmin(false)
      }

      // Fetch Usage Counts
      try {
        const [{ count: instCount }, { count: cliCount }] = await Promise.all([
          supabase.from('evolution_instances').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
        ])
        setInstancesCount(instCount || 0)
        setClientsCount(cliCount || 0)
      } catch (error) {
        console.error("Erro ao buscar estatísticas", error)
      }
    }
  }

  // Handlers - Password
  const handlePasswordChange = async () => {
    if (!oldPassword) return toast.error("Por favor, informe a senha atual.")
    if (newPassword.length < 6) return toast.error("A senha deve ter pelo menos 6 caracteres.")
    if (newPassword !== confirmPassword) return toast.error("As senhas não coincidem.")
    
    setIsChangingPassword(true)
    try {
      // 1. Verifica se a senha antiga está correta tentando logar
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: oldPassword,
      })
      if (signInError) throw new Error("Senha atual incorreta.")

      // 2. Se a senha antiga estiver correta, atualiza para a nova
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw new Error(error.message || "Erro ao alterar a senha.")

      toast.success("Senha alterada com sucesso!")
      setOldPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsChangingPassword(false)
    }
  }

  // Handlers - PIN
  const handleSavePin = async () => {
    if (hasPin && oldPin !== savedPin) return toast.error("O PIN atual está incorreto.")
    if (newPin.length !== 4) return toast.error("O NOVO PIN deve ter exatos 4 dígitos numéricos.")
    
    setIsSavingPin(true)
    try {
      const { error } = await supabase.auth.updateUser({
        data: { security_pin: newPin }
      })
      if (error) throw error
      
      toast.success(hasPin ? "PIN atualizado com sucesso!" : "PIN de segurança configurado com sucesso!")
      setHasPin(true)
      setSavedPin(newPin)
      setOldPin("")
      setNewPin("")
    } catch (error: any) {
      toast.error("Erro ao salvar o PIN de segurança.")
    } finally {
      setIsSavingPin(false)
    }
  }

  const handleSaveProfile = async () => {
    setIsSavingProfile(true)
    try {
      const { error } = await supabase.auth.updateUser({
        data: { 
          company_name: companyName,
          support_phone: supportPhone,
          pix_key: pixKey,
          pix_name: pixName,
          pix_bank: pixBank,
          whatsapp_channel_link: whatsappChannelLink,
          timezone: timezone
        }
      })
      if (error) throw error
      toast.success("Dados da empresa atualizados com sucesso!")
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar dados da empresa.")
    } finally {
      setIsSavingProfile(false)
    }
  }

  // Handle Stripe Portal
  const handleManageSubscription = async () => {
    setIsPortalLoading(true)
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
      })
      
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text)
      }

      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao abrir o portal de faturamento.")
    } finally {
      setIsPortalLoading(false)
    }
  }

  // Helpers for Premium Visuals
  const getPasswordStrength = () => {
    if (!newPassword) return { score: 0, text: "Muito Fraca", color: "bg-muted" }
    let score = 0
    if (newPassword.length > 5) score += 1
    if (newPassword.length > 8) score += 1
    if (/[A-Z]/.test(newPassword)) score += 1
    if (/[0-9]/.test(newPassword)) score += 1
    if (/[^A-Za-z0-9]/.test(newPassword)) score += 1

    if (score <= 2) return { score, text: "Fraca", color: "bg-red-500" }
    if (score === 3 || score === 4) return { score, text: "Boa", color: "bg-amber-500" }
    return { score, text: "Forte", color: "bg-emerald-500" }
  }

  const { score: passScore, text: passText, color: passColor } = getPasswordStrength()
  const instancesLimit = isAdmin ? 999 : planName === "Plus" ? 5 : planName === "Pro" ? 3 : 0
  const instancesPercentage = instancesLimit === 999 ? 0 : Math.min((instancesCount / (instancesLimit || 1)) * 100, 100)

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      
      {/* 1. Perfil Premium Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-background to-background border border-border/50 p-8 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-sky-500/5 rounded-full blur-3xl -z-10" />
        
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 z-10 relative">
          {/* Avatar Glass */}
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-primary to-sky-500 p-1">
              <div className="w-full h-full bg-background rounded-full flex items-center justify-center">
                <span className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-tr from-primary to-sky-500 uppercase">
                  {userName.substring(0, 2)}
                </span>
              </div>
            </div>
            {isAdmin && (
              <div className="absolute -bottom-2 -right-2 bg-background p-1 rounded-full">
                <div className="bg-sky-500 text-white rounded-full p-1.5 shadow-lg shadow-sky-500/20">
                  <Shield className="w-4 h-4" />
                </div>
              </div>
            )}
          </div>

          <div className="text-center sm:text-left space-y-1">
            <div className="flex items-center justify-center sm:justify-start gap-3">
              <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground">
                {userName}
              </h1>
              {isAdmin ? (
                <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/20 shadow-none">Admin Master</Badge>
              ) : (
                <Badge className="bg-primary/10 text-primary border-primary/20 shadow-none">{planName}</Badge>
              )}
            </div>
            <p className="text-muted-foreground flex items-center justify-center sm:justify-start gap-2">
              <UserCircle className="w-4 h-4 opacity-70" />
              {userEmail}
            </p>
            <p className="text-xs text-muted-foreground/60 pt-2">
              Membro desde: {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Tabs Premium */}
      <Tabs defaultValue="perfil" className="w-full animate-in fade-in duration-700 delay-100">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 max-w-[900px] mb-12 md:mb-8 bg-background/50 border border-border/50 p-1 h-auto md:h-12 rounded-xl flex-wrap">
          <TabsTrigger value="perfil" className="rounded-lg data-[state=active]:bg-primary/10 data-[state=active]:text-primary h-10 md:h-full transition-all">
            <Building2 className="w-4 h-4 mr-2" />
            <span>Perfil</span>
          </TabsTrigger>
          <TabsTrigger value="assinatura" className="rounded-lg data-[state=active]:bg-primary/10 data-[state=active]:text-primary h-10 md:h-full transition-all">
            <CreditCard className="w-4 h-4 mr-2" />
            <span>Assinatura</span>
          </TabsTrigger>
          <TabsTrigger value="senha" className="rounded-lg data-[state=active]:bg-primary/10 data-[state=active]:text-primary h-10 md:h-full transition-all">
            <Lock className="w-4 h-4 mr-2" />
            <span>Segurança</span>
          </TabsTrigger>
          <TabsTrigger value="pin" className="rounded-lg data-[state=active]:bg-primary/10 data-[state=active]:text-primary h-10 md:h-full transition-all">
            <KeyRound className="w-4 h-4 mr-2" />
            <span>PIN Cofre</span>
          </TabsTrigger>
          <TabsTrigger value="aparencia" className="rounded-lg data-[state=active]:bg-primary/10 data-[state=active]:text-primary h-10 md:h-full transition-all">
            <Palette className="w-4 h-4 mr-2" />
            <span>Aparência</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB PERFIL DA EMPRESA */}
        <TabsContent value="perfil" className="mt-0">
          <Card className="glass-card max-w-2xl mx-auto relative overflow-hidden border-primary/20">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2" />
            <CardHeader className="text-center pb-8">
              <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Building2 className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">Perfil da Empresa & PIX</CardTitle>
              <CardDescription>
                Configure os dados da sua empresa. Eles viram variáveis automáticas (ex: {'{{pix}}'}) para usar nas mensagens!
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Nome da Empresa</Label>
                  <Input 
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Ex: Cine Plus"
                    className="bg-background/50 h-11"
                  />
                  <p className="text-[10px] text-muted-foreground">Variável: {'{{empresa}}'}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supportPhone">WhatsApp Comercial / Suporte</Label>
                  <Input 
                    id="supportPhone"
                    value={supportPhone}
                    onChange={(e) => setSupportPhone(e.target.value)}
                    placeholder="Ex: (11) 99999-9999"
                    className="bg-background/50 h-11"
                  />
                  <p className="text-[10px] text-muted-foreground">Variável: {'{{telefone_suporte}}'}</p>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Label htmlFor="whatsappChannelLink">Link do Canal VIP / Grupo de Avisos</Label>
                <Input 
                  id="whatsappChannelLink"
                  value={whatsappChannelLink}
                  onChange={(e) => setWhatsappChannelLink(e.target.value)}
                  placeholder="Ex: https://chat.whatsapp.com/..."
                  className="bg-background/50 h-11"
                />
                <p className="text-[10px] text-muted-foreground">Variável automática: {'{{link_canal}}'}</p>
              </div>

              <div className="pt-4 border-t border-border/50">
                <h3 className="text-sm font-semibold mb-4 text-emerald-500 flex items-center gap-2">
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">$$</Badge>
                  Dados para Recebimento (PIX)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pixKey">Chave PIX</Label>
                    <Input 
                      id="pixKey"
                      value={pixKey}
                      onChange={(e) => setPixKey(e.target.value)}
                      placeholder="Celular, CPF, E-mail ou Aleatória"
                      className="bg-background/50 h-11"
                    />
                    <p className="text-[10px] text-muted-foreground">Variável: {'{{pix}}'}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pixName">Titular / Beneficiário</Label>
                    <Input 
                      id="pixName"
                      value={pixName}
                      onChange={(e) => setPixName(e.target.value)}
                      placeholder="Nome de quem recebe"
                      className="bg-background/50 h-11"
                    />
                    <p className="text-[10px] text-muted-foreground">Variável: {'{{titular_pix}}'}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pixBank">Instituição / Banco</Label>
                    <Input 
                      id="pixBank"
                      value={pixBank}
                      onChange={(e) => setPixBank(e.target.value)}
                      placeholder="Ex: Nubank, Inter, Itaú"
                      className="bg-background/50 h-11"
                    />
                    <p className="text-[10px] text-muted-foreground">Variável: {'{{banco_pix}}'}</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-border/50">
                <h3 className="text-sm font-semibold mb-4 text-sky-500 flex items-center gap-2">
                  <Badge variant="outline" className="bg-sky-500/10 text-sky-500 border-sky-500/20">🕒</Badge>
                  Fuso Horário (Sistema)
                </h3>
                <div className="space-y-2">
                  <Label>Seu Fuso Horário Local</Label>
                  <Select value={timezone} onValueChange={(val) => val && setTimezone(val)}>
                    <SelectTrigger className="w-full bg-background/50 h-11">
                      <SelectValue placeholder="Selecione o fuso horário" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="-03:00">Horário de Brasília (UTC-3)</SelectItem>
                      <SelectItem value="-04:00">Amazonas / NY (UTC-4)</SelectItem>
                      <SelectItem value="-05:00">Acre (UTC-5)</SelectItem>
                      <SelectItem value="+01:00">Portugal (Lisboa)</SelectItem>
                      <SelectItem value="+00:00">Londres (UTC+0)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-2">
                    Os robôs automáticos do sistema calcularão os disparos baseados no seu horário local para evitar mensagens adiantadas ou atrasadas.
                  </p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="pt-6">
              <Button 
                onClick={handleSaveProfile} 
                disabled={isSavingProfile}
                className="w-full h-12 text-md shadow-lg shadow-primary/20"
              >
                {isSavingProfile ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
                Salvar Perfil
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* TAB ASSINATURA */}
        <TabsContent value="assinatura" className="mt-0 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* STATUS DA ASSINATURA */}
            <Card className="glass-card md:col-span-5 relative overflow-hidden border-emerald-500/20">
              <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2" />
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                      Plano Atual
                    </CardTitle>
                    <div className="mt-2 text-3xl font-bold tracking-tight">
                      {isAdmin ? "Master" : planName}
                    </div>
                  </div>
                  <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/30">
                    <Zap className="w-6 h-6" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-3 rounded-xl bg-background/50 border border-border/50">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <div>
                      <p className="text-sm font-medium">Status da Conta</p>
                      <p className="text-xs text-muted-foreground">
                        {planExpiresAt 
                          ? `Vence em ${new Date(planExpiresAt).toLocaleDateString('pt-BR')}`
                          : "Pagamento em dia"}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Ativo</Badge>
                </div>
              </CardContent>
              <CardFooter className="pt-4 flex flex-col items-start gap-4 border-t border-border/50 mt-4">
                <Button variant="default" className="w-full bg-foreground text-background hover:bg-foreground/90 shadow-xl" onClick={() => setIsPricingModalOpen(true)}>
                  Fazer Upgrade de Plano <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
                
                
                <Button 
                  variant="outline" 
                  className="w-full border-border/50 bg-background/50 text-muted-foreground hover:bg-secondary/80 transition-all" 
                  onClick={handleManageSubscription}
                  disabled={isPortalLoading}
                >
                  {isPortalLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Settings2 className="w-4 h-4 mr-2" />}
                  Gerenciar Assinatura (Portal)
                </Button>
              </CardFooter>
            </Card>

            {/* DASHBOARD DE CONSUMO */}
            <Card className="glass-card md:col-span-7">
              <CardHeader>
                <CardTitle className="text-xl">Consumo e Limites</CardTitle>
                <CardDescription>Visão geral do uso da sua conta neste ciclo.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                
                {/* Progress: Chips */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-sky-500/10 text-sky-500 rounded-md">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <span className="font-medium text-sm">Fazenda de Chips (WPP)</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{instancesCount} / {instancesLimit === 999 ? "Ilimitado" : instancesLimit}</span>
                  </div>
                  <div className="h-2.5 w-full bg-secondary rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ${instancesPercentage >= 100 ? 'bg-amber-500' : 'bg-sky-500'}`} 
                      style={{ width: isAdmin ? '10%' : `${instancesPercentage}%` }} 
                    />
                  </div>
                  {instancesPercentage >= 100 && !isAdmin && (
                    <p className="text-xs text-amber-500 flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3 h-3" /> Limite atingido. Faça upgrade para adicionar mais.
                    </p>
                  )}
                </div>

                {/* Progress: Clients */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-primary/10 text-primary rounded-md">
                        <Users className="w-4 h-4" />
                      </div>
                      <span className="font-medium text-sm">Clientes Cadastrados</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{clientsCount} / ∞</span>
                  </div>
                  <div className="h-2.5 w-full bg-secondary rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all duration-1000 w-[15%]" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Você possui clientes ilimitados em seu plano atual.
                  </p>
                </div>

              </CardContent>
            </Card>

          </div>
        </TabsContent>

        {/* TAB SENHA */}
        <TabsContent value="senha" className="mt-0">
          <Card className="glass-card max-w-2xl mx-auto relative overflow-hidden border-sky-500/20">
            <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/5 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2" />
            <CardHeader className="text-center pb-8">
              <div className="mx-auto w-16 h-16 bg-sky-500/10 rounded-full flex items-center justify-center mb-4">
                <Shield className="w-8 h-8 text-sky-500" />
              </div>
              <CardTitle className="text-2xl">Segurança da Conta</CardTitle>
              <CardDescription>
                Atualize sua senha periodicamente para manter sua conta segura.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="old-password">Senha Atual</Label>
                <Input 
                  id="old-password"
                  type="password" 
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="Sua senha atual..."
                  className="bg-background/50 h-12"
                />
              </div>

              <div className="space-y-2 relative pt-2 border-t border-border/50">
                <Label htmlFor="new-password">Nova Senha</Label>
                <Input 
                  id="new-password"
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres..."
                  className="bg-background/50 h-12"
                />
                
                {/* Força da Senha */}
                <div className="pt-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-muted-foreground">Força da Senha</span>
                    <span className={`text-xs font-bold ${passScore > 2 ? 'text-emerald-500' : passScore > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                      {passText}
                    </span>
                  </div>
                  <div className="flex gap-1 h-1.5 w-full">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <div 
                        key={level} 
                        className={`flex-1 rounded-full transition-colors duration-300 ${level <= passScore ? passColor : 'bg-secondary'}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
                <Input 
                  id="confirm-password"
                  type="password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha..."
                  className="bg-background/50 h-12"
                />
              </div>
            </CardContent>
            <CardFooter className="pt-6">
              <Button 
                onClick={handlePasswordChange} 
                disabled={!oldPassword || !newPassword || newPassword !== confirmPassword || isChangingPassword || passScore < 2}
                className="w-full h-12 text-md shadow-lg shadow-primary/20"
              >
                {isChangingPassword ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Lock className="w-5 h-5 mr-2" />}
                Atualizar Senha
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* TAB PIN COFRE */}
        <TabsContent value="pin" className="mt-0">
          <Card className="glass-card max-w-2xl mx-auto relative overflow-hidden border-amber-500/20">
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2" />
            <CardHeader className="text-center pb-6">
              <div className="mx-auto w-20 h-20 bg-amber-500/10 rounded-2xl flex items-center justify-center mb-4 border border-amber-500/20 shadow-inner">
                <KeyRound className="w-10 h-10 text-amber-500" />
              </div>
              <CardTitle className="text-2xl">Cofre Digital (PIN)</CardTitle>
              <CardDescription className="max-w-md mx-auto">
                {hasPin 
                  ? "Sua conta já está protegida por um PIN. Digite abaixo caso queira substituí-lo." 
                  : "Crie um PIN numérico de 4 dígitos. Ele será exigido como camada extra de segurança para ações destrutivas (ex: exclusão de clientes)."
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-10 bg-background/40 rounded-2xl border border-border/50 shadow-inner relative overflow-hidden gap-6">
                {/* Vault Background Details */}
                <div className="absolute inset-0 opacity-5 pointer-events-none" 
                     style={{ backgroundImage: 'radial-gradient(circle at center, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                
                {hasPin && (
                  <div className="flex flex-col items-center gap-2 z-10 w-full pb-6 border-b border-border/50">
                    <Label className="text-sm font-medium text-foreground uppercase tracking-wider text-muted-foreground">
                      Digite o PIN ATUAL
                    </Label>
                    <InputOTP maxLength={4} value={oldPin} onChange={setOldPin}>
                      <InputOTPGroup className="gap-4">
                        {[0, 1, 2, 3].map((index) => (
                          <InputOTPSlot 
                            key={index} 
                            index={index} 
                            className="w-14 h-16 text-2xl font-bold rounded-xl border-2 border-border/80 bg-background/50 shadow-sm ring-amber-500/50 focus:border-amber-500 transition-all opacity-70 focus:opacity-100" 
                          />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                )}

                <div className="flex flex-col items-center gap-2 z-10">
                  <Label className="text-sm font-medium text-foreground uppercase tracking-wider text-amber-600 dark:text-amber-500">
                    {hasPin ? "Digite o NOVO PIN Numérico" : "Crie seu PIN Numérico"}
                  </Label>
                  <InputOTP maxLength={4} value={newPin} onChange={setNewPin}>
                    <InputOTPGroup className="gap-4">
                      {[0, 1, 2, 3].map((index) => (
                        <InputOTPSlot 
                          key={index} 
                          index={index} 
                          className="w-16 h-20 text-3xl font-bold rounded-xl border-2 border-border/80 bg-background shadow-sm ring-amber-500/50 focus:border-amber-500 transition-all" 
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </div>
            </CardContent>
            <CardFooter className="pt-6">
              <Button 
                onClick={handleSavePin} 
                disabled={(hasPin && oldPin.length !== 4) || newPin.length !== 4 || isSavingPin}
                className={`w-full h-12 text-md shadow-lg ${hasPin ? "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20" : ""}`}
              >
                {isSavingPin ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Shield className="w-5 h-5 mr-2" />}
                {hasPin ? "Substituir PIN do Cofre" : "Trancar Cofre com Novo PIN"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* TAB APARÊNCIA */}
        <TabsContent value="aparencia" className="mt-0">
          <Card className="glass-card max-w-2xl mx-auto">
            <CardHeader className="text-center pb-8">
              <div className="mx-auto w-16 h-16 bg-violet-500/10 rounded-full flex items-center justify-center mb-4">
                <Palette className="w-8 h-8 text-violet-500" />
              </div>
              <CardTitle className="text-2xl">Aparência do Sistema</CardTitle>
              <CardDescription>Personalize a interface do Gestor Master ao seu gosto.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {/* Claro */}
                <div 
                  className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 cursor-pointer transition-all hover:bg-muted/50 ${theme === 'light' ? 'border-primary bg-primary/5' : 'border-border/50 bg-background/50'}`}
                  onClick={() => setTheme('light')}
                >
                  <Sun className={`w-8 h-8 mb-3 ${theme === 'light' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="font-medium text-sm">Claro</span>
                </div>

                {/* Escuro */}
                <div 
                  className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 cursor-pointer transition-all hover:bg-muted/50 ${theme === 'dark' ? 'border-primary bg-primary/5' : 'border-border/50 bg-background/50'}`}
                  onClick={() => setTheme('dark')}
                >
                  <Moon className={`w-8 h-8 mb-3 ${theme === 'dark' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="font-medium text-sm">Escuro</span>
                </div>

                {/* Sistema */}
                <div 
                  className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 cursor-pointer transition-all hover:bg-muted/50 ${theme === 'system' ? 'border-primary bg-primary/5' : 'border-border/50 bg-background/50'}`}
                  onClick={() => setTheme('system')}
                >
                  <MonitorSmartphone className={`w-8 h-8 mb-3 ${theme === 'system' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="font-medium text-sm">Automático</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      <PricingModal open={isPricingModalOpen} onOpenChange={setIsPricingModalOpen} />
    </div>
  )
}

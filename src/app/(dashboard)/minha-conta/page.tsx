"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { AccountTabs } from "@/components/account-tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PricingModal } from "@/components/pricing-modal"
import { cn } from "@/lib/utils"

// Abas internas (5f): texto 11.5px, ativa com borda inferior 2px tinta
const SECTIONS = [
  { key: "empresa", label: "Empresa & PIX" },
  { key: "seguranca", label: "Segurança" },
  { key: "pin", label: "Cofre PIN" },
  { key: "aparencia", label: "Aparência" },
  { key: "plano", label: "Plano & consumo" },
] as const

type SectionKey = (typeof SECTIONS)[number]["key"]

const TABULAR_NUMS_KEY = "gm_tabular_nums"

export default function MinhaContaPage() {
  const [section, setSection] = useState<SectionKey>("empresa")
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false)
  const supabase = createClient()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // States - Senha
  const [oldPassword, setOldPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  // Stripe Portal
  const [isPortalLoading, setIsPortalLoading] = useState(false)

  // User Data
  const [userEmail, setUserEmail] = useState("")
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
  const [confirmPin, setConfirmPin] = useState("")
  const [isSavingPin, setIsSavingPin] = useState(false)
  const [pinLockout, setPinLockout] = useState(true)

  // States - Company Profile
  const [companyName, setCompanyName] = useState("")
  const [supportPhone, setSupportPhone] = useState("")
  const [pixKey, setPixKey] = useState("")
  const [pixName, setPixName] = useState("")
  const [pixBank, setPixBank] = useState("")
  const [whatsappChannelLink, setWhatsappChannelLink] = useState("")
  const [timezone, setTimezone] = useState("-03:00")
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  // Aparência - números tabulares (preferência do dispositivo)
  const [tabularNums, setTabularNums] = useState(true)

  useEffect(() => {
    setMounted(true)
    setTabularNums(localStorage.getItem(TABULAR_NUMS_KEY) !== "off")
    checkUserMetadata()
  }, [])

  const checkUserMetadata = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setUserEmail(user.email || "")
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
        setPinLockout(user.user_metadata.security_pin_lockout !== false)
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
    if (!/^\d{4}$/.test(newPin)) return toast.error("O novo PIN deve ter exatos 4 dígitos numéricos.")
    if (newPin !== confirmPin) return toast.error("Os PINs não coincidem.")

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
      setConfirmPin("")
    } catch (error: any) {
      toast.error("Erro ao salvar o PIN de segurança.")
    } finally {
      setIsSavingPin(false)
    }
  }

  const handleToggleLockout = async (checked: boolean) => {
    setPinLockout(checked)
    const { error } = await supabase.auth.updateUser({ data: { security_pin_lockout: checked } })
    if (error) {
      setPinLockout(!checked)
      toast.error("Erro ao salvar a preferência.")
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
      const res = await fetch("/api/stripe/portal", { method: "POST" })
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

  const handleToggleTabularNums = (checked: boolean) => {
    setTabularNums(checked)
    if (checked) {
      localStorage.removeItem(TABULAR_NUMS_KEY)
      document.documentElement.removeAttribute("data-tabular-nums")
    } else {
      localStorage.setItem(TABULAR_NUMS_KEY, "off")
      document.documentElement.setAttribute("data-tabular-nums", "off")
    }
  }

  // Força da senha (barra fina, 5 segmentos)
  const getPasswordStrength = () => {
    if (!newPassword) return { score: 0, text: "—", color: "bg-secondary" }
    let score = 0
    if (newPassword.length > 5) score += 1
    if (newPassword.length > 8) score += 1
    if (/[A-Z]/.test(newPassword)) score += 1
    if (/[0-9]/.test(newPassword)) score += 1
    if (/[^A-Za-z0-9]/.test(newPassword)) score += 1

    if (score <= 2) return { score, text: "Fraca", color: "bg-danger" }
    if (score === 3 || score === 4) return { score, text: "Boa", color: "bg-warning" }
    return { score, text: "Forte", color: "bg-money" }
  }

  const { score: passScore, text: passText, color: passColor } = getPasswordStrength()
  const instancesLimit = isAdmin ? 999 : planName === "Plus" ? 5 : planName === "Pro" ? 3 : 0
  const instancesPercentage = instancesLimit === 999 ? 0 : Math.min((instancesCount / (instancesLimit || 1)) * 100, 100)

  const inputHint = (v: string) => (
    <p className="num text-[10px] text-muted-foreground">{v}</p>
  )

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-10">
      <h1 className="text-[17px] font-semibold tracking-[-0.02em]">Minha conta</h1>
      <AccountTabs />

      {/* Abas internas 5f: underline, sem pills */}
      <div className="flex items-center gap-5 overflow-x-auto border-b border-border pt-1">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 pb-2 text-[11.5px] transition-colors",
              section === s.key
                ? "border-primary font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ═══ EMPRESA & PIX (5f) ═══ */}
      {section === "empresa" && (
        <div className="grid gap-4 pt-1 lg:grid-cols-[1fr_300px] lg:items-start">
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-[13.5px] font-semibold tracking-[-0.01em]">Dados da empresa</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Viram variáveis nas mensagens: {"{{empresa}}"}, {"{{pix}}"}, {"{{telefone_suporte}}"}…
              </p>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="companyName" className="text-[11.5px]">Nome da empresa</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Ex: Master TV Play"
                    className="h-9"
                  />
                  {inputHint("{{empresa}}")}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="supportPhone" className="text-[11.5px]">WhatsApp de suporte</Label>
                  <Input
                    id="supportPhone"
                    value={supportPhone}
                    onChange={(e) => setSupportPhone(e.target.value)}
                    placeholder="(11) 98800-1234"
                    className="h-9"
                  />
                  {inputHint("{{telefone_suporte}}")}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="whatsappChannelLink" className="text-[11.5px]">Link do canal VIP / grupo de avisos</Label>
                <Input
                  id="whatsappChannelLink"
                  value={whatsappChannelLink}
                  onChange={(e) => setWhatsappChannelLink(e.target.value)}
                  placeholder="https://chat.whatsapp.com/..."
                  className="h-9"
                />
                {inputHint("{{link_canal}}")}
              </div>

              <div className="space-y-4 border-t border-border pt-4">
                <p className="microlabel">Recebimento (PIX)</p>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="pixKey" className="text-[11.5px]">Chave PIX</Label>
                    <Input
                      id="pixKey"
                      value={pixKey}
                      onChange={(e) => setPixKey(e.target.value)}
                      placeholder="Celular, CPF, e-mail…"
                      className="h-9"
                    />
                    {inputHint("{{pix}}")}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pixName" className="text-[11.5px]">Titular</Label>
                    <Input
                      id="pixName"
                      value={pixName}
                      onChange={(e) => setPixName(e.target.value)}
                      placeholder="Nome de quem recebe"
                      className="h-9"
                    />
                    {inputHint("{{titular_pix}}")}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pixBank" className="text-[11.5px]">Banco</Label>
                    <Input
                      id="pixBank"
                      value={pixBank}
                      onChange={(e) => setPixBank(e.target.value)}
                      placeholder="Ex: Nubank, Inter"
                      className="h-9"
                    />
                    {inputHint("{{banco_pix}}")}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 border-t border-border pt-4">
                <p className="microlabel mb-3">Sistema</p>
                <Label className="text-[11.5px]">Fuso horário</Label>
                <Select value={timezone} onValueChange={(val) => val && setTimezone(val)}>
                  <SelectTrigger className="h-9 w-full md:w-64">
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
                <p className="text-[10.5px] text-muted-foreground">
                  Os disparos automáticos usam o seu horário local.
                </p>
              </div>
            </div>
            <div className="flex justify-end border-t border-border px-5 py-3">
              <Button size="sm" onClick={handleSaveProfile} disabled={isSavingProfile} className="h-8 px-4 text-xs">
                {isSavingProfile && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>

          {/* Coluna direita: plano + segurança (resumo) */}
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold">Plano {isAdmin ? "Master" : planName}</p>
                <button onClick={() => setSection("plano")} className="text-[11px] font-medium text-interactive hover:underline">
                  Gerenciar
                </button>
              </div>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="text-muted-foreground">Clientes</span>
                    <span className="num">{clientsCount} / ∞</span>
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-interactive" style={{ width: `${Math.min(clientsCount / 5, 40)}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="text-muted-foreground">Instâncias WhatsApp</span>
                    <span className="num">{instancesCount} / {instancesLimit === 999 ? "∞" : instancesLimit}</span>
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn("h-full rounded-full", instancesPercentage >= 100 ? "bg-warning" : "bg-interactive")}
                      style={{ width: `${isAdmin ? 10 : instancesPercentage}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card px-4 py-4">
              <p className="text-[13px] font-semibold">Segurança</p>
              <div className="mt-3 space-y-2.5 text-[11.5px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-muted-foreground">{userEmail || "Conta"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Senha</span>
                  <button onClick={() => setSection("seguranca")} className="font-medium text-interactive hover:underline">
                    Alterar
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Cofre PIN</span>
                  {hasPin ? (
                    <span className="flex items-center gap-1.5 font-medium text-money">
                      <span className="status-dot bg-money" /> Ativo
                    </span>
                  ) : (
                    <button onClick={() => setSection("pin")} className="font-medium text-interactive hover:underline">
                      Configurar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SEGURANÇA (senha) ═══ */}
      {section === "seguranca" && (
        <div className="max-w-md rounded-lg border border-border bg-card pt-1">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-[13.5px] font-semibold tracking-[-0.01em]">Senha</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Usada para entrar na sua conta ({userEmail}).</p>
          </div>
          <div className="space-y-4 px-5 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="old-password" className="text-[11.5px]">Senha atual</Label>
              <Input
                id="old-password"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Sua senha atual"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-[11.5px]">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="h-9"
              />
              <div className="flex items-center gap-2 pt-1">
                <div className="flex h-1 flex-1 gap-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={cn("flex-1 rounded-full transition-colors", level <= passScore ? passColor : "bg-secondary")}
                    />
                  ))}
                </div>
                <span className={cn(
                  "text-[10px] font-medium",
                  passScore >= 5 ? "text-money" : passScore >= 3 ? "text-warning" : passScore > 0 ? "text-danger" : "text-muted-foreground"
                )}>
                  {passText}
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-[11.5px]">Confirmar nova senha</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                className="h-9"
              />
            </div>
          </div>
          <div className="flex justify-end border-t border-border px-5 py-3">
            <Button
              size="sm"
              onClick={handlePasswordChange}
              disabled={!oldPassword || !newPassword || newPassword !== confirmPassword || isChangingPassword || passScore < 2}
              className="h-8 px-4 text-xs"
            >
              {isChangingPassword && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Atualizar senha
            </Button>
          </div>
        </div>
      )}

      {/* ═══ COFRE PIN (11e) ═══ */}
      {section === "pin" && (
        <div className="max-w-md rounded-lg border border-border bg-card pt-1">
          <div className="px-5 py-4">
            <div className="flex items-center gap-2">
              <h2 className="text-[13.5px] font-semibold tracking-[-0.01em]">Cofre PIN</h2>
              {hasPin ? (
                <span className="num rounded bg-success-bg px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.06em] text-success-fg">ATIVO</span>
              ) : (
                <span className="num rounded bg-secondary px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.06em] text-secondary-foreground">INATIVO</span>
              )}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Protege ações irreversíveis: exclusões, dados de pagamento e desconexão do WhatsApp.
            </p>
          </div>
          <div className="space-y-3 px-5 pb-4">
            <p className="text-[11.5px] font-medium">{hasPin ? "Alterar PIN" : "Criar PIN"}</p>
            {hasPin && (
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={oldPin}
                onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ""))}
                placeholder="PIN atual"
                className="num h-9"
              />
            )}
            <Input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
              placeholder="Novo PIN — 4 dígitos"
              className="num h-9"
            />
            <Input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
              placeholder="Confirmar novo PIN"
              className="num h-9"
            />
            <div className="flex items-center gap-4 pt-1">
              <Button
                size="sm"
                onClick={handleSavePin}
                disabled={(hasPin && oldPin.length !== 4) || newPin.length !== 4 || confirmPin.length !== 4 || isSavingPin}
                className="h-8 px-4 text-xs"
              >
                {isSavingPin && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Salvar PIN
              </Button>
              <Link href="/suporte" className="text-[11.5px] font-medium text-interactive hover:underline">
                Esqueci meu PIN
              </Link>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <span className="text-[11.5px] text-muted-foreground">Bloquear após 3 tentativas erradas</span>
            <Switch checked={pinLockout} onCheckedChange={handleToggleLockout} />
          </div>
        </div>
      )}

      {/* ═══ APARÊNCIA (11e) ═══ */}
      {section === "aparencia" && (
        <div className="max-w-md rounded-lg border border-border bg-card pt-1">
          <div className="px-5 py-4">
            <h2 className="text-[13.5px] font-semibold tracking-[-0.01em]">Aparência</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Vale para este dispositivo.</p>
          </div>
          <div className="px-5 pb-4">
            <div className="grid grid-cols-3 gap-3">
              {([
                { key: "light", label: "Claro" },
                { key: "dark", label: "Escuro" },
                { key: "system", label: "Sistema" },
              ] as const).map((opt) => {
                const selected = mounted && theme === opt.key
                return (
                  <button key={opt.key} onClick={() => setTheme(opt.key)} className="group text-center">
                    {/* Mini-preview: cores fixas de propósito — o thumbnail retrata o próprio tema */}
                    <div
                      className={cn(
                        "h-14 overflow-hidden rounded-md border transition-colors",
                        selected ? "border-[1.5px] border-ring" : "border-border group-hover:border-input"
                      )}
                    >
                      {opt.key === "light" && (
                        <div className="h-full space-y-1.5 bg-[#fbfbfa] p-2">
                          <div className="h-1.5 w-3/4 rounded-sm bg-[#e4e3df]" />
                          <div className="h-1.5 w-1/2 rounded-sm bg-[#e4e3df]" />
                        </div>
                      )}
                      {opt.key === "dark" && (
                        <div className="h-full space-y-1.5 bg-[#1b1c1f] p-2">
                          <div className="h-1.5 w-3/4 rounded-sm bg-[#33343a]" />
                          <div className="h-1.5 w-1/2 rounded-sm bg-[#33343a]" />
                        </div>
                      )}
                      {opt.key === "system" && (
                        <div className="flex h-full">
                          <div className="h-full w-1/2 bg-[#fbfbfa]" />
                          <div className="h-full w-1/2 bg-[#1b1c1f]" />
                        </div>
                      )}
                    </div>
                    <span className={cn("mt-1.5 block text-[11px]", selected ? "font-semibold text-foreground" : "text-muted-foreground")}>
                      {opt.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <span className="text-[11.5px] text-muted-foreground">Números em fonte tabular (alinhar colunas)</span>
            <Switch checked={tabularNums} onCheckedChange={handleToggleTabularNums} />
          </div>
        </div>
      )}

      {/* ═══ PLANO & CONSUMO (5f) ═══ */}
      {section === "plano" && (
        <div className="max-w-md rounded-lg border border-border bg-card pt-1">
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <h2 className="text-[13.5px] font-semibold tracking-[-0.01em]">Plano {isAdmin ? "Master" : planName}</h2>
              <span className="num rounded bg-success-bg px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.06em] text-success-fg">ATIVO</span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {planExpiresAt
                ? `Vence em ${new Date(planExpiresAt).toLocaleDateString('pt-BR')}`
                : "Pagamento em dia"}
            </p>
          </div>
          <div className="space-y-4 px-5 py-4">
            <div>
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="text-muted-foreground">Clientes cadastrados</span>
                <span className="num">{clientsCount} / ∞</span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-interactive" style={{ width: `${Math.min(clientsCount / 5, 40)}%` }} />
              </div>
              <p className="mt-1 text-[10.5px] text-muted-foreground">Clientes ilimitados no seu plano atual.</p>
            </div>
            <div>
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="text-muted-foreground">Instâncias WhatsApp</span>
                <span className="num">{instancesCount} / {instancesLimit === 999 ? "∞" : instancesLimit}</span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn("h-full rounded-full", instancesPercentage >= 100 ? "bg-warning" : "bg-interactive")}
                  style={{ width: `${isAdmin ? 10 : instancesPercentage}%` }}
                />
              </div>
              {instancesPercentage >= 100 && !isAdmin && (
                <p className="mt-1 text-[10.5px] text-warning">Limite atingido. Faça upgrade para adicionar mais.</p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleManageSubscription}
              disabled={isPortalLoading}
              className="h-8 text-xs"
            >
              {isPortalLoading && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Gerenciar assinatura
            </Button>
            <Button size="sm" onClick={() => setIsPricingModalOpen(true)} className="h-8 px-4 text-xs">
              Fazer upgrade
            </Button>
          </div>
        </div>
      )}

      <PricingModal open={isPricingModalOpen} onOpenChange={setIsPricingModalOpen} />
    </div>
  )
}

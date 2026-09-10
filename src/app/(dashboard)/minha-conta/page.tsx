"use client"

import { useCallback, useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import { useTheme } from "next-themes"

import { Building2, KeyRound, Palette, ShieldCheck, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { PageHeader, PageShell, SectionCard } from "@/components/page-layout"
import {
  fetchSecurityPinStatus,
  SecurityPinApiError,
  updateSecurityPin,
} from "@/lib/security-pin-client"

// Seções desta página. Afiliados e Notificações não moram aqui: cada uma é um
// destino próprio na navegação lateral, com cabeçalho e identidade próprios.
const SECTIONS = [
  { key: "empresa", label: "Empresa & PIX", icon: Building2 },
  { key: "seguranca", label: "Segurança", icon: ShieldCheck },
  { key: "pin", label: "Cofre PIN", icon: KeyRound },
  { key: "aparencia", label: "Aparência", icon: Palette },
  { key: "plano", label: "Plano & consumo", icon: Wallet },
] as const

type SectionKey = (typeof SECTIONS)[number]["key"]

const TABULAR_NUMS_KEY = "gm_tabular_nums"

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export default function MinhaContaPage() {
  const [section, setSection] = useState<SectionKey>("empresa")
  const [supabase] = useState(() => createClient())
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
  const [planName, setPlanName] = useState("Starter")
  const [planExpiresAt, setPlanExpiresAt] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState<boolean>(false)
  const [instancesCount, setInstancesCount] = useState(0)
  const [clientsCount, setClientsCount] = useState(0)
  const [clientsLimit, setClientsLimit] = useState<number | null>(100)
  const [whatsappInstancesLimit, setWhatsappInstancesLimit] = useState(1)

  // States - PIN
  const [hasPin, setHasPin] = useState(false)
  const [oldPin, setOldPin] = useState("")
  const [newPin, setNewPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [isSavingPin, setIsSavingPin] = useState(false)
  const [pinLockedUntil, setPinLockedUntil] = useState<string | null>(null)

  // States - Company Profile
  const [companyName, setCompanyName] = useState("")
  const [supportPhone, setSupportPhone] = useState("")
  const [pixKey, setPixKey] = useState("")
  const [pixName, setPixName] = useState("")
  const [pixBank, setPixBank] = useState("")
  const [whatsappChannelLink, setWhatsappChannelLink] = useState("")
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  // Aparência - números tabulares (preferência do dispositivo)
  const [tabularNums, setTabularNums] = useState(true)

  const checkUserMetadata = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setUserEmail(user.email || "")

      if (user.user_metadata) {
        setCompanyName(user.user_metadata.company_name || "")
        setSupportPhone(user.user_metadata.support_phone || "")
        setPixKey(user.user_metadata.pix_key || "")
        setPixName(user.user_metadata.pix_name || "")
        setPixBank(user.user_metadata.pix_bank || "")
        setWhatsappChannelLink(user.user_metadata.whatsapp_channel_link || "")
      }

      try {
        const pinStatus = await fetchSecurityPinStatus()
        setHasPin(pinStatus.configured)
        setPinLockedUntil(pinStatus.lockedUntil)
      } catch {
        setHasPin(false)
        setPinLockedUntil(null)
      }

      // Plano, limites e consumo vêm do entitlement oficial da organização.
      try {
        const [adminResponse, entitlementResponse] = await Promise.all([
          fetch('/api/admin/check', { cache: 'no-store' }),
          fetch('/api/entitlements', { cache: 'no-store' }),
        ])
        const adminData = await adminResponse.json().catch(() => ({ isAdmin: false }))
        setIsAdmin(Boolean(adminData.isAdmin))

        if (entitlementResponse.ok) {
          const entitlement = await entitlementResponse.json() as {
            plan: 'starter' | 'pro' | 'master'
            expiresAt: string | null
            limits: { clients: number | null; whatsappInstances: number }
            usage: { clients: number; whatsappInstances: number }
          }
          setPlanName(entitlement.plan.charAt(0).toUpperCase() + entitlement.plan.slice(1))
          setPlanExpiresAt(entitlement.expiresAt)
          setClientsLimit(entitlement.limits.clients)
          setWhatsappInstancesLimit(entitlement.limits.whatsappInstances)
          setClientsCount(entitlement.usage.clients)
          setInstancesCount(entitlement.usage.whatsappInstances)
        }
      } catch {
        setIsAdmin(false)
      }

    }
  }, [supabase])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMounted(true)
      setTabularNums(localStorage.getItem(TABULAR_NUMS_KEY) !== "off")
      void checkUserMetadata()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [checkUserMetadata])

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
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Erro ao alterar a senha."))
    } finally {
      setIsChangingPassword(false)
    }
  }

  // Handlers - PIN
  const handleSavePin = async () => {
    if (!/^\d{4}$/.test(newPin)) return toast.error("O novo PIN deve ter exatos 4 dígitos numéricos.")
    if (newPin !== confirmPin) return toast.error("Os PINs não coincidem.")

    setIsSavingPin(true)
    try {
      await updateSecurityPin(newPin, hasPin ? oldPin : undefined)

      toast.success(hasPin ? "PIN atualizado com sucesso!" : "PIN de segurança configurado com sucesso!")
      setHasPin(true)
      setPinLockedUntil(null)
      setOldPin("")
      setNewPin("")
      setConfirmPin("")
    } catch (error) {
      if (error instanceof SecurityPinApiError && error.lockedUntil) {
        setPinLockedUntil(error.lockedUntil)
      }
      toast.error(error instanceof SecurityPinApiError ? error.message : "Erro ao salvar o PIN de segurança.")
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
        }
      })
      if (error) throw error
      toast.success("Dados da empresa atualizados com sucesso!")
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Erro ao salvar dados da empresa."))
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
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Erro ao abrir o portal de faturamento."))
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
  const instancesLimit = isAdmin ? null : whatsappInstancesLimit
  const effectiveClientsLimit = isAdmin ? null : clientsLimit
  const instancesPercentage = instancesLimit === null ? 0 : Math.min((instancesCount / Math.max(instancesLimit, 1)) * 100, 100)
  const clientsPercentage = effectiveClientsLimit === null ? 0 : Math.min((clientsCount / Math.max(effectiveClientsLimit, 1)) * 100, 100)
  const isPinLocked = Boolean(pinLockedUntil)

  const inputHint = (v: string) => (
    <p className="num text-[10px] text-muted-foreground">{v}</p>
  )

  return (
    <PageShell width="default">
      <PageHeader eyebrow="Conta e assinatura" title="Minha conta" description="Gerencie empresa, segurança, aparência e os limites do seu plano." badge={planName} />

      {/* Navegação das seções desta página — a única barra de navegação daqui.
          Afiliados e Notificações são destinos próprios na navegação lateral,
          não abas desta tela. */}
      <nav aria-label="Seções de Minha conta" className="overflow-x-auto rounded-xl border border-border bg-muted/50 p-1">
        <div className="grid min-w-[560px] grid-cols-5 gap-1">
          {SECTIONS.map((s) => {
            const Icon = s.icon
            const active = section === s.key
            return (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium text-muted-foreground transition-[background-color,color,box-shadow] hover:bg-background/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active && "bg-background text-foreground shadow-sm"
                )}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{s.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* --- EMPRESA & PIX --- */}
      {section === "empresa" && (
        <div className="grid gap-4 pt-1 lg:grid-cols-[1fr_300px] lg:items-start">
          <SectionCard
            title="Dados da empresa"
            description={<>Viram variáveis nas mensagens: {"{{empresa}}"}, {"{{pix}}"}, {"{{telefone_suporte}}"}…</>}
            footer={
              <Button size="sm" onClick={handleSaveProfile} disabled={isSavingProfile} className="ml-auto h-8 px-4 text-xs">
                {isSavingProfile && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Salvar
              </Button>
            }
          >
            <div className="space-y-4">
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

              <div className="border-t border-border pt-4">
                <p className="microlabel">Prévia da mensagem</p>
                <div className="mt-2.5 max-w-[340px] rounded-[11px] rounded-bl-[3px] bg-success-bg px-3 py-2.5">
                  <p className="text-[12px] leading-[1.55] text-foreground">Olá! Seu plano vence em 3 dias. Deseja renovar?</p>
                  <p className="mt-2 text-[11px] font-semibold text-money">{companyName || "— Sua empresa"}</p>
                </div>
                <p className="mt-2 text-[10.5px] text-muted-foreground">
                  O fuso horário dos disparos fica em{" "}
                  <Link href="/configuracoes" className="font-medium text-interactive hover:underline">
                    Configurações › Perfil
                  </Link>
                  .
                </p>
              </div>
            </div>
          </SectionCard>

          {/* Coluna direita: plano + segurança (resumo) */}
          <div className="space-y-4">
            <SectionCard
              title={`Plano ${isAdmin ? "Master" : planName}`}
              headerAction={
                <button onClick={() => setSection("plano")} className="text-[11px] font-medium text-interactive hover:underline">
                  Gerenciar
                </button>
              }
            >
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="text-muted-foreground">Clientes</span>
                    <span className="num">{clientsCount} / {effectiveClientsLimit ?? "Ilimitado"}</span>
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-interactive" style={{ width: `${clientsPercentage}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="text-muted-foreground">Instâncias WhatsApp</span>
                    <span className="num">{instancesCount} / {instancesLimit ?? "Ilimitado"}</span>
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn("h-full rounded-full", instancesPercentage >= 100 ? "bg-warning" : "bg-interactive")}
                      style={{ width: `${isAdmin ? 10 : instancesPercentage}%` }}
                    />
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Segurança">
              <div className="space-y-2.5 text-[11.5px]">
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
            </SectionCard>
          </div>
        </div>
      )}

      {/* --- SEGURANÇA (senha) --- */}
      {section === "seguranca" && (
        <div className="max-w-md pt-1">
          <SectionCard
            title="Senha"
            description={`Usada para entrar na sua conta (${userEmail}).`}
            footer={
              <Button
                size="sm"
                onClick={handlePasswordChange}
                disabled={!oldPassword || !newPassword || newPassword !== confirmPassword || isChangingPassword || passScore < 2}
                className="ml-auto h-8 px-4 text-xs"
              >
                {isChangingPassword && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Atualizar senha
              </Button>
            }
          >
            <div className="space-y-4">
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
          </SectionCard>
        </div>
      )}

      {/* --- COFRE PIN --- */}
      {section === "pin" && (
        <div className="max-w-md pt-1">
          <SectionCard
            title="Cofre PIN"
            headerBadge={
              isPinLocked ? (
                <span className="num rounded bg-danger-bg px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.06em] text-danger-fg">BLOQUEADO</span>
              ) : hasPin ? (
                <span className="num rounded bg-success-bg px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.06em] text-success-fg">ATIVO</span>
              ) : (
                <span className="num rounded bg-secondary px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.06em] text-secondary-foreground">INATIVO</span>
              )
            }
            description="Autoriza exclusões irreversíveis sem expor o PIN na sessão ou no navegador."
            footer={
              <div className="flex w-full items-center justify-between">
                <span className="text-[11.5px] text-muted-foreground">Bloqueio obrigatório após 3 erros</span>
                <span className="rounded bg-success-bg px-2 py-1 text-[10px] font-semibold text-success-fg">15 MIN</span>
              </div>
            }
          >
            <div className="space-y-3">
            <p className="text-[11.5px] font-medium">{hasPin ? "Alterar PIN" : "Criar PIN"}</p>
            {isPinLocked && (
              <p className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-[11px] text-danger-fg">
                O PIN foi bloqueado após três erros. Aguarde 15 minutos para tentar novamente.
              </p>
            )}
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
                disabled={isPinLocked || (hasPin && oldPin.length !== 4) || newPin.length !== 4 || confirmPin.length !== 4 || isSavingPin}
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
          </SectionCard>
        </div>
      )}

      {/* --- APARÊNCIA --- */}
      {section === "aparencia" && (
        <div className="max-w-md pt-1">
          <SectionCard
            title="Aparência"
            description="Vale para este dispositivo."
            footer={
              <div className="flex w-full items-center justify-between">
                <span className="text-[11.5px] text-muted-foreground">Números em fonte tabular (alinhar colunas)</span>
                <Switch checked={tabularNums} onCheckedChange={handleToggleTabularNums} />
              </div>
            }
          >
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
          </SectionCard>
        </div>
      )}

      {/* --- PLANO & CONSUMO --- */}
      {section === "plano" && (
        <div className="max-w-md pt-1">
          <SectionCard
            title={`Plano ${isAdmin ? "Master" : planName}`}
            headerBadge={<span className="num rounded bg-success-bg px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.06em] text-success-fg">ATIVO</span>}
            description={planExpiresAt ? `Vence em ${new Date(planExpiresAt).toLocaleDateString('pt-BR')}` : "Pagamento em dia"}
            footer={
              <div className="flex w-full items-center justify-end gap-2">
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
                <Button size="sm" onClick={() => { window.location.href = "/planos" }} className="h-8 px-4 text-xs">Ver planos e fazer upgrade</Button>
              </div>
            }
          >
            <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="text-muted-foreground">Clientes cadastrados</span>
                <span className="num">{clientsCount} / {effectiveClientsLimit ?? "Ilimitado"}</span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-interactive" style={{ width: `${clientsPercentage}%` }} />
              </div>
              <p className="mt-1 text-[10.5px] text-muted-foreground">{effectiveClientsLimit === null ? 'Clientes ilimitados no plano atual.' : `Limite oficial do plano: ${effectiveClientsLimit} clientes.`}</p>
            </div>
            <div>
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="text-muted-foreground">Instâncias WhatsApp</span>
                <span className="num">{instancesCount} / {instancesLimit ?? "Ilimitado"}</span>
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
          </SectionCard>
        </div>
      )}

    </PageShell>
  )
}

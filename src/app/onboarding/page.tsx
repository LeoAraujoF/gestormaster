"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Check, Copy, Loader2, QrCode, RefreshCw, Smartphone } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { normalizeClientPhone, normalizeWhatsAppNumber } from "@/lib/phone"

/* ——————————————————————————————————————————————
   Types
—————————————————————————————————————————————— */
type Step = 1 | 2 | 3
type ConnectionMethod = "pairing" | "qr"

interface InstanceStatus {
  status: "connected" | "disconnected" | "error"
  qr_code?: string | null
  phone_number?: string | null
  instance_name?: string
}

/* ——————————————————————————————————————————————
   Stepper Component
—————————————————————————————————————————————— */
const steps = [
  { num: 1, label: "Conectar WhatsApp" },
  { num: 2, label: "Primeiro cliente" },
  { num: 3, label: "Pronto" },
] as const

function Stepper({ current }: { current: Step }) {
  return (
    <div className="mb-8 flex w-full items-center sm:mb-10">
      {steps.map((step, i) => (
        <div key={step.num} className={cn("flex min-w-0 items-center", i < steps.length - 1 && "flex-1")}>
          {/* Circle + label */}
          <div className="flex shrink-0 items-center gap-2">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                step.num < current
                  ? "bg-primary text-primary-foreground"
                  : step.num === current
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground"
              )}
            >
              {step.num < current ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                step.num
              )}
            </div>
            <span
              className={cn(
                "hidden whitespace-nowrap text-sm sm:inline",
                step.num === current
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
          </div>

          {/* Connector line */}
          {i < steps.length - 1 && (
            <div className="mx-2 h-px min-w-4 flex-1 bg-border sm:mx-3 sm:min-w-16" />
          )}
        </div>
      ))}
    </div>
  )
}

/* ——————————————————————————————————————————————
   Main OnboardingPage
—————————————————————————————————————————————— */
export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [currentStep, setCurrentStep] = useState<Step>(1)
  const [isLoading, setIsLoading] = useState(false)

  // Step 1 — WhatsApp state
  const [connectionMethod, setConnectionMethod] = useState<ConnectionMethod>("pairing")
  const [pairingPhone, setPairingPhone] = useState("")
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [instanceName, setInstanceName] = useState<string | null>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // Step 2 — Client state
  const [clientName, setClientName] = useState("")
  const [clientWhatsApp, setClientWhatsApp] = useState("")
  const [selectedService, setSelectedService] = useState<string>("")
  const [services, setServices] = useState<{ id: string; name: string }[]>([])
  const [isCreatingClient, setIsCreatingClient] = useState(false)

  /* ——— Step 1: Connect WhatsApp ——— */

  const connectWhatsApp = useCallback(async () => {
    const normalizedPhone = connectionMethod === "pairing" ? normalizeWhatsAppNumber(pairingPhone) : null
    if (connectionMethod === "pairing" && !normalizedPhone) {
      toast.error("Informe um WhatsApp válido com código do país, por exemplo +55 11 99999-9999.")
      return
    }

    setIsConnecting(true)
    try {
      const res = await fetch("/api/evolution/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "integrated",
          connectionMethod,
          phone: connectionMethod === "pairing" ? normalizedPhone : undefined,
          instanceName: instanceName || undefined,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || "Erro ao conectar")
        return
      }

      setPairingCode(data.pairingCode || null)
      setQrCode(data.base64 || null)
      if (data.instanceName) {
        setInstanceName(data.instanceName)
      }
      if (connectionMethod === "pairing" && !data.pairingCode && data.base64) {
        toast.warning("O código não ficou disponível. Use o QR Code alternativo.")
      } else if (connectionMethod === "pairing" && data.pairingCode) {
        toast.success("Código de pareamento gerado.")
      }
    } catch {
      toast.error("Erro de rede ao conectar")
    } finally {
      setIsConnecting(false)
    }
  }, [connectionMethod, instanceName, pairingPhone])

  const copyPairingCode = async () => {
    if (!pairingCode) return
    try {
      await navigator.clipboard.writeText(pairingCode)
      toast.success("Código copiado.")
    } catch {
      toast.error("Não foi possível copiar. Selecione o código manualmente.")
    }
  }

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/evolution/status")
      const data = await res.json()

      if (data.instances && data.instances.length > 0) {
        const inst = data.instances.find(
          (i: InstanceStatus) => i.status === "connected"
        )
        if (inst) {
          setIsConnected(true)
          setPairingCode(null)
          setQrCode(null)
          if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
          }
          return
        }
        // Update QR if available
        const lastInst = data.instances[data.instances.length - 1]
        if (lastInst.qr_code && !isConnected) {
          setQrCode(lastInst.qr_code)
        }
      }
    } catch {
      // Silently ignore polling errors
    }
  }, [isConnected])

  // Poll status every 5s
  useEffect(() => {
    if (currentStep !== 1 || isConnected) return

    pollRef.current = setInterval(checkStatus, 5000)
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [currentStep, isConnected, checkStatus])

  const handleRegenerateConnection = async () => {
    setPairingCode(null)
    setQrCode(null)
    await connectWhatsApp()
  }

  /* ——— Step 2: First client ——— */

  // Load services when entering step 2
  useEffect(() => {
    if (currentStep !== 2) return

    const loadServices = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from("services")
        .select("id, name")
        .eq("user_id", user.id)
        .eq("status", "active")

      if (data) setServices(data)
    }

    loadServices()
  }, [currentStep, supabase])

  const handleCreateClient = async () => {
    if (!clientName.trim()) {
      toast.error("Informe o nome do cliente")
      return
    }

    setIsCreatingClient(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error("Sessão expirada")
        router.push("/login")
        return
      }

      const normalizedPhone = normalizeClientPhone(clientWhatsApp)
      if (clientWhatsApp.trim() && !normalizedPhone.phone_e164) {
        toast.error("Informe o WhatsApp com código do país, por exemplo +55 11 99999-9999 ou +1 202 555 0123.")
        return
      }

      const clientData: Record<string, unknown> = {
        user_id: user.id,
        name: clientName.trim(),
        ...normalizedPhone,
        status: "active",
      }
      if (selectedService) {
        clientData.service_id = selectedService
      }

      const { error } = await supabase.from("clients").insert(clientData)

      if (error) {
        toast.error(error.message)
        return
      }

      toast.success("Cliente criado com sucesso!")
      setCurrentStep(3)
    } catch {
      toast.error("Erro ao criar cliente")
    } finally {
      setIsCreatingClient(false)
    }
  }

  /* ——— Step 3: Complete onboarding ——— */

  const handleComplete = async () => {
    setIsLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({
        data: { onboarding_completed: true },
      })

      if (error) {
        toast.error(error.message)
        return
      }

      toast.success("Tudo pronto! Boas-vindas à Lembrado.")
      window.location.href = "/planos"
    } catch {
      toast.error("Erro inesperado")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSkipToEnd = async () => {
    setIsLoading(true)
    try {
      // Stop polling
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }

      const { error } = await supabase.auth.updateUser({
        data: { onboarding_completed: true },
      })

      if (error) {
        toast.error(error.message)
        return
      }

      toast.success("Você pode conectar depois nas Configurações.")
      window.location.href = "/planos"
    } catch {
      toast.error("Erro inesperado")
    } finally {
      setIsLoading(false)
    }
  }

  /* ——————————————————————————————————————————
     RENDER
  —————————————————————————————————————————— */
  return (
    <div className="w-full max-w-xl">
      <Stepper current={currentStep} />

      {/* ─── Step 1: Conectar WhatsApp ─── */}
      {currentStep === 1 && (
        <div className="bg-card border border-border rounded-xl p-6 sm:p-8">
          <h2 className="text-[15px] font-semibold text-foreground leading-tight">
            Conecte seu WhatsApp
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            É por ele que a Lembrado cobra seus clientes. Conecte por código ou use o QR Code.
          </p>

          {!isConnected && (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-2" aria-label="Método de conexão">
                {([
                  { value: "pairing" as const, label: "Código", icon: Smartphone },
                  { value: "qr" as const, label: "QR Code", icon: QrCode },
                ]).map(({ value, label, icon: Icon }) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={connectionMethod === value}
                    onClick={() => {
                      setConnectionMethod(value)
                      setPairingCode(null)
                      setQrCode(null)
                    }}
                    className={cn(
                      "flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      connectionMethod === value
                        ? "border-foreground/25 bg-secondary text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className="size-4" /> {label}
                  </button>
                ))}
              </div>

              {connectionMethod === "pairing" && (
                <div className="space-y-1.5">
                  <Label htmlFor="onboarding-pairing-phone">Número do WhatsApp</Label>
                  <Input
                    id="onboarding-pairing-phone"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+55 11 99999-9999"
                    value={pairingPhone}
                    onChange={(event) => setPairingPhone(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Use o DDI. Ex.: +55 11 99999-9999 ou +1 202 555 0123.</p>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-6 sm:flex-row">
            <div className="flex-shrink-0">
              <div className="flex h-[160px] w-[160px] items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
                {isConnected ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--success-bg)]">
                      <Check className="h-5 w-5 text-[var(--success-fg)]" />
                    </div>
                    <span className="text-xs font-medium text-[var(--success-fg)]">Conectado</span>
                  </div>
                ) : isConnecting ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : pairingCode ? (
                  <div className="px-3 text-center">
                    <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Seu código</p>
                    <p className="num mt-2 select-all text-xl font-semibold tracking-[0.16em] text-foreground">
                      {pairingCode.match(/.{1,4}/g)?.join(" ") || pairingCode}
                    </p>
                  </div>
                ) : qrCode ? (
                  <Image
                    src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                    alt="QR Code para conectar o WhatsApp"
                    width={148}
                    height={148}
                    className="object-contain"
                    unoptimized
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    {connectionMethod === "pairing" ? <Smartphone className="h-8 w-8" /> : <QrCode className="h-8 w-8" />}
                    <span className="text-xs">Pronto para gerar</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-1 flex-col justify-center gap-3" aria-live="polite">
              {isConnected ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="h-[7px] w-[7px] rounded-full bg-[var(--money)]" />
                    <span className="text-sm font-medium text-foreground">Conectado!</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Seu WhatsApp está pronto. Continue para o próximo passo.
                  </p>
                </>
              ) : pairingCode ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="h-[7px] w-[7px] rounded-full bg-[var(--warning)]" />
                    <span className="text-sm font-medium text-foreground">Aguardando confirmação</span>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    No WhatsApp, abra Aparelhos conectados → Conectar aparelho → Conectar com número de telefone.
                  </p>
                  <button
                    type="button"
                    onClick={copyPairingCode}
                    className="flex min-h-11 w-fit items-center gap-1.5 text-left text-sm font-medium text-[var(--interactive)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copiar código
                  </button>
                </>
              ) : qrCode ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="h-[7px] w-[7px] rounded-full bg-[var(--warning)]" />
                    <span className="text-sm font-medium text-foreground">Aguardando leitura</span>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    No WhatsApp, abra Aparelhos conectados → Conectar aparelho e escaneie o QR Code.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {connectionMethod === "pairing"
                      ? "Use um número dedicado ao negócio. O código é temporário e não será armazenado."
                      : "Abra o WhatsApp em Aparelhos conectados quando o QR Code aparecer."}
                  </p>
                  <Button type="button" onClick={connectWhatsApp} disabled={isConnecting} className="w-full sm:w-fit">
                    {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {connectionMethod === "pairing" ? "Gerar código" : "Gerar QR Code"}
                  </Button>
                </>
              )}

              {!isConnected && (pairingCode || qrCode) && (
                <button
                  type="button"
                  onClick={handleRegenerateConnection}
                  disabled={isConnecting}
                  className="flex min-h-11 w-fit items-center gap-1.5 text-left text-sm font-medium text-[var(--interactive)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {isConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Gerar novamente
                </button>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mt-8">
            <Button
              variant="outline"
              onClick={handleSkipToEnd}
              disabled={isLoading}
              className="flex-1 h-10"
            >
              Fazer depois
            </Button>
            <Button
              onClick={() => setCurrentStep(2)}
              disabled={!isConnected}
              className="flex-1 h-10"
            >
              Continuar
            </Button>
          </div>
          {!isConnected && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              libera quando o número conectar
            </p>
          )}
        </div>
      )}

      {/* ─── Step 2: Primeiro cliente ─── */}
      {currentStep === 2 && (
        <div className="bg-card border border-border rounded-xl p-6 sm:p-8">
          <h2 className="text-[15px] font-semibold text-foreground leading-tight">
            Adicione seu primeiro cliente
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            Cadastre um cliente para testar o fluxo de cobrança automática.
          </p>

          <div className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="client-name" className="text-sm">
                Nome do cliente
              </Label>
              <Input
                id="client-name"
                placeholder="Ex: João Silva"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="client-whatsapp" className="text-sm">
                WhatsApp{" "}
                <span className="text-muted-foreground font-normal">
                  (opcional)
                </span>
              </Label>
              <Input
                id="client-whatsapp"
                placeholder="+55 11 99999-9999 ou +1 202 555 0123"
                value={clientWhatsApp}
                onChange={(e) => setClientWhatsApp(e.target.value)}
                className="h-10"
              />
              <p className="text-xs text-muted-foreground">Use o código do país para números internacionais.</p>
            </div>

            {services.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="client-service" className="text-sm">
                  Serviço
                </Label>
                <Select
                  value={selectedService}
                  onValueChange={(v) => setSelectedService(v || "")}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Selecione um serviço" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-8">
            <Button
              variant="outline"
              onClick={() => setCurrentStep(3)}
              className="flex-1 h-10"
            >
              Pular
            </Button>
            <Button
              onClick={handleCreateClient}
              disabled={isCreatingClient || !clientName.trim()}
              className="flex-1 h-10"
            >
              {isCreatingClient ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Criar cliente"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Pronto ─── */}
      {currentStep === 3 && (
        <div className="bg-card border border-border rounded-xl p-6 sm:p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-[var(--success-bg)] flex items-center justify-center mx-auto">
            <Check className="w-7 h-7 text-[var(--success-fg)]" />
          </div>

          <h2 className="text-[15px] font-semibold text-foreground mt-5">
            Tudo pronto!
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-sm mx-auto">
            Seu espaço está configurado. Explore o painel, crie serviços e
            comece a cobrar automaticamente.
          </p>

          <Button
            onClick={handleComplete}
            disabled={isLoading}
            className="mt-6 h-10 px-8"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Ir para o painel"
            )}
          </Button>
        </div>
      )}
    </div>
  )
}

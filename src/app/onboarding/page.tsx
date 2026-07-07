"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Loader2, Check, RefreshCw } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

/* ——————————————————————————————————————————————
   Types
—————————————————————————————————————————————— */
type Step = 1 | 2 | 3

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
    <div className="flex items-center justify-center gap-0 mb-10">
      {steps.map((step, i) => (
        <div key={step.num} className="flex items-center">
          {/* Circle + label */}
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors",
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
                "text-sm whitespace-nowrap",
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
            <div className="w-16 sm:w-24 h-px bg-border mx-3" />
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
    setIsConnecting(true)
    try {
      const res = await fetch("/api/evolution/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "integrated" }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || "Erro ao conectar")
        return
      }

      if (data.base64) {
        setQrCode(data.base64)
      }
      if (data.instanceName) {
        setInstanceName(data.instanceName)
      }
    } catch {
      toast.error("Erro de rede ao conectar")
    } finally {
      setIsConnecting(false)
    }
  }, [])

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

  // Auto-connect on mount
  useEffect(() => {
    connectWhatsApp()
  }, [connectWhatsApp])

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

  const handleRegenerateQR = async () => {
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

      const clientData: Record<string, unknown> = {
        user_id: user.id,
        name: clientName.trim(),
        whatsapp: clientWhatsApp.replace(/\D/g, "") || null,
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

      toast.success("Tudo pronto! Bem-vindo ao Gestor Master.")
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
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            É por ele que o Gestor cobra seus clientes. Abra o WhatsApp →{" "}
            <strong className="text-foreground">Aparelhos conectados</strong>{" "}
            → escaneie o código.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 mt-6">
            {/* QR Code */}
            <div className="flex-shrink-0">
              <div className="w-[160px] h-[160px] rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden">
                {isConnecting && !qrCode ? (
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                ) : qrCode ? (
                  <Image
                    src={
                      qrCode.startsWith("data:")
                        ? qrCode
                        : `data:image/png;base64,${qrCode}`
                    }
                    alt="QR Code WhatsApp"
                    width={148}
                    height={148}
                    className="object-contain"
                    unoptimized
                  />
                ) : isConnected ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-[var(--success-bg)] flex items-center justify-center">
                      <Check className="w-5 h-5 text-[var(--success-fg)]" />
                    </div>
                    <span className="text-xs text-[var(--success-fg)] font-medium">Conectado</span>
                  </div>
                ) : (
                  <div className="w-full h-full bg-muted animate-pulse rounded" />
                )}
              </div>
            </div>

            {/* Status info */}
            <div className="flex-1 flex flex-col justify-center gap-3">
              {isConnected ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="w-[7px] h-[7px] rounded-full bg-[var(--money)]" />
                    <span className="text-sm font-medium text-foreground">
                      Conectado!
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Seu WhatsApp está pronto. Continue para o próximo passo.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="w-[7px] h-[7px] rounded-full bg-[var(--warning)]" />
                    <span className="text-sm text-foreground">
                      Aguardando leitura...
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Use um número dedicado ao negócio — o aquecimento protege
                    números novos.
                  </p>
                  <button
                    onClick={handleRegenerateQR}
                    disabled={isConnecting}
                    className="text-sm font-medium text-[var(--interactive)] hover:underline text-left w-fit disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isConnecting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    Gerar novo código
                  </button>
                </>
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
                placeholder="(11) 99999-9999"
                value={clientWhatsApp}
                onChange={(e) => setClientWhatsApp(e.target.value)}
                className="h-10"
              />
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

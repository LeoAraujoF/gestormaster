"use client"

import { useState, useEffect } from "react"
import { Loader2, Copy, Check } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

interface PricingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type PayMethod = "pix" | "card" | "credit"

const PLAN_PRICE = 20
const FEATURES: { label: string; value: string; money?: boolean }[] = [
  { label: "Gestão de clientes", value: "Ilimitada" },
  { label: "Conexões WhatsApp", value: "3 números" },
  { label: "Automação de cobrança", value: "Ilimitada" },
  { label: "Anti-ban / aquecimento", value: "Incluso", money: true },
  { label: "Disparos em massa", value: "Incluso" },
]

export function PricingModal({ open, onOpenChange }: PricingModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pixData, setPixData] = useState<{ qr_code: string, qr_image_url: string } | null>(null)
  const [isCopied, setIsCopied] = useState(false)
  const [method, setMethod] = useState<PayMethod>("pix")
  const [affiliateBalance, setAffiliateBalance] = useState<number | null>(null)

  const router = useRouter()
  const supabase = createClient()

  // Saldo de afiliado — a opção só aparece quando cobre o valor (8a)
  useEffect(() => {
    if (!open) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('affiliate_earnings').select('amount, status').eq('referrer_id', user.id).then(({ data }) => {
        if (data) {
          let disponivel = 0
          data.forEach(e => {
            if (e.status === 'available') disponivel += Number(e.amount)
            if (e.status === 'paid' && Number(e.amount) < 0) disponivel += Number(e.amount)
          })
          setAffiliateBalance(disponivel)
        }
      })
    })
  }, [open, supabase])

  // --- Pagamento via Stripe (Cartão) ---
  const handleCardCheckout = async () => {
    const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO || "price_1TjKpNDhR1gtdDDjGOYez8LT"
    if (!priceId || priceId.includes("coloque_id")) {
      throw new Error("O ID de Preço deste plano ainda não foi configurado.")
    }
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId, planName: "Lembrado Pro" })
    })
    if (!res.ok) throw new Error(await res.text() || "Erro ao conectar com a operadora de pagamentos")
    const data = await res.json()
    if (!data.url) throw new Error("URL de checkout inválida.")
    window.location.href = data.url
  }

  // --- Pagamento via PIXGO (PIX Instantâneo) ---
  const handlePixCheckout = async () => {
    const res = await fetch('/api/pixgo/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: PLAN_PRICE, planName: "Lembrado Pro" })
    })
    if (!res.ok) throw new Error(await res.text() || "Erro ao conectar com o gateway de PIX")
    const data = await res.json()
    if (!data.qr_code || !data.qr_image_url) throw new Error("Dados do PIX inválidos recebidos da API.")
    setPixData(data)
  }

  // --- Saldo de afiliado ---
  const handleCreditCheckout = async () => {
    const res = await fetch('/api/afiliados/converter', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Erro ao converter saldo")
    toast.success("Plano ativado com sucesso usando R$ 20 do seu saldo!")
    onOpenChange(false)
    router.refresh()
  }

  const handlePay = async () => {
    setIsSubmitting(true)
    try {
      if (method === "pix") await handlePixCheckout()
      else if (method === "card") await handleCardCheckout()
      else await handleCreditCheckout()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopyPix = () => {
    if (pixData?.qr_code) {
      navigator.clipboard.writeText(pixData.qr_code)
      setIsCopied(true)
      toast.success("Código PIX copiado com sucesso!")
      setTimeout(() => setIsCopied(false), 2000)
    }
  }

  const hasCredit = affiliateBalance !== null && affiliateBalance >= PLAN_PRICE
  const creditMonths = affiliateBalance ? Math.floor(affiliateBalance / PLAN_PRICE) : 0

  const methods: { key: PayMethod; label: string; hint: React.ReactNode; show: boolean }[] = [
    { key: "pix", label: "PIX", hint: "ativação imediata · QR code na próxima etapa", show: true },
    { key: "card", label: "Cartão de crédito", hint: "renovação automática via Stripe", show: true },
    {
      key: "credit",
      label: "Saldo de afiliado",
      hint: (
        <>
          você tem <span className="num font-semibold text-money">R$ {affiliateBalance?.toFixed(2).replace(".", ",") ?? "0,00"}</span>
          {creditMonths > 0 && <> — cobre {creditMonths} {creditMonths === 1 ? "mês" : "meses"}</>}
        </>
      ),
      show: hasCredit,
    },
  ]

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-[14px] font-semibold">Ativar o Lembrado Pro</DialogTitle>
            <DialogDescription className="text-xs">
              Todos os recursos liberados para o seu negócio crescer.
            </DialogDescription>
          </DialogHeader>

          {/* Resumo do plano (8a): preço mono + badge âmbar discreto */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="num text-[24px] font-semibold tracking-[-0.02em]">
                R$ {PLAN_PRICE}<span className="text-sm font-normal text-muted-foreground"> /mês</span>
              </p>
              <span className="microlabel rounded bg-warning-bg px-1.5 py-1 !text-warning-fg">Oferta limitada</span>
            </div>
            <p className="text-[10.5px] text-muted-foreground">cancele quando quiser</p>
            <div className="mt-3 divide-y divide-border border-t border-border text-xs">
              {FEATURES.map((f) => (
                <div key={f.label} className="flex items-center justify-between py-2">
                  <span className="text-muted-foreground">{f.label}</span>
                  <span className={cn("font-semibold", f.money ? "text-money" : "text-foreground")}>{f.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Forma de pagamento (rádios) + UM botão primário tinta */}
          <div>
            <p className="text-[13px] font-semibold">Forma de pagamento</p>
            <div className="mt-2.5 space-y-2">
              {methods.filter((m) => m.show).map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMethod(m.key)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors",
                    method === m.key ? "border-primary" : "border-input hover:bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                      method === m.key ? "border-primary" : "border-input"
                    )}
                  >
                    {method === m.key && <span className="size-1.5 rounded-full bg-primary" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">{m.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{m.hint}</span>
                  </span>
                </button>
              ))}
            </div>

            <Button onClick={handlePay} disabled={isSubmitting} className="mt-3.5 h-10 w-full">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Processando…
                </>
              ) : (
                <>Ativar por R$ {PLAN_PRICE}/mês</>
              )}
            </Button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Pagamento seguro · suporte via WhatsApp
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL DO PIX */}
      <Dialog open={pixData !== null} onOpenChange={(o) => !o && setPixData(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[14px] font-semibold">Pagamento via PIX</DialogTitle>
            <DialogDescription className="text-xs">
              Escaneie o QR Code com o app do seu banco ou copie o código.
            </DialogDescription>
          </DialogHeader>

          {pixData && (
            <div className="flex flex-col items-center space-y-4 py-2">
              <div className="rounded-lg border border-border bg-white p-3">
                <img src={pixData.qr_image_url} alt="QR Code PIX" className="h-44 w-44 object-contain" />
              </div>

              <div className="w-full space-y-1.5">
                <p className="microlabel text-center">PIX copia e cola</p>
                <div className="flex items-center gap-2">
                  <div className="num line-clamp-2 flex-1 break-all rounded-md bg-secondary p-2.5 text-[10px] text-secondary-foreground">
                    {pixData.qr_code}
                  </div>
                  <Button variant="outline" size="icon" className="h-auto shrink-0 px-3 py-3" onClick={handleCopyPix}>
                    {isCopied ? <Check className="size-4 text-money" /> : <Copy className="size-4" />}
                  </Button>
                </div>
              </div>

              <div className="w-full rounded-md border border-warning-border bg-warning-bg p-2.5 text-center text-xs text-warning-fg">
                Após o pagamento, seu acesso será liberado em até 10 segundos.
              </div>
            </div>
          )}

          <DialogFooter className="sm:justify-between">
            <Button variant="outline" onClick={() => setPixData(null)} className="sm:flex-1">
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setPixData(null)
                onOpenChange(false)
                toast.success("Verificando pagamento...")
              }}
              className="sm:flex-[1.4]"
            >
              Já paguei
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

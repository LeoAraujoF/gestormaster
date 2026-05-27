"use client"

import { useState } from "react"
import { Loader2, CreditCard, Zap, QrCode, Copy, Check } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"

interface PricingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PricingModal({ open, onOpenChange }: PricingModalProps) {
  const [isCheckoutLoading, setIsCheckoutLoading] = useState<string | null>(null)
  const [isPixLoading, setIsPixLoading] = useState<string | null>(null)
  const [pixData, setPixData] = useState<{qr_code: string, qr_image_url: string} | null>(null)
  const [isCopied, setIsCopied] = useState(false)

  const router = useRouter()

  // --- Pagamento via Stripe (Cartão) ---
  const handleCheckout = async (priceId: string, planName: string) => {
    if (!priceId || priceId.includes("coloque_id")) {
      return toast.error("O ID de Preço deste plano ainda não foi configurado.")
    }

    setIsCheckoutLoading(priceId)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, planName })
      })
      
      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(errorText || "Erro ao conectar com a operadora de pagamentos")
      }
      
      const data = await res.json()
      
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error("URL de checkout inválida.")
      }
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsCheckoutLoading(null)
    }
  }

  // --- Pagamento via PIXGO (PIX Instantâneo) ---
  const handlePixCheckout = async (amount: number, planName: string) => {
    setIsPixLoading(planName)
    try {
      const res = await fetch('/api/pixgo/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, planName })
      })

      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(errorText || "Erro ao conectar com o gateway de PIX")
      }

      const data = await res.json()
      
      if (data.qr_code && data.qr_image_url) {
        setPixData(data)
      } else {
        throw new Error("Dados do PIX inválidos recebidos da API.")
      }
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsPixLoading(null)
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] md:max-w-5xl max-h-[90vh] overflow-y-auto p-2 sm:p-6 bg-background/95 backdrop-blur-xl border-border/50">
          <DialogHeader className="pt-4 pb-2 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-sky-500" />
            </div>
            <DialogTitle className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Escolha o plano ideal para o seu negócio
            </DialogTitle>
            <DialogDescription className="mt-2 text-lg text-muted-foreground max-w-2xl mx-auto">
              Comece agora mesmo a gerir seus clientes e escalar suas vendas com automação.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center mt-6 py-4">
            
            {/* PLANO LITE */}
            <Card className="glass-card flex flex-col relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:border-slate-500/30">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold">Plano Lite</CardTitle>
                <CardDescription className="h-10 mt-2">
                  Apenas gerencia os clientes sem automação.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow space-y-4">
                <div className="text-4xl font-bold">R$ 15<span className="text-lg font-normal text-muted-foreground">/mês</span></div>
                <div className="space-y-3 mt-6 text-sm">
                  <div className="flex justify-between py-2 border-b border-border/40">
                    <span className="text-muted-foreground">Gestão de Clientes</span>
                    <span className="font-medium text-foreground">Acesso Total</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border/40">
                    <span className="text-muted-foreground">Integração WPP</span>
                    <span className="font-medium text-muted-foreground">Sem Acesso</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-6 mt-auto flex gap-2">
                <Button 
                  className="flex-1 h-12 bg-slate-800 hover:bg-slate-700 text-white" 
                  onClick={() => handleCheckout(process.env.NEXT_PUBLIC_STRIPE_PRICE_BASIC || "", "Lite")}
                  disabled={isCheckoutLoading !== null || isPixLoading !== null}
                >
                  {isCheckoutLoading === process.env.NEXT_PUBLIC_STRIPE_PRICE_BASIC ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-4 h-4 mr-1 sm:mr-2" />}
                  Cartão
                </Button>
                <Button 
                  className="flex-1 h-12 bg-emerald-500 hover:bg-emerald-600 text-white" 
                  onClick={() => handlePixCheckout(15, "Lite")}
                  disabled={isCheckoutLoading !== null || isPixLoading !== null}
                >
                  {isPixLoading === "Lite" ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-4 h-4 mr-1 sm:mr-2" />}
                  PIX
                </Button>
              </CardFooter>
            </Card>

            {/* PLANO PRO (DESTAQUE) */}
            <Card className="glass-card flex flex-col relative overflow-hidden border-sky-500/40 shadow-2xl shadow-sky-500/20 scale-100 md:scale-105 z-10 transition-all duration-300 bg-background">
              <div className="absolute top-0 right-0 -mr-8 -mt-8 w-40 h-40 bg-sky-500/20 rounded-full blur-3xl" />
              <div className="absolute top-0 w-full text-center py-1.5 bg-sky-500 text-white text-xs font-bold uppercase tracking-widest">
                Mais Popular
              </div>
              <CardHeader className="pt-10 pb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-3xl font-bold text-sky-500">Plano Pro</CardTitle>
                    <CardDescription className="h-10 mt-2">
                      Tudo do Lite + Automação WPP.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-grow space-y-4">
                <div className="text-5xl font-bold text-foreground">R$ 30<span className="text-xl font-normal text-muted-foreground">/mês</span></div>
                <div className="space-y-3 mt-6 text-sm">
                  <div className="flex justify-between py-2 border-b border-border/40">
                    <span className="text-muted-foreground">Gestão de Clientes</span>
                    <span className="font-medium text-foreground">Acesso Total</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border/40">
                    <span className="text-muted-foreground">Integração WPP</span>
                    <span className="font-bold text-sky-500">3 Números</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-6 mt-auto flex flex-col gap-3">
                <Button 
                  className="w-full h-12 bg-sky-500 hover:bg-sky-600 text-white shadow-lg shadow-sky-500/20" 
                  onClick={() => handleCheckout(process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO || "", "Pro")}
                  disabled={isCheckoutLoading !== null || isPixLoading !== null}
                >
                  {isCheckoutLoading === process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CreditCard className="w-5 h-5 mr-2" />}
                  Pagar com Cartão
                </Button>
                <Button 
                  className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20" 
                  onClick={() => handlePixCheckout(30, "Pro")}
                  disabled={isCheckoutLoading !== null || isPixLoading !== null}
                >
                  {isPixLoading === "Pro" ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <QrCode className="w-5 h-5 mr-2" />}
                  Pagar com PIX
                </Button>
              </CardFooter>
            </Card>

            {/* PLANO PLUS */}
            <Card className="glass-card flex flex-col relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:border-amber-500/30">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold text-amber-500">Plano Plus</CardTitle>
                <CardDescription className="h-10 mt-2">
                  Tudo do Pro + Gestão de revendas do produto.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow space-y-4">
                <div className="text-4xl font-bold">R$ 45<span className="text-lg font-normal text-muted-foreground">/mês</span></div>
                <div className="space-y-3 mt-6 text-sm">
                  <div className="flex justify-between py-2 border-b border-border/40">
                    <span className="text-muted-foreground">Integração WPP</span>
                    <span className="font-medium text-green-500">5 Números</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border/40">
                    <span className="text-muted-foreground">Gestão de Revendas</span>
                    <span className="font-medium text-amber-500">Em Breve</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-6 mt-auto flex gap-2">
                <Button 
                  className="flex-1 h-12 bg-amber-500 hover:bg-amber-600 text-white" 
                  onClick={() => handleCheckout(process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM || "", "Plus")}
                  disabled={isCheckoutLoading !== null || isPixLoading !== null}
                >
                  {isCheckoutLoading === process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-4 h-4 mr-1 sm:mr-2" />}
                  Cartão
                </Button>
                <Button 
                  className="flex-1 h-12 bg-emerald-500 hover:bg-emerald-600 text-white" 
                  onClick={() => handlePixCheckout(45, "Plus")}
                  disabled={isCheckoutLoading !== null || isPixLoading !== null}
                >
                  {isPixLoading === "Plus" ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-4 h-4 mr-1 sm:mr-2" />}
                  PIX
                </Button>
              </CardFooter>
            </Card>

          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL DO PIX */}
      <Dialog open={pixData !== null} onOpenChange={(o) => !o && setPixData(null)}>
        <DialogContent className="sm:max-w-md border-emerald-500/30">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <QrCode className="w-5 h-5" />
              Pagamento via PIX
            </DialogTitle>
            <DialogDescription>
              Escaneie o QR Code abaixo com o aplicativo do seu banco ou copie o código para pagar.
            </DialogDescription>
          </DialogHeader>
          
          {pixData && (
            <div className="flex flex-col items-center space-y-6 py-4">
              <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100">
                <img 
                  src={pixData.qr_image_url} 
                  alt="QR Code PIX" 
                  className="w-48 h-48 object-contain"
                />
              </div>

              <div className="w-full space-y-2">
                <p className="text-sm font-medium text-center text-muted-foreground">PIX Copia e Cola</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted p-3 rounded-lg text-xs font-mono break-all line-clamp-2 text-muted-foreground">
                    {pixData.qr_code}
                  </div>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-auto py-3 px-3 shrink-0"
                    onClick={handleCopyPix}
                  >
                    {isCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="text-sm text-center text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-500/10 p-3 rounded-lg w-full">
                Após o pagamento, seu acesso será liberado em até 10 segundos.
              </div>
            </div>
          )}

          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" onClick={() => setPixData(null)}>
              Cancelar
            </Button>
            <Button onClick={() => {
                setPixData(null)
                onOpenChange(false) // Close the pricing modal as well
                toast.success("Verificando pagamento...")
              }} 
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              Já paguei (Ir pro Painel)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

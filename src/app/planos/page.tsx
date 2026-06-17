"use client"

import { useState } from "react"
import { Loader2, CreditCard, Zap, LayoutDashboard, LogOut, QrCode, Copy, Check } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"

export default function PlanosPage() {
  const [isCheckoutLoading, setIsCheckoutLoading] = useState<string | null>(null)
  const [isPixLoading, setIsPixLoading] = useState<string | null>(null)
  const [pixData, setPixData] = useState<{qr_code: string, qr_image_url: string} | null>(null)
  const [isCopied, setIsCopied] = useState(false)

  const router = useRouter()
  const supabase = createClient()

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

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <div className="min-h-screen bg-background/95 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Top Bar for Logout */}
      <div className="absolute top-4 right-4 flex gap-4">
         <Button variant="ghost" onClick={() => router.push("/")} className="text-muted-foreground">
           <LayoutDashboard className="w-4 h-4 mr-2" />
           Já paguei (Ir pro Painel)
         </Button>
         <Button variant="outline" onClick={handleLogout} className="text-muted-foreground">
           <LogOut className="w-4 h-4 mr-2" />
           Sair
         </Button>
      </div>

      <div className="max-w-7xl w-full space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mb-6">
            <span className="text-2xl font-black text-sky-500 tracking-tighter">GM</span>
          </div>
          <h2 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
            Escolha o plano ideal para o seu negócio
          </h2>
          <p className="mt-4 text-xl text-muted-foreground max-w-2xl mx-auto">
            Comece agora mesmo a gerir seus clientes e escalar suas vendas com automação.
          </p>
        </div>

        <div className="flex justify-center items-center w-full max-w-md mx-auto">
          {/* PLANO ÚNICO (PRO) */}
          <Card className="glass-card flex flex-col relative overflow-hidden border-sky-500/40 shadow-2xl shadow-sky-500/20 scale-100 z-10 w-full transition-all duration-300">
            <div className="absolute top-0 right-0 -mr-8 -mt-8 w-40 h-40 bg-sky-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute top-0 w-full text-center py-1.5 bg-rose-500 text-white text-xs font-bold uppercase tracking-widest">
              🔥 Oferta por Tempo Limitado
            </div>
            <CardHeader className="pt-10 pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-3xl font-bold text-sky-500">Gestor Pro</CardTitle>
                  <CardDescription className="h-10 mt-2">
                    Todos os recursos liberados para o seu negócio crescer.
                  </CardDescription>
                </div>
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-sky-500/10 text-sky-500 shrink-0">
                  <span className="text-lg font-black tracking-tighter">GM</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-grow space-y-4">
              <div className="text-5xl font-bold text-foreground">R$ 20<span className="text-xl font-normal text-muted-foreground">/mês</span></div>
              <div className="space-y-3 mt-6 text-sm">
                <div className="flex justify-between py-2 border-b border-border/40">
                  <span className="text-muted-foreground">Gestão de Clientes</span>
                  <span className="font-bold text-foreground">Ilimitado</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/40">
                  <span className="text-muted-foreground">Conexões WhatsApp</span>
                  <span className="font-bold text-sky-500">Até 3 Números</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/40">
                  <span className="text-muted-foreground">Automação de Cobrança</span>
                  <span className="font-bold text-foreground">Ilimitado</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/40">
                  <span className="text-muted-foreground">Anti-Ban / Aquecimento</span>
                  <span className="font-bold text-emerald-500">Incluso</span>
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
                onClick={() => handlePixCheckout(20, "Pro")}
                disabled={isCheckoutLoading !== null || isPixLoading !== null}
              >
                {isPixLoading === "Pro" ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <QrCode className="w-5 h-5 mr-2" />}
                Pagar com PIX
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* MODAL DO PIX */}
      <Dialog open={pixData !== null} onOpenChange={(open) => !open && setPixData(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-emerald-500" />
              Pagamento via PIX
            </DialogTitle>
            <DialogDescription>
              Escaneie o QR Code abaixo com o aplicativo do seu banco ou copie o código para pagar.
            </DialogDescription>
          </DialogHeader>
          
          {pixData && (
            <div className="flex flex-col items-center space-y-6 py-4">
              {/* QR Code Image */}
              <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100">
                <img 
                  src={pixData.qr_image_url} 
                  alt="QR Code PIX" 
                  className="w-48 h-48 object-contain"
                />
              </div>

              {/* Copia e Cola */}
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
                router.push("/")
              }} 
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              Já paguei (Ir pro Painel)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

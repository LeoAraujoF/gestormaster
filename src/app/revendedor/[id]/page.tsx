"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useParams, useSearchParams } from "next/navigation"
import { Loader2, Plus, ShoppingCart, CheckCircle2, ArrowRight, Clock, Copy } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"

export default function PublicResellerArea() {
  const { id } = useParams()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const supabase = createClient()

  const [reseller, setReseller] = useState<any>(null)
  const [gestorPix, setGestorPix] = useState<{key: string, type: string} | null>(null)
  const [services, setServices] = useState<any[]>([])
  const [pendingRequests, setPendingRequests] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Request State
  const [selectedService, setSelectedService] = useState<any>(null)
  const [creditsAmount, setCreditsAmount] = useState<number>(1)
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    loadData()
  }, [id])

  async function loadData() {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/revendas/public?id=${id}&token=${encodeURIComponent(token)}`)
      if (!response.ok) throw new Error("Erro ao carregar dados")

      const { data } = await response.json()

      setReseller(data.reseller)
      setGestorPix(data.gestorPix)
      setServices(data.services)
      setPendingRequests(data.pendingRequests)

      if (data.services && data.services.length > 0 && !selectedService) {
        setSelectedService(data.services[0])
      }
    } catch (error: any) {
      toast.error("Este link parece inválido ou expirado.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleGenerateRequest = async () => {
    if (!selectedService) return
    setIsGenerating(true)

    try {
      const response = await fetch('/api/revendas/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-reseller-access-token': token },
        body: JSON.stringify({
          resellerId: id,
          serviceId: selectedService.id,
          creditsAmount: creditsAmount
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Falha ao gerar pedido")
      }

      toast.success("Pedido gerado! Realize o pagamento.")
      loadData()
    } catch (error: any) {
      toast.error(error.message || "Erro ao gerar solicitação")
    } finally {
      setIsGenerating(false)
    }
  }

  const handleConfirmPayment = async (requestId: string) => {
    try {
      const response = await fetch('/api/revendas/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-reseller-access-token': token },
        body: JSON.stringify({
          requestId,
          newStatus: 'paid',
          actionType: 'notify_gestor_payment'
        })
      })

      if (!response.ok) throw new Error("Falha na requisição")

      toast.success("Aviso enviado ao Gestor!")
      loadData()
    } catch (error: any) {
      toast.error("Erro ao confirmar pagamento")
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!reseller) return <div className="p-8 text-center">Revendedor inválido.</div>

  const totalPrice = selectedService ? selectedService.unit_price * creditsAmount : 0

  return (
    <div className="min-h-screen bg-background text-foreground py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Painel de Recarga</h1>
          <p className="text-muted-foreground">Olá, <span className="font-semibold text-foreground">{reseller.name}</span>. Faça suas solicitações de crédito abaixo.</p>
        </div>

        {pendingRequests.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" /> Suas Solicitações Pendentes
            </h2>
            {pendingRequests.map(req => (
              <Card key={req.id} className="border-amber-500/20 bg-amber-500/5">
                <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold">{req.service_name}</p>
                    <p className="text-sm text-muted-foreground">{req.credits_amount} créditos solicitados</p>
                    <p className="font-bold text-emerald-600 mt-1">{formatCurrency(req.total_value)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 w-full sm:w-auto">
                    {req.status === 'pending_payment' ? (
                      <>
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 mb-2">Aguardando Pagamento</Badge>
                        {gestorPix && (
                          <div className="text-xs bg-secondary/50 p-2 rounded border border-border/50 text-center w-full mb-2">
                            <span className="text-muted-foreground block">{gestorPix.type}</span>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="font-mono font-bold">{gestorPix.key}</span>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
                                navigator.clipboard.writeText(gestorPix.key)
                                toast.success("Chave PIX copiada!")
                              }}>
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        )}
                        <Button size="sm" className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-600" onClick={() => handleConfirmPayment(req.id)}>
                          Já fiz o PIX
                        </Button>
                      </>
                    ) : (
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 px-3 py-1">
                        Aguardando Gestor Liberar...
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Serviços Disponíveis</h2>
            {services.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum serviço liberado pelo Gestor.</p>
            ) : (
              services.map(srv => {
                const isSelected = selectedService?.id === srv.id
                const finalPrice = srv.unit_price

                return (
                  <Card
                    key={srv.id}
                    className={`cursor-pointer transition-all ${isSelected ? 'border-primary ring-1 ring-primary shadow-md' : 'hover:border-primary/50'}`}
                    onClick={() => {
                      setSelectedService(srv)
                      setCreditsAmount(1)
                    }}
                  >
                    <CardContent className="p-4 flex justify-between items-center">
                      <div>
                        <p className="font-semibold">{srv.service_name}</p>
                        <p className="text-sm text-muted-foreground">{formatCurrency(finalPrice)} por crédito</p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                        {isSelected && <div className="w-2 h-2 rounded-full bg-background" />}
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>

          <div>
            <Card className="sticky top-10 border-primary/20 shadow-lg">
              <CardHeader className="bg-secondary/30 border-b border-border/50 pb-4">
                <CardTitle className="text-xl flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" /> Fazer Pedido
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                {!selectedService ? (
                  <p className="text-center text-muted-foreground py-8">Selecione um serviço ao lado para solicitar créditos.</p>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Serviço Selecionado</Label>
                      <div className="font-medium p-3 bg-secondary/50 rounded-md border border-border/50">
                        {selectedService.service_name}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Quantidade de Créditos</Label>
                      <Input
                        type="number"
                        min={1}
                        max={1000}
                        value={creditsAmount}
                        onChange={(e) => setCreditsAmount(Math.min(1000, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="text-lg"
                      />
                    </div>

                    <div className="pt-4 border-t border-border/50">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-muted-foreground">Total a pagar:</span>
                        <span className="text-3xl font-black text-emerald-500">{formatCurrency(totalPrice)}</span>
                      </div>
                      <Button
                        className="w-full h-12 text-lg bg-primary hover:bg-primary/90"
                        onClick={handleGenerateRequest}
                        disabled={isGenerating}
                      >
                        {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : "Gerar Pedido"}
                        {!isGenerating && <ArrowRight className="w-5 h-5 ml-2" />}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

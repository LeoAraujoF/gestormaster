"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Plus, Trash2, Copy, ExternalLink, Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils"
import { logAuditClient } from "@/lib/audit-client"
import { useConfirm } from "@/components/providers/confirm-provider"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageHeader, PageShell } from "@/components/page-layout"
import { ResellerNavigation } from "@/components/reseller-navigation"

export default function ResellerDetailsPage() {
  const confirm = useConfirm()
  const { id } = useParams()
  const router = useRouter()
  const supabase = createClient()

  const [reseller, setReseller] = useState<any>(null)
  const [services, setServices] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Form for new service
  const [newServiceName, setNewServiceName] = useState("")
  const [newBasePrice, setNewBasePrice] = useState("")
  const [newProfitMargin, setNewProfitMargin] = useState("")

  // Debt management
  const [debtAmount, setDebtAmount] = useState("")
  const [isUpdatingDebt, setIsUpdatingDebt] = useState(false)

  useEffect(() => {
    loadReseller()
  }, [id])

  async function loadReseller() {
    setIsLoading(true)
    try {
      // Get reseller basic info
      const { data: resData, error: resErr } = await supabase
        .from("resellers")
        .select("*")
        .eq("id", id)
        .single()

      if (resErr) throw resErr
      setReseller(resData)

      // Get assigned services
      const { data: srvData, error: srvErr } = await supabase
        .from("reseller_services")
        .select("*")
        .eq("reseller_id", id)
        .order("created_at", { ascending: false })

      if (srvErr) throw srvErr
      setServices(srvData || [])
    } catch (error: any) {
      toast.error("Erro ao carregar dados", { description: error.message })
    } finally {
      setIsLoading(false)
    }
  }

  async function handleAddService(e: React.FormEvent) {
    e.preventDefault()
    try {
      const basePrice = parseFloat(newBasePrice.replace(",", "."))
      const profitMargin = parseFloat(newProfitMargin.replace(",", "."))

      if (isNaN(basePrice) || isNaN(profitMargin)) {
        toast.error("Valores inválidos")
        return
      }

      const { data, error } = await supabase
        .from("reseller_services")
        .insert({
          reseller_id: id,
          service_name: newServiceName,
          base_price: basePrice,
          profit_margin: profitMargin
        })
        .select()
        .single()

      if (error) throw error
      logAuditClient({ action: 'reseller.add_service', resource: 'reseller_services', resource_id: data.id, details: { service_name: newServiceName } })

      toast.success("Serviço vinculado com sucesso!")
      setServices([...services, data])
      setNewServiceName("")
      setNewBasePrice("")
      setNewProfitMargin("")
    } catch (error: any) {
      toast.error("Erro ao vincular serviço")
    }
  }

  async function handleDeleteService(serviceId: string) {
    if (!await confirm({
      title: "Remover Serviço",
      description: "Tem certeza que deseja remover este serviço do revendedor?",
      variant: "destructive"
    })) return
    try {
      const { error } = await supabase
        .from("reseller_services")
        .delete()
        .eq("id", serviceId)

      if (error) throw error
      logAuditClient({ action: 'reseller.delete_service', resource: 'reseller_services', resource_id: serviceId })
      toast.success("Serviço removido")
      setServices(services.filter(s => s.id !== serviceId))
    } catch (error: any) {
      toast.error("Erro ao remover serviço")
    }
  }

  function copyResellerLink() {
    // The public link for the reseller
    const url = `${window.location.origin}/revendedor/${id}?token=${reseller.public_token}`
    navigator.clipboard.writeText(url)
    toast.success("Link do Painel do Revendedor copiado!")
  }

  async function handleUpdateDebt(isAdding: boolean) {
    if (!reseller) return
    const amount = parseFloat(debtAmount.replace(",", "."))
    if (isNaN(amount) || amount <= 0) {
      toast.error("Insira um valor válido")
      return
    }

    setIsUpdatingDebt(true)
    const newDebt = isAdding
      ? Number(reseller.current_debt || 0) + amount
      : Math.max(0, Number(reseller.current_debt || 0) - amount)

    try {
      const { error } = await supabase
        .from("resellers")
        .update({ current_debt: newDebt })
        .eq("id", id)

      if (error) throw error
      logAuditClient({ action: 'reseller.update_debt', resource: 'resellers', resource_id: id as string, details: { new_debt: newDebt } })

      setReseller({ ...reseller, current_debt: newDebt })
      setDebtAmount("")
      toast.success("Débito atualizado!")
    } catch (error: any) {
      toast.error("Erro ao atualizar débito")
    } finally {
      setIsUpdatingDebt(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!reseller) return <div className="p-8">Revendedor não encontrado.</div>

  const publicLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/revendedor/${id}?token=${reseller?.public_token || ''}`

  return (
    <PageShell width="default" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeader eyebrow="Detalhes do parceiro" title={reseller.name} description="Configure serviços, margens, débitos e o acesso público deste revendedor." actions={<Button variant="outline" onClick={() => router.push('/revendas')}><ArrowLeft className="mr-2 size-4" />Voltar à gestão</Button>} />
      <ResellerNavigation active="management" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 h-fit">
          <CardHeader>
            <CardTitle>Dados do Parceiro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground">WhatsApp</Label>
              <p className="font-medium">{reseller.whatsapp}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">E-mail</Label>
              <p className="font-medium">{reseller.email || "Não informado"}</p>
            </div>

            <div className="pt-4 border-t border-border/50">
              <Label className="text-muted-foreground mb-2 block">Link de Recarga (Área do Revendedor)</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={publicLink} className="text-xs bg-secondary/50" />
                <Button size="icon" variant="outline" onClick={copyResellerLink}>
                  <Copy className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="outline" onClick={() => window.open(publicLink, '_blank')}>
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">Envie este link para ele pedir créditos.</p>
            </div>

            <div className="pt-4 border-t border-border/50">
              <Label className="text-muted-foreground mb-2 block">Gestão de Débitos</Label>
              <div className="bg-secondary/30 p-3 rounded-lg border border-border/50 text-center mb-3">
                <span className="text-xs text-muted-foreground block">Débito Atual:</span>
                <span className={`text-xl font-bold ${Number(reseller.current_debt) > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                  {formatCurrency(reseller.current_debt || 0)}
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="0.00"
                  value={debtAmount}
                  onChange={(e) => setDebtAmount(e.target.value)}
                  className="w-full text-right"
                  type="number"
                  step="0.01"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10 border-emerald-500/20"
                  onClick={() => handleUpdateDebt(false)}
                  disabled={isUpdatingDebt}
                >
                  Abater (-)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/20"
                  onClick={() => handleUpdateDebt(true)}
                  disabled={isUpdatingDebt}
                >
                  Adicionar (+)
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Serviços e Margens de Lucro</CardTitle>
            <CardDescription>
              Defina quais serviços ele tem acesso e qual é a **Sua Margem** em cima de cada um.
              O revendedor pagará o (Preço Base + Sua Margem).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddService} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6 p-4 bg-secondary/20 rounded-lg border border-border/40">
              <div className="space-y-1 sm:col-span-1">
                <Label className="text-xs">Nome do Serviço</Label>
                <Input required value={newServiceName} onChange={e => setNewServiceName(e.target.value)} placeholder="Ex: Seguidores IG" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Preço Base (R$)</Label>
                <Input required value={newBasePrice} onChange={e => setNewBasePrice(e.target.value)} placeholder="0.00" type="number" step="0.01" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Seu Lucro (R$)</Label>
                <Input required value={newProfitMargin} onChange={e => setNewProfitMargin(e.target.value)} placeholder="0.00" type="number" step="0.01" />
              </div>
              <div className="flex items-end">
                <Button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white">
                  <Plus className="w-4 h-4 mr-2" /> Adicionar
                </Button>
              </div>
            </form>

            {services.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum serviço configurado. Ele não verá nada no link de recarga.
              </div>
            ) : (
              <div className="rounded-md border border-border/50">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/30">
                      <TableHead>Serviço</TableHead>
                      <TableHead>Custo Base</TableHead>
                      <TableHead className="text-emerald-500 font-semibold">Seu Lucro</TableHead>
                      <TableHead>Revendedor Paga</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {services.map((srv) => (
                      <TableRow key={srv.id}>
                        <TableCell className="font-medium">{srv.service_name}</TableCell>
                        <TableCell>{formatCurrency(srv.base_price)}</TableCell>
                        <TableCell className="text-emerald-500 font-semibold">+{formatCurrency(srv.profit_margin)}</TableCell>
                        <TableCell className="font-bold">{formatCurrency(srv.base_price + srv.profit_margin)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-500/10" onClick={() => handleDeleteService(srv.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}

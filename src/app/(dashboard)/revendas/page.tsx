"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Plus, Users, Search, DollarSign, CheckCircle2, XCircle, Clock, Loader2, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils"
import { logAuditClient } from "@/lib/audit-client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { PageHeader, PageShell } from "@/components/page-layout"
import { ResellerNavigation } from "@/components/reseller-navigation"

export default function RevendasPage() {
  const supabase = createClient()
  const [resellers, setResellers] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Form states
  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newWhatsapp, setNewWhatsapp] = useState("")

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: resellersData, error: resellersError } = await supabase
        .from("resellers")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (resellersError) throw resellersError

      setResellers(resellersData || [])

      // Carregar requests vinculados a esses resellers
      if (resellersData && resellersData.length > 0) {
        const resellerIds = resellersData.map(r => r.id)
        const { data: requestsData, error: requestsError } = await supabase
          .from("credit_requests")
          .select("*, resellers(name)")
          .in("reseller_id", resellerIds)
          .order("created_at", { ascending: false })

        if (requestsError) throw requestsError
        setRequests(requestsData || [])
      }
    } catch (error: any) {
      toast.error("Erro ao carregar dados", { description: error.message })
    } finally {
      setIsLoading(false)
    }
  }

  async function handleAddReseller(e: React.FormEvent) {
    e.preventDefault()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from("resellers")
        .insert({
          user_id: user.id,
          name: newName,
          email: newEmail,
          whatsapp: newWhatsapp
        })
        .select()
        .single()

      if (error) throw error
      logAuditClient({ action: 'reseller.create', resource: 'resellers', resource_id: data.id, details: { reseller_name: newName } })

      toast.success("Revendedor adicionado!")
      setResellers([data, ...resellers])
      setIsAddModalOpen(false)
      setNewName("")
      setNewEmail("")
      setNewWhatsapp("")
    } catch (error: any) {
      toast.error("Erro ao adicionar revendedor", { description: error.message })
    }
  }

  async function updateRequestStatus(id: string, newStatus: string) {
    try {
      if (newStatus === 'completed') {
        // Usa a API para aprovar e disparar whatsapp
        const response = await fetch('/api/revendas/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: id,
            newStatus,
            actionType: 'notify_reseller_completed'
          })
        })
        if (!response.ok) throw new Error("Falha na notificação")
      } else {
        // Cancelamento normal pelo supabase
        const { error } = await supabase
          .from("credit_requests")
          .update({ status: newStatus })
          .eq("id", id)
        if (error) throw error
        logAuditClient({ action: 'reseller.cancel_credit', resource: 'credit_requests', resource_id: id })
      }

      toast.success(`Solicitação atualizada para ${newStatus}`)
      setRequests(requests.map(r => r.id === id ? { ...r, status: newStatus } : r))
    } catch (error: any) {
      toast.error("Erro ao atualizar solicitação")
    }
  }

  const filteredResellers = resellers.filter(r => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.email?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const pendingRequests = requests.filter(r => r.status === 'pending_payment' || r.status === 'paid')

  return (
    <PageShell>
      <PageHeader eyebrow="Rede de parceiros" title="Gestão de Revendas" description="Resolva solicitações pendentes e acompanhe seus revendedores em um único lugar." badge={pendingRequests.length ? `${pendingRequests.length} pendentes` : "Sem pendências"} actions={<Button onClick={() => setIsAddModalOpen(true)}><Plus className="mr-2 size-4" />Novo revendedor</Button>} />
      <ResellerNavigation active="management" />

      <Tabs defaultValue="solicitacoes" className="space-y-6">
        <TabsList className="h-auto w-full justify-start overflow-x-auto border bg-card p-1 sm:w-auto">
          <TabsTrigger value="solicitacoes" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Clock className="w-4 h-4 mr-2" /> Solicitações Pendentes
            {pendingRequests.length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-amber-500/20 text-amber-600">{pendingRequests.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="revendedores" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Users className="w-4 h-4 mr-2" /> Meus Revendedores
          </TabsTrigger>
        </TabsList>

        <TabsContent value="solicitacoes">
          <Card>
            <CardHeader>
              <CardTitle>Solicitações de Crédito</CardTitle>
              <CardDescription>Aprove recargas de crédito solicitadas pelos seus revendedores.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : pendingRequests.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium text-foreground mb-1">Tudo limpo!</h3>
                  <p className="text-muted-foreground">Nenhuma solicitação de crédito pendente.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border border-border/50">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-secondary/30 hover:bg-secondary/30">
                        <TableHead>Revendedor</TableHead>
                        <TableHead>Serviço</TableHead>
                        <TableHead>Créditos</TableHead>
                        <TableHead>Valor a Pagar</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingRequests.map((req) => (
                        <TableRow key={req.id}>
                          <TableCell className="font-medium">{req.resellers?.name}</TableCell>
                          <TableCell>{req.service_name}</TableCell>
                          <TableCell><Badge variant="outline">+{req.credits_amount}</Badge></TableCell>
                          <TableCell className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(req.total_value)}
                          </TableCell>
                          <TableCell>
                            {req.status === 'pending_payment' ? (
                              <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">Aguardando Pgto</Badge>
                            ) : req.status === 'paid' ? (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Pagamento Recebido</Badge>
                            ) : (
                              <Badge variant="outline">{req.status}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" className="text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/20" onClick={() => updateRequestStatus(req.id, 'canceled')}>
                                Cancelar
                              </Button>
                              <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => updateRequestStatus(req.id, 'completed')}>
                                Concluir
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revendedores">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <CardTitle>Meus Revendedores</CardTitle>
                  <CardDescription>Gerencie a sua rede de parceiros.</CardDescription>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar revendedor..." 
                    className="pl-9 bg-secondary/30 border-border/50"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : filteredResellers.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground mb-4">Nenhum revendedor encontrado.</p>
                  <Button variant="outline" onClick={() => setIsAddModalOpen(true)}>Adicionar o primeiro</Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredResellers.map(reseller => (
                    <Card key={reseller.id} className="bg-secondary/20 border-border/40 hover:bg-secondary/40 transition-colors">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">{reseller.name}</CardTitle>
                        <CardDescription>{reseller.email || "Sem e-mail"}</CardDescription>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <div className="text-sm space-y-2">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">WhatsApp:</span>
                            <span>{reseller.whatsapp}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Cadastro:</span>
                            <span>{new Date(reseller.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter className="pt-0 border-t border-border/40 mt-4 flex items-center justify-between">
                        <Button variant="link" className="px-0 text-interactive h-10" onClick={() => window.location.href=`/revendas/${reseller.id}`}>
                          Configurar Serviços <ArrowRight className="w-4 h-4 ml-1" />
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Novo Revendedor</DialogTitle>
            <DialogDescription>
              Cadastre os dados básicos. Depois você poderá configurar as margens de lucro dele.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddReseller} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome Completo</Label>
              <Input required value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Agência XYZ" />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp (com DDD)</Label>
              <Input required value={newWhatsapp} onChange={e => setNewWhatsapp(e.target.value)} placeholder="5511999999999" />
            </div>
            <div className="space-y-2">
              <Label>E-mail (Opcional)</Label>
              <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="contato@agenciaxyz.com" />
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancelar</Button>
              <Button type="submit">Cadastrar Revendedor</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}

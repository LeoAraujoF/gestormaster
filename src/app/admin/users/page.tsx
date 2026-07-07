"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Users, Loader2, Ban, CheckCircle2, ShieldAlert, DollarSign, Smartphone, MessageCircle, MoreVertical, Plus, Trash2, Edit } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils"

import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export default function AdminUsersPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [users, setUsers] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [isBlocking, setIsBlocking] = useState<string | null>(null)
  
  // AlertDialog States
  const [userToDelete, setUserToDelete] = useState<any | null>(null)
  const [userToBlock, setUserToBlock] = useState<{ id: string, currentBannedStatus: boolean } | null>(null)

  // New user form states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newUserName, setNewUserName] = useState("")
  const [newUserEmail, setNewUserEmail] = useState("")
  const [newUserPassword, setNewUserPassword] = useState("")
  const [newUserPlan, setNewUserPlan] = useState("Free")
  const [newUserPaymentStatus, setNewUserPaymentStatus] = useState("Ativo")
  const [newUserPhone, setNewUserPhone] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  // Edit user states
  const [editPlan, setEditPlan] = useState<string>("Free")
  const [editPaymentStatus, setEditPaymentStatus] = useState<string>("Ativo")
  const [editDueDate, setEditDueDate] = useState<string>("")
  const [editPhone, setEditPhone] = useState<string>("")
  const [isUpdating, setIsUpdating] = useState(false)
  const [isSendingBilling, setIsSendingBilling] = useState<string | null>(null)

  const supabase = createClient()

  const checkAdminAndLoadUsers = async () => {
    setIsLoading(true)
    try {
      const resMetrics = await fetch('/api/admin/metrics')
      if (!resMetrics.ok) {
        setIsAdmin(false)
        return
      }
      setIsAdmin(true)

      const resUsers = await fetch('/api/admin/users')
      if (resUsers.ok) {
        const usersData = await resUsers.json()
        setUsers(usersData.users || [])
      }
    } catch (e) {
      console.error(e)
      setIsAdmin(false)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    checkAdminAndLoadUsers()
  }, [])

  const executeToggleBlock = async () => {
    if (!userToBlock) return;
    const { id: userId, currentBannedStatus } = userToBlock;
    setIsBlocking(userId)
    try {
      const res = await fetch('/api/admin/users/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isBlocked: !currentBannedStatus })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      
      toast.success(data.message)
      setUsers(users.map(u => u.id === userId ? { ...u, is_banned: !currentBannedStatus } : u))
      
      if (selectedUser && selectedUser.id === userId) {
        setSelectedUser({...selectedUser, is_banned: !currentBannedStatus})
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao alterar status.")
    } finally {
      setIsBlocking(null)
      setUserToBlock(null)
    }
  }

  const handleCreateUser = async () => {
    if (!newUserName || !newUserEmail || !newUserPassword || !newUserPhone) {
      toast.error("Preencha todos os campos obrigatórios, incluindo o WhatsApp.")
      return
    }

    setIsCreating(true)
    try {
      const res = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: newUserEmail, 
          password: newUserPassword, 
          name: newUserName,
          plan: newUserPlan,
          paymentStatus: newUserPaymentStatus,
          phone: newUserPhone
        })
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Rota /api/admin/users/create pendente de implementação.")
      }

      toast.success("Usuário criado com sucesso e boas-vindas enviadas!")
      setIsCreateModalOpen(false)
      checkAdminAndLoadUsers()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setIsCreating(false)
    }
  }

  const executeDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      // API call to delete user via supabase admin api
      toast.info("Função de exclusão em massa em desenvolvimento. Requer API com service_role.")
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setUserToDelete(null)
    }
  }

  const handleOpenProfile = (user: any) => {
    setSelectedUser(user)
    setEditPlan(user.plan || "Free")
    setEditPaymentStatus(user.payment_status || "Ativo")
    setEditPhone(user.phone || "")
    if (user.due_date) {
      setEditDueDate(new Date(user.due_date).toISOString().split('T')[0])
    } else {
      setEditDueDate("")
    }
  }

  const handleUpdateUser = async () => {
    if (!selectedUser) return
    setIsUpdating(true)
    try {
      const res = await fetch('/api/admin/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUser.id,
          plan: editPlan,
          paymentStatus: editPaymentStatus,
          dueDate: editDueDate ? new Date(editDueDate).toISOString() : null,
          phone: editPhone
        })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao atualizar usuário.")
      }
      toast.success("Perfil atualizado com sucesso!")
      checkAdminAndLoadUsers()
      setSelectedUser(null)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleSendBilling = async (method: 'whatsapp' | 'email') => {
    if (!selectedUser) return
    setIsSendingBilling(method)
    try {
      const res = await fetch('/api/admin/billing/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUser.id,
          method
        })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao enviar cobrança.")
      }
      toast.success(`Fatura enviada com sucesso via ${method === 'whatsapp' ? 'WhatsApp' : 'E-mail'}!`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setIsSendingBilling(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-interactive" />
      </div>
    )
  }

  if (isAdmin === false) return <div>Acesso Negado</div>

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-start sm:items-center flex-col sm:flex-row gap-4">
        <div>
          <h1 className="text-[17px] font-semibold tracking-[-0.02em] mb-2 flex items-center gap-2">
            Usuários / Inquilinos
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Gestão completa de contas, bloqueios e deleções.
          </p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
          <Plus className="w-4 h-4 mr-2" />
          Criar Usuário
        </Button>
      </div>

      <div className="bg-card text-card-foreground border rounded-xl overflow-hidden p-4">
        <div className="mb-4">
          <Input
            placeholder="Buscar usuário por email ou nome..."
            className="max-w-md bg-background/50"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Plano SaaS</TableHead>
                <TableHead>Métricas</TableHead>
                <TableHead>Saúde</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((u) => (
                <TableRow 
                  key={u.id} 
                  className="hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => handleOpenProfile(u)}
                >
                  <TableCell>
                    <div className="font-semibold">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-primary/5">{u.plan}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium text-emerald-500">{formatCurrency(u.stats.mrr)}</div>
                    <div className="text-xs text-muted-foreground">{u.stats.activeClients} clts ativos</div>
                  </TableCell>
                  <TableCell>
                    {u.stats.messagesMonth < 500 ? (
                      <Badge className="bg-success-bg text-success-fg border-0 gap-1.5"><span className="status-dot bg-money" />Normal</Badge>
                    ) : u.stats.messagesMonth <= 2000 ? (
                      <Badge className="bg-warning-bg text-warning-fg border-0 gap-1.5"><span className="status-dot bg-warning" />Alto</Badge>
                    ) : (
                      <Badge className="bg-danger-bg text-danger-fg border-0 gap-1.5"><span className="status-dot bg-danger" />Crítico</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.is_banned ? (
                      <Badge className="bg-red-500/10 text-red-500 border-0">Bloqueado</Badge>
                    ) : (
                      <Badge className="bg-emerald-500/10 text-emerald-500 border-0">Ativo</Badge>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger className={buttonVariants({ variant: "ghost", size: "icon", className: "h-8 w-8" })}>
                        <MoreVertical className="w-4 h-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenProfile(u)}><Edit className="w-4 h-4 mr-2" /> Ver Perfil Completo</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setUserToBlock({ id: u.id, currentBannedStatus: u.is_banned })} className={u.is_banned ? "text-emerald-500" : "text-amber-500"}>
                          <Ban className="w-4 h-4 mr-2" /> {u.is_banned ? "Desbloquear" : "Bloquear"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setUserToDelete(u)} className="text-red-500 hover:text-red-600">
                          <Trash2 className="w-4 h-4 mr-2" /> Excluir Conta
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-[550px] p-0 border-border/50">
          <div className="bg-muted p-6 border-b border-border">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-secondary text-interactive flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                Novo Cliente VIP
              </DialogTitle>
              <DialogDescription className="pt-2 text-muted-foreground">
                Cadastre um usuário manualmente. Ele receberá acesso imediato à plataforma com os privilégios definidos abaixo.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-interactive" /> 
                Credenciais de Acesso
              </h4>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Nome Completo</Label>
                <Input className="bg-muted/30 focus:bg-background transition-colors" value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="Ex: João Silva" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">E-mail Principal</Label>
                <Input className="bg-muted/30 focus:bg-background transition-colors" type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} placeholder="joao@empresa.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">WhatsApp (Com DDD)</Label>
                <Input className="bg-muted/30 focus:bg-background transition-colors" type="text" value={newUserPhone} onChange={e => setNewUserPhone(e.target.value)} placeholder="Ex: 11999999999" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Senha Provisória</Label>
                <Input className="bg-muted/30 focus:bg-background transition-colors" type="text" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} placeholder="Ex: @Mudar123" />
              </div>
            </div>

            <div className="h-px w-full bg-border/50" />
            
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-500" />
                Assinatura SaaS
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Plano</Label>
                  <Select value={newUserPlan} onValueChange={(v) => setNewUserPlan(v ?? "")}>
                    <SelectTrigger className="bg-muted/30 focus:bg-background transition-colors w-full">
                      <SelectValue placeholder="Selecione o plano" />
                    </SelectTrigger>
                    <SelectContent className="min-w-[220px]">
                      <SelectItem value="Free"><span className="font-medium">Plano Free</span> (Limitações ativas)</SelectItem>
                      <SelectItem value="Pro"><span className="font-medium text-interactive">Plano Pro</span> (Acesso Total)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Status Financeiro</Label>
                  <Select value={newUserPaymentStatus} onValueChange={(v) => setNewUserPaymentStatus(v ?? "")}>
                    <SelectTrigger className="bg-muted/30 focus:bg-background transition-colors w-full">
                      <SelectValue placeholder="Selecione o status" />
                    </SelectTrigger>
                    <SelectContent className="min-w-[220px]">
                      <SelectItem value="Pago"><span className="text-emerald-500 font-medium">● Pago</span> (Regular)</SelectItem>
                      <SelectItem value="Ativo"><span className="text-interactive font-medium">● Ativo</span> (Cortesia / Manual)</SelectItem>
                      <SelectItem value="Aguardando"><span className="text-amber-500 font-medium">● Aguardando Pagamento</span></SelectItem>
                      <SelectItem value="Vencido"><span className="text-red-500 font-medium">● Vencido</span> (Bloqueado)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 pt-0 bg-muted/10 mt-2 flex justify-end gap-3 rounded-b-xl">
            <Button variant="outline" className="border-border/50 hover:bg-muted/50" onClick={() => setIsCreateModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateUser} disabled={isCreating} className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-6 shadow-md">
              {isCreating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Criar Conta e Liberar Acesso
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <SheetContent className="sm:max-w-lg w-full overflow-y-auto border-l border-white/10 bg-background/95 backdrop-blur-xl p-8">
          <SheetHeader className="text-left mb-8">
            <SheetTitle className="text-[17px] font-semibold tracking-[-0.02em] flex items-center gap-2">
              <Users className="w-6 h-6 text-interactive" /> Perfil do Inquilino
            </SheetTitle>
          </SheetHeader>
          {selectedUser && (
            <div className="space-y-8">
              <div className="flex items-center gap-5 pb-6 border-b border-border/40">
                <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-2xl font-bold text-white shrink-0">
                  {selectedUser.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-2xl font-bold">{selectedUser.name}</h3>
                  <p className="text-muted-foreground">{selectedUser.email}</p>
                  <p className="text-xs text-muted-foreground mt-1">Cliente desde {new Date(selectedUser.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-interactive" />
                  Métricas de Uso
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted/30 rounded-xl border border-border/50">
                    <p className="text-xs text-muted-foreground">MRR Total</p>
                    <p className="font-bold text-xl">{formatCurrency(selectedUser.stats.mrr)}</p>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-xl border border-border/50">
                    <p className="text-xs text-muted-foreground">Clientes Ativos</p>
                    <p className="font-bold text-xl">{selectedUser.stats.activeClients}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                  Plano e Faturamento
                </h4>
                
                <div className="space-y-3 p-4 bg-muted/20 rounded-xl border border-border/50">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Plano Atual</Label>
                      <Select value={editPlan} onValueChange={(v) => setEditPlan(v ?? "")}>
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Selecione o plano" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Free">Plano Free</SelectItem>
                          <SelectItem value="Pro">Plano Pro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">WhatsApp (Com DDD)</Label>
                      <Input 
                        type="text" 
                        className="bg-background"
                        value={editPhone} 
                        onChange={(e) => setEditPhone(e.target.value)} 
                        placeholder="Ex: 11999999999"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      <Select value={editPaymentStatus} onValueChange={(v) => setEditPaymentStatus(v ?? "")}>
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Pago">Pago</SelectItem>
                          <SelectItem value="Ativo">Ativo</SelectItem>
                          <SelectItem value="Aguardando">Aguardando</SelectItem>
                          <SelectItem value="Vencido">Vencido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Data de Vencimento</Label>
                      <Input 
                        type="date" 
                        className="bg-background"
                        value={editDueDate} 
                        onChange={(e) => setEditDueDate(e.target.value)} 
                      />
                    </div>
                  </div>

                  <Button 
                    onClick={handleUpdateUser} 
                    disabled={isUpdating}
                    className="w-full mt-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {isUpdating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                    Salvar Alterações
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-green-500" />
                  Ações de Cobrança (Stripe / PixGo)
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <Button 
                    variant="outline" 
                    className="border-green-500/30 text-green-600 hover:bg-green-500/10 hover:text-green-600"
                    onClick={() => handleSendBilling('whatsapp')}
                    disabled={isSendingBilling !== null}
                  >
                    {isSendingBilling === 'whatsapp' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Smartphone className="w-4 h-4 mr-2" />}
                    WhatsApp
                  </Button>
                  <Button 
                    variant="outline" 
                    className="border-blue-500/30 text-blue-600 hover:bg-blue-500/10 hover:text-blue-600"
                    onClick={() => handleSendBilling('email')}
                    disabled={isSendingBilling !== null}
                  >
                    {isSendingBilling === 'email' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageCircle className="w-4 h-4 mr-2" />}
                    E-mail
                  </Button>
                </div>
              </div>

              <div className="pt-6 border-t border-border/40">
                <Button 
                  variant={selectedUser.is_banned ? "outline" : "destructive"}
                  className="w-full"
                  onClick={() => setUserToBlock({ id: selectedUser.id, currentBannedStatus: selectedUser.is_banned })}
                >
                  <Ban className="w-4 h-4 mr-2" />
                  {selectedUser.is_banned ? "Restaurar Acesso" : "Bloquear Usuário"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!userToBlock} onOpenChange={(open) => !open && setUserToBlock(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {userToBlock?.currentBannedStatus ? 'Desbloquear Usuário' : 'Bloquear Usuário'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {userToBlock?.currentBannedStatus 
                ? 'Tem certeza que deseja restaurar o acesso deste usuário? Ele poderá entrar novamente no sistema.'
                : 'Tem certeza que deseja bloquear este usuário? Ele perderá imediatamente o acesso ao painel e integrações.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeToggleBlock} className={userToBlock?.currentBannedStatus ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "bg-amber-500 hover:bg-amber-600 text-white"}>
              {userToBlock?.currentBannedStatus ? 'Sim, desbloquear' : 'Sim, bloquear'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-500 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" /> Excluir Usuário Definitivamente
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base text-foreground mt-2">
              Você está prestes a excluir o usuário <strong>{userToDelete?.name}</strong>.
            </AlertDialogDescription>
            <div className="bg-red-500/10 p-4 rounded-md border border-red-500/20 mt-4 text-sm text-red-500 dark:text-red-400">
              <strong>ATENÇÃO:</strong> Esta ação removerá instâncias de WhatsApp, carteira de clientes, integrações e configurações. <strong>É IRREVERSÍVEL.</strong>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteUser} className="bg-red-500 hover:bg-red-600 text-white">
              Confirmar Exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

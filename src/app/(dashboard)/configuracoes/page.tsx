"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { ShieldAlert, Download, Upload, Loader2, Save, Trash2, KeyRound } from "lucide-react"
import { toast } from "sonner"
import Papa from "papaparse"
import { logAuditClient } from "@/lib/audit-client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"

export default function ConfiguracoesPage() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [hasPin, setHasPin] = useState(false)
  const [isCheckingUser, setIsCheckingUser] = useState(true)
  const [userPlan, setUserPlan] = useState<string>("Desconhecido")
  const [isAdmin, setIsAdmin] = useState(false)

  // PIN States
  const [newPin, setNewPin] = useState("")
  const [isSavingPin, setIsSavingPin] = useState(false)
  
  // Export States
  const [isExporting, setIsExporting] = useState(false)

  // Import States
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)

  // Danger Zone States
  const [isDangerDialogOpen, setIsDangerDialogOpen] = useState(false)
  const [dangerPin, setDangerPin] = useState("")
  const [isDeletingAll, setIsDeletingAll] = useState(false)

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        setUserPlan(user.user_metadata?.plan_name || "Desconhecido")
        if (user.user_metadata?.security_pin) {
          setHasPin(true)
        }
        
        try {
          const res = await fetch('/api/admin/check')
          const adminData = await res.json()
          setIsAdmin(adminData.isAdmin)
        } catch (e) {
          setIsAdmin(false)
        }
      }
      setIsCheckingUser(false)
    }
    loadUser()
  }, [])

  const handleSavePin = async () => {
    if (newPin.length !== 4) return toast.error("O PIN deve ter 4 dígitos.")
    setIsSavingPin(true)
    try {
      const { error } = await supabase.auth.updateUser({
        data: { security_pin: newPin }
      })
      if (error) throw error
      toast.success("PIN de segurança configurado com sucesso!")
      setHasPin(true)
      setNewPin("")
    } catch (e: any) {
      toast.error("Erro ao salvar PIN.")
    } finally {
      setIsSavingPin(false)
    }
  }

  const handleExport = async () => {
    if (userPlan === "Lite" && !isAdmin) {
      toast.info("A Exportação de Backup é um recurso exclusivo do Plano Pro e Plus.")
      return
    }
    
    setIsExporting(true)
    try {
      const { data: clients, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false })
      if (error) throw error

      if (!clients || clients.length === 0) {
        toast.info("Nenhum cliente para exportar.")
        return
      }

      // Map to clean Portuguese headers and completely hide internal database IDs (UUIDs)
      const mappedClients = clients.map(c => ({
        "Nome": c.name,
        "Usuario": c.username || "",
        "Telefone": c.phone || "",
        "Valor do Plano": c.plan_value || 0,
        "Telas": c.screens || 1,
        "Vencimento": c.due_date ? c.due_date.split('T')[0] : "",
        "Status": c.status === 'active' ? 'Ativo' : c.status === 'vencido' ? 'Vencido' : c.status === 'inactive' ? 'Inativo' : c.status,
        "Observacao": c.observation || "",
        "Descricao": c.description || ""
      }))

      const csv = Papa.unparse(mappedClients)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `gestor_clientes_${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success("Exportação concluída!")
    } catch (e: any) {
      toast.error("Erro ao exportar clientes.")
    } finally {
      setIsExporting(false)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (userPlan === "Lite" && !isAdmin) {
      toast.info("A Importação de clientes é um recurso exclusivo do Plano Pro e Plus.")
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    const file = e.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as any[]
          if (rows.length === 0) throw new Error("O arquivo CSV está vazio.")

          // Map CSV rows supporting both English, Portuguese, accented and case variants
          const inserts = rows.map(row => {
            const name = row.Nome ?? row.nome ?? row.name ?? row.Name ?? "Sem Nome"
            const username = row.Usuario ?? row.usuario ?? row.username ?? row.Username ?? null
            const phone = row.Telefone ?? row.telefone ?? row.phone ?? row.Phone ?? null
            
            const rawPlan = row["Valor do Plano"] ?? row.valor ?? row.plan_value ?? row.PlanValue
            const plan_value = rawPlan !== undefined && rawPlan !== null && rawPlan !== ""
              ? parseFloat(rawPlan.toString().replace(',', '.'))
              : 0

            const rawScreens = row.Telas ?? row.telas ?? row.screens ?? row.Screens
            const screens = rawScreens !== undefined && rawScreens !== null && rawScreens !== ""
              ? parseInt(rawScreens.toString())
              : 1

            const rawDate = row.Vencimento ?? row.vencimento ?? row.due_date ?? row.DueDate
            let due_date = new Date().toISOString().split('T')[0]
            if (rawDate) {
              try {
                const parsedDate = new Date(rawDate)
                if (!isNaN(parsedDate.getTime())) {
                  due_date = parsedDate.toISOString().split('T')[0]
                }
              } catch (err) {}
            }

            const status = row.Status ?? row.status ?? 'active'
            const observation = row.Observacao ?? row["Observação"] ?? row.observacao ?? row["observação"] ?? row.observation ?? row.notes ?? row.notas ?? null
            const description = row.Descricao ?? row["Descrição"] ?? row.descricao ?? row["descrição"] ?? row.description ?? row.Description ?? null

            return {
              user_id: user.id,
              name,
              username,
              phone,
              plan_value,
              screens,
              due_date,
              status,
              observation,
              description
            }
          })

          const { error } = await supabase.from('clients').insert(inserts)
          if (error) throw error
          logAuditClient({ action: 'config.import_clients', resource: 'clients', details: { count: inserts.length } })

          toast.success(`${inserts.length} clientes importados com sucesso!`)
          if (fileInputRef.current) fileInputRef.current.value = ""
        } catch (err: any) {
          toast.error("Erro na importação: Verifique as colunas do seu CSV. " + err.message)
        } finally {
          setIsImporting(false)
        }
      },
      error: (error) => {
        toast.error("Erro ao ler o arquivo CSV.")
        setIsImporting(false)
      }
    })
  }

  const handleDeleteAll = async () => {
    if (dangerPin.length !== 4) return toast.error("Digite os 4 dígitos do PIN.")
    if (dangerPin !== user.user_metadata?.security_pin) return toast.error("PIN incorreto! Acesso negado.")

    setIsDeletingAll(true)
    try {
      // RLS only allows deleting own clients
      const { error } = await supabase.from('clients').delete().eq('user_id', user.id)
      if (error) throw error
      logAuditClient({ action: 'config.delete_all_clients', resource: 'clients' })

      toast.success("Banco de dados completamente zerado.")
      setIsDangerDialogOpen(false)
      setDangerPin("")
    } catch (e: any) {
      toast.error("Erro ao limpar banco de dados.")
    } finally {
      setIsDeletingAll(false)
    }
  }

  if (isCheckingUser) {
    return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight mb-2">Configurações & Dados</h1>
        <p className="text-zinc-500 dark:text-zinc-400">Gerencie a segurança da sua conta, backups e migração de dados.</p>
      </div>

      {!hasPin ? (
        <Card className="glass-card border-amber-500/20">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2 text-amber-500">
              <KeyRound className="w-5 h-5" /> PIN de Segurança
            </CardTitle>
            <CardDescription>
              Para acessar as opções avançadas (como Limpar Banco de Dados), você precisa criar um PIN numérico de 4 dígitos. Guarde-o com segurança.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-start gap-4">
              <InputOTP maxLength={4} value={newPin} onChange={setNewPin}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>
              <Button onClick={handleSavePin} disabled={newPin.length !== 4 || isSavingPin}>
                {isSavingPin && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Meu PIN
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="backup" className="w-full">
          <TabsList className="bg-background/50 border border-border/50 p-1 mb-6">
            <TabsTrigger value="backup" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Exportar & Importar</TabsTrigger>
            <TabsTrigger value="danger" className="data-[state=active]:bg-red-500/10 data-[state=active]:text-red-500">Zona de Perigo</TabsTrigger>
          </TabsList>

          <TabsContent value="backup" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="w-5 h-5 text-blue-500" /> 
                    Exportar Dados (Backup)
                    {userPlan === "Lite" && !isAdmin && <span className="text-lg ml-auto">🔒</span>}
                  </CardTitle>
                  <CardDescription>Baixe toda a sua lista de clientes para uma planilha Excel (CSV).</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Recomendamos fazer a exportação semanalmente como backup ou para usar os dados em outras ferramentas.
                  </p>
                  <Button onClick={handleExport} disabled={isExporting} className="w-full bg-blue-600 hover:bg-blue-700">
                    {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                    Baixar Backup CSV
                  </Button>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="w-5 h-5 text-emerald-500" /> 
                    Importar de CSV
                    {userPlan === "Lite" && !isAdmin && <span className="text-lg ml-auto">🔒</span>}
                  </CardTitle>
                  <CardDescription>Traga sua base de clientes de outro sistema para o Gestor Master.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    O arquivo precisa ter a primeira linha com o nome das colunas (Ex: name, phone, plan_value, due_date).
                  </p>
                  <div className="flex items-center gap-2">
                    <Input 
                      type="file" 
                      accept=".csv" 
                      ref={fileInputRef} 
                      className="bg-background/50 cursor-pointer"
                      disabled={isImporting}
                      onChange={handleImport}
                    />
                    <Button onClick={() => fileInputRef.current?.click()} disabled={isImporting} variant="outline" className="hidden">
                      {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="danger">
            <Card className="border-red-500/20 bg-red-500/5 shadow-none">
              <CardHeader>
                <CardTitle className="text-red-500 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5" /> Limpar Banco de Dados
                </CardTitle>
                <CardDescription className="text-red-500/80">
                  Esta ação é irreversível. Todos os seus clientes serão apagados permanentemente do sistema.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="destructive" onClick={() => setIsDangerDialogOpen(true)}>
                  Apagar Todos os Clientes
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Danger Zone Password Dialog */}
      <Dialog open={isDangerDialogOpen} onOpenChange={(open) => {
        setIsDangerDialogOpen(open)
        if (!open) setDangerPin("")
      }}>
        <DialogContent className="glass-card sm:max-w-[400px] border-red-500/30">
          <DialogHeader>
            <DialogTitle className="text-red-500 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" /> Autenticação Necessária
            </DialogTitle>
            <DialogDescription>
              Para realizar a limpeza total do banco de dados, você precisa confirmar sua identidade digitando o PIN de Segurança.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-6">
            <InputOTP maxLength={4} value={dangerPin} onChange={setDangerPin}>
              <InputOTPGroup>
                <InputOTPSlot index={0} className="border-red-500/30" />
                <InputOTPSlot index={1} className="border-red-500/30" />
                <InputOTPSlot index={2} className="border-red-500/30" />
                <InputOTPSlot index={3} className="border-red-500/30" />
              </InputOTPGroup>
            </InputOTP>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDangerDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteAll} disabled={dangerPin.length !== 4 || isDeletingAll}>
              {isDeletingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Deletar Permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

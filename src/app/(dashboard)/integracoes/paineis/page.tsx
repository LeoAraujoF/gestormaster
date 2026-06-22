"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Tv, Plus, Trash2, Edit2, Server } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { GlobalDeleteDialog } from "@/components/global-delete-dialog"

export default function PaineisPage() {
  const [panels, setPanels] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPanel, setEditingPanel] = useState<any>(null)
  const [formData, setFormData] = useState({ provider: 'tvdc_iptv', username: '', password: '', url: '', linked_service_id: 'none' })
  const [isSaving, setIsSaving] = useState(false)

  const [deletingPanel, setDeletingPanel] = useState<any>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const supabase = createClient()

  const loadData = async () => {
    setIsLoading(true)
    try {
      // Load panels
      const res = await fetch('/api/integrations/paineis')
      if (res.ok) {
        const data = await res.json()
        setPanels(data.panels || [])
      }

      // Load services for dropdown
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: srvs } = await supabase.from('services').select('id, name').eq('user_id', user.id)
        if (srvs) setServices(srvs)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleOpenModal = (panel?: any) => {
    if (panel) {
      setEditingPanel(panel)
      setFormData({
        provider: panel.provider,
        username: panel.username,
        password: panel.password,
        url: panel.url || '',
        linked_service_id: panel.linked_service_id || 'none'
      })
    } else {
      setEditingPanel(null)
      setFormData({ provider: 'tvdc_iptv', username: '', password: '', url: '', linked_service_id: 'none' })
    }
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const method = editingPanel ? 'PUT' : 'POST'
      const payload = { ...formData, id: editingPanel?.id }
      if (payload.linked_service_id === 'none') payload.linked_service_id = null

      const res = await fetch('/api/integrations/paineis', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        toast.success(editingPanel ? "Painel atualizado!" : "Painel cadastrado!")
        loadData()
        setIsModalOpen(false)
      } else {
        toast.error("Erro ao salvar painel.")
      }
    } catch (e) {
      toast.error("Erro interno ao salvar.")
    } finally {
      setIsSaving(false)
    }
  }

  const getServiceName = (serviceId: string) => {
    const srv = services.find(s => s.id === serviceId)
    return srv ? srv.name : "Nenhum"
  }

  return (
    <div className="flex flex-col space-y-8 p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Server className="w-8 h-8 text-purple-500" />
            Painéis IPTV Integrados
          </h2>
          <p className="text-muted-foreground mt-1">Conecte múltiplas contas de painéis e vincule-as a seus Serviços.</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="gap-2 bg-purple-500 hover:bg-purple-600 text-white">
          <Plus className="w-4 h-4" />
          Conectar Novo Painel
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : panels.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 gap-4 text-center glass-card rounded-2xl">
          <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center">
            <Tv className="w-8 h-8 text-purple-500" />
          </div>
          <h3 className="text-xl font-semibold">Nenhum painel conectado</h3>
          <p className="text-muted-foreground max-w-sm">
            Você pode adicionar múltiplos painéis. Os clientes sincronizados herdarão o preço do serviço que você escolher.
          </p>
          <Button onClick={() => handleOpenModal()} variant="outline" className="mt-2 text-purple-500 border-purple-500/50">
            Adicionar Primeiro Painel
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {panels.map((panel) => (
            <Card key={panel.id} className="relative overflow-hidden transition-all duration-200 hover:shadow-md border-purple-500/30">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-purple-500/10">
                      <Tv className="w-6 h-6 text-purple-500" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">{panel.provider === 'tvdc_iptv' ? 'TVdeCasa' : panel.provider}</CardTitle>
                      <CardDescription>Usuário: {panel.username}</CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm space-y-2">
                  <div className="flex justify-between items-center bg-muted/50 p-2 rounded">
                    <span className="text-muted-foreground">Serviço Vinculado:</span>
                    <span className="font-semibold">{getServiceName(panel.linked_service_id)}</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-4 border-t bg-secondary/10 flex justify-end gap-2">
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-purple-500" onClick={() => handleOpenModal(panel)}>
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => { setDeletingPanel(panel); setIsDeleteDialogOpen(true) }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-500">
              <Tv className="w-5 h-5" />
              {editingPanel ? "Editar Painel" : "Conectar Novo Painel"}
            </DialogTitle>
            <DialogDescription>
              Insira as credenciais do seu painel IPTV.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Provedor / Plataforma</Label>
              <Select value={formData.provider} onValueChange={(v) => setFormData({ ...formData, provider: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tvdc_iptv">TVdeCasa / Dashboard</SelectItem>
                  <SelectItem value="xtreamui" disabled>XtreamUI (Em breve)</SelectItem>
                  <SelectItem value="koffice" disabled>KOffice (Em breve)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>URL do Painel (Link)</Label>
              <Input
                placeholder="Ex: http://cms.painel.com"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Usuário (Login)</Label>
              <Input
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Senha</Label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>
            <div className="space-y-2 pt-4 border-t border-border/50">
              <Label>Vincular ao Serviço (Financeiro)</Label>
              <Select value={formData.linked_service_id} onValueChange={(v) => setFormData({ ...formData, linked_service_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum Serviço (Manual)</SelectItem>
                  {services.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Clientes importados daqui receberão o custo configurado neste serviço.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-purple-500 hover:bg-purple-600 text-white">
              {isSaving ? "Salvando..." : "Salvar Painel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GlobalDeleteDialog 
        open={isDeleteDialogOpen} 
        onOpenChange={setIsDeleteDialogOpen} 
        item={deletingPanel} 
        table="iptv_accounts" 
        title="Desconectar Painel" 
        description="Esta ação removerá a integração, mas os clientes importados continuarão no seu banco de dados." 
        onSuccess={loadData} 
      />
    </div>
  )
}

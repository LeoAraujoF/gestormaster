"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Tv, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { GlobalDeleteDialog } from "@/components/global-delete-dialog"
import { ConnectionsNavigation } from "@/components/connections-navigation"
import { PageHeader, PageShell } from "@/components/page-layout"

export default function PaineisPage() {
  const supabase = createClient()
  
  const [isLoading, setIsLoading] = useState(true)
  const [services, setServices] = useState<any[]>([])
  const [panels, setPanels] = useState<any[]>([])
  
  const [isPanelModalOpen, setIsPanelModalOpen] = useState(false)
  const [editingPanel, setEditingPanel] = useState<any>(null)
  const [panelFormData, setPanelFormData] = useState({ provider: 'tvdc_iptv', username: '', password: '', url: '', linked_service_id: 'none' })
  const [isSavingPanel, setIsSavingPanel] = useState(false)
  
  const [deletingPanel, setDeletingPanel] = useState<any>(null)
  const [isDeletePanelOpen, setIsDeletePanelOpen] = useState(false)

  const loadData = async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const { data: srvs } = await supabase.from('services').select('id, name').eq('user_id', user.id)
      if (srvs) setServices(srvs)

      const resPanels = await fetch('/api/integrations/paineis')
      if (resPanels.ok) {
        const dataPanels = await resPanels.json()
        setPanels(dataPanels.panels || [])
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

  const handleOpenPanelModal = (panel?: any) => {
    if (panel) {
      setEditingPanel(panel)
      let linkedService = panel.linked_service_id || 'none'
      if (linkedService !== 'none' && !services.find(s => s.id === linkedService)) {
        linkedService = 'none'
      }
      setPanelFormData({
        provider: panel.provider,
        username: panel.username,
        password: panel.password,
        url: panel.url || '',
        linked_service_id: linkedService
      })
    } else {
      setEditingPanel(null)
      setPanelFormData({ provider: 'tvdc_iptv', username: '', password: '', url: '', linked_service_id: 'none' })
    }
    setIsPanelModalOpen(true)
  }

  const handleSavePanel = async () => {
    setIsSavingPanel(true)
    try {
      const method = editingPanel ? 'PUT' : 'POST'
      const payload: any = { ...panelFormData, id: editingPanel?.id }
      if (payload.linked_service_id === 'none') payload.linked_service_id = null

      const res = await fetch('/api/integrations/paineis', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        toast.success(editingPanel ? "Painel atualizado!" : "Painel cadastrado!")
        loadData()
        setIsPanelModalOpen(false)
      } else {
        toast.error("Erro ao salvar painel.")
      }
    } catch (e) {
      toast.error("Erro interno ao salvar painel.")
    } finally {
      setIsSavingPanel(false)
    }
  }

  return (
    <PageShell width="default">
      <PageHeader eyebrow="Integrações" title="Painéis IPTV" description="Veja o estado das conexões e os serviços vinculados antes de cadastrar ou reconectar um painel." badge={`${panels.length} conectados`} actions={<Button onClick={() => handleOpenPanelModal()}><Plus className="mr-2 size-4" />Conectar painel</Button>} />
      <ConnectionsNavigation active="panels" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading ? (
          <div className="h-28 bg-muted animate-pulse rounded-xl" />
        ) : panels.length === 0 ? (
          <div className="col-span-full rounded-xl border border-dashed border-border p-12 flex flex-col items-center justify-center text-center bg-card/50">
            <p className="text-sm font-medium text-muted-foreground mb-4">Nenhum painel conectado no momento.</p>
            <Button variant="outline" size="sm" onClick={() => handleOpenPanelModal()} className="text-xs">
              + Conectar Painel
            </Button>
          </div>
        ) : (
          panels.map((panel) => (
            <div key={panel.id} className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-border/80">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="size-10 bg-secondary rounded-lg flex items-center justify-center">
                    <span className="text-[13px] font-bold text-muted-foreground">
                        {panel.provider === 'tvdc_iptv' ? 'TV' : panel.provider.substring(0,2).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[15px]">{panel.provider === 'tvdc_iptv' ? 'TVdeCasa' : panel.provider}</h3>
                    <p className="text-[12px] text-muted-foreground">{panel.username}</p>
                  </div>
                </div>
                
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500">
                    <span className="size-1.5 rounded-full bg-emerald-500"></span> Conectado
                  </div>
                  <div className="flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity">
                      <button onClick={() => handleOpenPanelModal(panel)} className="text-[10px] text-muted-foreground hover:text-foreground hover:underline">Editar</button>
                      <span className="text-[10px] text-muted-foreground">&middot;</span>
                      <button onClick={() => { setDeletingPanel(panel); setIsDeletePanelOpen(true) }} className="text-[10px] text-muted-foreground hover:text-destructive hover:underline">Remover</button>
                  </div>
                </div>
              </div>
              
              <div className="h-px bg-border w-full mb-3"></div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-[12px]">
                  <span className="text-muted-foreground">Créditos: <span className="font-semibold text-foreground">—</span></span>
                  <span className="text-muted-foreground">Custo/crédito: <span className="font-semibold text-foreground">—</span></span>
                </div>
                <button onClick={() => handleOpenPanelModal(panel)} className="text-[12px] font-semibold text-interactive hover:underline">
                  Reconectar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={isPanelModalOpen} onOpenChange={setIsPanelModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tv className="w-5 h-5 text-muted-foreground" />
              {editingPanel ? "Editar Painel" : "Conectar Novo Painel"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
             <div className="space-y-2">
              <Label>Provedor / Plataforma</Label>
              <Select value={panelFormData.provider} onValueChange={(v) => setPanelFormData({ ...panelFormData, provider: v ?? "" })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione...">
                    {panelFormData.provider === 'tvdc_iptv' ? 'TVdeCasa / Dashboard' : panelFormData.provider === 'xtreamui' ? 'XtreamUI (Em breve)' : 'Selecione...'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tvdc_iptv">TVdeCasa / Dashboard</SelectItem>
                  <SelectItem value="xtreamui" disabled>XtreamUI (Em breve)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>URL do Painel (Link)</Label>
              <Input placeholder="Ex: http://cms.painel.com" value={panelFormData.url} onChange={(e) => setPanelFormData({ ...panelFormData, url: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Usuário (Login)</Label>
              <Input value={panelFormData.username} onChange={(e) => setPanelFormData({ ...panelFormData, username: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Senha</Label>
              <Input type="password" value={panelFormData.password} onChange={(e) => setPanelFormData({ ...panelFormData, password: e.target.value })} />
            </div>
            <div className="space-y-2 pt-4 border-t border-border/50">
              <Label>Vincular ao Serviço (Financeiro)</Label>
              <Select value={panelFormData.linked_service_id} onValueChange={(v) => setPanelFormData({ ...panelFormData, linked_service_id: v ?? "none" })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione...">
                    {panelFormData.linked_service_id === 'none' 
                      ? 'Nenhum Serviço (Manual)' 
                      : (services.find(s => s.id === panelFormData.linked_service_id)?.name || 'Nenhum Serviço (Manual)')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum Serviço (Manual)</SelectItem>
                  {services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPanelModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSavePanel} disabled={isSavingPanel} className="bg-foreground text-background hover:bg-foreground/90">
              {isSavingPanel ? "Salvando..." : "Salvar Painel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GlobalDeleteDialog 
        open={isDeletePanelOpen} 
        onOpenChange={setIsDeletePanelOpen} 
        item={deletingPanel} 
        table="iptv_accounts" 
        title="Desconectar Painel" 
        description="Esta ação removerá a integração permanentemente." 
        onSuccess={loadData} 
      />
    </PageShell>
  )
}

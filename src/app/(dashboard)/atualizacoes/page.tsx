"use client"

import dynamic from 'next/dynamic'
import { useState, useEffect, Suspense } from "react"
import { createClient } from "@/lib/supabase/client"
import { Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AccountTabs } from "@/components/account-tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { logAuditClient } from "@/lib/audit-client"
import { PageHeader, PageShell } from "@/components/page-layout"

// Badges de tipo (11b): NOVO verde / MELHORIA azul / CORREÇÃO cinza
const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  feature: { label: "NOVO", cls: "bg-success-bg text-success-fg" },
  improvement: { label: "MELHORIA", cls: "bg-accent text-accent-foreground" },
  bugfix: { label: "CORREÇÃO", cls: "bg-secondary text-secondary-foreground" },
  maintenance: { label: "MANUTENÇÃO", cls: "bg-warning-bg text-warning-fg" },
}

const ReactMarkdown = dynamic(() => import('react-markdown'))

function AtualizacoesContent() {
  const [updates, setUpdates] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  // States for new update modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [newUpdate, setNewUpdate] = useState({ title: '', content: '', type: 'feature' })

  const searchParams = useSearchParams()
  const tab = searchParams.get("tab") || "updates"
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Verifica se é admin
    try {
      const res = await fetch('/api/admin/check')
      const data = await res.json()
      setIsAdmin(data.isAdmin)
    } catch (e) {
      setIsAdmin(false)
    }

    // 1. System Updates
    const { data: updatesData } = await supabase
      .from('system_updates')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false })

    if (updatesData) {
      setUpdates(updatesData)
      // Call background API to mark all updates as read
      fetch('/api/updates/read', { method: 'POST' }).catch(console.error)
    }

    // 2. Alerts
    const newAlerts = []

    // WPP Check
    const { data: wppDataArray } = await supabase
      .from('evolution_instances')
      .select('status')
      .eq('user_id', user.id)
      .limit(1)

    const wppData = wppDataArray?.[0]

    if (wppData && wppData.status !== 'connected') {
      newAlerts.push({
        id: 'wpp',
        type: 'critical',
        title: 'Instância desconectada',
        desc: 'O número de WhatsApp configurado perdeu a conexão. Suas automações estão pausadas.',
        action: 'Resolver agora',
        path: '/automacao'
      })
    }

    // Clients Expiring in 5 days
    const today = new Date()
    const fiveDaysFromNow = new Date()
    fiveDaysFromNow.setDate(today.getDate() + 5)

    const { data: clientsData } = await supabase
      .from('clients')
      .select('id, name, due_date')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gte('due_date', today.toISOString().split('T')[0])
      .lte('due_date', fiveDaysFromNow.toISOString().split('T')[0])
      .order('due_date', { ascending: true })

    if (clientsData && clientsData.length > 0) {
      newAlerts.push({
        id: 'clients',
        type: 'warning',
        title: `${clientsData.length} cliente(s) vencendo`,
        desc: 'Existem mensalidades que vencem nos próximos 5 dias. Monitore os pagamentos para evitar inadimplência.',
        action: 'Ver clientes',
        path: '/clientes'
      })
    }

    // Vencidos Alert
    const { count: vencidosCount } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'vencido')

    if (vencidosCount && vencidosCount > 0) {
      newAlerts.push({
        id: 'vencidos',
        type: 'critical',
        title: `${vencidosCount} cliente(s) vencidos`,
        desc: 'Existem clientes com a mensalidade atrasada. Recomendamos enviar uma cobrança ou suspender o serviço.',
        action: 'Cobrar agora',
        path: '/automacao'
      })
    }

    setAlerts(newAlerts)
    setIsLoading(false)
  }

  const handlePostUpdate = async () => {
    if (!newUpdate.title || !newUpdate.content) {
      return toast.error("Preencha título e conteúdo.")
    }
    setIsSaving(true)
    try {
      const { error } = await supabase.from('system_updates').insert({
        title: newUpdate.title,
        content: newUpdate.content,
        update_type: newUpdate.type,
        is_published: true
      })
      if (error) throw error
      logAuditClient({ action: 'system.create_update', resource: 'system_updates', details: { title: newUpdate.title } })
      toast.success("Atualização publicada com sucesso!")
      setIsModalOpen(false)
      setNewUpdate({ title: '', content: '', type: 'feature' })
      loadData()
    } catch (error) {
      toast.error("Erro ao publicar atualização.")
    } finally {
      setIsSaving(false)
    }
  }

  // Coluna mono da timeline: "02 JUL" (+ ano quando difere do atual)
  const dateLabel = (iso: string) => {
    const d = new Date(iso)
    const day = String(d.getDate()).padStart(2, "0")
    const month = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase()
    return { main: `${day} ${month}`, year: d.getFullYear() !== new Date().getFullYear() ? String(d.getFullYear()) : null }
  }

  return (
    <PageShell width="default">
      <PageHeader eyebrow="Central de novidades" title="Atualizações" description="Consulte mudanças do produto e alertas que exigem atenção na sua operação." badge={alerts.length ? `${alerts.length} alertas` : "Tudo em dia"} />
      <AccountTabs />

      {/* Cabeçalho: título + segmentado Novidades/Alertas (11b) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Atualizações</h2>
          <div className="flex items-center gap-0.5 rounded-md bg-secondary p-0.5">
            {([
              { key: "updates", label: "Novidades" },
              { key: "alertas", label: "Alertas" },
            ] as const).map((s) => (
              <button
                key={s.key}
                onClick={() => router.push(`?tab=${s.key}`, { scroll: false })}
                className={cn(
                  "flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-xs transition-colors",
                  tab === s.key
                    ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                    : "text-secondary-foreground hover:text-foreground"
                )}
              >
                {s.label}
                {s.key === "alertas" && alerts.length > 0 && (
                  <span className="num rounded bg-warning-bg px-1 text-[9px] font-semibold text-warning-fg">
                    {alerts.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {isAdmin && (
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger render={
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <Plus className="size-3.5" /> Nova atualização
              </Button>
            } />
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Publicar nova atualização</DialogTitle>
                <DialogDescription>
                  Esta mensagem aparecerá na linha do tempo de todos os seus clientes.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Tipo de atualização</Label>
                  <Select value={newUpdate.type} onValueChange={(val) => setNewUpdate({ ...newUpdate, type: val || "improvement" as any })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="feature">Nova funcionalidade</SelectItem>
                      <SelectItem value="improvement">Melhoria</SelectItem>
                      <SelectItem value="bugfix">Correção de bug</SelectItem>
                      <SelectItem value="maintenance">Manutenção</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input
                    placeholder="Ex: Novo disparo em massa"
                    value={newUpdate.title}
                    onChange={(e) => setNewUpdate({ ...newUpdate, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Detalhes da atualização</Label>
                  <Textarea
                    placeholder="Descreva as melhorias ou correções aplicadas..."
                    className="min-h-[120px]"
                    value={newUpdate.content}
                    onChange={(e) => setNewUpdate({ ...newUpdate, content: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <Button onClick={handlePostUpdate} disabled={isSaving}>
                  {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />} Publicar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : tab === "alertas" ? (
        /* ── Alertas: faixas acionáveis, contador estático (sem pulse) ── */
        alerts.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-5">
            <span className="status-dot bg-money" />
            <div>
              <p className="text-[12.5px] font-semibold">Nenhum alerta ativo</p>
              <p className="text-[11px] text-muted-foreground">Conexão e vencimentos estão em dia.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-md border px-4 py-3",
                  alert.type === 'critical'
                    ? "border-danger-border bg-danger-bg"
                    : "border-warning-border bg-warning-bg"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[12.5px] font-semibold", alert.type === 'critical' ? "text-danger-fg" : "text-warning-fg")}>
                    {alert.title}
                  </p>
                  <p className={cn("mt-0.5 text-[11px]", alert.type === 'critical' ? "text-danger-fg/80" : "text-warning-fg/80")}>
                    {alert.desc}
                  </p>
                </div>
                <Button size="sm" className="h-7 text-xs" onClick={() => router.push(alert.path)}>
                  {alert.action}
                </Button>
              </div>
            ))}
          </div>
        )
      ) : (
        /* ── Novidades: timeline com data mono à esquerda + cards (11b) ── */
        updates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-center">
            <p className="text-[12.5px] font-semibold">Sem novidades por enquanto</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Nenhuma atualização registrada. Novas melhorias aparecem aqui.
            </p>
          </div>
        ) : (
          <div className="pt-1">
            {updates.map((update, i) => {
              const badge = TYPE_BADGE[update.update_type] || { label: "ATUALIZAÇÃO", cls: "bg-secondary text-secondary-foreground" }
              const label = dateLabel(update.created_at)
              const prev = i > 0 ? dateLabel(updates[i - 1].created_at) : null
              const showDate = !prev || prev.main !== label.main || prev.year !== label.year
              return (
                <div key={update.id} className="grid grid-cols-[64px_1fr] gap-4 sm:grid-cols-[76px_1fr]">
                  {/* Coluna mono: data (só na primeira entrada do dia) */}
                  <div className="pt-1 text-right">
                    {showDate && (
                      <>
                        <p className="num text-[11px] font-semibold text-foreground">{label.main}</p>
                        {label.year && <p className="num text-[10px] text-muted-foreground">{label.year}</p>}
                      </>
                    )}
                  </div>
                  <div className="border-l border-border pb-4 pl-4">
                    <div className="rounded-lg border border-border bg-card px-4 py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("num rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.06em]", badge.cls)}>
                          {badge.label}
                        </span>
                        <p className="text-[13px] font-semibold tracking-[-0.01em]">{update.title}</p>
                      </div>
                      <div className="prose prose-sm dark:prose-invert mt-1.5 max-w-none text-[12px] leading-relaxed text-muted-foreground">
                        <ReactMarkdown>{update.content}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </PageShell>
  )
}

export default function AtualizacoesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}>
      <AtualizacoesContent />
    </Suspense>
  )
}

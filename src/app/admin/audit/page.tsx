"use client"

import { useEffect, useState } from "react"
import { ShieldCheck, Search, Filter, AlertCircle, Clock, Database, Eye, ChevronDown, RefreshCw, Activity } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [missingTable, setMissingTable] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [actionFilter, setActionFilter] = useState("all")
  const [uniqueActions, setUniqueActions] = useState<string[]>([])
  const [expandedDetails, setExpandedDetails] = useState<string | null>(null)

  useEffect(() => {
    fetchAuditLogs()
  }, [])

  const fetchAuditLogs = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/audit?limit=200')
      if (res.ok) {
        const data = await res.json()
        if (data.missingTable) {
          setMissingTable(true)
        } else {
          setLogs(data.logs || [])
          setUniqueActions(data.uniqueActions || [])
        }
      }
    } catch (error) {
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const getActionColor = (action: string) => {
    if (action.includes('delete') || action.includes('block') || action.includes('failed') || action.includes('clear')) 
      return 'bg-red-500/10 text-red-500 border-red-500/20'
    if (action.includes('create') || action.includes('success') || action.includes('connect') || action.includes('import')) 
      return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
    if (action.includes('update') || action.includes('edit') || action.includes('toggle') || action.includes('change') || action.includes('renew')) 
      return 'bg-amber-500/10 text-amber-500 border-amber-500/20'
    if (action.includes('send') || action.includes('mass') || action.includes('single') || action.includes('instant'))
      return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
    if (action.includes('checkout') || action.includes('payment') || action.includes('pix') || action.includes('generate'))
      return 'bg-purple-500/10 text-purple-500 border-purple-500/20'
    if (action.includes('admin') || action.includes('cron') || action.includes('force'))
      return 'bg-rose-500/10 text-rose-600 border-rose-500/20'
    return 'bg-slate-500/10 text-slate-500 border-slate-500/20'
  }

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      'client.create': '➕ Criar Cliente',
      'client.update': '✏️ Editar Cliente',
      'client.delete': '🗑️ Excluir Cliente',
      'client.renew': '🔄 Renovar Cliente',
      'config.import_clients': '📥 Importar Clientes',
      'config.delete_all_clients': '⚠️ Excluir Todos Clientes',
      'lead.create': '➕ Criar Lead',
      'lead.update': '✏️ Editar Lead',
      'lead.delete': '🗑️ Excluir Lead',
      'lead.bulk_delete': '🗑️ Excluir Leads em Massa',
      'lead.bulk_import': '📥 Importar Leads',
      'lead.delete_all': '⚠️ Excluir Todos Leads',
      'lead.status_change': '🔄 Mudar Status Lead',
      'campaign.delete': '🗑️ Excluir Campanha',
      'automation.create': '➕ Criar Automação',
      'automation.update': '✏️ Editar Automação',
      'automation.delete': '🗑️ Excluir Automação',
      'alert.retry': '🔁 Reenviar Alerta',
      'alert.cancel': '❌ Cancelar Alerta',
      'alert.delete': '🗑️ Excluir Alerta',
      'alert.batch_retry': '🔁 Reenviar Alertas em Lote',
      'alert.batch_cancel': '❌ Cancelar Alertas em Lote',
      'alert.clear_all': '⚠️ Limpar Todo Histórico',
      'antiban.update': '🛡️ Atualizar Anti-Ban',
      'whatsapp.send_mass': '📨 Disparo em Massa',
      'whatsapp.send_single': '💬 Enviar Mensagem',
      'whatsapp.send_instant': '⚡ Envio Instantâneo',
      'whatsapp.connect': '🔗 Conectar Instância',
      'whatsapp.delete_instance': '🗑️ Excluir Instância',
      'whatsapp.logout': '🔌 Desconectar Instância',
      'whatsapp.update_settings': '⚙️ Configurar Instância',
      'whatsapp.set_primary': '⭐ Definir Instância Primária',
      'whatsapp.toggle_warmup': '🔥 Modo Aquecimento',
      'payment.create': '💰 Registrar Pagamento',
      'pix.generate': '💳 Gerar Pix',
      'stripe.checkout': '💳 Checkout Stripe',
      'stripe.payment_success': '✅ Pagamento Stripe',
      'stripe.subscription_cancelled': '❌ Cancelar Assinatura',
      'mercadopago.payment': '💳 Pagamento MercadoPago',
      'service.create': '➕ Criar Serviço',
      'service.update': '✏️ Editar Serviço',
      'promotion.create': '➕ Criar Promoção',
      'promotion.update': '✏️ Editar Promoção',
      'promotion.toggle': '🔄 Ativar/Desativar Promoção',
      'reseller.create': '➕ Criar Revendedor',
      'reseller.add_service': '➕ Adicionar Serviço Revenda',
      'reseller.delete_service': '🗑️ Excluir Serviço Revenda',
      'reseller.update_debt': '💰 Atualizar Débito Revenda',
      'reseller.cancel_credit': '❌ Cancelar Crédito',
      'reseller.update_config': '⚙️ Config Revenda',
      'resource.delete': '🗑️ Excluir Recurso',
      'integration.save': '🔗 Salvar Integração',
      'integration.delete': '🗑️ Excluir Integração',
      'integration.create_painel': '➕ Criar Painel IPTV',
      'integration.update_painel': '✏️ Editar Painel IPTV',
      'integration.delete_painel': '🗑️ Excluir Painel IPTV',
      'iptv.sync': '🔄 Sincronizar IPTV',
      'developer.create_key': '🔑 Criar Chave API',
      'developer.delete_key': '🗑️ Excluir Chave API',
      'admin.block_user': '🚫 Bloquear Usuário',
      'admin.unblock_user': '✅ Desbloquear Usuário',
      'admin.create_user': '➕ Criar Usuário',
      'admin.update_user': '✏️ Editar Usuário',
      'admin.force_cron': '⚡ Forçar CRON',
      'system.create_update': '📢 Publicar Atualização',
      'ticket.create': '🎫 Abrir Ticket',
    }
    return labels[action] || action.toUpperCase()
  }

  const getActionCategory = (action: string) => {
    const category = action.split('.')[0]
    const categoryLabels: Record<string, string> = {
      'client': 'Clientes',
      'config': 'Configurações',
      'lead': 'Leads',
      'campaign': 'Campanhas',
      'automation': 'Automações',
      'alert': 'Alertas',
      'antiban': 'Anti-Ban',
      'whatsapp': 'WhatsApp',
      'payment': 'Pagamentos',
      'pix': 'Pix',
      'stripe': 'Stripe',
      'mercadopago': 'MercadoPago',
      'service': 'Serviços',
      'promotion': 'Promoções',
      'reseller': 'Revendas',
      'resource': 'Recursos',
      'integration': 'Integrações',
      'iptv': 'IPTV',
      'developer': 'Desenvolvedor',
      'admin': 'Administração',
      'system': 'Sistema',
      'ticket': 'Suporte',
    }
    return categoryLabels[category] || category
  }

  // Filtro combinado
  const filteredLogs = logs.filter(l => {
    const matchesAction = actionFilter === 'all' || l.action === actionFilter
    const matchesSearch = !searchTerm || 
      l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.user_email && l.user_email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (l.resource && l.resource.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (l.resource_id && l.resource_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (l.ip_address && l.ip_address.includes(searchTerm))
    return matchesAction && matchesSearch
  })

  // Stats
  const todayLogs = logs.filter(l => {
    const logDate = new Date(l.created_at)
    const today = new Date()
    return logDate.toDateString() === today.toDateString()
  })
  const deleteActions = todayLogs.filter(l => l.action.includes('delete') || l.action.includes('clear'))
  const criticalActions = todayLogs.filter(l => l.action.includes('admin') || l.action.includes('block') || l.action.includes('delete_all'))

  return (
    <div className="flex flex-col space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-teal-500" />
            Logs de Auditoria
          </h2>
          <p className="text-muted-foreground mt-1">Rastreio completo de todas as ações do sistema em tempo real.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAuditLogs} disabled={isLoading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {missingTable && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-amber-500 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Tabela `audit_logs` não encontrada no Supabase
            </CardTitle>
            <CardDescription>
              A interface está pronta, mas o banco de dados ainda não possui a tabela de auditoria criada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-background rounded-md p-4 text-sm font-mono overflow-x-auto border">
              <code>
                CREATE TABLE audit_logs (<br/>
                &nbsp;&nbsp;id UUID DEFAULT gen_random_uuid() PRIMARY KEY,<br/>
                &nbsp;&nbsp;user_id UUID,<br/>
                &nbsp;&nbsp;action VARCHAR(255) NOT NULL,<br/>
                &nbsp;&nbsp;resource VARCHAR(255) NOT NULL,<br/>
                &nbsp;&nbsp;resource_id VARCHAR(255),<br/>
                &nbsp;&nbsp;details JSONB,<br/>
                &nbsp;&nbsp;ip_address VARCHAR(45),<br/>
                &nbsp;&nbsp;created_at TIMESTAMPTZ DEFAULT NOW()<br/>
                );
              </code>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      {!missingTable && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ações Hoje</CardTitle>
              <Activity className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{todayLogs.length}</div>
              <p className="text-xs text-muted-foreground">Total de ações registradas hoje</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Exclusões Hoje</CardTitle>
              <AlertCircle className="w-4 h-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${deleteActions.length > 0 ? 'text-red-500' : ''}`}>
                {deleteActions.length}
              </div>
              <p className="text-xs text-muted-foreground">Operações de exclusão realizadas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ações Críticas</CardTitle>
              <ShieldCheck className="w-4 h-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${criticalActions.length > 0 ? 'text-rose-500' : ''}`}>
                {criticalActions.length}
              </div>
              <p className="text-xs text-muted-foreground">Admin, bloqueios e exclusões em massa</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b pb-4">
          <CardTitle className="text-xl">Histórico de Ações</CardTitle>
          <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por ação, email, IP..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                disabled={missingTable || isLoading}
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter} disabled={missingTable || isLoading}>
              <SelectTrigger className="w-full md:w-52">
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Filtrar por ação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as ações</SelectItem>
                {uniqueActions.map((action) => (
                  <SelectItem key={action} value={action}>
                    {getActionLabel(action)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Data / Hora</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Recurso</TableHead>
                <TableHead>Detalhes</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead className="w-[120px]">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    <RefreshCw className="w-4 h-4 animate-spin inline mr-2" />
                    Carregando logs de auditoria...
                  </TableCell>
                </TableRow>
              ) : missingTable ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Aguardando criação da tabela `audit_logs` no banco de dados.
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    {logs.length === 0 
                      ? "Nenhum log registrado ainda. As ações do sistema serão registradas automaticamente."
                      : "Nenhum log encontrado com os filtros aplicados."
                    }
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <TableRow key={log.id} className="group hover:bg-muted/50 transition-colors">
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(log.created_at), "dd/MM/yy HH:mm:ss")}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getActionColor(log.action)}>
                        {getActionLabel(log.action)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{getActionCategory(log.action)}</div>
                      <div className="text-xs text-muted-foreground">
                        {log.resource}
                        {log.resource_id && (
                          <span className="ml-1 font-mono truncate max-w-[120px] inline-block align-bottom" title={log.resource_id}>
                            #{log.resource_id.substring(0, 8)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {log.details ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger render={
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 px-2 text-xs gap-1"
                                onClick={() => setExpandedDetails(expandedDetails === log.id ? null : log.id)}
                              >
                                <Eye className="w-3 h-3" />
                                Ver
                              </Button>
                            } />
                            <TooltipContent side="left" className="max-w-xs">
                              <pre className="text-xs whitespace-pre-wrap">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm truncate max-w-[180px]" title={log.user_email || log.user_id}>
                        {log.user_email || (log.user_id ? log.user_id.substring(0, 8) + '...' : 'Sistema')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground font-mono">{log.ip_address || '—'}</div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Expanded Details Row */}
          {expandedDetails && (
            <div className="border-t bg-muted/30 p-4">
              <h4 className="text-sm font-semibold mb-2">Detalhes da Ação</h4>
              <pre className="text-xs bg-background p-3 rounded-md border overflow-x-auto">
                {JSON.stringify(
                  logs.find(l => l.id === expandedDetails)?.details || {},
                  null,
                  2
                )}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {!missingTable && filteredLogs.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Exibindo {filteredLogs.length} de {logs.length} registros
        </p>
      )}
    </div>
  )
}

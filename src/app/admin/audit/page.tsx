"use client"

import { useEffect, useState } from "react"
import { ShieldCheck, Search, Filter, AlertCircle, Clock, Database } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [missingTable, setMissingTable] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    fetchAuditLogs()
  }, [])

  const fetchAuditLogs = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/audit?limit=100')
      if (res.ok) {
        const data = await res.json()
        if (data.missingTable) {
          setMissingTable(true)
        } else {
          setLogs(data.logs || [])
        }
      }
    } catch (error) {
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const getActionColor = (action: string) => {
    if (action.includes('delete') || action.includes('block') || action.includes('failed')) return 'bg-red-500/10 text-red-500 border-red-500/20'
    if (action.includes('create') || action.includes('success') || action.includes('login')) return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
    if (action.includes('update') || action.includes('edit')) return 'bg-amber-500/10 text-amber-500 border-amber-500/20'
    return 'bg-slate-500/10 text-slate-500 border-slate-500/20'
  }

  const filteredLogs = logs.filter(l => 
    l.action.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (l.user_id && l.user_id.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  return (
    <div className="flex flex-col space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-teal-500" />
            Logs de Auditoria
          </h2>
          <p className="text-muted-foreground mt-1">Rastreio de atividades, exclusões e logins críticos no sistema.</p>
        </div>
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
                &nbsp;&nbsp;id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,<br/>
                &nbsp;&nbsp;organization_id UUID,<br/>
                &nbsp;&nbsp;user_id UUID,<br/>
                &nbsp;&nbsp;action VARCHAR(255) NOT NULL,<br/>
                &nbsp;&nbsp;resource VARCHAR(255) NOT NULL,<br/>
                &nbsp;&nbsp;resource_id VARCHAR(255),<br/>
                &nbsp;&nbsp;ip_address VARCHAR(45),<br/>
                &nbsp;&nbsp;created_at TIMESTAMPTZ DEFAULT NOW()<br/>
                );
              </code>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b pb-4">
          <CardTitle className="text-xl">Histórico de Ações</CardTitle>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por ação ou usuário..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                disabled={missingTable || isLoading}
              />
            </div>
            <Button variant="outline" size="icon" disabled={missingTable || isLoading}>
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data / Hora</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Recurso Afetado</TableHead>
                <TableHead>Usuário / IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    Carregando logs de segurança...
                  </TableCell>
                </TableRow>
              ) : missingTable ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    Aguardando criação da tabela `audit_logs` no banco de dados.
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    Nenhum log encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss")}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getActionColor(log.action)}>
                        {log.action.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{log.resource}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">{log.resource_id}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm truncate max-w-[150px]" title={log.user_id}>{log.user_id || 'Sistema'}</div>
                      <div className="text-xs text-muted-foreground font-mono">{log.ip_address || 'IP Desconhecido'}</div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

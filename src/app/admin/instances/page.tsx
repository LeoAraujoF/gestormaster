"use client"

import { useState, useEffect } from "react"
import { Loader2, RefreshCw, Server, Search } from "lucide-react"
import { phoneMask } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function AdminInstancesPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [instances, setInstances] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")

  const checkAdminAndLoadInstances = async () => {
    setIsLoading(true)
    try {
      const resMetrics = await fetch('/api/admin/metrics')
      if (!resMetrics.ok) {
        setIsAdmin(false)
        return
      }
      setIsAdmin(true)

      const resInst = await fetch('/api/admin/instances')
      if (resInst.ok) {
        const instData = await resInst.json()
        setInstances(instData.instances || [])
      }

    } catch (e) {
      console.error(e)
      setIsAdmin(false)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    checkAdminAndLoadInstances()
  }, [])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isAdmin === false) return <div>Acesso Negado</div>

  const filteredInstances = instances.filter(i => 
    i.instance_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    i.user_email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-start sm:items-center flex-col sm:flex-row gap-4">
        <div>
          <h1 className="text-[17px] font-semibold tracking-[-0.02em] mb-2 flex items-center gap-2">
            <Server className="w-8 h-8 text-muted-foreground" />
            Instâncias Evolution API
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Monitoramento global de todas as conexões do WhatsApp.
          </p>
        </div>
        <Button variant="outline" onClick={checkAdminAndLoadInstances}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar Lista
        </Button>
      </div>

      <div className="bg-card text-card-foreground border rounded-xl overflow-hidden p-4">
        <div className="mb-4 relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
          <Input
            placeholder="Buscar instância ou dono (e-mail)..."
            className="max-w-md pl-9 bg-background/50"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Instância</TableHead>
                <TableHead>Dono (E-mail)</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Modo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criada em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInstances.map((inst) => (
                <TableRow key={inst.id} className="hover:bg-muted/30">
                  <TableCell>
                    <div className="font-semibold text-interactive">{inst.instance_name}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground">{inst.user_email}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{inst.phone_number ? phoneMask(inst.phone_number) : '-'}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={inst.connection_mode === 'integrated' ? 'border-border text-interactive' : 'border-border text-muted-foreground'}>
                      {inst.connection_mode === 'integrated' ? 'Nuvem' : 'Própria'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {inst.status === 'connected' ? (
                       <Badge className="bg-emerald-500/10 text-emerald-500 border-0">Conectado</Badge>
                    ) : inst.status === 'connecting' ? (
                       <Badge className="bg-amber-500/10 text-amber-500 border-0">Conectando</Badge>
                    ) : (
                       <Badge className="bg-red-500/10 text-red-500 border-0">Desconectado</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-muted-foreground">
                      {new Date(inst.created_at).toLocaleString('pt-BR')}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}

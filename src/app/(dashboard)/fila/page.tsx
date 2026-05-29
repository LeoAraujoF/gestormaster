"use client"

import { useState, useEffect } from "react"
import { Activity, Clock, AlertTriangle, CheckCircle2, Loader2, Send } from "lucide-react"
import { toast } from "sonner"
import { phoneMask } from "@/lib/utils"

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

export default function QueueDashboardPage() {
  const [status, setStatus] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadStatus()
    // Auto refresh a cada 10 segundos
    const interval = setInterval(loadStatus, 10000)
    return () => clearInterval(interval)
  }, [])

  const loadStatus = async () => {
    try {
      const res = await fetch('/api/queues/status')
      const data = await res.json()
      if (res.ok) {
        setStatus(data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading && !status) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">Consultando fila de envios...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight mb-2 flex items-center gap-2">
          <Activity className="w-8 h-8 text-primary" />
          Status de Disparos
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          Acompanhe em tempo real as mensagens que estão na fila aguardando processamento e o histórico recente.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-amber-500/5 rounded-bl-full -z-10" />
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 rounded-xl">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <h3 className="font-medium text-muted-foreground">Na Fila (Aguardando)</h3>
          </div>
          <p className="text-3xl font-bold mt-2 text-amber-500">{status?.metrics?.waiting || 0}</p>
        </div>

        <div className="p-6 rounded-2xl bg-card border shadow-sm flex flex-col gap-2 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-sky-500/5 rounded-bl-full -z-10" />
          <div className="flex items-center gap-3">
            <div className="p-3 bg-sky-500/10 rounded-xl">
              <Send className="w-5 h-5 text-sky-500" />
            </div>
            <h3 className="font-medium text-muted-foreground">Processando Agora</h3>
          </div>
          <p className="text-3xl font-bold mt-2 text-sky-500">{status?.metrics?.active || 0}</p>
        </div>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-3 mb-6 bg-background/50 border border-border/50">
          <TabsTrigger value="pending">Aguardando na Fila</TabsTrigger>
          <TabsTrigger value="sent">Enviados (Recentes)</TabsTrigger>
          <TabsTrigger value="errors">Falhas (Recentes)</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-0">
          <div className="glass-card rounded-xl overflow-hidden p-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Destino</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Enfileirado em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!status?.pendingList?.length ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        Nenhuma mensagem aguardando na fila.
                      </TableCell>
                    </TableRow>
                  ) : (
                    status.pendingList.map((job: any) => (
                      <TableRow key={job.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="font-semibold">{phoneMask(job.phone)}</div>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-amber-500/10 text-amber-500 border-0 flex w-fit items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Na Fila / Agendado
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(job.added_at).toLocaleString('pt-BR')}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sent" className="mt-0">
          <div className="glass-card rounded-xl overflow-hidden p-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Destino</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Enviado em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!status?.sentHistory?.length ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        Nenhum disparo recente.
                      </TableCell>
                    </TableRow>
                  ) : (
                    status.sentHistory.map((log: any) => (
                      <TableRow key={log.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="font-semibold">{phoneMask(log.phone || '')}</div>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-emerald-500/10 text-emerald-500 border-0 flex w-fit items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Entregue
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(log.created_at).toLocaleString('pt-BR')}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="errors" className="mt-0">
          <div className="glass-card rounded-xl overflow-hidden p-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Destino</TableHead>
                    <TableHead>Motivo do Erro</TableHead>
                    <TableHead>Ocorrido em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!status?.errorHistory?.length ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        Nenhum erro recente.
                      </TableCell>
                    </TableRow>
                  ) : (
                    status.errorHistory.map((log: any) => (
                      <TableRow key={log.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="font-semibold text-destructive">{phoneMask(log.phone || '')}</div>
                        </TableCell>
                        <TableCell>
                           <div className="text-sm flex items-center gap-2 text-destructive">
                             <AlertTriangle className="w-4 h-4" />
                             {log.error_message || "Falha desconhecida"}
                           </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(log.created_at).toLocaleString('pt-BR')}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

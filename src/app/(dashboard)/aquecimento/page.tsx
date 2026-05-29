"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Flame, Loader2, AlertCircle, Smartphone, Power, Info } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function AquecimentoPage() {
  const [instances, setInstances] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isToggling, setIsToggling] = useState<string | null>(null)
  
  const supabase = createClient()

  useEffect(() => {
    loadInstances()
  }, [])

  const loadInstances = async () => {
    setIsLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data, error } = await supabase
        .from('evolution_instances')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      
      setInstances(data || [])
    } catch (e: any) {
      toast.error('Erro ao carregar instâncias: ' + e.message)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleWarmup = async (instanceId: string, currentStatus: boolean) => {
    setIsToggling(instanceId)
    try {
      const res = await fetch('/api/instances/warmup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_id: instanceId, is_warming_up: !currentStatus })
      })
      
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      
      setInstances(instances.map(inst => 
        inst.id === instanceId ? { ...inst, is_warming_up: !currentStatus } : inst
      ))
      
      if (!currentStatus) {
        toast.success('🔥 Aquecimento ativado para esta instância!')
      } else {
        toast.info('❄️ Aquecimento desativado.')
      }

    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setIsToggling(null)
    }
  }

  const activeWarmups = instances.filter(i => i.is_warming_up).length

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-orange-500" />
        <p className="text-muted-foreground animate-pulse">Carregando motores de aquecimento...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight mb-2 flex items-center gap-2">
          <Flame className="w-8 h-8 text-orange-500" />
          Motor de Aquecimento
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          Simule conversas reais geradas por Inteligência Artificial para aumentar o Score dos seus chips novos e evitar banimentos pelo WhatsApp.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="glass-card rounded-xl p-6 border-orange-500/20 bg-orange-500/5 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-orange-500/10 rounded-bl-full -z-10" />
          <h3 className="font-semibold text-lg flex items-center gap-2 mb-2">
            <Info className="w-5 h-5 text-orange-500" />
            Como funciona?
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Você precisa ativar o aquecimento em **no mínimo 2 instâncias** que estejam conectadas. O nosso robô fará elas conversarem entre si aleatoriamente enviando gírias, dúvidas e textos humanizados.
          </p>
          <div className="text-xs font-semibold text-orange-500 bg-orange-500/10 inline-flex px-3 py-1 rounded-full">
            Custo coberto pela plataforma
          </div>
        </div>

        <div className="glass-card rounded-xl p-6 flex flex-col justify-center items-center text-center">
          <Flame className={`w-12 h-12 mb-3 ${activeWarmups >= 2 ? 'text-orange-500 animate-pulse' : 'text-muted/50'}`} />
          <h3 className="font-semibold text-xl">
            {activeWarmups} {activeWarmups === 1 ? 'Instância Aquecendo' : 'Instâncias Aquecendo'}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {activeWarmups < 2 
              ? "Ative pelo menos 2 números para iniciar o motor." 
              : "O motor está rodando perfeitamente em background."}
          </p>
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden p-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Instância</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Status Conexão</TableHead>
                <TableHead>Aquecimento</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instances.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Você ainda não possui números de WhatsApp cadastrados.
                  </TableCell>
                </TableRow>
              ) : (
                instances.map((inst) => {
                  const isConnected = inst.status === 'connected';
                  
                  return (
                    <TableRow key={inst.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div className="font-semibold flex items-center gap-2">
                          <Smartphone className="w-4 h-4 text-muted-foreground" />
                          {inst.instance_name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{inst.phone_number || '-'}</div>
                      </TableCell>
                      <TableCell>
                        {isConnected ? (
                           <Badge className="bg-emerald-500/10 text-emerald-500 border-0">Conectado</Badge>
                        ) : (
                           <Badge className="bg-red-500/10 text-red-500 border-0">Desconectado</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {inst.is_warming_up ? (
                           <Badge className="bg-orange-500/10 text-orange-500 border-0 flex w-fit items-center gap-1">
                             <Flame className="w-3 h-3" />
                             Ligado
                           </Badge>
                        ) : (
                           <Badge variant="outline" className="text-muted-foreground border-border/50">
                             Desligado
                           </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant={inst.is_warming_up ? "destructive" : "default"}
                          size="sm"
                          disabled={!isConnected || isToggling === inst.id}
                          onClick={() => toggleWarmup(inst.id, inst.is_warming_up)}
                          className={!inst.is_warming_up && isConnected ? "bg-orange-500 hover:bg-orange-600 text-white" : ""}
                        >
                          {isToggling === inst.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : inst.is_warming_up ? (
                            <>
                              <Power className="w-4 h-4 mr-2" />
                              Parar
                            </>
                          ) : (
                            <>
                              <Flame className="w-4 h-4 mr-2" />
                              Aquecer
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}

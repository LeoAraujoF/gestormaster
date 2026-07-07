"use client"

import { useEffect, useState } from "react"
import { Server, Activity, Database, Zap, Clock, ShieldAlert, Cpu, HardDrive, RefreshCw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export default function SystemPage() {
  const [healthData, setHealthData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // Throttling state mocks
  const [maxRps, setMaxRps] = useState([50])
  const [maxConnections, setMaxConnections] = useState([1000])

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/admin/health')
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setHealthData(data.services)
          setLastUpdate(new Date())
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 10000) // 10s auto-refresh
    return () => clearInterval(interval)
  }, [])

  const handleSaveThrottling = () => {
    toast.success("Limites de segurança atualizados com sucesso (Simulação).")
  }

  const getStatusColor = (status: string) => status === 'online' ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500 bg-red-500/10'

  return (
    <div className="flex flex-col space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Saúde do Sistema & Performance</h2>
          <p className="text-muted-foreground mt-1">Monitoramento de infraestrutura e limites de segurança (Throttling).</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Última atualização: {lastUpdate ? lastUpdate.toLocaleTimeString() : "--:--:--"}</span>
          <Button variant="outline" size="icon" onClick={fetchHealth} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Supabase / DB */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Supabase (PostgreSQL)</CardTitle>
            <Database className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading && !healthData ? (
              <div className="h-10 flex items-center"><RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <div className="text-2xl font-bold flex items-center gap-2">
                  <span className={healthData?.database.status === 'online' ? 'text-emerald-500' : 'text-red-500'}>
                    {healthData?.database.status === 'online' ? 'Online' : 'Offline'}
                  </span>
                  <div className={`w-2 h-2 rounded-full ${healthData?.database.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Latência: {healthData?.database.latency}ms
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Redis */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Redis (BullMQ)</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading && !healthData ? (
              <div className="h-10 flex items-center"><RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <div className="text-2xl font-bold flex items-center gap-2">
                  <span className={healthData?.redis.status === 'online' ? 'text-emerald-500' : 'text-red-500'}>
                    {healthData?.redis.status === 'online' ? 'Online' : 'Offline'}
                  </span>
                  <div className={`w-2 h-2 rounded-full ${healthData?.redis.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Latência: {healthData?.redis.latency}ms
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Evolution API */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Evolution</CardTitle>
            <Zap className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading && !healthData ? (
              <div className="h-10 flex items-center"><RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <div className="text-2xl font-bold flex items-center gap-2">
                  <span className={healthData?.evolution.status === 'online' ? 'text-emerald-500' : 'text-red-500'}>
                    {healthData?.evolution.status === 'online' ? 'Online' : 'Offline'}
                  </span>
                  <div className={`w-2 h-2 rounded-full ${healthData?.evolution.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Latência: {healthData?.evolution.latency}ms
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Node Server */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Node.js Server</CardTitle>
            <Server className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading && !healthData ? (
              <div className="h-10 flex items-center"><RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <div className="text-2xl font-bold flex items-center gap-2">
                  {healthData?.server.memoryMb} MB
                </div>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Uptime: {healthData?.server.uptime}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tenant Throttling Section */}
      <Card className="border-danger-border shadow-sm">
        <CardHeader className="bg-danger-bg border-b border-danger-border">
          <CardTitle className="flex items-center gap-2 text-danger">
            <ShieldAlert className="w-5 h-5" />
            Isolamento de Tenants e Throttling (WAF)
          </CardTitle>
          <CardDescription>
            Defina limites globais de requisições para proteger a infraestrutura contra ataques (DDoS) ou clientes abusivos (Noisy Neighbors).
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-8">
          
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-amber-500" />
                  Taxa de Requisições por Segundo (RPS)
                </Label>
                <p className="text-sm text-muted-foreground">O limite global que qualquer tenant pode atingir na API principal antes de receber HTTP 429.</p>
              </div>
              <Badge variant="outline" className="text-lg px-3 py-1 bg-amber-500/10 text-amber-500 border-amber-500/20">
                {maxRps[0]} Req/s
              </Badge>
            </div>
            <Slider
              value={maxRps}
              onValueChange={(v) => setMaxRps(v as number[])}
              max={500}
              min={10} 
              step={10} 
              className="py-4 cursor-pointer"
            />
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-interactive" />
                  Disparos Simultâneos de Webhooks (Global)
                </Label>
                <p className="text-sm text-muted-foreground">O número máximo de workers de webhook que podem rodar paralelos sem enfileirar.</p>
              </div>
              <Badge variant="outline" className="text-lg px-3 py-1 bg-secondary text-interactive border-border">
                {maxConnections[0]} Workers
              </Badge>
            </div>
            <Slider
              value={maxConnections}
              onValueChange={(v) => setMaxConnections(v as number[])}
              max={5000}
              min={100} 
              step={100} 
              className="py-4 cursor-pointer"
            />
          </div>

          <div className="pt-4 flex justify-end">
            <Button onClick={handleSaveThrottling} className="bg-destructive hover:bg-destructive/90">
              <ShieldAlert className="w-4 h-4 mr-2" />
              Aplicar Políticas de Segurança
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  )
}

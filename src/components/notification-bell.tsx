"use client"

import { useState, useEffect } from "react"
import { BellRing, ShieldAlert, Zap, Megaphone } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"

export function NotificationBell() {
  const [alerts, setAlerts] = useState<any[]>([])
  const [updates, setUpdates] = useState<any[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [])

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // 1. Fetch System Updates from last 14 days
    const daysAgo = new Date()
    daysAgo.setDate(daysAgo.getDate() - 14)
    
    const { data: updatesData } = await supabase
      .from('system_updates')
      .select('*')
      .gte('created_at', daysAgo.toISOString())
      .eq('is_published', true)
      .order('created_at', { ascending: false })

    if (updatesData) setUpdates(updatesData)

    // 2. Fetch Alerts (Disconnected WPP and Expiring Clients)
    const newAlerts = []

    // WhatsApp
    const { data: wppDataArray } = await supabase
      .from('evolution_instances')
      .select('status')
      .eq('user_id', user.id)
      .limit(1)

    const wppData = wppDataArray?.[0]

    if (wppData && wppData.status !== 'connected') {
      newAlerts.push({
        id: `wpp-${wppData.status}`,
        title: 'WhatsApp Desconectado',
        desc: 'Acesse Automação para reconectar.',
        icon: ShieldAlert,
        color: 'text-red-500',
        bg: 'bg-red-500/10'
      })
    }

    // Clients Expiring in 3 days
    const today = new Date()
    const threeDaysFromNow = new Date()
    threeDaysFromNow.setDate(today.getDate() + 3)
    
    const { data: clientsData } = await supabase
      .from('clients')
      .select('id, name, due_date')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gte('due_date', today.toISOString().split('T')[0])
      .lte('due_date', threeDaysFromNow.toISOString().split('T')[0])

    if (clientsData && clientsData.length > 0) {
      newAlerts.push({
        id: `clients-${clientsData.length}`,
        title: `${clientsData.length} Cliente(s) Vencendo`,
        desc: 'Existem cobranças próximas.',
        icon: Zap,
        color: 'text-amber-500',
        bg: 'bg-amber-500/10'
      })
    }

    // 3. Fetch Pending Reseller Requests
    // First get reseller IDs
    const { data: resellersData } = await supabase
      .from('resellers')
      .select('id')
      .eq('user_id', user.id)

    if (resellersData && resellersData.length > 0) {
      const resellerIds = resellersData.map(r => r.id)
      const { data: pendingRequests } = await supabase
        .from('credit_requests')
        .select('id')
        .in('reseller_id', resellerIds)
        .in('status', ['pending_payment', 'paid'])

      if (pendingRequests && pendingRequests.length > 0) {
        newAlerts.push({
          id: `revendas-${pendingRequests.length}`,
          title: `${pendingRequests.length} Recarga(s) Pendente(s)`,
          desc: 'Revendedores solicitaram créditos.',
          icon: Megaphone,
          color: 'text-emerald-500',
          bg: 'bg-emerald-500/10'
        })
      }
    }

    // Filter dismissed notifications
    const dismissed = JSON.parse(localStorage.getItem('dismissed_notifications') || '[]')
    
    const filteredAlerts = newAlerts.filter(a => !dismissed.includes(a.id))
    const filteredUpdates = (updatesData || []).filter(u => !dismissed.includes(`update-${u.id}`))

    setAlerts(filteredAlerts)
    setUpdates(filteredUpdates)
  }

  const handleNavigation = (path: string) => {
    setIsOpen(false) // Força o fechamento e libera o scroll da tela
    setTimeout(() => {
      router.push(path)
    }, 100)
  }

  const handleClearAll = () => {
    const dismissed = JSON.parse(localStorage.getItem('dismissed_notifications') || '[]')
    const newDismissed = [
      ...dismissed,
      ...alerts.map(a => a.id),
      ...updates.map(u => `update-${u.id}`)
    ]
    localStorage.setItem('dismissed_notifications', JSON.stringify(newDismissed))
    setAlerts([])
    setUpdates([])
  }

  const totalNotifications = alerts.length + updates.length

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger className="relative inline-flex items-center justify-center h-10 w-10 hover:bg-muted/50 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <BellRing className="h-5 w-5 text-muted-foreground" />
        {totalNotifications > 0 && (
          <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 rounded-full bg-red-500 border-2 border-background text-[10px] text-white">
            {totalNotifications}
          </Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="end">
        <div className="flex justify-between items-center py-2 px-3 text-sm font-semibold text-foreground">
          <div className="flex items-center gap-2">
            <span>Notificações</span>
            {totalNotifications > 0 && (
              <Badge variant="outline" className="text-[10px] font-normal">{totalNotifications} novas</Badge>
            )}
          </div>
          {totalNotifications > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClearAll} className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground">
              Limpar todas
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        
        {totalNotifications === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <BellRing className="w-8 h-8 text-muted-foreground/30 mb-1" />
            Tudo tranquilo por aqui.
          </div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto">
            {alerts.length > 0 && (
              <DropdownMenuGroup>
                <div className="px-2 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Alertas da Conta</div>
                {alerts.map(alert => {
                  let path = '/atualizacoes'
                  if (alert.id === 'wpp') path = '/automacao'
                  else if (alert.id === 'revendas') path = '/revendas'
                  else if (alert.id === 'clients') path = '/clientes'

                  return (
                    <DropdownMenuItem key={alert.id} className="cursor-pointer flex items-start gap-3 p-3 rounded-md mb-1" onClick={() => handleNavigation(path)}>
                      <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${alert.bg} ${alert.color}`}>
                        <alert.icon className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium leading-none">{alert.title}</span>
                        <span className="text-xs text-muted-foreground line-clamp-2 mt-1">{alert.desc}</span>
                      </div>
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuGroup>
            )}

            {updates.length > 0 && (
              <DropdownMenuGroup>
                {alerts.length > 0 && <DropdownMenuSeparator />}
                <div className="px-2 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Atualizações do Sistema</div>
                {updates.map(update => (
                  <DropdownMenuItem key={update.id} className="cursor-pointer flex items-start gap-3 p-3 rounded-md mb-1" onClick={() => handleNavigation('/atualizacoes')}>
                    <div className="mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-sky-500/10 text-sky-500">
                      <Megaphone className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium leading-none">{update.title}</span>
                      <span className="text-xs text-muted-foreground line-clamp-2 mt-1">Lançado recentemente</span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            )}
          </div>
        )}
        
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer w-full text-center p-3 text-sky-500 justify-center font-medium bg-muted/30 hover:bg-muted/50 rounded-none" onClick={() => handleNavigation('/atualizacoes')}>
          Ver Central de Avisos
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

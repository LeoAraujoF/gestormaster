'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, type ComponentProps } from 'react'
import {
  Activity,
  ArrowLeft,
  HeartPulse,
  LayoutDashboard,
  LifeBuoy,
  Loader2,
  Lock,
  LogOut,
  ScrollText,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { createClient } from '@/lib/supabase/client'

const navigationGroups = [
  {
    label: 'Cockpit e operação',
    items: [
      { title: 'Cockpit executivo', url: '/admin', icon: LayoutDashboard },
      { title: 'Usuários e SaaS', url: '/admin/users', icon: Users },
      { title: 'Instâncias Evolution', url: '/admin/instances', icon: Server },
      { title: 'Chamados', url: '/admin/tickets', icon: LifeBuoy },
      { title: 'Filas BullMQ', url: '/admin/queues', icon: Activity },
      { title: 'Saúde do sistema', url: '/admin/system', icon: HeartPulse },
    ],
  },
  {
    label: 'Governança',
    items: [
      { title: 'Controle de recursos', url: '/admin/features', icon: SlidersHorizontal },
      { title: 'Logs de auditoria', url: '/admin/audit', icon: ScrollText },
      { title: 'Segurança e secrets', url: '/admin/security', icon: Lock },
    ],
  },
]

export function AdminSidebar(props: ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const router = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)

  const handleLogout = async () => {
    if (isSigningOut) return
    setIsSigningOut(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      router.replace('/login')
      router.refresh()
    } catch {
      toast.error('Não foi possível encerrar a sessão.')
      setIsSigningOut(false)
    }
  }

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader className="border-b border-sidebar-border p-3">
        <Link href="/admin" className="flex h-10 items-center gap-3 rounded-lg px-1.5 focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-danger-border bg-danger-bg text-danger-fg">
            <ShieldCheck aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-sm font-semibold tracking-tight text-sidebar-foreground">lembrado.</span>
            <span className="block truncate text-[10px] uppercase tracking-[0.08em] text-danger">Admin control</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="py-2">
        {navigationGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const isActive = pathname === item.url || (item.url !== '/admin' && pathname.startsWith(`${item.url}/`))
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      render={<Link href={item.url} aria-current={isActive ? 'page' : undefined} />}
                      isActive={isActive}
                      tooltip={item.title}
                      className="h-9 gap-2.5 data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground"
                    >
                      <item.icon aria-hidden="true" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href="/painel" />} tooltip="Voltar ao SaaS">
              <ArrowLeft aria-hidden="true" />
              <span>Voltar ao SaaS</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => void handleLogout()}
              disabled={isSigningOut}
              tooltip="Sair da conta"
              className="text-danger hover:bg-danger-bg hover:text-danger-fg"
            >
              {isSigningOut ? <Loader2 aria-hidden="true" className="animate-spin" /> : <LogOut aria-hidden="true" />}
              <span>{isSigningOut ? 'Saindo…' : 'Sair da conta'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

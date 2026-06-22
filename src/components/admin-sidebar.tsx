"use client"

import * as React from "react"
import {
  LayoutDashboard,
  Users,
  Server,
  Activity,
  ShieldCheck,
  LifeBuoy,
  LogOut,
  ArrowLeft,
  Settings,
  Lock
} from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarGroup,
} from "@/components/ui/sidebar"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

const adminNav = [
  {
    title: "Visão Geral",
    url: "/admin",
    icon: LayoutDashboard,
    color: "text-rose-500",
  },
  {
    title: "Usuários (SaaS)",
    url: "/admin/users",
    icon: Users,
    color: "text-sky-500",
  },
  {
    title: "Instâncias (Evo)",
    url: "/admin/instances",
    icon: Server,
    color: "text-indigo-500",
  },
  {
    title: "Chamados",
    url: "/admin/tickets",
    icon: LifeBuoy,
    color: "text-amber-500",
  },
  {
    title: "Filas (BullMQ)",
    url: "/admin/queues",
    icon: Activity,
    color: "text-emerald-500",
  },
  {
    title: "Saúde do Sistema",
    url: "/admin/system",
    icon: Settings,
    color: "text-slate-500",
  },
  {
    title: "Controle de Recursos",
    url: "/admin/features",
    icon: Settings,
    color: "text-purple-500",
  },
  {
    title: "Logs de Auditoria",
    url: "/admin/audit",
    icon: ShieldCheck,
    color: "text-teal-500",
  },
  {
    title: "Segurança / Secrets",
    url: "/admin/security",
    icon: Lock,
    color: "text-red-500",
  },
]

export function AdminSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      router.push("/login")
      router.refresh()
    } catch (error) {
      toast.error("Erro ao sair.")
    }
  }

  return (
    <Sidebar variant="inset" className="border-r border-border/50 bg-background/50" {...props}>
      <SidebarHeader className="h-16 flex items-center px-4 pt-4 pb-2 border-b border-border/30">
        <div className="flex items-center gap-2 font-bold text-xl w-full">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/15 text-rose-500">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <span className="tracking-tight text-rose-500">Master Admin</span>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {adminNav.map((item) => {
              const isActive = pathname === item.url || (item.url !== "/admin" && pathname?.startsWith(item.url))
              
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    render={<Link href={item.url} />} 
                    isActive={isActive} 
                    tooltip={item.title}
                    className={isActive ? `bg-rose-500/10 text-rose-500 border-r-2 border-rose-500` : `hover:bg-secondary/50`}
                  >
                    <item.icon className={isActive ? item.color : "text-muted-foreground"} />
                    <span className={isActive ? "font-semibold" : ""}>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      
      <SidebarSeparator />
      
      <SidebarFooter className="p-4 border-t border-border/30">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href="/painel" />} className="text-muted-foreground hover:bg-secondary w-full justify-center rounded-lg mb-2">
              <ArrowLeft className="w-4 h-4 mr-2" />
              <span>Voltar ao SaaS</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} className="text-red-500 hover:bg-red-500/10 hover:text-red-500 w-full justify-center rounded-lg">
              <LogOut className="w-4 h-4 mr-2" />
              <span>Sair da Conta</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

"use client"

import * as React from "react"
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Tags,
  Bot,
  Search,
  LogOut,
  Zap,
  Wallet,
  Settings,
  UserCircle,
  BellRing,
  LifeBuoy,
  ShieldAlert,
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

const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/",
      icon: LayoutDashboard,
      color: "text-sky-500",
    },
    {
      title: "Financeiro",
      url: "/financeiro",
      icon: Wallet,
      color: "text-emerald-500",
    },
    {
      title: "Serviços",
      url: "/servicos",
      icon: Briefcase,
      color: "text-violet-500",
    },
    {
      title: "Clientes",
      url: "/clientes",
      icon: Users,
      color: "text-pink-500",
    },
    {
      title: "Promoções",
      url: "/promocoes",
      icon: Tags,
      color: "text-amber-500",
    },
    {
      title: "Automação",
      url: "/automacao",
      icon: Bot,
      color: "text-indigo-500",
    },
    {
      title: "Leads / CSV",
      url: "/leads",
      icon: Search,
      color: "text-rose-500",
    },
    /* {
      title: "Revendas (Créditos)",
      url: "/revendas",
      icon: Users,
      color: "text-blue-500",
    }, */
    {
      title: "Minha Conta",
      url: "/minha-conta",
      icon: UserCircle,
      color: "text-teal-500",
    },
    {
      title: "Avisos & Updates",
      url: "/atualizacoes",
      icon: BellRing,
      color: "text-orange-500",
    },
    {
      title: "Configurações",
      url: "/configuracoes",
      icon: Settings,
      color: "text-slate-500",
    },
    {
      title: "Suporte",
      url: "/suporte",
      icon: LifeBuoy,
      color: "text-cyan-500",
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  
  const [userName, setUserName] = React.useState<string>("Carregando...")
  const [userEmail, setUserEmail] = React.useState<string>("")
  const [userPlan, setUserPlan] = React.useState<string>("Free")
  const [isAdmin, setIsAdmin] = React.useState<boolean>(false)

  React.useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || "Usuário")
        setUserEmail(user.email || "")
        setUserPlan(user.user_metadata?.plan_name || "Free")
        
        try {
          const res = await fetch('/api/admin/check')
          if (res.ok) {
            const data = await res.json()
            setIsAdmin(data.isAdmin)
          }
        } catch (e) {
          console.error(e)
        }
      }
    }
    loadUser()
  }, [])

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      toast.success("Logout realizado com sucesso!")
      router.push("/login")
      router.refresh()
    } catch (error) {
      toast.error("Erro ao sair da conta.")
    }
  }

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader className="h-16 flex items-center px-4 pt-4 pb-2 border-b border-border/30">
        <div className="flex items-center gap-2 font-bold text-xl w-full">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/15 text-sky-500">
            <span className="text-sm font-black tracking-tighter">GM</span>
          </div>
          <span className="tracking-tight">Gestor Master</span>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {data.navMain.map((item) => {
              const isActive = pathname === item.url || (item.url !== "/" && pathname?.startsWith(item.url))
              
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    render={<Link href={item.url} />} 
                    isActive={isActive} 
                    tooltip={item.title}
                    className={isActive ? `bg-primary/10 text-primary border-r-2 border-primary` : `hover:bg-secondary/50`}
                  >
                    <item.icon className={isActive ? item.color : "text-muted-foreground"} />
                    <span className={isActive ? "font-semibold" : ""}>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}

            {isAdmin && (
              <>
                <SidebarSeparator className="my-2" />
                <SidebarMenuItem>
                  <SidebarMenuButton 
                    render={<Link href="/master" />} 
                    isActive={pathname?.startsWith('/master')} 
                    tooltip="Master Admin"
                    className={pathname?.startsWith('/master') ? `bg-rose-500/10 text-rose-500 border-r-2 border-rose-500` : `hover:bg-rose-500/5 text-rose-500/80`}
                  >
                    <ShieldAlert className={pathname?.startsWith('/master') ? "text-rose-500" : "text-rose-500/80"} />
                    <span className="font-bold text-rose-500">Master Admin</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      
      <SidebarSeparator />
      
      <SidebarFooter className="p-4 border-t border-border/30">
        <div className="flex items-center justify-between bg-secondary/30 p-3 rounded-xl border border-border/40 mb-3">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center text-white font-bold shadow-md">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col truncate">
              <span className="text-sm font-semibold truncate">{userName}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground truncate max-w-[100px]">{userEmail}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${userPlan === 'Plus' ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white' : userPlan === 'Pro' ? 'bg-sky-500 text-white' : 'bg-secondary text-muted-foreground'}`}>{userPlan}</span>
              </div>
            </div>
          </div>
        </div>
        
        <SidebarMenu>
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

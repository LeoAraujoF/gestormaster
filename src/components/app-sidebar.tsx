"use client"

import * as React from "react"
import { LogOut, ShieldAlert } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { useFeatureFlags } from "@/components/providers/feature-flags-provider"
import { BrandMark } from "@/components/brand-mark"

/**
 * Navegação reorganizada (design_handoff §6): 4 grupos em vez de ~16 itens soltos.
 * Itens text-only; item ativo usa os tokens --sidebar-accent (sem barra colorida).
 * Afiliados, Atualizações e Desenvolvedor saíram do menu (viram abas/cards — fases 5).
 */
type NavItem = { title: string; url: string; shortcut?: string }

const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [{ title: "Painel", url: "/painel", shortcut: "1" }],
  },
  {
    label: "Operação",
    items: [
      { title: "Clientes", url: "/clientes", shortcut: "2" },
      { title: "Financeiro", url: "/financeiro", shortcut: "3" },
      { title: "Serviços", url: "/servicos", shortcut: "4" },
      { title: "Promoções", url: "/promocoes" },
      { title: "Revendas", url: "/revendas" },
    ],
  },
  {
    label: "Comunicação",
    items: [
      { title: "Automação", url: "/automacao" },
      { title: "Aquecimento", url: "/aquecimento" },
      { title: "Leads", url: "/leads" },
    ],
  },
  {
    label: "Conexões",
    items: [
      { title: "Painéis IPTV", url: "/conexoes/paineis" },
      { title: "Gateways & API", url: "/conexoes/gateways" },
    ],
  },
]

const FOOTER_ITEMS: NavItem[] = [
  { title: "Configurações", url: "/configuracoes" },
  { title: "Suporte", url: "/suporte" },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { flags } = useFeatureFlags()

  const [userName, setUserName] = React.useState<string>("")
  const [userPlan, setUserPlan] = React.useState<string>("Free")
  const [isAdmin, setIsAdmin] = React.useState<boolean>(false)

  React.useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserName(user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário")
        setUserPlan(user.user_metadata?.plan_name || "Free")
        try {
          const res = await fetch("/api/admin/check")
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
  }, [supabase])

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

  const isItemActive = (url: string) => {
    if (pathname === url) return true
    return pathname?.startsWith(url + "/") ?? false
  }

  const flagVisible = (url: string) => {
    const flagKey = `page_${url.substring(1).replace(/\//g, "_")}`
    return flags[flagKey] !== false
  }

  const renderItem = (item: NavItem) => {
    const active = isItemActive(item.url)
    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton
          render={<Link href={item.url} />}
          isActive={active}
          tooltip={item.title}
          className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-semibold"
        >
          <span className="flex-1 text-[13px]">{item.title}</span>
          {item.shortcut && (
            <kbd className="num pointer-events-none text-[10px] text-muted-foreground/70">
              {item.shortcut}
            </kbd>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader className="px-4 pt-4 pb-2">
        <Link href="/painel" className="flex items-center gap-2">
          <BrandMark size={22} />
          <span className="text-[12.5px] font-semibold tracking-tight text-foreground">Gestor</span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group, gi) => {
          const visible = group.items.filter((i) => flagVisible(i.url))
          if (visible.length === 0) return null
          return (
            <SidebarGroup key={gi} className="py-1">
              {group.label && (
                <SidebarGroupLabel className="microlabel px-2 text-[9.5px]">
                  {group.label}
                </SidebarGroupLabel>
              )}
              <SidebarMenu>{visible.map(renderItem)}</SidebarMenu>
            </SidebarGroup>
          )
        })}
      </SidebarContent>

      <SidebarFooter className="px-2 pb-3">
        <SidebarSeparator className="mb-2" />
        <SidebarMenu>
          {FOOTER_ITEMS.filter((i) => flagVisible(i.url)).map(renderItem)}
          {isAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link href="/admin" />}
                isActive={pathname?.startsWith("/admin")}
                tooltip="Master Admin"
              >
                <ShieldAlert className="size-3.5 text-danger" />
                <span className="flex-1 text-[13px] text-danger">Master Admin</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>

        <Link
          href="/minha-conta"
          className="mt-2 flex items-center gap-2.5 rounded-lg border border-sidebar-border bg-card px-2.5 py-2 transition-colors hover:bg-muted"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
            {userName ? userName.charAt(0).toUpperCase() : "…"}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xs font-semibold">{userName || "Carregando…"}</span>
            <span className="microlabel text-[9px]">{userPlan}</span>
          </div>
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleLogout()
            }}
            title="Sair da conta"
            className="rounded p-1 text-muted-foreground transition-colors hover:text-danger"
          >
            <LogOut className="size-3.5" />
          </button>
        </Link>
      </SidebarFooter>
    </Sidebar>
  )
}

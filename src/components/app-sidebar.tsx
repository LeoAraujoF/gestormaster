"use client"

import * as React from "react"
import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  Cable,
  ChevronRight,
  ContactRound,
  Ellipsis,
  LayoutDashboard,
  LifeBuoy,
  LockKeyhole,
  LogOut,
  Package,
  Settings,
  ShieldAlert,
  Users,
  WalletCards,
  Workflow,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { BrandMark } from "@/components/brand-mark"
import { useFeatureFlags } from "@/components/providers/feature-flags-provider"
import { usePlan } from "@/components/providers/plan-provider"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import { createClient } from "@/lib/supabase/client"
import type { PlanCapability } from "@/lib/plan-types"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type NavChild = {
  title: string
  url: string
  capability?: PlanCapability
  alwaysVisible?: boolean
}

type NavItem = {
  id: string
  title: string
  icon: LucideIcon
  url?: string
  shortcut?: string
  badge?: string
  capability?: PlanCapability
  alwaysVisible?: boolean
  children?: NavChild[]
}

type NavGroup = {
  label: string | null
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { id: "dashboard", title: "Painel", url: "/painel", icon: LayoutDashboard, shortcut: "1" },
    ],
  },
  {
    label: "Operação",
    items: [
      { id: "clients", title: "Clientes", url: "/clientes", icon: Users, shortcut: "2" },
      { id: "finance", title: "Financeiro", url: "/financeiro", icon: WalletCards, shortcut: "3" },
      {
        id: "catalog",
        title: "Catálogo",
        url: "/servicos",
        icon: Package,
        shortcut: "4",
        children: [
          { title: "Serviços", url: "/servicos" },
          { title: "Promoções", url: "/promocoes" },
        ],
      },
    ],
  },
  {
    label: "Comunicação",
    items: [
      {
        id: "automation",
        title: "Automação",
        url: "/automacao",
        icon: Workflow,
        capability: "automation_basic",
        children: [
          { title: "Central de automação", url: "/automacao", capability: "automation_basic" },
          { title: "Cobrança inteligente", url: "/cobranca-inteligente", capability: "intelligent_collections" },
          { title: "Aquecimento", url: "/aquecimento", capability: "warmup" },
        ],
      },
      { id: "leads", title: "Leads", url: "/leads", icon: ContactRound, badge: "Beta", capability: "leads" },
    ],
  },
  {
    label: "Gestão",
    items: [
      {
        id: "insights",
        title: "Insights",
        url: "/analytics",
        icon: BarChart3,
        capability: "analytics",
        children: [
          { title: "Analytics", url: "/analytics", capability: "analytics" },
          { title: "Intelligence", url: "/inteligencia", capability: "intelligence" },
        ],
      },
      {
        id: "integrations",
        title: "Integrações",
        url: "/conexoes/gateways",
        icon: Cable,
        capability: "integrations",
        children: [
          { title: "Gateways e API", url: "/conexoes/gateways", capability: "integrations" },
          { title: "Painéis IPTV", url: "/conexoes/paineis", capability: "iptv_panels" },
        ],
      },
      {
        id: "more",
        title: "Mais",
        icon: Ellipsis,
        children: [
          { title: "Portal do cliente", url: "/portal-cliente", capability: "client_portal", alwaysVisible: true },
          { title: "Autoatendimento", url: "/autoatendimento", capability: "self_service" },
          { title: "Revendas", url: "/revendas", capability: "resellers" },
          { title: "Afiliados", url: "/afiliados" },
        ],
      },
    ],
  },
]

const FOOTER_ITEMS: NavItem[] = [
  { id: "settings", title: "Configurações", url: "/configuracoes", icon: Settings },
  { id: "support", title: "Suporte", url: "/suporte", icon: LifeBuoy },
]

const ROUTE_FLAG_KEYS: Record<string, string> = {
  "/conexoes/gateways": "page_integracoes",
  "/conexoes/paineis": "page_integracoes_paineis",
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { flags } = useFeatureFlags()
  const planContext = usePlan()
  const { isMobile, setOpenMobile } = useSidebar()

  const [userName, setUserName] = React.useState("")
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})

  React.useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setUserName(user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário")
      try {
        const res = await fetch("/api/admin/check")
        if (res.ok) {
          const data = await res.json()
          setIsAdmin(data.isAdmin)
        }
      } catch (error) {
        console.error(error)
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
    } catch {
      toast.error("Erro ao sair da conta.")
    }
  }

  const closeMobileNavigation = () => {
    if (isMobile) setOpenMobile(false)
  }

  const isItemActive = (url: string) => {
    if (pathname === url) return true
    return pathname?.startsWith(`${url}/`) ?? false
  }

  const flagVisible = (url: string) => {
    const flagKey = ROUTE_FLAG_KEYS[url] ?? `page_${url.substring(1).replace(/\//g, "_")}`
    return flags[flagKey] !== false
  }

  const childVisible = (child: NavChild) => child.alwaysVisible || flagVisible(child.url)

  const visibleChildren = (item: NavItem) => item.children?.filter(childVisible) ?? []

  const itemVisible = (item: NavItem) => {
    const ownRouteVisible = item.alwaysVisible || !item.url || flagVisible(item.url)
    return ownRouteVisible || visibleChildren(item).length > 0
  }

  const branchActive = (item: NavItem) => {
    if (item.url && isItemActive(item.url)) return true
    return visibleChildren(item).some((child) => isItemActive(child.url))
  }

  const lockedHref = (url: string, capability?: PlanCapability) => {
    const locked = Boolean(capability && !planContext.capabilities.includes(capability))
    return locked ? `/planos?upgrade=${capability}` : url
  }

  const toggleExpanded = (item: NavItem) => {
    const currentlyOpen = expanded[item.id] ?? branchActive(item)
    setExpanded((current) => ({ ...current, [item.id]: !currentlyOpen }))
  }

  const renderSubmenu = (item: NavItem, children: NavChild[], open: boolean) => {
    if (!open || children.length === 0) return null

    return (
      <SidebarMenuSub aria-label={`Opções de ${item.title}`} className="mb-1 mt-0.5">
        {children.map((child) => {
          const active = isItemActive(child.url)
          const locked = Boolean(child.capability && !planContext.capabilities.includes(child.capability))
          return (
            <SidebarMenuSubItem key={child.url}>
              <SidebarMenuSubButton
                render={
                  <Link
                    href={lockedHref(child.url, child.capability)}
                    onClick={closeMobileNavigation}
                    aria-current={active ? "page" : undefined}
                  />
                }
                isActive={active}
                className="h-8"
              >
                <span className="min-w-0 flex-1 truncate">{child.title}</span>
                {locked ? <LockKeyhole className="size-3 text-muted-foreground/70" aria-label="Disponível em outro plano" /> : null}
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          )
        })}
      </SidebarMenuSub>
    )
  }

  const renderItem = (item: NavItem) => {
    const children = visibleChildren(item)
    const active = branchActive(item)
    const open = expanded[item.id] ?? active
    const locked = Boolean(item.capability && !planContext.capabilities.includes(item.capability))
    const Icon = item.icon

    return (
      <SidebarMenuItem key={item.id}>
        <SidebarMenuButton
          render={
            item.url ? (
              <Link
                href={lockedHref(item.url, item.capability)}
                onClick={closeMobileNavigation}
                aria-current={isItemActive(item.url) ? "page" : undefined}
              />
            ) : undefined
          }
          type={item.url ? undefined : "button"}
          onClick={item.url ? undefined : () => toggleExpanded(item)}
          aria-expanded={children.length > 0 ? open : undefined}
          isActive={active}
          tooltip={item.title}
          className="data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground"
        >
          <Icon className="size-4 text-sidebar-foreground/75 group-data-[active=true]/menu-button:text-sidebar-accent-foreground" />
          <span className="min-w-0 flex-1 truncate text-[13px]">{item.title}</span>
          {item.badge ? (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-secondary-foreground">
              {item.badge}
            </span>
          ) : null}
          {locked && children.length === 0 ? <LockKeyhole className="size-3 text-muted-foreground/70" aria-label="Disponível em outro plano" /> : null}
          {item.shortcut && children.length === 0 ? (
            <kbd className="num pointer-events-none text-[10px] text-muted-foreground/70">{item.shortcut}</kbd>
          ) : null}
          {!item.url && children.length > 0 ? (
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} aria-hidden />
          ) : null}
        </SidebarMenuButton>

        {item.url && children.length > 0 ? (
          <SidebarMenuAction
            type="button"
            onClick={() => toggleExpanded(item)}
            aria-label={`${open ? "Recolher" : "Expandir"} opções de ${item.title}`}
            aria-expanded={open}
          >
            <ChevronRight className={cn("transition-transform", open && "rotate-90")} />
          </SidebarMenuAction>
        ) : null}

        {renderSubmenu(item, children, open)}
      </SidebarMenuItem>
    )
  }

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader className="px-4 pb-2 pt-4">
        <Link href="/painel" onClick={closeMobileNavigation} className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
          <BrandMark size={22} />
          <span className="text-[12.5px] font-semibold tracking-tight text-foreground">lembrado.</span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group, groupIndex) => {
          const visible = group.items.filter(itemVisible)
          if (visible.length === 0) return null

          return (
            <SidebarGroup key={group.label ?? groupIndex} className="py-1">
              {group.label ? (
                <SidebarGroupLabel className="microlabel px-2 text-[9.5px]">{group.label}</SidebarGroupLabel>
              ) : null}
              <SidebarMenu>{visible.map(renderItem)}</SidebarMenu>
            </SidebarGroup>
          )
        })}
      </SidebarContent>

      <SidebarFooter className="px-2 pb-3">
        <SidebarSeparator className="mb-2" />
        <SidebarMenu>
          {FOOTER_ITEMS.filter(itemVisible).map(renderItem)}
          {isAdmin ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link href="/admin" onClick={closeMobileNavigation} aria-current={pathname?.startsWith("/admin") ? "page" : undefined} />}
                isActive={pathname?.startsWith("/admin")}
                tooltip="Master Admin"
              >
                <ShieldAlert className="size-4 text-danger" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-danger">Master Admin</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>

        <div
          className={cn(
            "mt-2 flex items-center gap-1 rounded-lg border border-sidebar-border bg-card p-1 transition-colors hover:bg-muted",
            isItemActive("/minha-conta") && "bg-sidebar-accent text-sidebar-accent-foreground"
          )}
        >
          <Link
            href="/minha-conta"
            onClick={closeMobileNavigation}
            aria-current={isItemActive("/minha-conta") ? "page" : undefined}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
              {userName ? userName.charAt(0).toUpperCase() : "…"}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs font-semibold">{userName || "Carregando…"}</span>
              <span className="microlabel text-[9px]">{planContext.plan.charAt(0).toUpperCase() + planContext.plan.slice(1)}</span>
            </div>
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Sair da conta"
            title="Sair da conta"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-danger-bg hover:text-danger focus-visible:outline-2 focus-visible:outline-ring"
          >
            <LogOut className="size-3.5" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

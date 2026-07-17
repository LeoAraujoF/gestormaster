import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { PrivacyProvider } from "@/hooks/use-privacy"
import { PrivacyToggle } from "@/components/privacy-toggle"
import { ThemeToggle } from "@/components/theme-toggle"
import { NotificationBell } from "@/components/notification-bell"
import { QuickActions } from "@/components/quick-actions"
import { WhatsAppStatus } from "@/components/whatsapp-status"
import { CampaignHeaderStatus } from "@/components/campaign-header-status"
import { CommandPalette } from "@/components/command-palette"
import { DashboardPageTitle } from "@/components/dashboard-page-title"
import { UserTimezoneClock } from "@/components/user-timezone-clock"
import { WhatsAppBanner } from "@/components/whatsapp-banner"
import { OrganizationProvider } from "@/components/providers/organization-provider"
import { PlanProvider } from '@/components/providers/plan-provider'
import { PlanRouteGate } from '@/components/plan-route-gate'
import { createClient } from '@/lib/supabase/server'
import { getOrganizationMembership } from '@/lib/access-control'
import { getOrganizationPlanContext } from '@/lib/plan-catalog'

import { PageProtector } from "@/components/page-protector"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const membership = user ? await getOrganizationMembership(supabase, user.id) : null
  const plan = membership ? await getOrganizationPlanContext(membership.organizationId) : { plan: 'starter' as const, active: false, expiresAt: null, limits: { clients: 100, whatsappInstances: 1 }, capabilities: [] }
  return (
    <PrivacyProvider>
      <OrganizationProvider>
       <PlanProvider value={plan}>
        <SidebarProvider defaultOpen={true} className="saas-dashboard">
          <AppSidebar />
          <main className="flex min-w-0 flex-1 flex-col overflow-x-clip bg-background [--dashboard-header-left:0px] md:peer-data-[state=expanded]:[--dashboard-header-left:var(--sidebar-width)]">
              <header className="fixed inset-x-0 top-0 z-50 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 shadow-xs backdrop-blur-sm transition-[left] duration-200 ease-linear supports-[backdrop-filter]:bg-background/80 sm:gap-3 sm:px-5 md:left-[var(--dashboard-header-left)] md:px-6">
                <SidebarTrigger className="shrink-0" />
                <DashboardPageTitle />
                <div className="hidden min-w-0 max-w-[280px] flex-1 md:block">
                  <CommandPalette />
                </div>
                <div className="hidden min-w-0 flex-1 md:block" />
                <div className="flex shrink-0 items-center gap-0.5 sm:gap-1 md:gap-2">
                  <UserTimezoneClock initialTimezone={user?.user_metadata?.timezone} />
                  <div className="hidden xl:block"><CampaignHeaderStatus /></div>
                  <WhatsAppStatus />
                  <QuickActions />
                  <div className="h-5 w-px bg-border hidden md:block"></div>
                  <NotificationBell />
                  <ThemeToggle />
                  <PrivacyToggle />
                </div>
              </header>
              <div className="h-14 shrink-0" aria-hidden="true" />
              <div className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-5 md:px-6 md:py-6 lg:px-8 lg:py-8">
                <WhatsAppBanner />
                <PageProtector>
                  <PlanRouteGate>{children}</PlanRouteGate>
                </PageProtector>
              </div>
          </main>
        </SidebarProvider>
       </PlanProvider>
      </OrganizationProvider>
    </PrivacyProvider>
  )
}

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
        <SidebarProvider defaultOpen={true}>
          <AppSidebar />
          <main className="flex-1 w-full flex flex-col bg-background min-w-0 overflow-x-hidden">
              <header className="h-14 flex items-center gap-3 px-4 md:px-6 border-b border-border bg-background sticky top-0 z-50">
                <SidebarTrigger />
                <div className="flex-1 max-w-[280px]">
                  <CommandPalette />
                </div>
                <div className="flex-1"></div>
                <div className="flex items-center gap-1 md:gap-2">
                  <CampaignHeaderStatus />
                  <WhatsAppStatus />
                  <QuickActions />
                  <div className="h-5 w-px bg-border hidden md:block"></div>
                  <NotificationBell />
                  <ThemeToggle />
                  <PrivacyToggle />
                </div>
              </header>
              <div className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full">
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

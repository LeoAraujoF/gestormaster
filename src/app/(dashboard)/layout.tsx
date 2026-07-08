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

import { PageProtector } from "@/components/page-protector"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <PrivacyProvider>
      <OrganizationProvider>
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
                  {children}
                </PageProtector>
              </div>
          </main>
        </SidebarProvider>
      </OrganizationProvider>
    </PrivacyProvider>
  )
}

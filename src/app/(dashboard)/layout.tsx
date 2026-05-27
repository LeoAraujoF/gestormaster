import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { PrivacyProvider } from "@/hooks/use-privacy"
import { PrivacyToggle } from "@/components/privacy-toggle"
import { ThemeToggle } from "@/components/theme-toggle"
import { NotificationBell } from "@/components/notification-bell"
import { QuickActions } from "@/components/quick-actions"
import { WhatsAppStatus } from "@/components/whatsapp-status"
import { CampaignHeaderStatus } from "@/components/campaign-header-status"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <PrivacyProvider>
      <SidebarProvider defaultOpen={true}>
        <AppSidebar />
        <main className="flex-1 w-full flex flex-col bg-background">
            <header className="h-16 flex items-center px-4 md:px-6 border-b border-border/30 bg-background/80 backdrop-blur-md sticky top-0 z-50">
              <SidebarTrigger className="mr-4" />
              <div className="flex-1"></div>
              <div className="flex items-center gap-2 md:gap-4">
                <CampaignHeaderStatus />
                <WhatsAppStatus />
                <QuickActions />
                <div className="h-6 w-px bg-border/50 hidden md:block"></div>
                <NotificationBell />
                <div className="h-6 w-px bg-border/50 hidden md:block"></div>
                <ThemeToggle />
                <PrivacyToggle />
              </div>
            </header>
            <div className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full">
              {children}
            </div>
        </main>
      </SidebarProvider>
    </PrivacyProvider>
  )
}

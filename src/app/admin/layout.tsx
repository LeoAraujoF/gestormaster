import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AdminSidebar } from "@/components/admin-sidebar"
import { ThemeToggle } from "@/components/theme-toggle"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider defaultOpen={true}>
      <AdminSidebar />
      <main className="flex-1 w-full flex flex-col bg-background">
          <header className="h-16 flex items-center px-4 md:px-6 border-b border-border/30 bg-background/80 backdrop-blur-md sticky top-0 z-50">
            <SidebarTrigger className="mr-4 text-danger hover:text-danger" />
            <div className="flex-1 font-semibold text-danger">Administração Gestor Master</div>
            <div className="flex items-center gap-2 md:gap-4">
              <ThemeToggle />
            </div>
          </header>
          <div className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full">
            {children}
          </div>
      </main>
    </SidebarProvider>
  )
}

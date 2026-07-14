import { redirect } from 'next/navigation'

import { AdminCriticalActionProvider } from '@/components/admin-critical-action-provider'
import { AdminSidebar } from '@/components/admin-sidebar'
import { ThemeToggle } from '@/components/theme-toggle'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { AdminAccessError, requireMasterAdmin } from '@/lib/admin-security'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireMasterAdmin()
  } catch (error) {
    redirect(error instanceof AdminAccessError && error.status === 401 ? '/login' : '/painel')
  }

  return (
    <AdminCriticalActionProvider>
      <SidebarProvider defaultOpen>
        <a
          href="#admin-content"
          className="sr-only fixed left-3 top-3 z-[100] rounded-md bg-background px-3 py-2 text-sm font-medium shadow-lg focus:not-sr-only"
        >
          Pular para o conteúdo
        </a>
        <AdminSidebar />
        <SidebarInset className="min-w-0 overflow-hidden md:m-2 md:ml-0">
          <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b bg-background/90 px-3 backdrop-blur-xl sm:px-5">
            <SidebarTrigger aria-label="Alternar menu administrativo" />
            <div className="h-5 w-px bg-border" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold tracking-tight">Administração Master</p>
              <p className="hidden truncate text-[11px] text-muted-foreground sm:block">Ambiente global · acesso restrito</p>
            </div>
            <span className="hidden items-center gap-2 rounded-full border border-danger-border bg-danger-bg px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-danger-fg sm:inline-flex">
              <span className="status-dot bg-danger" aria-hidden="true" />
              Master
            </span>
            <ThemeToggle />
          </header>
          <div id="admin-content" className="w-full flex-1 px-4 py-5 sm:px-6 sm:py-6 xl:px-8">
            <div className="mx-auto w-full max-w-[1600px]">{children}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </AdminCriticalActionProvider>
  )
}

import { PageShell } from "@/components/page-layout"
import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <PageShell aria-busy="true" aria-label="Carregando página">
      <span className="sr-only" role="status">Carregando conteúdo…</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-44 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </PageShell>
  )
}

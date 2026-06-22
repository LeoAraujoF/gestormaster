import { ExternalLink, Server } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import Link from "next/link"

export default function QueuesPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Server className="w-6 h-6 text-emerald-500" />
            BullMQ Board
          </h2>
          <p className="text-muted-foreground">Monitore as filas do sistema em tempo real.</p>
        </div>
        <Link 
          href="/api/admin/queues-redirect" 
          target="_blank" 
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", className: "text-emerald-600 border-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600" })}
        >
          Abrir em Tela Cheia <ExternalLink className="ml-2 w-4 h-4" />
        </Link>
      </div>

      <div className="flex-1 bg-card rounded-xl border border-border/50 overflow-hidden shadow-sm relative">
        <iframe 
          src="/api/admin/queues-redirect" 
          className="w-full h-full border-0 absolute inset-0"
          title="BullMQ Board"
        />
      </div>
    </div>
  )
}

"use client"

import { PlusCircle, Users, Tag, Package, Rocket } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createClient } from "@/lib/supabase/client"
import { QuickAddServiceDialog, QuickAddPromoDialog } from "@/components/quick-add-dialogs"
import { ClientFormDialog } from "@/components/client-form-dialog"

export function QuickActions() {
  const router = useRouter()
  const [isClientOpen, setIsClientOpen] = useState(false)
  const [isPromoOpen, setIsPromoOpen] = useState(false)
  const [isServiceOpen, setIsServiceOpen] = useState(false)
  const [servicesList, setServicesList] = useState<any[]>([])
  
  const supabase = createClient()

  useEffect(() => {
    // Busca a lista de serviços uma vez para alimentar o modal de cliente caso seja aberto
    const fetchServices = async () => {
      const { data } = await supabase.from('services').select('id, name, cost')
      if (data) setServicesList(data)
    }
    fetchServices()
  }, [supabase])

  const handleSuccess = () => {
    // Optionally refresh the current page data if needed
    router.refresh()
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-sky-500 hover:bg-sky-600 text-white shadow-sm hover:shadow-md transition-all gap-1.5 h-9 rounded-full px-4 border-0">
          <PlusCircle className="w-4 h-4" />
          <span className="hidden sm:inline-block font-medium">Criar</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-xl border-border/50 shadow-xl">
          <div className="px-2 py-2 text-xs font-medium text-muted-foreground">Ações Rápidas</div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setIsClientOpen(true)} className="cursor-pointer py-2">
            <div className="bg-sky-500/10 p-1.5 rounded-md mr-2">
              <Users className="w-4 h-4 text-sky-500" />
            </div>
            <span className="font-medium">Novo Cliente</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setIsPromoOpen(true)} className="cursor-pointer py-2">
            <div className="bg-emerald-500/10 p-1.5 rounded-md mr-2">
              <Tag className="w-4 h-4 text-emerald-500" />
            </div>
            <span className="font-medium">Nova Promoção</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setIsServiceOpen(true)} className="cursor-pointer py-2">
            <div className="bg-violet-500/10 p-1.5 rounded-md mr-2">
              <Package className="w-4 h-4 text-violet-500" />
            </div>
            <span className="font-medium">Novo Serviço</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push('/automacao')} className="cursor-pointer py-2">
            <div className="bg-amber-500/10 p-1.5 rounded-md mr-2">
              <Rocket className="w-4 h-4 text-amber-500" />
            </div>
            <span className="font-medium text-foreground">Disparo em Massa</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ClientFormDialog 
        open={isClientOpen} 
        onOpenChange={setIsClientOpen} 
        servicesList={servicesList}
        onSuccess={handleSuccess}
      />
      
      <QuickAddPromoDialog 
        open={isPromoOpen} 
        onOpenChange={setIsPromoOpen} 
        onSuccess={handleSuccess}
      />
      
      <QuickAddServiceDialog 
        open={isServiceOpen} 
        onOpenChange={setIsServiceOpen} 
        onSuccess={handleSuccess}
      />
    </>
  )
}

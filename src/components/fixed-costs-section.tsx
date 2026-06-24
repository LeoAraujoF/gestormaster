"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Plus, Trash2, Power, PowerOff, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { formatCurrency, cn } from "@/lib/utils"

interface FixedCost {
  id: string
  name: string
  amount: number
  active: boolean
  created_at: string
}

interface FixedCostsSectionProps {
  onTotalChange?: (total: number) => void
}

export function FixedCostsSection({ onTotalChange }: FixedCostsSectionProps) {
  const [costs, setCosts] = useState<FixedCost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [newAmount, setNewAmount] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadCosts()
  }, [])

  useEffect(() => {
    const total = costs
      .filter(c => c.active)
      .reduce((sum, c) => sum + Number(c.amount), 0)
    onTotalChange?.(total)
  }, [costs, onTotalChange])

  async function loadCosts() {
    const { data, error } = await supabase
      .from('fixed_costs')
      .select('*')
      .order('created_at', { ascending: true })

    if (data) setCosts(data)
    if (error) console.error('Error loading fixed costs:', error)
    setIsLoading(false)
  }

  async function handleAdd() {
    if (!newName.trim() || !newAmount) return
    setIsSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('fixed_costs').insert({
      user_id: user.id,
      name: newName.trim(),
      amount: parseFloat(newAmount),
      active: true,
    })

    if (error) {
      toast.error("Erro ao adicionar custo fixo")
    } else {
      toast.success("Custo fixo adicionado!")
      setNewName("")
      setNewAmount("")
      setIsDialogOpen(false)
      loadCosts()
    }
    setIsSaving(false)
  }

  async function toggleCost(id: string, active: boolean) {
    const { error } = await supabase
      .from('fixed_costs')
      .update({ active: !active })
      .eq('id', id)

    if (!error) loadCosts()
  }

  async function deleteCost(id: string) {
    const { error } = await supabase
      .from('fixed_costs')
      .delete()
      .eq('id', id)

    if (error) {
      toast.error("Erro ao remover custo")
    } else {
      toast.success("Custo removido")
      loadCosts()
    }
  }

  const activeTotal = costs
    .filter(c => c.active)
    .reduce((sum, c) => sum + Number(c.amount), 0)

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base">Custos Fixos Mensais</CardTitle>
              <CardDescription className="text-xs">
                Total: <span className="text-rose-500 font-semibold">{formatCurrency(activeTotal)}</span>/mês
              </CardDescription>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 rounded-full text-xs"
            onClick={() => setIsDialogOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-6 text-muted-foreground text-sm">Carregando...</div>
        ) : costs.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-border/50 rounded-xl">
            <Wallet className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum custo fixo cadastrado</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Adicione seus custos (servidor, IA, apps, etc.)
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {costs.map((cost) => (
              <div
                key={cost.id}
                className={cn(
                  "flex items-center justify-between p-3 rounded-xl border transition-all",
                  cost.active
                    ? "border-border/50 bg-background/50"
                    : "border-border/20 bg-muted/30 opacity-60"
                )}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <button
                    onClick={() => toggleCost(cost.id, cost.active)}
                    className={cn(
                      "flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors",
                      cost.active
                        ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted/80"
                    )}
                    title={cost.active ? "Desativar" : "Ativar"}
                  >
                    {cost.active ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
                  </button>
                  <span className={cn(
                    "text-sm font-medium truncate",
                    !cost.active && "line-through text-muted-foreground"
                  )}>
                    {cost.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn(
                    "text-sm font-semibold",
                    cost.active ? "text-rose-500" : "text-muted-foreground"
                  )}>
                    {formatCurrency(cost.amount)}
                  </span>
                  <button
                    onClick={() => deleteCost(cost.id)}
                    className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                    title="Remover"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Custo Fixo</DialogTitle>
            <DialogDescription>
              Registre um custo mensal recorrente (ex: servidor VPS, painel, ferramentas).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cost-name">Nome do Custo</Label>
              <Input
                id="cost-name"
                placeholder="Ex: Servidor VPS"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost-amount">Valor Mensal (R$)</Label>
              <Input
                id="cost-amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="Ex: 89.90"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={isSaving || !newName.trim() || !newAmount}>
              {isSaving ? "Salvando..." : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

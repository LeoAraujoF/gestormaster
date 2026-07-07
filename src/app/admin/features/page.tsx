"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Settings2, Zap, LayoutTemplate } from "lucide-react"
import { toast } from "sonner"

export default function FeaturesAdminPage() {
  const [features, setFeatures] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchFeatures()
  }, [])

  const fetchFeatures = async () => {
    const { data, error } = await supabase.from('system_features').select('*').order('name')
    if (data) setFeatures(data)
    setIsLoading(false)
  }

  const toggleFeature = async (key: string, currentValue: boolean) => {
    const newValue = !currentValue
    
    // Optimistic UI update
    setFeatures(features.map(f => f.key === key ? { ...f, is_enabled: newValue } : f))
    
    const { error } = await supabase
      .from('system_features')
      .update({ is_enabled: newValue })
      .eq('key', key)

    if (error) {
      toast.error("Erro ao atualizar trava.")
      // Revert on error
      setFeatures(features.map(f => f.key === key ? { ...f, is_enabled: currentValue } : f))
    } else {
      toast.success(`Trava atualizada com sucesso.`)
    }
  }

  const pages = features.filter(f => f.category === 'Página')
  const actions = features.filter(f => f.category === 'Ação')
  const integracoes = features.filter(f => f.category === 'Integração')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Controle Mestre de Funcionalidades</h2>
        <p className="text-muted-foreground mt-1">Ligue ou desligue partes do sistema para todos os usuários instantaneamente.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Settings2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <LayoutTemplate className="w-5 h-5 text-interactive" />
                <CardTitle>Travas de Páginas</CardTitle>
              </div>
              <CardDescription>Oculta páginas inteiras. Quem tentar acessar verá a tela de manutenção.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {pages.map((feature) => (
                <div key={feature.key} className="flex items-center justify-between">
                  <Label htmlFor={feature.key} className="text-base font-medium cursor-pointer">
                    {feature.name}
                  </Label>
                  <Switch 
                    id={feature.key} 
                    checked={feature.is_enabled} 
                    onCheckedChange={() => toggleFeature(feature.key, feature.is_enabled)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-8">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-500" />
                  <CardTitle>Travas de Ações</CardTitle>
                </div>
                <CardDescription>Oculta botões específicos do sistema (ex: Impedir disparos em massa).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {actions.map((feature) => (
                  <div key={feature.key} className="flex items-center justify-between">
                    <Label htmlFor={feature.key} className="text-base font-medium cursor-pointer">
                      {feature.name}
                    </Label>
                    <Switch 
                      id={feature.key} 
                      checked={feature.is_enabled} 
                      onCheckedChange={() => toggleFeature(feature.key, feature.is_enabled)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-emerald-500" />
                  <CardTitle>Travas de Integrações</CardTitle>
                </div>
                <CardDescription>Ative ou desative cartões da página Hub de Integrações.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {integracoes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma integração mapeada no banco.</p>}
                {integracoes.map((feature) => (
                  <div key={feature.key} className="flex items-center justify-between">
                    <Label htmlFor={feature.key} className="text-base font-medium cursor-pointer">
                      {feature.name}
                    </Label>
                    <Switch 
                      id={feature.key} 
                      checked={feature.is_enabled} 
                      onCheckedChange={() => toggleFeature(feature.key, feature.is_enabled)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

        </div>
      )}
    </div>
  )
}

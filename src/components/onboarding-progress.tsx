"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Users, MessageCircle, Zap, Check, ChevronRight, X, Briefcase } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from "@/components/ui/dialog"

interface OnboardingStep {
  id: string
  title: string
  description: string
  icon: React.ElementType
  href: string
  completed: boolean
}

export function OnboardingProgress() {
  const [steps, setSteps] = useState<OnboardingStep[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDismissed, setIsDismissed] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkProgress()
  }, [])

  async function checkProgress() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Check if user dismissed the onboarding banner
      if (user.user_metadata?.onboarding_banner_dismissed) {
        setIsDismissed(true)
        setIsLoading(false)
        return
      }

      // Check 0: Has at least 1 service
      const { count: serviceCount } = await supabase
        .from('services')
        .select('*', { count: 'exact', head: true })

      // Check 1: Has at least 1 client
      const { count: clientCount } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })

      // Check 2: Has a connected WhatsApp instance set as primary
      const { data: instances } = await supabase
        .from('evolution_instances')
        .select('id, status, is_primary')
        .eq('is_primary', true)
        .limit(1)
      const hasWhatsAppPrimary = instances && instances.length > 0 && instances[0].status === 'connected'

      // Check 3: Has at least 1 active automation rule
      const { count: automationCount } = await supabase
        .from('automations')
        .select('*', { count: 'exact', head: true })
        .eq('active', true)

      const stepsData: OnboardingStep[] = [
        {
          id: 'services',
          title: 'Criar um serviço',
          description: 'Cadastre os serviços que você oferece (IPTV, VPS, etc)',
          icon: Briefcase,
          href: '/servicos',
          completed: (serviceCount ?? 0) > 0,
        },
        {
          id: 'clients',
          title: 'Adicionar um cliente',
          description: 'Cadastre seu primeiro cliente para começar a gerenciar',
          icon: Users,
          href: '/clientes',
          completed: (clientCount ?? 0) > 0,
        },
        {
          id: 'whatsapp',
          title: 'Conectar WhatsApp',
          description: 'Conecte e defina como número principal para cobranças',
          icon: MessageCircle,
          href: '/automacao',
          completed: !!hasWhatsAppPrimary,
        },
        {
          id: 'automation',
          title: 'Criar regra de automação',
          description: 'Configure alertas automáticos para seus clientes',
          icon: Zap,
          href: '/automacao',
          completed: (automationCount ?? 0) > 0,
        },
      ]

      setSteps(stepsData)
    } catch (error) {
      console.error('Error checking onboarding progress:', error)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleDismiss() {
    setIsDismissed(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.auth.updateUser({
        data: { onboarding_banner_dismissed: true }
      })
    }
  }

  if (isLoading || isDismissed) return null

  const completedCount = steps.filter(s => s.completed).length
  const totalSteps = steps.length
  const allCompleted = completedCount === totalSteps
  const progressPercent = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0

  // Hide if all completed
  if (allCompleted) return null

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-[700px] p-0 overflow-hidden border-border/50 bg-background shadow-2xl"
        showCloseButton={false}
      >
        <div className="relative overflow-hidden p-6 md:p-8">
          {/* Background decoration */}
          
          <DialogHeader className="relative mb-6">
            <div className="flex items-center gap-4 mb-2">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary">
                <Zap className="w-6 h-6" />
              </div>
              <div className="text-left">
                <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                  Configure sua conta
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                    {completedCount}/{totalSteps}
                  </span>
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground mt-1">
                  Complete os passos abaixo para deixar seu sistema 100% pronto para faturar.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Progress bar */}
          <div className="relative h-2.5 bg-muted/50 rounded-full mb-8 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Steps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {steps.map((step) => {
              const Icon = step.icon
              return (
                <button
                  key={step.id}
                  onClick={() => !step.completed && router.push(step.href)}
                  disabled={step.completed}
                  className={cn(
                    "group relative flex items-start gap-4 rounded-xl border p-4 text-left transition-all duration-200",
                    step.completed
                      ? "border-emerald-500/20 bg-emerald-500/5 cursor-default"
                      : "border-border/50 bg-background hover:border-primary/30 hover:bg-primary/5 cursor-pointer hover:shadow-md hover:-translate-y-0.5"
                  )}
                >
                  <div
                    className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-lg shrink-0 transition-colors",
                      step.completed
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-muted/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                    )}
                  >
                    {step.completed ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm font-semibold leading-tight",
                        step.completed ? "text-emerald-600 dark:text-emerald-400 line-through decoration-emerald-500/30" : "text-foreground"
                      )}
                    >
                      {step.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                  {!step.completed && (
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0 mt-3 transition-transform group-hover:translate-x-1" />
                  )}
                </button>
              )
            })}
          </div>

          <DialogFooter className="mt-8 pt-4 border-t border-border/50 flex flex-row items-center justify-between sm:justify-between">
            <span className="text-sm text-muted-foreground hidden sm:inline-block">
              Você pode pular e fazer isso depois se quiser.
            </span>
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={handleDismiss}
            >
              Pular Tutorial
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

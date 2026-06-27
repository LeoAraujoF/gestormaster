"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Users, MessageCircle, Zap, Check, ChevronRight, X, Briefcase } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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
          title: 'Conectar WhatsApp (Principal)',
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
    <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-primary/5 via-background to-background p-5 md:p-6 shadow-sm">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
      
      {/* Header */}
      <div className="relative flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              Configure sua conta
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {completedCount}/{totalSteps}
              </span>
            </h3>
            <p className="text-xs text-muted-foreground">
              Complete os passos abaixo para aproveitar ao máximo o Gestor
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
          onClick={handleDismiss}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 bg-muted/50 rounded-full mb-5 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-emerald-500 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {steps.map((step) => {
          const Icon = step.icon
          return (
            <button
              key={step.id}
              onClick={() => !step.completed && router.push(step.href)}
              disabled={step.completed}
              className={cn(
                "group relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200",
                step.completed
                  ? "border-emerald-500/20 bg-emerald-500/5 cursor-default"
                  : "border-border/50 bg-background/50 hover:border-primary/30 hover:bg-primary/5 cursor-pointer hover:shadow-sm"
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-center w-9 h-9 rounded-lg shrink-0 transition-colors",
                  step.completed
                    ? "bg-emerald-500/10 text-emerald-500"
                    : "bg-muted/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                )}
              >
                {step.completed ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Icon className="w-4 h-4" />
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
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {step.description}
                </p>
              </div>
              {!step.completed && (
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0 mt-1 transition-transform group-hover:translate-x-0.5" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

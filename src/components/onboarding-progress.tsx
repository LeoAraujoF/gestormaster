"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
  const supabase = useMemo(() => createClient(), [])

  const checkProgress = useCallback(async () => {
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
  }, [supabase])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void checkProgress(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [checkProgress])

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

  const nextStep = steps.find((step) => !step.completed)

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card" aria-labelledby="onboarding-title">
      <div className="flex items-start gap-3 px-5 py-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-interactive-bg text-interactive-fg">
          <Zap className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="onboarding-title" className="text-sm font-semibold text-foreground">Configure sua conta</h2>
            <span className="num rounded-[6px] bg-interactive-bg px-[7px] py-0.5 text-[10px] font-semibold text-interactive-fg">
              {completedCount}/{totalSteps}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Complete os passos essenciais para começar a operar e faturar.</p>
          <div className="relative mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-label={`${Math.round(progressPercent)}% concluído`}>
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-interactive transition-all duration-700 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Ocultar configuração inicial"
          title="Fazer depois"
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="grid border-t border-border sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => {
              const Icon = step.icon
              return (
                <button
                  key={step.id}
                  onClick={() => !step.completed && router.push(step.href)}
                  disabled={step.completed}
                  className={cn(
                    "group flex min-h-20 items-start gap-2.5 border-b border-border px-4 py-3 text-left transition-colors motion-reduce:transition-none sm:border-r lg:border-b-0",
                    step.completed
                      ? "cursor-default bg-success-bg/40"
                      : "cursor-pointer bg-card hover:bg-muted"
                  )}
                >
                  <div
                    className={cn(
                      "flex size-[30px] shrink-0 items-center justify-center rounded-[6px] transition-colors motion-reduce:transition-none",
                      step.completed
                        ? "bg-success-bg text-success-fg"
                        : "bg-muted text-muted-foreground group-hover:text-interactive"
                    )}
                  >
                    {step.completed ? (
                      <Check className="size-4" />
                    ) : (
                      <Icon className="size-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-xs font-semibold leading-tight",
                        step.completed ? "text-success-fg" : "text-foreground"
                      )}
                    >
                      {step.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[10.5px] leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                  {!step.completed && (
                    <ChevronRight className="mt-2 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-interactive" />
                  )}
                </button>
              )
            })}
      </div>

      {nextStep ? (
        <div className="flex flex-col gap-2 border-t border-border px-5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">Próximo passo: <strong className="text-foreground">{nextStep.title}</strong></p>
          <Button size="sm" onClick={() => router.push(nextStep.href)} className="h-[30px] shrink-0 rounded-lg text-xs font-semibold">Continuar configuração</Button>
        </div>
      ) : null}
    </section>
  )
}

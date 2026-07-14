"use client"

import { useState, useEffect } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Eye, EyeOff } from "lucide-react"
import Link from "next/link"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { BrandMark } from "@/components/brand-mark"

const loginSchema = z.object({
  email: z.string().email({ message: "Email inválido" }),
  password: z.string().min(6, { message: "A senha deve ter pelo menos 6 caracteres" }),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  useEffect(() => {
    const savedEmail = localStorage.getItem("gestor_master_email")
    if (savedEmail) {
      setValue("email", savedEmail)
      setRememberMe(true)
    }
  }, [setValue])

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true)
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (error) {
        toast.error(error.message === "Invalid login credentials"
          ? "Email ou senha incorretos."
          : "Erro ao fazer login.")
        return
      }

      if (!authData.session || !authData.user) {
        toast.error("Login sem sessão ativa. Confirme o e-mail da conta e tente novamente.")
        return
      }

      if (rememberMe) {
        localStorage.setItem("gestor_master_email", data.email)
      } else {
        localStorage.removeItem("gestor_master_email")
      }

      // The middleware is the server-authoritative source for entitlements. Do
      // not decide the plan in the browser from potentially stale JWT claims.
      // Sending the user to a protected route lets the middleware resolve the
      // current organization entitlement and redirect to /planos when needed.
      const onboardingCompleted = authData.user?.user_metadata?.onboarding_completed === true
      const destination = onboardingCompleted ? "/painel" : "/onboarding"
      toast.success("Login realizado com sucesso!")
      window.location.assign(destination)
    } catch (err) {
      toast.error("Ocorreu um erro inesperado.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      {/* Logo */}
      <Link href="/" className="mb-8 flex items-center gap-2">
        <BrandMark size={26} />
        <span className="text-[15px] font-semibold tracking-tight text-foreground">Gestor</span>
      </Link>

      {/* Card único */}
      <div className="w-full max-w-[360px] rounded-[12px] border border-border bg-card p-6 shadow-[0_12px_32px_rgba(0,0,0,.06)]">
        <h1 className="text-[15px] font-semibold tracking-[-0.02em]">Entrar no painel</h1>
        <p className="mt-1 text-xs text-muted-foreground">Digite suas credenciais para acessar.</p>

        <form method="post" onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              className="h-10"
              {...register("email")}
            />
            {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs">Senha</Label>
              <Link href="/forgot-password" className="text-xs font-medium text-interactive hover:underline">
                Esqueceu a senha?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                className="h-10 pr-10"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-danger">{errors.password.message}</p>}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="rememberMe"
              checked={rememberMe}
              onCheckedChange={(checked) => setRememberMe(checked as boolean)}
            />
            <Label htmlFor="rememberMe" className="text-xs font-normal text-muted-foreground">
              Lembrar meu e-mail
            </Label>
          </div>

          <Button type="submit" className="h-10 w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Entrando…
              </>
            ) : (
              "Entrar"
            )}
          </Button>
        </form>

        <div className="mt-5 border-t border-border pt-4 text-center text-xs text-muted-foreground">
          Não tem uma conta?{" "}
          <Link href="/cadastro" className="font-medium text-interactive hover:underline">
            Teste 7 dias grátis
          </Link>
        </div>
      </div>

      <Link
        href="/privacidade"
        className="mt-6 text-[11px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
      >
        Política de Privacidade
      </Link>
    </div>
  )
}

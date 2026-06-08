"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react"
import Link from "next/link"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"

const loginSchema = z.object({
  email: z.string().email({ message: "Email inválido" }),
  password: z.string().min(6, { message: "A senha deve ter pelo menos 6 caracteres" }),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
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
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (error) {
        toast.error(error.message === "Invalid login credentials" 
          ? "Email ou senha incorretos." 
          : "Erro ao fazer login.")
        return
      }

      if (rememberMe) {
        localStorage.setItem("gestor_master_email", data.email)
      } else {
        localStorage.removeItem("gestor_master_email")
      }

      toast.success("Login realizado com sucesso!")
      router.push("/")
      router.refresh()
    } catch (err) {
      toast.error("Ocorreu um erro inesperado.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setIsLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        }
      })
      if (error) throw error
    } catch (err) {
      toast.error("Erro ao redirecionar para o Google.")
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-background animate-in fade-in slide-in-from-left-8 duration-700 ease-out">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center bg-zinc-900 dark:bg-zinc-950">
        <div className="relative z-10 px-12 max-w-lg">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-sky-500/15 border border-sky-500/20 flex items-center justify-center">
              <span className="text-xl font-black text-sky-400 tracking-tighter">GM</span>
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Gestor Master</h1>
          </div>
          <p className="text-lg text-zinc-300 leading-relaxed mb-8">
            Sistema inteligente de gestão de clientes com <span className="text-sky-300">automação</span> e <span className="text-emerald-300">controle financeiro</span>.
          </p>
          <div className="space-y-4 text-sm text-zinc-400">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <span>Controle de vencimentos automático</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Alertas via WhatsApp integrados</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>Relatórios financeiros em tempo real</span>
            </div>
          </div>
        </div>
        {/* Subtle decorative element */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/15 flex items-center justify-center">
              <span className="text-lg font-black text-sky-500 tracking-tighter">GM</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Gestor Master</h1>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold tracking-tight">Bem-vindo de volta</h2>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1.5">
              Digite suas credenciais para acessar o painel.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-zinc-700 dark:text-zinc-300">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  className="pl-9 h-11"
                  {...register("email")}
                />
              </div>
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-zinc-700 dark:text-zinc-300">Senha</Label>
                <Link href="/forgot-password" className="text-xs font-medium text-sky-500 hover:underline" tabIndex={-1}>
                  Esqueceu a senha?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="pl-9 pr-10 h-11"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="flex items-center space-x-2 mt-2">
              <Checkbox 
                id="rememberMe" 
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked as boolean)}
              />
              <Label 
                htmlFor="rememberMe" 
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-zinc-600 dark:text-zinc-400"
              >
                Lembrar meu e-mail
              </Label>
            </div>

            <Button 
              type="submit" 
              className="w-full h-11 text-sm font-medium mt-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200" 
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                "Entrar"
              )}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Ou continue com</span>
            </div>
          </div>

          <Button 
            type="button" 
            variant="outline" 
            className="w-full h-11" 
            onClick={handleGoogleLogin}
            disabled={isLoading}
          >
            <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path></svg>
            Google
          </Button>

          <div className="text-center text-sm text-muted-foreground mt-6">
            Não tem uma conta? <Link href="/cadastro" className="text-sky-500 hover:underline">Cadastre-se</Link>
          </div>

          <div className="flex flex-col items-center gap-2 mt-8 text-xs text-zinc-400 dark:text-zinc-500">
            <p>Acesso restrito a administradores autorizados.</p>
            <Link href="/privacidade" className="hover:text-zinc-600 dark:hover:text-zinc-300 underline underline-offset-2 transition-colors">
              Ler Política de Privacidade
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Mail, Lock, Zap, User } from "lucide-react"
import Link from "next/link"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

const registerSchema = z.object({
  name: z.string().min(2, { message: "O nome deve ter pelo menos 2 caracteres" }),
  email: z.string().email({ message: "Email inválido" }),
  password: z.string().min(6, { message: "A senha deve ter pelo menos 6 caracteres" }),
})

type RegisterForm = z.infer<typeof registerSchema>

export default function RegisterPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  })

  const onSubmit = async (data: RegisterForm) => {
    setIsLoading(true)
    
    try {
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.name,
            has_active_subscription: false // Inicia sempre bloqueado
          }
        }
      })

      if (error) {
        toast.error(error.message)
        return
      }

      toast.success("Conta criada com sucesso! Redirecionando...")
      router.push("/planos") // Redireciona para o pedágio de planos
      router.refresh()
    } catch (err) {
      toast.error("Ocorreu um erro inesperado.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex lg:flex-row-reverse bg-background animate-in fade-in slide-in-from-right-8 duration-700 ease-out">
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

      {/* Right Panel - Register Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/15 flex items-center justify-center">
              <span className="text-lg font-black text-sky-500 tracking-tighter">GM</span>
            </div>
            <span className="text-2xl font-bold tracking-tight">Gestor Master</span>
          </div>

          <div className="space-y-2 mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Crie sua conta
            </h2>
            <p className="text-muted-foreground text-sm">
              Preencha os dados abaixo para iniciar sua jornada.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome completo</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    placeholder="Seu nome"
                    className="pl-9 bg-background/50"
                    {...register("name")}
                  />
                </div>
                {errors.name && (
                  <p className="text-xs text-destructive">{errors.name.message}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="voce@exemplo.com"
                    className="pl-9 bg-background/50"
                    {...register("email")}
                  />
                </div>
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    className="pl-9 bg-background/50"
                    {...register("password")}
                  />
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                )}
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full shadow-lg shadow-primary/20" 
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Cadastrar
            </Button>
            
            <div className="text-center text-sm text-muted-foreground mt-4">
              Já tem uma conta? <Link href="/login" className="text-sky-500 hover:underline">Faça login</Link>
            </div>
          </form>
          
          <div className="flex justify-center mt-8 text-xs text-muted-foreground">
            <Link href="/privacidade" className="hover:text-foreground underline underline-offset-2 transition-colors">
              Ler Política de Privacidade
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

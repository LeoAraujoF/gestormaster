"use client"

import { useState, useEffect } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Check, Eye, EyeOff } from "lucide-react"
import Link from "next/link"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { BrandMark } from "@/components/brand-mark"

const registerSchema = z.object({
  name: z.string().min(2, { message: "O nome deve ter pelo menos 2 caracteres" }),
  email: z.string().email({ message: "Email inválido" }),
  password: z.string().min(6, { message: "A senha deve ter pelo menos 6 caracteres" }),
  terms: z.boolean().refine((val) => val === true, {
    message: "Você precisa aceitar os termos de uso",
  }),
})

type RegisterForm = z.infer<typeof registerSchema>

const PROVAS = [
  "Cobranças automáticas no WhatsApp em volta do vencimento",
  "Anti-ban nativo: aquecimento e delays que protegem seu chip",
  "Financeiro em tempo real: lucro, custos e inadimplência",
]

export default function RegisterPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { terms: false },
  })

  // Captura o link de afiliado da URL (ex: ?ref=UUID)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const ref = urlParams.get('ref')
      if (ref) localStorage.setItem('gestor_ref_code', ref)
    }
  }, [])

  const onSubmit = async (data: RegisterForm) => {
    setIsLoading(true)
    try {
      const referredBy = typeof window !== 'undefined' ? localStorage.getItem('gestor_ref_code') : null

      const { error, data: authData } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.name,
            has_active_subscription: false, // Inicia sempre bloqueado
            referred_by: referredBy,
          },
        },
      })

      if (error) {
        toast.error(error.message)
        return
      }

      if (authData?.user && referredBy) {
        await supabase.from('users').update({ referred_by: referredBy }).eq('id', authData.user.id)
      }
      if (typeof window !== 'undefined') {
        localStorage.removeItem('gestor_ref_code')
      }

      toast.success("Conta criada com sucesso!")
      window.location.href = "/onboarding"
    } catch (err) {
      toast.error("Ocorreu um erro inesperado.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Painel esquerdo: tinta sólida com pitch + provas */}
      <div className="hidden flex-col justify-between bg-[#191a1e] p-10 lg:flex lg:w-[44%]">
        <Link href="/" className="flex items-center gap-2">
          <BrandMark size={26} g="#faf8f2" check="#3ecf8e" />
          <span className="text-[15px] font-semibold tracking-tight text-white">Gestor</span>
        </Link>

        <div className="max-w-sm">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.035em] text-white">
            Pare de cobrar cliente um por um.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            O Gestor cobra, renova e organiza seu caixa enquanto você cuida do negócio.
          </p>
          <ul className="mt-8 space-y-3.5">
            {PROVAS.map((prova) => (
              <li key={prova} className="flex items-start gap-2.5 text-[13px] text-white/80">
                <Check className="mt-0.5 size-3.5 shrink-0 text-[#3ecf8e]" />
                {prova}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/40">
          +500 gestores já automatizaram suas cobranças.
        </p>
      </div>

      {/* Formulário */}
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        {/* Logo mobile */}
        <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden">
          <BrandMark size={26} />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">Gestor</span>
        </Link>

        <div className="w-full max-w-[360px]">
          <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Criar sua conta</h2>
          <p className="mt-1 text-xs text-muted-foreground">Comece a cobrar no automático hoje.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs">Nome</Label>
              <Input id="name" placeholder="Seu nome" className="h-10" {...register("name")} />
              {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">E-mail</Label>
              <Input id="email" type="email" placeholder="seu@email.com" className="h-10" {...register("email")} />
              {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Mínimo 6 caracteres"
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

            <div className="flex items-start gap-2">
              <Checkbox
                id="terms"
                checked={watch("terms")}
                onCheckedChange={(checked) => setValue("terms", checked as boolean, { shouldValidate: true })}
                className="mt-0.5"
              />
              <Label htmlFor="terms" className="text-xs font-normal leading-snug text-muted-foreground">
                Li e aceito os{" "}
                <Link href="/termos" className="font-medium text-interactive hover:underline">termos de uso</Link>
                {" "}e a{" "}
                <Link href="/privacidade" className="font-medium text-interactive hover:underline">política de privacidade</Link>.
              </Label>
            </div>
            {errors.terms && <p className="text-xs text-danger">{errors.terms.message}</p>}

            <div>
              <Button type="submit" className="h-10 w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando conta…
                  </>
                ) : (
                  "Criar conta"
                )}
              </Button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">7 dias grátis · sem cartão</p>
            </div>
          </form>

          <div className="mt-5 border-t border-border pt-4 text-center text-xs text-muted-foreground">
            Já tem uma conta?{" "}
            <Link href="/login" className="font-medium text-interactive hover:underline">Entrar</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

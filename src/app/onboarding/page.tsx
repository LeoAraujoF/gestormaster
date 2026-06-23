"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Phone, Building2, FileText, CheckCircle2 } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { phoneMask, cpfCnpjMask } from "@/lib/utils"

const onboardingSchema = z.object({
  whatsapp: z.string().min(10, { message: "WhatsApp inválido" }),
  document: z.string().optional(),
  company_name: z.string().min(2, { message: "O nome da empresa deve ter pelo menos 2 caracteres" }),
})

type OnboardingForm = z.infer<typeof onboardingSchema>

export default function OnboardingPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<OnboardingForm>({
    resolver: zodResolver(onboardingSchema),
  })

  // Assistir mudanças para aplicar máscaras
  const whatsappValue = watch("whatsapp")
  const documentValue = watch("document")

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue("whatsapp", phoneMask(e.target.value), { shouldValidate: true })
  }

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue("document", cpfCnpjMask(e.target.value), { shouldValidate: true })
  }

  const onSubmit = async (data: OnboardingForm) => {
    setIsLoading(true)
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        toast.error("Usuário não autenticado")
        router.push("/login")
        return
      }

      // Atualiza o user_metadata no Supabase Auth
      const { error } = await supabase.auth.updateUser({
        data: {
          whatsapp: data.whatsapp.replace(/\D/g, ''), // Salva apenas números
          document: data.document ? data.document.replace(/\D/g, '') : null,
          company_name: data.company_name,
          onboarding_completed: true
        }
      })

      if (error) {
        toast.error(error.message)
        return
      }

      toast.success("Tudo pronto! Bem-vindo ao Gestor Master.")
      window.location.href = "/planos"
    } catch (err) {
      toast.error("Ocorreu um erro inesperado.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-500">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-xl shadow-zinc-200/20 dark:shadow-black/40">
          
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mb-6">
              <CheckCircle2 className="w-8 h-8 text-sky-500" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Quase lá!
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-2 text-sm">
              Para configurar o seu espaço de trabalho e as suas faturas, precisamos de mais alguns dados do seu negócio.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="whatsapp" className="text-zinc-700 dark:text-zinc-300">
                WhatsApp com DDI (Ex: +55)
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="whatsapp"
                  placeholder="+55 (11) 99999-9999"
                  className="pl-9 h-11"
                  {...register("whatsapp")}
                  onChange={handlePhoneChange}
                />
              </div>
              {errors.whatsapp && (
                <p className="text-sm text-destructive">{errors.whatsapp.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="document" className="text-zinc-700 dark:text-zinc-300">
                CPF ou CNPJ (Opcional)
              </Label>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="document"
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                  className="pl-9 h-11"
                  {...register("document")}
                  onChange={handleDocumentChange}
                />
              </div>
              {errors.document && (
                <p className="text-sm text-destructive">{errors.document.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="company_name" className="text-zinc-700 dark:text-zinc-300">
                Nome da Empresa ou Negócio
              </Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="company_name"
                  placeholder="Ex: Gestor Master Solutions"
                  className="pl-9 h-11"
                  {...register("company_name")}
                />
              </div>
              {errors.company_name && (
                <p className="text-sm text-destructive">{errors.company_name.message}</p>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full h-11 mt-4 bg-sky-600 hover:bg-sky-700 text-white shadow-lg shadow-sky-600/20" 
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                "Concluir Configuração"
              )}
            </Button>
          </form>
          
        </div>
      </div>
    </div>
  )
}

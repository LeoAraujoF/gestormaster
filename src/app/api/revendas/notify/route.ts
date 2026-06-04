import { NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || "YOUR_GLOBAL_APIKEY" 
const INSTANCE_NAME = "GestorMaster" 

// Cliente admin para salvar no banco ignorando RLS publico
const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: Request) {
  try {
    const { requestId, newStatus, actionType } = await request.json()

    if (!requestId || !newStatus) {
      return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 })
    }

    // 1. Buscar dados primeiro
    const { data: requestData, error: fetchErr } = await supabaseAdmin
      .from("credit_requests")
      .select("*, resellers(*)")
      .eq("id", requestId)
      .single()

    if (fetchErr || !requestData) throw fetchErr || new Error("Solicitação não encontrada")

    const reseller = requestData.resellers

    // Verificação de Segurança (RLS MANUAL)
    if (newStatus === "completed") {
      const cookieStore = await cookies()
      const supabaseUser = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() { return cookieStore.getAll() },
            setAll(cookiesToSet) {} // API route, can't set easily, just for checking
          }
        }
      )
      
      const { data: { user } } = await supabaseUser.auth.getUser()
      
      if (!user || user.id !== reseller.user_id) {
        return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
      }
    }

    // 2. Atualizar no banco
    const { error: updateErr } = await supabaseAdmin
      .from("credit_requests")
      .update({ status: newStatus })
      .eq("id", requestId)

    if (updateErr) throw updateErr

    // 2. Notificar via Evolution API
    if (actionType === "notify_gestor_payment") {
      // Buscar numero do gestor nas configs
      const { data: config } = await supabaseAdmin
        .from("revenda_settings")
        .select("notification_number")
        .eq("user_id", reseller.user_id)
        .single()

      const gestorNumber = config?.notification_number

      if (gestorNumber && EVOLUTION_API_URL) {
        const message = `💰 *Pagamento de Revenda*\nO revendedor *${reseller.name}* acaba de confirmar o pagamento de *${requestData.credits_amount}x créditos* para o serviço *${requestData.service_name}*.\n\nValor: R$ ${requestData.total_value}\n\nAcesse o Gestor para liberar o crédito!`
        
        await fetch(`${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": EVOLUTION_API_KEY
          },
          body: JSON.stringify({
            number: gestorNumber,
            text: message,
            options: { delay: 1200, presence: "composing" },
            textMessage: { text: message }
          })
        }).catch(err => console.log("Erro na API Evolution:", err))
      }
    } else if (actionType === "notify_reseller_completed") {
      // Enviar comprovante para o revendedor
      const resellerNumber = reseller.whatsapp

      if (resellerNumber && EVOLUTION_API_URL) {
        const message = `✅ *Créditos Liberados!*\nOlá *${reseller.name}*, sua recarga foi concluída com sucesso.\n\n*Serviço:* ${requestData.service_name}\n*Quantidade:* ${requestData.credits_amount} créditos\n*Valor Pago:* R$ ${requestData.total_value}\n\nSeus créditos já estão disponíveis para uso! 🚀`
        
        await fetch(`${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": EVOLUTION_API_KEY
          },
          body: JSON.stringify({
            number: resellerNumber,
            text: message,
            options: { delay: 1200, presence: "composing" },
            textMessage: { text: message }
          })
        }).catch(err => console.log("Erro na API Evolution:", err))
      }
    }

    return NextResponse.json({ success: true, data: requestData })
  } catch (error: any) {
    console.error("Erro na rota de notificação:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

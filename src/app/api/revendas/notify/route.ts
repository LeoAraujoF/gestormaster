import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/service-role"

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || "YOUR_GLOBAL_APIKEY"
const INSTANCE_NAME = "GestorMaster"

export async function POST(request: Request) {
  try {
    const { requestId, actionType } = await request.json()
    const accessToken = request.headers.get('x-reseller-access-token')

    if (!requestId || !actionType) {
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

    if (actionType === 'notify_gestor_payment') {
      // A área pública pode apenas informar que o pagamento foi realizado.
      // Ela não confirma pagamento nem altera o estado financeiro do pedido.
      const { data: authorizedReseller } = await supabaseAdmin
        .from('resellers')
        .select('id')
        .eq('id', reseller.id)
        .eq('public_token', accessToken || '')
        .maybeSingle()

      if (!authorizedReseller || requestData.status !== 'pending_payment') {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
      }
    } else if (actionType === 'notify_reseller_completed') {
      // Apenas o gestor dono do revendedor pode liberar créditos.
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.id !== reseller.user_id) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
      }

      if (!['pending_payment', 'paid'].includes(requestData.status)) {
        return NextResponse.json({ error: 'Transição de status inválida' }, { status: 409 })
      }

      const { error: updateErr } = await supabaseAdmin
        .from('credit_requests')
        .update({ status: 'completed' })
        .eq('id', requestId)
        .in('status', ['pending_payment', 'paid'])

      if (updateErr) throw updateErr
    } else {
      return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
    }

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
        const message = `💰 *Pagamento de Revenda*\nO revendedor *${reseller.name}* acaba de confirmar o pagamento de *${requestData.credits_amount}x créditos* para o serviço *${requestData.service_name}*.\n\nValor: R$ ${requestData.total_value}\n\nAcesse a Lembrado para liberar o crédito!`

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

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Erro na rota de notificação:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit"

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || "YOUR_GLOBAL_APIKEY"
const INSTANCE_NAME = "GestorMaster"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: Request) {
  try {
    // Rota pública (sem login) que grava no banco e dispara WhatsApp — limita abuso por IP.
    const rl = await rateLimit(`revendas:checkout:${getClientIp(request)}`, 10, 60, { failOpen: false })
    if (rl.unavailable) {
      return NextResponse.json({ error: 'Serviço temporariamente indisponível' }, { status: 503 })
    }
    if (!rl.ok) return tooManyRequests()

    const { resellerId, serviceId, creditsAmount } = await request.json()
    const token = request.headers.get('x-reseller-access-token')

    if (
      !resellerId ||
      !serviceId ||
      !token ||
      !Number.isSafeInteger(creditsAmount) ||
      creditsAmount < 1 ||
      creditsAmount > 1000
    ) {
      return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 })
    }

    // O token do link é uma capacidade aleatória emitida pelo gestor. O ID
    // isolado nunca concede acesso ao fluxo público.
    const { data: reseller, error: resellerErr } = await supabaseAdmin
      .from('resellers')
      .select('id')
      .eq('id', resellerId)
      .eq('public_token', token)
      .maybeSingle()

    if (resellerErr || !reseller) {
      return NextResponse.json({ error: 'Link de acesso inválido' }, { status: 403 })
    }

    // 1. Buscar o serviço e o revendedor
    const { data: service, error: srvErr } = await supabaseAdmin
      .from("reseller_services")
      .select("*, resellers(user_id, name)")
      .eq("id", serviceId)
      .eq("reseller_id", resellerId)
      .single()

    if (srvErr || !service) {
      return NextResponse.json({ error: "Serviço não encontrado" }, { status: 404 })
    }

    // 2. Calcular valores seguros no backend
    const baseCost = Number(service.base_price) * creditsAmount
    const netProfit = Number(service.profit_margin) * creditsAmount
    const totalValue = baseCost + netProfit

    // 3. Criar a solicitação de crédito
    const { data: newRequest, error: insertErr } = await supabaseAdmin
      .from("credit_requests")
      .insert({
        reseller_id: resellerId,
        service_name: service.service_name,
        credits_amount: creditsAmount,
        total_value: totalValue,
        base_cost: baseCost,
        net_profit: netProfit,
        status: "pending_payment"
      })
      .select()
      .single()

    if (insertErr || !newRequest) throw insertErr || new Error("Erro ao criar pedido")

    // Notificar Gestor sobre o novo pedido pendente
    const resellerName = service.resellers?.name || "Desconhecido"
    const { data: config } = await supabaseAdmin
      .from("revenda_settings")
      .select("notification_number")
      .eq("user_id", service.resellers?.user_id)
      .single()

    const gestorNumber = config?.notification_number

    if (gestorNumber && EVOLUTION_API_URL) {
      const message = `🔔 *Novo Pedido de Revenda*\nO revendedor *${resellerName}* acabou de gerar um pedido de *${creditsAmount}x créditos* para o serviço *${service.service_name}*.\n\nValor: R$ ${totalValue}\nStatus: Aguardando Pagamento (PIX).`

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

    return NextResponse.json({ success: true, data: newRequest })
  } catch (error: any) {
    console.error("Erro no checkout:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

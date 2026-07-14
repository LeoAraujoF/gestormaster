import { NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/service-role"
import { getIpFromRequest } from "@/lib/audit"
import { logAudit } from "@/lib/audit"

export async function POST(req: Request) {
  try {
    const { amount, pixKey } = await req.json()

    if (!amount || amount <= 0 || !pixKey) {
      return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 })
    }

    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Sessão inválida" }, { status: 401 })
    }

    // Calcular saldo disponível
    const { data: earnings, error: earningsErr } = await supabaseAdmin
      .from('affiliate_earnings')
      .select('amount, status')
      .eq('referrer_id', user.id)

    if (earningsErr) throw earningsErr

    let disponivel = 0
    earnings?.forEach(e => {
      if (e.status === 'available') disponivel += Number(e.amount)
      // Withdrawals are saved as negative 'paid' amounts, so we sum them too
      if (e.status === 'paid' && Number(e.amount) < 0) disponivel += Number(e.amount)
    })

    if (disponivel < amount) {
      return NextResponse.json({ error: "Saldo insuficiente." }, { status: 400 })
    }

    // Insere o pedido de saque
    const { error: reqError } = await supabaseAdmin
      .from('withdrawal_requests')
      .insert({
        user_id: user.id,
        amount: amount,
        pix_key: pixKey,
        status: 'pending'
      })

    if (reqError) throw reqError

    // Insere a dedução no extrato como "Pendente de Pagamento"
    const { error: earnError } = await supabaseAdmin
      .from('affiliate_earnings')
      .insert({
        referrer_id: user.id,
        referred_user_id: user.id, // self ref para saques
        amount: -amount,
        status: 'pending', // Fica pending até o admin pagar o PIX
        payment_id: 'withdrawal_' + Date.now()
      })

    if (earnError) throw earnError

    // Log
    await logAudit({
      user_id: user.id,
      action: 'affiliate.withdrawal_request',
      resource: 'withdrawal_requests',
      details: { amount, pixKey },
      ip_address: getIpFromRequest(req)
    })

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error("Erro no saque:", error)
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 })
  }
}

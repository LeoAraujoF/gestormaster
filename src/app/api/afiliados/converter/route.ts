import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { getIpFromRequest } from "@/lib/audit"
import { logAudit } from "@/lib/audit-server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MONTHLY_COST = 20.00

export async function POST(req: Request) {
  try {
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
      if (e.status === 'paid' && Number(e.amount) < 0) disponivel += Number(e.amount)
    })

    if (disponivel < MONTHLY_COST) {
      return NextResponse.json({ error: "Saldo insuficiente. Você precisa de R$ 20,00." }, { status: 400 })
    }

    // Pega os dados do usuário para ver o vencimento
    const { data: { user: adminUser }, error: userError } = await supabaseAdmin.auth.admin.getUserById(user.id)

    if (userError || !adminUser) throw userError

    const userData = adminUser.user_metadata || {}

    // Calcula a nova data
    const now = new Date()
    let currentExpires = userData.plan_expires_at ? new Date(userData.plan_expires_at) : now
    
    if (currentExpires < now) {
      currentExpires = now
    }
    
    currentExpires.setDate(currentExpires.getDate() + 30)

    // Insere a dedução no extrato como "Pago" instantaneamente
    const { error: earnError } = await supabaseAdmin
      .from('affiliate_earnings')
      .insert({
        referrer_id: user.id,
        referred_user_id: user.id,
        amount: -MONTHLY_COST,
        status: 'paid', // Consumido na hora
        payment_id: 'conversion_' + Date.now()
      })

    if (earnError) throw earnError

    // Atualiza o vencimento do plano no metadata
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...userData,
        plan_expires_at: currentExpires.toISOString(),
        has_active_subscription: true,
        plan_name: "Gestor Pro"
      }
    })
    
    // Atualiza também a tabela pública para garantir a sincronia
    await supabaseAdmin.from('users').update({
      plan_expires_at: currentExpires.toISOString(),
      has_active_subscription: true,
      plan_name: "Gestor Pro"
    }).eq('id', user.id)

    if (updateError) {
      // Tentar reverter a dedução se der erro (ou aceitar inconsistência temporária)
      throw updateError
    }

    // Log
    await logAudit({
      user_id: user.id,
      action: 'affiliate.convert_to_plan',
      resource: 'users',
      details: { amount_deducted: MONTHLY_COST, new_expires_at: currentExpires.toISOString() },
      ip_address: getIpFromRequest(req)
    })

    return NextResponse.json({ success: true, newExpires: currentExpires.toISOString() })

  } catch (error: any) {
    console.error("Erro na conversão:", error)
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 })
  }
}

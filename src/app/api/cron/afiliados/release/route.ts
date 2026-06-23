import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { logAudit } from "@/lib/audit-server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Dias de carência antes de liberar o saldo (Garantia incondicional padrão do CDC é 7 dias)
const HOLD_DAYS = 7

export async function GET(req: Request) {
  try {
    // Autenticação básica para proteger a rota do cron
    // Recomenda-se passar um header Authorization: Bearer CRON_SECRET nas configurações do seu Cron
    const authHeader = req.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
       return NextResponse.json({ error: "Não autorizado." }, { status: 401 })
    }

    // Calcula a data limite: tudo que foi criado antes de (Hoje - HOLD_DAYS)
    const releaseDate = new Date()
    releaseDate.setDate(releaseDate.getDate() - HOLD_DAYS)

    console.log(`[Cron] Buscando comissões pendentes criadas antes de: ${releaseDate.toISOString()}`)

    // Busca comissões pendentes e antigas
    const { data: pendingEarnings, error: searchError } = await supabaseAdmin
      .from('affiliate_earnings')
      .select('id, amount, referrer_id')
      .eq('status', 'pending')
      .lte('created_at', releaseDate.toISOString())

    if (searchError) throw searchError

    if (!pendingEarnings || pendingEarnings.length === 0) {
      return NextResponse.json({ message: "Nenhuma comissão pendente para liberar hoje." })
    }

    const idsToRelease = pendingEarnings.map(e => e.id)

    // Atualiza para available
    const { error: updateError } = await supabaseAdmin
      .from('affiliate_earnings')
      .update({ status: 'available' })
      .in('id', idsToRelease)

    if (updateError) throw updateError

    // Log the cron execution
    await logAudit({
      user_id: null,
      action: 'system.cron_release_earnings',
      resource: 'affiliate_earnings',
      details: { count: idsToRelease.length, threshold_date: releaseDate.toISOString() },
      ip_address: "127.0.0.1"
    })

    return NextResponse.json({ 
      success: true, 
      message: `${idsToRelease.length} comissões foram liberadas.`,
      released_ids: idsToRelease
    })

  } catch (error: any) {
    console.error("Erro no cron de liberação de comissões:", error)
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 })
  }
}

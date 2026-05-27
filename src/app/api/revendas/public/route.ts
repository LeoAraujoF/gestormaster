import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "ID não fornecido" }, { status: 400 })
    }

    // Buscar revendedor
    const { data: reseller, error: resErr } = await supabaseAdmin
      .from("resellers")
      .select("id, name, whatsapp, user_id, current_debt")
      .eq("id", id)
      .single()

    if (resErr || !reseller) throw resErr || new Error("Revendedor não encontrado")

    // Buscar PIX key
    let pixData = null
    if (reseller.user_id) {
      const { data: settings } = await supabaseAdmin
        .from("revenda_settings")
        .select("pix_key, pix_type")
        .eq("user_id", reseller.user_id)
        .single()
      
      if (settings?.pix_key) {
        pixData = { key: settings.pix_key, type: settings.pix_type || 'PIX' }
      }
    }

    // Buscar Serviços do revendedor
    const { data: services, error: srvErr } = await supabaseAdmin
      .from("reseller_services")
      .select("id, service_name, base_price, profit_margin")
      .eq("reseller_id", id)
      .order("service_name")

    if (srvErr) throw srvErr

    // Buscar solicitações de crédito pendentes do revendedor (para mostrar histórico local)
    const { data: pendingRequests, error: reqErr } = await supabaseAdmin
      .from("credit_requests")
      .select("id, service_name, credits_amount, total_value, status, created_at")
      .eq("reseller_id", id)
      .in("status", ["pending_payment", "paid"])
      .order("created_at", { ascending: false })
      .limit(10)

    if (reqErr) throw reqErr

    return NextResponse.json({
      success: true,
      data: {
        reseller,
        gestorPix: pixData,
        services: services || [],
        pendingRequests: pendingRequests || []
      }
    })
  } catch (error: any) {
    console.error("Erro na rota pública:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

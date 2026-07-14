import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(request: Request) {
  try {
    // Rota pública (sem login) — limita enumeração de revendedores por IP.
    const rl = await rateLimit(`revendas:public:${getClientIp(request)}`, 60, 60, { failOpen: false })
    if (rl.unavailable) {
      return NextResponse.json({ error: 'Serviço temporariamente indisponível' }, { status: 503 })
    }
    if (!rl.ok) return tooManyRequests()

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    const token = searchParams.get("token")

    if (!id || !token) {
      return NextResponse.json({ error: "Link de acesso inválido" }, { status: 400 })
    }

    // Buscar revendedor
    const { data: reseller, error: resErr } = await supabaseAdmin
      .from("resellers")
      .select("id, name, user_id")
      .eq("id", id)
      .eq("public_token", token)
      .single()

    if (resErr || !reseller) {
      return NextResponse.json({ error: "Link de acesso inválido" }, { status: 404 })
    }

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
        // A margem é informação interna do gestor. A área pública recebe
        // somente o preço final por crédito.
        services: (services || []).map((service) => ({
          id: service.id,
          service_name: service.service_name,
          unit_price: Number(service.base_price) + Number(service.profit_margin),
        })),
        pendingRequests: pendingRequests || []
      }
    })
  } catch (error: any) {
    console.error("Erro na rota pública:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

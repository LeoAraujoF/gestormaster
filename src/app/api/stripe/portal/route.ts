import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Stripe from "stripe"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !user.email) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error("STRIPE_SECRET_KEY is missing in .env.local")
      return new NextResponse("Stripe configuration error", { status: 500 })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-04-22.dahlia", // Matching the installed SDK type strictness
    })

    // Como o ID do cliente da Stripe não é salvo no banco nativamente (apenas no Webhook de sucesso),
    // vamos buscar o cliente pelo email que ele usa no sistema (que é o mesmo que ele usou no Checkout)
    const customers = await stripe.customers.list({
      email: user.email,
      limit: 1,
    })

    if (customers.data.length === 0) {
      return new NextResponse("Nenhuma assinatura encontrada para este e-mail.", { status: 404 })
    }

    const customerId = customers.data[0].id

    const origin = request.headers.get("origin") || "http://localhost:3000"

    // Criar a sessão do Portal do Cliente
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/minha-conta`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error("Stripe Portal Error:", err)
    return new NextResponse(err.message, { status: err.statusCode || 500 })
  }
}

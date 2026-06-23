import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Stripe from "stripe"
import { logAudit, getIpFromRequest } from '@/lib/audit'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error("STRIPE_SECRET_KEY is missing in .env.local")
      return new NextResponse("Stripe configuration error", { status: 500 })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-04-22.dahlia", // Matching the installed SDK type strictness
    })

    const body = await request.json()
    // Recebe o priceId e o nome do plano do frontend para gerar o Checkout dinamicamente
    const { priceId, planName } = body

    if (!priceId) {
      return new NextResponse("Price ID is required", { status: 400 })
    }

    const origin = request.headers.get("origin") || "http://localhost:3000"

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"], // Apenas cartão (PIX será migrado para PIXGO)
      customer_email: user.email,
      line_items: [
        {
          price: priceId, // Aqui usamos o ID oficial que você criou na Stripe
          quantity: 1,
        },
      ],
      mode: "subscription", // Oficialmente mudamos para uma cobrança de Assinatura Recorrente
      success_url: `${origin}/minha-conta?success=true`,
      cancel_url: `${origin}/minha-conta?canceled=true`,
      client_reference_id: user.id, // ID oficial do Supabase para o Webhook ler com facilidade
      metadata: {
        userId: user.id, 
        planName: planName || "Desconhecido"
      }
    })

    await logAudit({
      user_id: user.id,
      action: 'stripe.checkout',
      resource: 'payments',
      resource_id: session.id,
      details: { plan: planName || 'Desconhecido', priceId },
      ip_address: getIpFromRequest(request)
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error("Stripe Checkout Error:", err)
    return new NextResponse(err.message, { status: err.statusCode || 500 })
  }
}

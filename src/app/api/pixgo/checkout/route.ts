import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    if (!process.env.PIXGO_API_KEY) {
      console.error("PIXGO_API_KEY is missing in .env.local")
      return new NextResponse("PIXGO configuration error", { status: 500 })
    }

    const body = await request.json()
    // Recebemos o valor do plano e uma descrição curta do front-end
    const { amount, planName } = body

    if (!amount || !planName) {
      return new NextResponse("Amount and Plan Name are required", { status: 400 })
    }

    // Preparar carga de dados (Payload) para a PIXGO
    const pixgoPayload = {
      amount: Number(amount),
      description: `Assinatura Gestor Master - ${planName}`,
      customer_name: user.user_metadata?.full_name || "Cliente Gestor",
      customer_email: user.email,
      external_id: user.id // Super Importante: Passamos o ID do Supabase para achar no Webhook depois!
    }

    // Faz a chamada para a PIXGO
    const pixgoReq = await fetch("https://pixgo.org/api/v1/payment/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.PIXGO_API_KEY
      },
      body: JSON.stringify(pixgoPayload)
    })

    const pixgoRes = await pixgoReq.json()

    if (!pixgoReq.ok || !pixgoRes.success) {
      console.error("PIXGO Error:", pixgoRes)
      return new NextResponse(pixgoRes.message || "Erro na geração do PIX", { status: 400 })
    }

    // Devolvemos o QR Code e o Link da Imagem para o nosso site
    return NextResponse.json({ 
      qr_code: pixgoRes.data.qr_code,
      qr_image_url: pixgoRes.data.qr_image_url,
      payment_id: pixgoRes.data.payment_id
    })

  } catch (err: any) {
    console.error("PIXGO Checkout Error:", err)
    return new NextResponse(err.message || "Internal Error", { status: 500 })
  }
}

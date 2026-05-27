import { NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@supabase/supabase-js"

export async function POST(request: Request) {
  try {
    const WEBHOOK_SECRET = process.env.PIXGO_WEBHOOK_SECRET

    if (!WEBHOOK_SECRET) {
      console.error("PIXGO_WEBHOOK_SECRET is missing in .env.local")
      return new NextResponse("Webhook Secret não configurado", { status: 500 })
    }

    const timestamp = request.headers.get("x-webhook-timestamp")
    const signature = request.headers.get("x-webhook-signature")
    
    if (!timestamp || !signature) {
      return new NextResponse("Missing signature headers", { status: 400 })
    }

    // A PIXGO exige o body bruto (em texto) para bater a criptografia
    const payload = await request.text()

    // Montando a criptografia esperada: timestamp + "." + payload
    const signaturePayload = timestamp + "." + payload
    const expectedSignature = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(signaturePayload)
      .digest("hex")

    // Verificando a assinatura para ter certeza que veio da PIXGO
    if (expectedSignature !== signature) {
      console.error("Assinatura do Webhook PIXGO inválida!")
      return new NextResponse("Assinatura inválida", { status: 401 })
    }

    // Convertendo texto para JSON agora que sabemos que é seguro
    const data = JSON.parse(payload)

    if (data.event === "payment.completed") {
      const externalId = data.data.external_id // Este é o nosso user.id do Supabase
      const amount = data.data.amount
      const description = data.data.description || ""
      const planName = description.split(" - ")[1] || "PIX"

      if (!externalId) {
        console.error("PIX pago, mas sem external_id (não sabemos de quem é)")
        return new NextResponse("Missing external_id", { status: 400 })
      }

      // Inicializa o Supabase no modo Administrador (Service Role)
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      // Busca o usuário para verificar o vencimento atual
      const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(externalId)
      if (userError || !user) {
        console.error("Erro ao buscar usuário no Supabase", userError)
        return new NextResponse("User not found", { status: 400 })
      }

      const currentExpiresAt = user.user_metadata?.plan_expires_at
      let newExpiresAt = new Date()

      if (currentExpiresAt) {
        const expiresDate = new Date(currentExpiresAt)
        // Se ainda não venceu, soma em cima da data futura
        if (expiresDate > new Date()) {
          newExpiresAt = expiresDate
        }
      }

      // Adiciona 30 dias (1 mês)
      newExpiresAt.setDate(newExpiresAt.getDate() + 30)

      // Atualiza o perfil do cliente liberando o acesso e atualizando o vencimento
      const { error } = await supabaseAdmin.auth.admin.updateUserById(externalId, {
        user_metadata: {
          has_active_subscription: true,
          plan_name: planName,
          plan_expires_at: newExpiresAt.toISOString()
        }
      })

      if (error) {
        console.error("Erro ao atualizar o Supabase após PIX:", error)
        throw error
      }
      
      console.log(`[Webhook PIXGO] Acesso Liberado para o usuário: ${externalId}. Valor pago: R$ ${amount}`)
    } else {
      console.log(`[Webhook PIXGO] Evento ignorado: ${data.event}`)
    }

    return new NextResponse("Webhook recebido com sucesso", { status: 200 })

  } catch (err: any) {
    console.error("PIXGO Webhook processing error:", err)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}

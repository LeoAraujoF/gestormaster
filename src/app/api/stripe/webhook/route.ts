import { NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"

export async function POST(request: Request) {
  const payload = await request.text()
  const signature = request.headers.get("Stripe-Signature")

  if (!signature) {
    return new NextResponse("Missing stripe signature", { status: 400 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-04-22.dahlia",
  })

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err: any) {
    console.error("Webhook signature verification failed.", err.message)
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 })
  }

  // Inicializa o Supabase no modo Administrador (Service Role)
  // Isso permite alterar os metadados de um usuário passando por cima de regras de segurança front-end
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        
        const userId = session.client_reference_id
        if (!userId) {
          console.error("No client_reference_id found in session")
          break
        }

        const planName = session.metadata?.planName || "Desconhecido"

        // Busca o usuário para verificar o vencimento atual
        const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId)
        if (userError || !user) {
          console.error("Erro ao buscar usuário no Supabase", userError)
          break
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

        // Cliente pagou! Vamos colocar a tag de "has_active_subscription: true", gravar o nome do plano e atualizar o vencimento
        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: {
            has_active_subscription: true,
            plan_name: planName,
            plan_expires_at: newExpiresAt.toISOString()
          }
        })

        if (error) {
          console.error("Erro ao atualizar o Supabase após pagamento:", error)
          throw error
        }
        
        console.log(`[Webhook] Assinatura ativada com sucesso para o usuário: ${userId}`)
        break
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        // Para cancelar, precisaremos do ID do cliente no nosso banco.
        // Como o webhook de delete de subscription não traz o client_reference_id facilmente,
        // o ideal em cenários avançados é mapear o stripe_customer_id no banco.
        // Por enquanto, faremos o log para que você seja avisado.
        console.log("Assinatura cancelada na Stripe:", subscription.id)
        break
      }

      default:
        console.log(`Unhandled event type ${event.type}`)
    }

    return new NextResponse("Webhook recebido com sucesso", { status: 200 })
  } catch (err: any) {
    console.error("Stripe Webhook processing error:", err)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}

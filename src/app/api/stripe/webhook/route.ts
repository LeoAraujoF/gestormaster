import { NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"
import { logAudit, getIpFromRequest } from '@/lib/audit'

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
            ...user.user_metadata,
            has_active_subscription: true,
            plan_name: planName,
            plan_expires_at: newExpiresAt.toISOString(),
            stripe_customer_id: session.customer as string
          }
        })

        if (error) {
          console.error("Erro ao atualizar o Supabase após pagamento:", error)
          throw error
        }
        
        console.log(`[Webhook] Assinatura ativada com sucesso para o usuário: ${userId}`)

        // --- Lógica de Afiliados ---
        const referredBy = user.user_metadata?.referred_by;
        if (referredBy) {
          const amountTotal = session.amount_total ? session.amount_total / 100 : 0;
          const commissionAmount = amountTotal * 0.30; // 30% de comissão fixa

          if (commissionAmount > 0) {
            const { error: affiliateError } = await supabaseAdmin.from('affiliate_earnings').insert({
              referrer_id: referredBy,
              referred_user_id: userId,
              amount: commissionAmount,
              status: 'pending' // Pendente para análise de reembolso/chargeback
            });
            
            if (affiliateError) {
               console.error("Erro ao inserir comissão de afiliado:", affiliateError)
            } else {
               console.log(`[Webhook] Comissão de R$ ${commissionAmount} gerada para o afiliado ${referredBy}`)
            }
          }
        }

        await logAudit({
          user_id: userId,
          action: 'stripe.payment_success',
          resource: 'payments',
          resource_id: session.id,
          details: { event_type: 'checkout.session.completed', plan: planName },
          ip_address: getIpFromRequest(request)
        })

        break
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        if (!customerId) {
          console.error("No customer ID found in subscription")
          break
        }

        // Encontrar o usuário que possui esse stripe_customer_id
        const { data: usersData, error: searchError } = await supabaseAdmin.auth.admin.listUsers()
        if (searchError) {
           console.error("Erro ao buscar usuários para cancelamento:", searchError)
           break
        }
        
        const user = usersData.users.find(u => u.user_metadata?.stripe_customer_id === customerId)

        if (user) {
          // Atualiza o usuário para remover o plano ativo
          await supabaseAdmin.auth.admin.updateUserById(user.id, {
            user_metadata: {
              ...user.user_metadata,
              has_active_subscription: false
            }
          })
          console.log(`[Webhook] Assinatura cancelada processada para o usuário: ${user.id}`)

          await logAudit({
            user_id: user.id,
            action: 'stripe.subscription_cancelled',
            resource: 'payments',
            resource_id: subscription.id,
            details: { event_type: 'customer.subscription.deleted', customer_id: customerId },
            ip_address: getIpFromRequest(request)
          })
        } else {
          console.log("Assinatura cancelada, mas customer_id não foi encontrado nos metadados:", customerId)
        }
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

import { NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@supabase/supabase-js"
import { claimWebhookEvent, releaseWebhookEvent } from '@/lib/webhook-events'
import { upsertOrganizationEntitlementForUser } from '@/lib/entitlements'
import { getPlanById } from '@/lib/plan-catalog'

const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000

function parseTimestamp(timestamp: string): number | null {
  const numeric = Number(timestamp)
  const millis = Number.isFinite(numeric)
    ? (numeric < 1_000_000_000_000 ? numeric * 1000 : numeric)
    : Date.parse(timestamp)
  return Number.isFinite(millis) ? millis : null
}

function safeEqual(a: string, b: string): boolean {
  const value = Buffer.from(a, 'utf8')
  const expected = Buffer.from(b, 'utf8')
  return value.length === expected.length && crypto.timingSafeEqual(value, expected)
}

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

    const eventTime = parseTimestamp(timestamp)
    if (!eventTime || Math.abs(Date.now() - eventTime) > MAX_WEBHOOK_AGE_MS) {
      return new NextResponse('Webhook timestamp inválido ou expirado', { status: 401 })
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
    if (!safeEqual(expectedSignature, signature)) {
      console.error("Assinatura do Webhook PIXGO inválida!")
      return new NextResponse("Assinatura inválida", { status: 401 })
    }

    // Convertendo texto para JSON agora que sabemos que é seguro
    const data = JSON.parse(payload)

    if (data.event === "payment.completed") {
      const eventId = String(data.id || data.event_id || data.data?.id || data.data?.payment_id || '')
      if (!eventId) {
        return new NextResponse('Evento de pagamento sem identificador', { status: 400 })
      }

      const claimed = await claimWebhookEvent('pixgo', eventId)
      if (!claimed) return new NextResponse('Evento já processado', { status: 200 })

      try {
      const externalReference = String(data.data.external_id || '')
      const [externalId, requestedPlanId = 'pro'] = externalReference.split(':')
      const plan = await getPlanById(requestedPlanId)
      const amount = Number(data.data.amount)

      if (!externalId || !plan?.isPurchasable || plan.monthlyPriceCents == null) {
        console.error("PIX pago, mas sem external_id (não sabemos de quem é)")
        return new NextResponse("Missing external_id", { status: 400 })
      }
      if (Math.round(amount * 100) !== plan.monthlyPriceCents) throw new Error('Valor do PIX diverge do catálogo')

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

      // Atualiza o perfil do cliente liberando o acesso e atualizando o vencimento.
      // has_active_subscription vai em app_metadata (só o servidor grava); preservamos as chaves
      // existentes (provider/providers) com o spread para não quebrar o login.
      const { error } = await supabaseAdmin.auth.admin.updateUserById(externalId, {
        app_metadata: {
          ...user.app_metadata,
          has_active_subscription: true,
          pixgo_last_event_id: eventId,
        },
        user_metadata: {
          ...user.user_metadata,
          plan_name: plan.name,
          plan_expires_at: newExpiresAt.toISOString()
        }
      })

      if (error) {
        console.error("Erro ao atualizar o Supabase após PIX:", error)
        throw error
      }
      await upsertOrganizationEntitlementForUser({
        userId: externalId,
        planName: plan.id,
        active: true,
        source: 'pixgo',
        expiresAt: newExpiresAt.toISOString(),
      })

      console.log(`[Webhook PIXGO] Acesso Liberado para o usuário: ${externalId}. Valor pago: R$ ${amount}`)
      } catch (error) {
        await releaseWebhookEvent('pixgo', eventId)
        throw error
      }
    } else {
      console.log(`[Webhook PIXGO] Evento ignorado: ${data.event}`)
    }

    return new NextResponse("Webhook recebido com sucesso", { status: 200 })

  } catch (err: any) {
    console.error("PIXGO Webhook processing error:", err)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}

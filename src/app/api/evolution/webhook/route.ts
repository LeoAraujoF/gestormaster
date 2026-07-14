import crypto from 'crypto'
import { NextResponse } from 'next/server'

import { SecretsManager } from '@/lib/encryption'
import { verifyEvolutionWebhookSignature } from '@/lib/evolution-webhook-signature'
import { webhookQueue } from '@/lib/queue'
import { supabaseAdmin } from '@/lib/supabase/service-role'

const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export async function POST(request: Request) {
  try {
    const headers = request.headers
    if (Number(headers.get('content-length') || '0') > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload muito grande' }, { status: 413 })
    }

    // Tokens em query strings podem vazar para logs. Aceite-os somente em headers.
    const authorization = headers.get('authorization') || ''
    const token = headers.get('x-webhook-token') || authorization.replace(/^Bearer\s+/i, '')
    const environmentSecrets = (process.env.WEBHOOK_SECRETS || process.env.WEBHOOK_SECRET || '')
      .split(',')
      .map((secret) => secret.trim())
      .filter(Boolean)
    const hasValidToken = environmentSecrets.some((secret) => safeEqual(token, secret))

    if (environmentSecrets.length > 0 && !hasValidToken) {
      console.warn('[WEBHOOK] Callback bloqueado por token inválido')
      return NextResponse.json({ error: 'Unauthorized token' }, { status: 401 })
    }

    const rawBody = await request.text()
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload muito grande' }, { status: 413 })
    }
    const payload: unknown = JSON.parse(rawBody)

    let requiresSignature = false
    try {
      const { data: settings, error: settingsError } = await supabaseAdmin
        .from('security_settings')
        .select('hmac_secret,hmac_previous_secret,hmac_previous_valid_until,require_signature')
        .limit(1)
        .single()
      if (settingsError) throw settingsError

      requiresSignature = Boolean(settings?.require_signature)
      if (requiresSignature) {
        if (!settings?.hmac_secret) {
          return NextResponse.json({ error: 'Webhook não configurado' }, { status: 503 })
        }

        const incomingSignature = headers.get('x-hmac-signature')
          || headers.get('x-hub-signature-256')
          || headers.get('x-signature')
          || headers.get('apikey')
          || headers.get('x-webhook-secret')
        if (!incomingSignature) {
          return NextResponse.json({ error: 'Missing webhook secret' }, { status: 401 })
        }

        const acceptedSecrets = [SecretsManager.decrypt(settings.hmac_secret)]
        const previousValidUntil = settings.hmac_previous_valid_until
          ? new Date(settings.hmac_previous_valid_until).getTime()
          : Number.NaN
        if (
          settings.hmac_previous_secret
          && Number.isFinite(previousValidUntil)
          && previousValidUntil > Date.now()
        ) {
          acceptedSecrets.push(SecretsManager.decrypt(settings.hmac_previous_secret))
        }

        if (!verifyEvolutionWebhookSignature(incomingSignature, rawBody, acceptedSecrets)) {
          console.warn('[WEBHOOK] Callback bloqueado por assinatura inválida')
          return NextResponse.json({ error: 'Invalid webhook secret/signature' }, { status: 401 })
        }
      }
    } catch (error) {
      // Falhe fechado quando nenhuma credencial alternativa de ambiente protege o endpoint.
      console.error('[WEBHOOK] Falha ao validar a configuração HMAC:', error)
      if (environmentSecrets.length === 0) {
        return NextResponse.json({ error: 'Webhook não configurado' }, { status: 503 })
      }
    }

    if (environmentSecrets.length === 0 && !requiresSignature) {
      return NextResponse.json({ error: 'Webhook não configurado' }, { status: 503 })
    }

    const event = payload && typeof payload === 'object' && 'event' in payload
      ? String((payload as { event?: unknown }).event || '')
      : ''
    await webhookQueue.add('evolution-webhook', payload, {
      priority: event === 'CONNECTION_UPDATE' ? 1 : 2,
    })

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[WEBHOOK] Falha ao processar callback:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

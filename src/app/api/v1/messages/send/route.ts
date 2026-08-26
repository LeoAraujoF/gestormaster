import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { messageQueue } from '@/lib/queue'
import crypto from 'crypto'
import { redisConnection } from '@/lib/redis'
import { organizationHasCapability } from '@/lib/plan-catalog'
import { normalizeWhatsAppNumber } from '@/lib/phone'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Throttling configuration
const MAX_REQUESTS_PER_MINUTE = 60

export async function POST(request: Request) {
  try {
    // 1. Extração do Token
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Token de Autenticação ausente ou inválido.' }, { status: 401 })
    }

    const plainToken = authHeader.split(' ')[1]

    // 2. Validação Criptográfica e Busca no Banco
    const hash = crypto.createHash('sha256').update(plainToken).digest('hex')

    const { data: apiKeyData, error: apiError } = await supabaseAdmin
      .from('api_keys')
      .select('id, organization_id, user_id')
      .eq('key_hash', hash)
      .single()

    if (apiError || !apiKeyData) {
      // Retarda a resposta em 500ms para evitar ataques de timing/brute force
      await new Promise(resolve => setTimeout(resolve, 500))
      return NextResponse.json({ error: 'Chave de API inválida ou revogada.' }, { status: 401 })
    }

    const orgId = apiKeyData.organization_id
    if (!orgId || !apiKeyData.user_id) {
      return NextResponse.json({ error: 'Chave de API inválida ou revogada.' }, { status: 401 })
    }
    if (!(await organizationHasCapability(orgId, 'developer_api'))) {
      return NextResponse.json({ error: 'A API está disponível somente no plano Master.' }, { status: 403 })
    }

    // 3. Rate Limiting (Throttling) via Redis
    try {
      const rateLimitKey = `rate_limit:api:${orgId}`
      const currentRequests = await redisConnection.incr(rateLimitKey)

      if (currentRequests === 1) {
        await redisConnection.expire(rateLimitKey, 60) // Reseta após 60 segundos
      }

      if (currentRequests > MAX_REQUESTS_PER_MINUTE) {
        return NextResponse.json({
          error: 'Limite de requisições excedido (Too Many Requests).',
          retry_after: 60
        }, { status: 429 })
      }
    } catch (redisError) {
      console.error("Redis indisponível para throttling da API.", redisError)
      return NextResponse.json({ error: 'Serviço temporariamente indisponível.' }, { status: 503 })
    }

    // 4. Validação de Payload
    const body = await request.json()
    const { phone, message, media_url, instance_id } = body

    if (instance_id !== undefined && instance_id !== null && (typeof instance_id !== 'string' || !UUID_PATTERN.test(instance_id))) {
      return NextResponse.json({ error: 'instance_id deve ser um UUID.' }, { status: 400 })
    }

    if (typeof phone !== 'string' || typeof message !== 'string' || !phone || !message || message.length > 4_000) {
      return NextResponse.json({ error: 'Os campos "phone" e "message" são obrigatórios.' }, { status: 400 })
    }

    if (media_url && (typeof media_url !== 'string' || !/^https:\/\//i.test(media_url) || media_url.length > 2_000)) {
      return NextResponse.json({ error: 'media_url deve ser uma URL HTTPS válida.' }, { status: 400 })
    }

    const cleanPhone = normalizeWhatsAppNumber(phone)
    if (!cleanPhone) {
      return NextResponse.json({ error: 'Número de telefone inválido. Informe o DDI, por exemplo +55 11 99999-9999.' }, { status: 400 })
    }

    let selectedInstance: { id: string; instance_name: string; sending_paused?: boolean; sending_pause_reason?: string | null } | null = null
    if (instance_id) {
      const { data: instance, error: instanceError } = await supabaseAdmin
        .from('evolution_instances')
        .select('id, instance_name, sending_paused, sending_pause_reason')
        .eq('id', instance_id)
        .eq('organization_id', orgId)
        .maybeSingle()
      if (instanceError || !instance) {
        return NextResponse.json({ error: 'instance_id inválido ou não pertence à organização.' }, { status: 400 })
      }
      if (instance.sending_paused) {
        return NextResponse.json({ error: `Envios pausados nesta instância: ${instance.sending_pause_reason || 'revisão necessária'}` }, { status: 409 })
      }
      selectedInstance = instance
    }

    const ownerId = apiKeyData.user_id

    const { data: history, error: historyError } = await supabaseAdmin.from('alert_history').insert({
      user_id: ownerId,
      organization_id: orgId,
      client_id: null,
      status: 'queued',
      phone: cleanPhone,
      instance_name: selectedInstance?.instance_name || null,
      message_content: message,
      queued_at: new Date().toISOString(),
      scheduled_at: new Date().toISOString(),
    }).select('id').single()
    if (historyError || !history) throw new Error(`Falha ao registrar histórico da mensagem: ${historyError?.message || 'registro ausente'}`)

    // Atualiza last_used_at de forma assíncrona para não atrasar a resposta
    supabaseAdmin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', apiKeyData.id).then()

    // 5. Enfileiramento Blindado no BullMQ
    // Em vez de disparar síncrono e travar a API, colocamos na fila
    const jobData = {
      organizationId: orgId,
      userId: ownerId,
      instanceId: selectedInstance?.id || null,
      phone: cleanPhone,
      finalMessage: message,
      mediaUrl: media_url || null,
      alertHistoryId: history.id,
      source: 'api_v1'
    }

    const job = await messageQueue.add('send-message', jobData, {
      jobId: `alert-history:${history.id}`,
      priority: 5, // Prioridade média para envios via API geral
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    })

    return NextResponse.json({
      success: true,
      message: 'Mensagem enfileirada com sucesso.',
      job_id: job.id,
      history_id: history.id,
    }, { status: 202 }) // 202 Accepted

  } catch (error: any) {
    console.error('API v1 Send Error:', error)
    return NextResponse.json({ error: 'Erro interno no servidor ao processar a requisição.' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { messageQueue } from '@/lib/queue'
import crypto from 'crypto'
import { redisConnection } from '@/lib/redis'

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
      .select('id, organization_id')
      .eq('key_hash', hash)
      .single()

    if (apiError || !apiKeyData) {
      // Retarda a resposta em 500ms para evitar ataques de timing/brute force
      await new Promise(resolve => setTimeout(resolve, 500))
      return NextResponse.json({ error: 'Chave de API inválida ou revogada.' }, { status: 401 })
    }

    const orgId = apiKeyData.organization_id

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
      console.warn("Redis Indisponível para Throttling. Ignorando limitação de segurança.", redisError)
    }

    // 4. Validação de Payload
    const body = await request.json()
    const { phone, message, media_url, instance_id } = body

    if (!phone || !message) {
      return NextResponse.json({ error: 'Os campos "phone" e "message" são obrigatórios.' }, { status: 400 })
    }

    const cleanPhone = phone.replace(/\D/g, '')
    if (cleanPhone.length < 10) {
      return NextResponse.json({ error: 'Número de telefone inválido.' }, { status: 400 })
    }

    // Atualiza last_used_at de forma assíncrona para não atrasar a resposta
    supabaseAdmin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', apiKeyData.id).then()

    // 5. Enfileiramento Blindado no BullMQ
    // Em vez de disparar síncrono e travar a API, colocamos na fila
    const jobData = {
      organization_id: orgId,
      instance_id: instance_id || null, // Se nulo, a worker pegará a instância padrão ativa
      phone: cleanPhone,
      message,
      media_url,
      source: 'api_v1'
    }

    const job = await messageQueue.add('send-message', jobData, {
      priority: 5, // Prioridade média para envios via API geral
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Mensagem enfileirada com sucesso.',
      job_id: job.id
    }, { status: 202 }) // 202 Accepted

  } catch (error: any) {
    console.error('API v1 Send Error:', error)
    return NextResponse.json({ error: 'Erro interno no servidor ao processar a requisição.' }, { status: 500 })
  }
}

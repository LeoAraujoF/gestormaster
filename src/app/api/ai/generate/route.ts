import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { redisConnection } from '@/lib/redis'
import { getCapabilityMembership } from '@/lib/plan-access'

const MAX_GENERATIONS_PER_DAY = 3
const MAX_CONTEXT_LENGTH = 4_000

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }
    if (!(await getCapabilityMembership(supabase, user.id, 'leads'))) {
      return NextResponse.json({ error: 'Recurso disponível nos planos Pro e Master', upgrade_required: true }, { status: 403 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'Chave da OpenAI (OPENAI_API_KEY) não está configurada no servidor.' },
        { status: 500 }
      )
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    })

    // O limite não pode ficar em user_metadata, pois o usuário pode alterá-lo.
    // Redis é compartilhado entre instâncias e falha fechado para evitar custos
    // não autorizados quando a infraestrutura de rate limit estiver indisponível.
    const today = new Date().toISOString().split('T')[0] // Formato YYYY-MM-DD
    const usageKey = `ratelimit:ai:${user.id}:${today}`
    let currentCount: number
    try {
      currentCount = await redisConnection.incr(usageKey)
      if (currentCount === 1) await redisConnection.expire(usageKey, 60 * 60 * 24)
    } catch {
      return NextResponse.json({ error: 'Serviço de limite temporariamente indisponível.' }, { status: 503 })
    }

    if (currentCount > MAX_GENERATIONS_PER_DAY) {
      return NextResponse.json(
        { error: 'Você atingiu o limite de 3 gerações de IA por dia. Volte amanhã!' },
        { status: 429 }
      )
    }

    const body = await req.json()
    const { context, count = 4 } = body

    if (typeof context !== 'string' || !context.trim() || context.length > MAX_CONTEXT_LENGTH) {
      return NextResponse.json({ error: 'Contexto é obrigatório.' }, { status: 400 })
    }

    if (!Number.isInteger(count) || count < 1 || count > 4) {
      return NextResponse.json({ error: 'A quantidade deve estar entre 1 e 4.' }, { status: 400 })
    }

    const prompt = `
Você é um especialista em Copywriting de Resposta Direta e vendas pelo WhatsApp.
O usuário quer enviar mensagens em massa para seus Leads. Para evitar bloqueios do WhatsApp por "spam" ou padrão repetitivo, o sistema requer mensagens diferentes.

Seu objetivo é gerar ${count} variações diferentes de mensagens persuasivas para o seguinte objetivo/campanha:
"${context}"

Regras RÍGIDAS:
1. Retorne EXATAMENTE um array JSON contendo apenas as strings das mensagens, ex: ["msg1", "msg2", "msg3"].
2. Não adicione textos fora do JSON, nem formatação Markdown (remova aspas extras, crases ou \`\`\`json).
3. Seja altamente humano, persuasivo, natural e curto (mensagens de WhatsApp não devem ser textos enormes).
4. Use Spintax dentro das mensagens sempre que possível para aumentar ainda mais as variações. Exemplo de Spintax: "{Olá|Oi|Tudo bem|Opa} {{nome}}, como você está?"
5. Você DEVE usar a variável {{nome}} (para referenciar o primeiro nome do Lead) e opcionalmente {{telefone}} ou {{email}} se couber. NUNCA invente links ou placeholders fixos como [Link] a não ser que o usuário tenha pedido no contexto.

Gere as mensagens agora no formato JSON:
`

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
    })

    const rawContent = response.choices[0].message.content || '[]'

    // Tenta limpar caso a IA responda com marcações de código markdown
    let cleanedContent = rawContent.trim()
    if (cleanedContent.startsWith('```json')) {
      cleanedContent = cleanedContent.substring(7)
    }
    if (cleanedContent.endsWith('```')) {
      cleanedContent = cleanedContent.substring(0, cleanedContent.length - 3)
    }
    cleanedContent = cleanedContent.trim()

    let variants: string[] = []
    try {
      variants = JSON.parse(cleanedContent)
    } catch (e) {
      console.error('Erro ao fazer parse da resposta da IA:', cleanedContent)
      return NextResponse.json({ error: 'A resposta da Inteligência Artificial não veio no formato esperado.' }, { status: 500 })
    }

    return NextResponse.json({ variants })
  } catch (error: any) {
    console.error('Erro na API de IA:', error)
    return NextResponse.json({ error: error.message || 'Erro interno ao gerar mensagens.' }, { status: 500 })
  }
}

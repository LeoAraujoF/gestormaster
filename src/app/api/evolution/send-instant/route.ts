import { SecretsManager } from "@/lib/encryption";
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { redisConnection } from '@/lib/redis'
import { logAudit, getIpFromRequest } from '@/lib/audit'

import { parseMessageTemplate } from "@/lib/message-parser";

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // --- KILL SWITCH CHECK ---
    const isBanned = await redisConnection.sismember('global:banned_users', user.id)
    if (isBanned) {
      return NextResponse.json({ error: 'Sua conta foi suspensa temporariamente. Contate o suporte.' }, { status: 403 })
    }

    // --- PLAN QUOTAS CHECK ---
    const { data: userData } = await supabase.from('users').select('plan_name').eq('id', user.id).single()
    const userPlan = (userData?.plan_name || user.user_metadata?.plan_name || 'Lite').toLowerCase()
    
    let isLite = false
    let messageLimit = 0
    if (userPlan.includes('pro')) messageLimit = 2000
    else if (userPlan.includes('plus') || userPlan.includes('max')) messageLimit = 10000
    else {
      isLite = true
      messageLimit = 300 // Limite razoável para cliques manuais no Lite
    }

    const currentMonth = new Date().toISOString().slice(0, 7)
    const quotaKey = `usage:messages:${user.id}:${currentMonth}`
    const currentUsageStr = await redisConnection.get(quotaKey)
    const currentUsage = parseInt(currentUsageStr || '0', 10)

    if (currentUsage >= messageLimit) {
      return NextResponse.json({ error: `Limite do plano excedido (${messageLimit} mensais). Faça upgrade.` }, { status: 403 })
    }

    const { clientId, ruleId } = await req.json()

    // 1. Get Client
    const { data: client, error: clientErr } = await supabase.from('clients').select('*').eq('id', clientId).single()
    if (clientErr || !client) throw new Error("Cliente não encontrado")

    // 2. Get Rule
    const { data: rule, error: ruleErr } = await supabase.from('automations').select('*').eq('id', ruleId).single()
    if (ruleErr || !rule) throw new Error("Regra de automação não encontrada")

    // 3. Get Instance (Primary first, fallback to any)
    const { data: instances } = await supabase
      .from('evolution_instances')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'connected')
      .order('is_primary', { ascending: false })
      .limit(1)

    const instance = instances?.[0]
    if (!instance || instance.status !== 'connected') {
      throw new Error("Instância do WhatsApp não configurada ou desconectada")
    }

    let finalBaseUrl = instance.base_url
    let finalApiKey = SecretsManager.decrypt(instance.api_key || '')

    if (instance.connection_mode === 'integrated' || !finalBaseUrl) {
      finalBaseUrl = process.env.EVOLUTION_API_URL || ''
      finalApiKey = process.env.EVOLUTION_API_KEY || ''
    }

    if (!finalBaseUrl || !finalApiKey) {
      throw new Error("Credenciais da API não configuradas.")
    }

    if (!client.phone) throw new Error("Cliente não possui telefone cadastrado")

    // Format phone
    let phone = client.phone.replace(/\D/g, '')
    if (!phone.startsWith('55') && phone.length <= 11) {
      phone = '55' + phone
    }

    // Se for Lite, força a mensagem padrão estruturada e bloqueia outros tipos
    let templateToUse = rule.message_template
    if (isLite) {
      if (rule.alert_type === 'renewal') {
        templateToUse = `Olá {{primeiro_nome}}!\n\nPassando para agradecer e confirmar que sua renovação foi realizada com sucesso em nosso sistema! ✅\n\n💰 Valor Renovado: R$ {{plan_value}}\n📅 Próximo Vencimento: {{due_date}}\n\nQualquer dúvida, estamos à disposição!\n\n_Mensagem automática enviada via sistema._`
      } else if (rule.alert_type === 'promotion') {
        templateToUse = `Olá {{primeiro_nome}}!\n\nTemos uma novidade para você! Uma nova promoção ou benefício foi ativado no seu plano. 🚀\n\n💰 Valor Atualizado: R$ {{plan_value}}\n📅 Próximo Vencimento: {{due_date}}\n\nAproveite! Qualquer dúvida, é só nos chamar.\n\n_Mensagem automática enviada via sistema._`
      } else if (rule.alert_type === 'activation' || rule.alert_type === 'welcome' || rule.alert_type === 'quick_message') {
        templateToUse = `Olá {{primeiro_nome}}! Seja muito bem-vindo(a)!\n\nSua ativação foi concluída com sucesso em nosso sistema. Estamos muito felizes em ter você conosco! 🌟\n\n💰 Valor do Plano: R$ {{plan_value}}\n📅 Seu Vencimento: {{due_date}}\n\nSe precisar de qualquer suporte, basta nos chamar por aqui.\n\n_Mensagem automática enviada via sistema._`
      } else {
        return NextResponse.json({ error: 'O plano Lite só permite disparos de Renovação, Ativação ou Promoção. Faça upgrade para usar notificações personalizadas de atraso e aviso prévio.' }, { status: 403 })
      }
    }

    const finalMessage = parseMessageTemplate(templateToUse, client, user.user_metadata || {})

    // 4. Send Instantly with Timeout (prevent UI hanging)
    const url = `${finalBaseUrl.replace(/\/$/, '')}/message/sendText/${instance.instance_name}`
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000) // 8 seconds timeout
    
    let apiReq;
    try {
      apiReq = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': finalApiKey
        },
        signal: controller.signal,
        body: JSON.stringify({
          number: phone,
          options: { delay: 1200, presence: 'composing' },
          text: finalMessage
        })
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!apiReq.ok) {
      const errData = await apiReq.text()
      // Log failed
      await supabase.from('alert_history').insert({
        user_id: user.id, client_id: client.id, automation_id: rule.id,
        status: 'failed', error_message: `API Evolution erro: ${errData}`,
        scheduled_at: new Date().toISOString()
      })
      throw new Error(`Falha no envio Evolution: ${errData}`)
    }

    // 5. Log success
    await supabase.from('alert_history').insert({
      user_id: user.id, client_id: client.id, automation_id: rule.id,
      status: 'sent', message_content: finalMessage,
      sent_at: new Date().toISOString(), scheduled_at: new Date().toISOString()
    })

    await logAudit({
      user_id: user.id,
      action: 'whatsapp.send_instant',
      resource: 'evolution',
      details: { instance_name: instance.instance_name, client_id: clientId, rule_id: ruleId, alert_type: rule.alert_type },
      ip_address: getIpFromRequest(req)
    })

    return NextResponse.json({ success: true, message: "Enviado com sucesso!" })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

import { SecretsManager } from "@/lib/encryption";
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function parseMessageTemplate(template: string, client: any) {
  let msg = template
  msg = msg.replace(/{{client_name}}/g, client.name || '')
  
  const firstName = client.name ? client.name.split(' ')[0] : ''
  msg = msg.replace(/{{primeiro_nome}}/g, firstName)
  
  msg = msg.replace(/{{plan_value}}/g, client.plan_value?.toString() || '0')
  
  if (client.due_date) {
    const [y, m, d] = client.due_date.split('-')
    msg = msg.replace(/{{due_date}}/g, `${d}/${m}/${y}`)
  }
  return msg
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

    const finalMessage = parseMessageTemplate(rule.message_template, client)

    // 4. Send Instantly
    const url = `${finalBaseUrl.replace(/\/$/, '')}/message/sendText/${instance.instance_name}`
    const apiReq = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': finalApiKey
      },
      body: JSON.stringify({
        number: phone,
        options: { delay: 1200, presence: 'composing' },
        text: finalMessage
      })
    })

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

    return NextResponse.json({ success: true, message: "Enviado com sucesso!" })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

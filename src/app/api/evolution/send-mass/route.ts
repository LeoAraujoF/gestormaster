import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Formats the template with the client data
function parseMessageTemplate(template: string, client: any, userMeta: any = {}) {
  let msg = template
  msg = msg.replace(/{{client_name}}/g, client.name || '')
  
  const firstName = client.name ? client.name.split(' ')[0] : ''
  msg = msg.replace(/{{primeiro_nome}}/g, firstName)
  
  msg = msg.replace(/{{plan_value}}/g, client.plan_value?.toString() || '0')
  
  if (client.due_date) {
    const [y, m, d] = client.due_date.split('-')
    msg = msg.replace(/{{due_date}}/g, `${d}/${m}/${y}`)
  }
  
  msg = msg.replace(/{{empresa}}/g, userMeta.company_name || '')
  msg = msg.replace(/{{telefone_suporte}}/g, userMeta.support_phone || '')
  msg = msg.replace(/{{pix}}/g, userMeta.pix_key || '')
  msg = msg.replace(/{{titular_pix}}/g, userMeta.pix_name || '')

  return msg
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { audience, messageTemplate, delaySeconds = 5, serviceId } = await req.json()

    if (!audience || !messageTemplate) {
      return NextResponse.json({ error: 'Faltam campos obrigatórios' }, { status: 400 })
    }

    // 1. Check WhatsApp connection (Get primary instance)
    const { data: instances } = await supabase
      .from('evolution_instances')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'connected')
      .eq('is_primary', true)
      .limit(1)

    const primaryInstance = instances?.[0]
    if (!primaryInstance) {
      return NextResponse.json({ error: 'Nenhum chip Principal conectado. Esta função exige um número Principal marcado com ⭐️.' }, { status: 400 })
    }

    // 2. Fetch target clients
    let query = supabase.from('clients').select('id, name, phone, plan_value, due_date').eq('user_id', user.id)

    if (audience === 'active') {
      query = query.eq('status', 'active')
    } else if (audience === 'inactive') {
      query = query.eq('status', 'inactive')
    } else if (audience === 'expired') {
      // due_date < today
      const today = new Date().toISOString().split('T')[0]
      query = query.lt('due_date', today)
    } else if (audience === 'service' && serviceId) {
      // Requires joining with client_services
      const { data: serviceClients, error: svcErr } = await supabase
        .from('client_services')
        .select('client_id')
        .eq('service_id', serviceId)
      
      if (svcErr) throw svcErr

      const clientIds = serviceClients?.map(sc => sc.client_id) || []
      if (clientIds.length > 0) {
        query = query.in('id', clientIds)
      } else {
        return NextResponse.json({ error: 'Nenhum cliente encontrado para este serviço' }, { status: 400 })
      }
    }

    const { data: clients, error: clientsErr } = await query
    if (clientsErr) throw clientsErr

    const validClients = clients?.filter(c => c.phone && c.phone.length >= 10) || []
    
    if (validClients.length === 0) {
      return NextResponse.json({ error: 'Nenhum cliente com telefone válido encontrado para o filtro selecionado' }, { status: 400 })
    }

    // 3. Process send loop asynchronously
    // We send a response back immediately and process the messages in the background
    // (Note: On Vercel Hobby this might be killed after 10s-60s, but for local/small scale it's acceptable.
    // Ideally we would use a queue like Inngest, but this provides the functionality immediately).
    
    const sendMassMessages = async () => {
      // Create a temporary "Rule" specifically for this mass message to group logs
      const { data: tempRule } = await supabase.from('automations').insert({
        user_id: user.id,
        alert_type: 'promotion',
        days_offset: 0,
        send_time: '00:00',
        message_template: messageTemplate,
        is_active: false // Keep it false so it doesn't run automatically
      }).select().single()

      if (!tempRule) return

      for (let i = 0; i < validClients.length; i++) {
        const client = validClients[i]
        
        // Format phone
        let phone = client.phone.replace(/\D/g, '')
        if (!phone.startsWith('55') && phone.length <= 11) {
          phone = '55' + phone
        }

        const userMeta = user.user_metadata || {}
        const finalMessage = parseMessageTemplate(messageTemplate, client, userMeta)

        const instance = primaryInstance // Usa a instância principal sem roleta

        let finalBaseUrl = instance.base_url
        let finalApiKey = instance.api_key

        if (instance.connection_mode === 'integrated' || !finalBaseUrl) {
          finalBaseUrl = process.env.EVOLUTION_API_URL || ''
          finalApiKey = process.env.EVOLUTION_API_KEY || ''
        }

        try {
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
            await supabase.from('alert_history').insert({
              user_id: user.id, client_id: client.id, automation_id: tempRule.id,
              status: 'failed', error_message: `API erro: ${errData}`,
              scheduled_at: new Date().toISOString()
            })
          } else {
            await supabase.from('alert_history').insert({
              user_id: user.id, client_id: client.id, automation_id: tempRule.id,
              status: 'sent', message_content: finalMessage,
              sent_at: new Date().toISOString(), scheduled_at: new Date().toISOString()
            })
          }
        } catch (err: any) {
          await supabase.from('alert_history').insert({
            user_id: user.id, client_id: client.id, automation_id: tempRule.id,
            status: 'failed', error_message: err.message,
            scheduled_at: new Date().toISOString()
          })
        }

        // Delay between messages (Anti-ban)
        if (i < validClients.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000))
        }
      }
    }

    // Trigger async background processing
    sendMassMessages().catch(console.error)

    return NextResponse.json({ 
      success: true, 
      message: `Disparo iniciado para ${validClients.length} clientes. As mensagens estão sendo enviadas com intervalo de ${delaySeconds}s.` 
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

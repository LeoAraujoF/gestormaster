import { SecretsManager } from "@/lib/encryption";
import { NextResponse } from 'next/server'
import { createClient, getActiveOrganization } from '@/lib/supabase/server'
import { messageQueue } from '@/lib/queue'

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
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const user = session.user
    const { audience, serviceId, messageTemplate, delaySeconds = 5, scheduledAt } = await req.json()

    if (!messageTemplate) {
      return NextResponse.json({ error: 'Mensagem é obrigatória' }, { status: 400 })
    }

    // Calcula o delay inicial se houver agendamento
    let initialDelayMs = 0;
    if (scheduledAt) {
      const scheduledTime = new Date(scheduledAt).getTime();
      const now = Date.now();
      if (scheduledTime > now) {
        initialDelayMs = scheduledTime - now;
      }
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
    
    // Obtem a organização ativa
    const org = await getActiveOrganization(supabase, user.id);
    const organizationId = org?.organization_id;

    // Create a temporary "Rule" specifically for this mass message to group logs
    const { data: tempRule } = await supabase.from('automations').insert({
      user_id: user.id,
      alert_type: 'promotion',
      days_offset: 0,
      send_time: '00:00',
      message_template: messageTemplate,
      is_active: false // Keep it false so it doesn't run automatically
    }).select().single()

    if (!tempRule) {
      return NextResponse.json({ error: 'Erro ao criar regra de automação' }, { status: 500 })
    }

    const userMeta = user.user_metadata || {}
    const instance = primaryInstance

    let finalBaseUrl = instance.base_url
    let finalApiKey = SecretsManager.decrypt(instance.api_key || '')

    if (instance.connection_mode === 'integrated' || !finalBaseUrl) {
      finalBaseUrl = process.env.EVOLUTION_API_URL || ''
      finalApiKey = process.env.EVOLUTION_API_KEY || ''
    }

    const url = `${finalBaseUrl.replace(/\/$/, '')}/message/sendText/${instance.instance_name}`

    // Prepare Jobs Array for BullMQ
    const jobs = validClients.map((client: any) => {
      let phone = client.phone.replace(/\D/g, '')
      if (!phone.startsWith('55') && phone.length <= 11) {
        phone = '55' + phone
      }

      const finalMessage = parseMessageTemplate(messageTemplate, client, userMeta)

      return {
        name: 'send-message',
        data: {
          clientId: client.id,
          phone,
          finalMessage,
          instanceUrl: url,
          apiKey: finalApiKey,
          ruleId: tempRule.id,
          userId: user.id,
          organizationId: organizationId
        },
        opts: {
          delay: initialDelayMs
        }
      }
    })

    // Enfileira todos os clientes de uma vez (Super Rápido)
    await messageQueue.addBulk(jobs)

    return NextResponse.json({ 
      success: true, 
      message: `Disparo enfileirado com sucesso! ${validClients.length} mensagens estão sendo processadas em background pelo Worker.` 
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

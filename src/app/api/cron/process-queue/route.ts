import { SecretsManager } from "@/lib/encryption";
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAuthorizedCron } from '@/lib/cron-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

import { parseMessageTemplate } from "@/lib/message-parser";

export async function GET(req: Request) {
  try {
    // 1. Security Check (header Bearer da Vercel Cron ou ?key= legado)
    if (!isAuthorizedCron(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date().toISOString()

    // 2. Fetch pending alerts where scheduled_at <= now
    const { data: alerts, error: alertsErr } = await supabase
      .from('alert_history')
      .select(`
        *,
        client:clients(name, phone, plan_value, due_date),
        automation:automations(message_template)
      `)
      .eq('status', 'pending')
      .lte('scheduled_at', now)

    if (alertsErr || !alerts) {
      throw new Error("Failed to fetch pending alerts")
    }

    if (alerts.length === 0) {
      return NextResponse.json({ success: true, message: "No pending alerts." })
    }

    let processedCount = 0
    let failedCount = 0

    const START_TIME = Date.now()
    const EXECUTION_LIMIT_MS = 45000 // 45 seconds to avoid Vercel 60s timeout

    const userMetaCache: Record<string, any> = {}

    const userInstanceIndex: Record<string, number> = {}

    // 3. Process each alert
    for (const alert of alerts) {
      // Check if we are running out of time to process this loop
      if (Date.now() - START_TIME >= EXECUTION_LIMIT_MS) {
        console.log("Execution limit reached. Breaking loop to prevent timeout.")
        break
      }
      try {
        const client = alert.client as any
        const automation = alert.automation as any
        
        if (!client || !client.phone) {
          throw new Error("Cliente inválido ou sem telefone")
        }

        // 4. Fetch the Primary Evolution Instance for this user
        const { data: instances } = await supabase
          .from('evolution_instances')
          .select('*')
          .eq('user_id', alert.user_id)
          .eq('status', 'connected')
          .eq('is_primary', true)

        if (!instances || instances.length === 0) {
          throw new Error("Nenhum chip Principal conectado. As automações de cobrança exigem um número Principal marcado com ⭐️.")
        }

        const instance = instances[0]

        let finalBaseUrl = instance.base_url
        let finalApiKey = SecretsManager.decrypt(instance.api_key || '')

        if (instance.connection_mode === 'integrated' || !finalBaseUrl) {
          finalBaseUrl = process.env.EVOLUTION_API_URL || ''
          finalApiKey = process.env.EVOLUTION_API_KEY || ''
        }

        if (!finalBaseUrl || !finalApiKey) {
          throw new Error("Instância do WhatsApp mal configurada (credenciais da API não encontradas)")
        }

        // Formata o número
        if (!client || !client.phone) throw new Error("Client phone missing")
        let phone = client.phone.replace(/\D/g, '')
        if (!phone.startsWith('55') && phone.length <= 11) phone = '55' + phone

        if (!userMetaCache[alert.user_id]) {
          const { data: { user } } = await supabase.auth.admin.getUserById(alert.user_id)
          userMetaCache[alert.user_id] = user?.user_metadata || {}
        }
        const userMeta = userMetaCache[alert.user_id]

        const template = automation?.message_template || "Mensagem automática: {{client_name}}"
        const finalMessage = parseMessageTemplate(template, client, userMeta)

        // 5. Fire Request to Evolution API
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
          throw new Error(`API Evolution erro: ${errData}`)
        }

        // Update to sent
        await supabase
          .from('alert_history')
          .update({ 
            status: 'sent', 
            message_content: finalMessage,
            sent_at: new Date().toISOString()
          })
          .eq('id', alert.id)

        processedCount++
      } catch (err: any) {
        // Update to failed
        await supabase
          .from('alert_history')
          .update({ 
            status: 'failed', 
            error_message: err.message || 'Erro desconhecido'
          })
          .eq('id', alert.id)
          
        failedCount++
      }

      // Check if we need to sleep before the NEXT message to avoid anti-ban (only if there are more messages to process)
      if (Date.now() - START_TIME < EXECUTION_LIMIT_MS) {
        // Fetch instance delays (we re-use instance object if it exists)
        // If the instance wasn't fetched due to an error, we default to 10-25
        const minDelay = 10
        const maxDelay = 25
        // Ideally we use the instance delays. Since instance is scoped in try/catch, we fetch again or just assume defaults.
        // Wait, let's just fetch it again to be safe, or do a separate query. Actually, we can just use the user's config if available.
        // To be safe and simple:
        const { data: configs } = await supabase.from('evolution_instances').select('min_delay, max_delay').eq('user_id', alert.user_id).limit(1)
        const config = configs?.[0]
        const min = config?.min_delay || 10
        const max = config?.max_delay || 25
        const randomDelaySec = Math.floor(Math.random() * (max - min + 1)) + min
        
        // Sleep
        await new Promise(resolve => setTimeout(resolve, randomDelaySec * 1000))
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Processed ${processedCount} alerts successfully. ${failedCount} failed.` 
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

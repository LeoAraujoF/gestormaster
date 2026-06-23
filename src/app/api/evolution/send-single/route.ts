import { SecretsManager } from "@/lib/encryption";
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { redisConnection } from '@/lib/redis'
import { logAudit, getIpFromRequest } from '@/lib/audit'

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

    const { instanceName, phone, message, mediaBase64, mediaMimeType } = await req.json()

    if (!instanceName || !phone || !message) {
      return NextResponse.json({ error: 'Faltam campos obrigatórios (instanceName, phone, message)' }, { status: 400 })
    }

    // 1. Fetch instance details securely
    const { data: instance, error: instanceError } = await supabase
      .from('evolution_instances')
      .select('base_url, api_key, connection_mode')
      .eq('user_id', user.id)
      .eq('instance_name', instanceName)
      .maybeSingle()

    if (instanceError || !instance) {
      return NextResponse.json({ error: 'Instância não encontrada ou sem permissão' }, { status: 400 })
    }

    let finalBaseUrl = instance.base_url
    let finalApiKey = SecretsManager.decrypt(instance.api_key || '')

    if (instance.connection_mode === 'integrated' || !finalBaseUrl) {
      finalBaseUrl = process.env.EVOLUTION_API_URL || ''
      finalApiKey = process.env.EVOLUTION_API_KEY || ''
    }

    if (!finalBaseUrl || !finalApiKey) {
       return NextResponse.json({ error: 'Credenciais da API não configuradas.' }, { status: 500 })
    }

    const baseUrl = finalBaseUrl.replace(/\/$/, '')

    let apiReq;

    if (mediaBase64 && mediaMimeType) {
      // Send Media
      const url = `${baseUrl}/message/sendMedia/${instanceName}`
      const body = {
        number: phone,
        options: {
          delay: 1200,
          presence: 'composing'
        },
        mediaMessage: {
          mediatype: mediaMimeType.includes('image') ? 'image' : 'video',
          caption: message,
          media: mediaBase64.split(',')[1] || mediaBase64 // Evolution needs base64 without prefix usually, but handles both. Let's send raw base64.
        }
      }

      apiReq = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': finalApiKey
        },
        body: JSON.stringify(body)
      })
    } else {
      // Send Text
      const url = `${baseUrl}/message/sendText/${instanceName}`
      apiReq = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': finalApiKey
        },
        body: JSON.stringify({
          number: phone,
          options: { delay: 1200, presence: 'composing' },
          text: message
        })
      })
    }

    if (!apiReq.ok) {
      const errData = await apiReq.text()
      console.error("Evolution API Error:", errData)
      return NextResponse.json({ error: `Erro na API: ${errData}` }, { status: 400 })
    }

    const responseData = await apiReq.json()

    const maskedPhone = phone.length > 4 ? '***' + phone.slice(-4) : phone
    await logAudit({
      user_id: user.id,
      action: 'whatsapp.send_single',
      resource: 'evolution',
      details: { instance_name: instanceName, phone: maskedPhone, has_media: !!(mediaBase64 && mediaMimeType) },
      ip_address: getIpFromRequest(req)
    })

    return NextResponse.json({ success: true, data: responseData })

  } catch (error: any) {
    console.error("send-single error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

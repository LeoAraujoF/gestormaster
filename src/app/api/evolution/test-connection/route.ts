import { SecretsManager } from "@/lib/encryption";
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { phone } = await req.json()
    if (!phone) throw new Error("Telefone obrigatório")

    // Get Instance
    const { data: instances } = await supabase.from('evolution_instances')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'connected')
      .order('is_primary', { ascending: false })
      .limit(1)
      
    const instance = instances?.[0]
    if (!instance) {
      throw new Error("Instância do WhatsApp não configurada ou desconectada")
    }

    let finalBaseUrl = instance.base_url
    let finalApiKey = SecretsManager.decrypt(instance.api_key || '')

    if (instance.connection_mode === 'integrated' || !finalBaseUrl) {
      finalBaseUrl = process.env.EVOLUTION_API_URL || ''
      finalApiKey = process.env.EVOLUTION_API_KEY || ''
    }

    if (!finalBaseUrl || !finalApiKey) {
      throw new Error("Credenciais do servidor não configuradas")
    }

    let parsedPhone = phone.replace(/\D/g, '')
    if (!parsedPhone.startsWith('55') && parsedPhone.length <= 11) {
      parsedPhone = '55' + parsedPhone
    }

    const testMessage = "✅ *Conexão Gestor Master x Evolution* estabelecida com sucesso!\n\nSeu motor de envios está pronto para funcionar."

    const url = `${finalBaseUrl.replace(/\/$/, '')}/message/sendText/${instance.instance_name}`
    const apiReq = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': finalApiKey
      },
      body: JSON.stringify({
        number: parsedPhone,
        options: { delay: 1200, presence: 'composing' },
        text: testMessage
      })
    })

    if (!apiReq.ok) {
      const errData = await apiReq.text()
      throw new Error(`Falha no envio: ${errData}`)
    }

    return NextResponse.json({ success: true, message: "Mensagem de teste enviada!" })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

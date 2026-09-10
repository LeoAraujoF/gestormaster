import { normalizeWhatsAppNumber } from '@/lib/phone'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { messageQueue } from '@/lib/queue'
import { MESSAGE_PRIORITY } from '@/lib/message-priority'
import { SecretsManager } from "@/lib/encryption";

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

    const parsedPhone = normalizeWhatsAppNumber(phone)
    if (!parsedPhone) throw new Error("Número de WhatsApp inválido. Informe o DDI, por exemplo +55 ou +1.")

    const testMessage = "✅ *Conexão Lembrado x Evolution* estabelecida com sucesso!\n\nSeu motor de envios está pronto para funcionar."

    if (instance.sending_paused) {
      return NextResponse.json({ error: `Envios pausados nesta instância: ${instance.sending_pause_reason || 'revisão necessária'}` }, { status: 409 })
    }

    await messageQueue.add('send-message', {
      organizationId: instance.organization_id,
      userId: user.id,
      instanceId: instance.id,
      instanceName: instance.instance_name,
      phone: parsedPhone,
      finalMessage: testMessage,
      source: 'connection_test',
    }, { priority: MESSAGE_PRIORITY.transactional })

    return NextResponse.json({ success: true, message: "Mensagem de teste enfileirada com proteção de ritmo!" }, { status: 202 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

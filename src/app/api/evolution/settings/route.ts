import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createEvolutionClient } from '@/lib/evolution'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { reject_calls, reject_calls_message } = body

    // Buscar as informações das instâncias do usuário no banco
    const { data: instances, error: instanceError } = await supabase
      .from('evolution_instances')
      .select('*')
      .eq('user_id', user.id)

    if (instanceError || !instances || instances.length === 0) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }

    // Salvar as configurações no banco de dados para todas as instâncias do usuário
    const updateData: any = {}
    if (reject_calls !== undefined) updateData.reject_calls = reject_calls
    if (reject_calls_message !== undefined) updateData.reject_calls_message = reject_calls_message

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from('evolution_instances')
        .update(updateData)
        .eq('user_id', user.id)

      if (updateError) {
        throw new Error('Failed to update settings in database')
      }
    }

    // Enviar a configuração nativa para a Evolution API para cada instância ativa
    for (const instance of instances) {
      if (instance.instance_name && instance.status === 'connected') {
        try {
          const evo = createEvolutionClient()
          
          await evo.setSettings(instance.instance_name, {
            rejectCall: reject_calls !== undefined ? reject_calls : instance.reject_calls || false,
            msgCall: reject_calls_message !== undefined ? reject_calls_message : instance.reject_calls_message || "As chamadas de voz e vídeo estão desativadas para este número. Por favor, envie uma mensagem de texto."
          })
        } catch (evolutionError) {
          console.error("Evolution API Settings sync error for", instance.instance_name, evolutionError)
        }
      }
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Evolution Settings Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

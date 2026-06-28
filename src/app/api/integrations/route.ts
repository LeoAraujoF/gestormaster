import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit, getIpFromRequest } from '@/lib/audit'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const orgId = user.user_metadata?.organization_id || user.id;

    const { data: integrations, error } = await supabase
      .from('integrations')
      .select('id, provider, credentials, is_active')
      .eq('organization_id', orgId)

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ success: true, integrations: [], missingTable: true })
      }
      throw error
    }
    
    // Buscar também credenciais de IPTV
    const { data: iptvData } = await supabase
      .from('iptv_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'tvdc_iptv')
      .maybeSingle();
      
    const finalIntegrations = integrations || [];
    if (iptvData) {
      finalIntegrations.push({
        id: iptvData.id,
        provider: 'tvdc_iptv',
        credentials: { 
          username: iptvData.username, 
          password: iptvData.password,
          service_id: iptvData.linked_service_id || ""
        },
        is_active: true
      });
    }

    return NextResponse.json({ success: true, integrations: finalIntegrations })

  } catch (error: any) {
    console.error('Integrations GET Error:', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const orgId = user.user_metadata?.organization_id || user.id;
    const body = await request.json()
    const { provider, credentials, is_active } = body

    if (!provider || !credentials) {
      return NextResponse.json({ error: 'Provedor e credenciais são obrigatórios.' }, { status: 400 })
    }

    if (provider === 'tvdc_iptv') {
      const { username, password, service_id } = credentials;
      
      // Substitui upsert por select + insert/update para evitar erro de constraint unique
      const { data: existing } = await supabase
        .from('iptv_accounts')
        .select('id')
        .eq('user_id', user.id)
        .eq('provider', 'tvdc_iptv')
        .maybeSingle();

      const payload = {
        username,
        password,
        linked_service_id: service_id || null
      }

      let dbResult;
      if (existing) {
        dbResult = await supabase
          .from('iptv_accounts')
          .update(payload)
          .eq('id', existing.id)
          .select()
          .single();
      } else {
        dbResult = await supabase
          .from('iptv_accounts')
          .insert({ user_id: user.id, provider: 'tvdc_iptv', ...payload })
          .select()
          .single();
      }
        
      if (dbResult.error) {
        console.error('IPTV Save Error:', dbResult.error);
        return NextResponse.json({ error: 'Erro ao salvar credenciais do painel IPTV.' }, { status: 500 });
      }
      
      await logAudit({
        user_id: user.id,
        action: 'integration.save',
        resource: 'integrations',
        resource_id: dbResult.data?.id,
        details: { provider: 'tvdc_iptv' },
        ip_address: getIpFromRequest(request)
      })

      return NextResponse.json({ success: true, integration: dbResult.data });
    }

    // Substitui upsert por select + update/insert para evitar erro de constraint unique
    const { data: existingInt } = await supabase
      .from('integrations')
      .select('id')
      .eq('organization_id', orgId)
      .eq('provider', provider)
      .maybeSingle()

    const intPayload = {
      credentials,
      is_active: is_active ?? true,
      updated_at: new Date().toISOString()
    }

    let dbResult;
    if (existingInt) {
      dbResult = await supabase
        .from('integrations')
        .update(intPayload)
        .eq('id', existingInt.id)
        .select()
        .single()
    } else {
      dbResult = await supabase
        .from('integrations')
        .insert({ organization_id: orgId, provider, ...intPayload })
        .select()
        .single()
    }

    if (dbResult.error) {
      if (dbResult.error.code === '42P01') {
        return NextResponse.json({ error: 'A tabela de integrações ainda não foi criada no banco.' }, { status: 400 })
      }
      throw dbResult.error
    }

    const data = dbResult.data;

    // Integração Nativa Typebot (Sincronização Evolution API)
    if (provider === 'typebot' && (is_active ?? true)) {
      const { createEvolutionClient } = await import('@/lib/evolution')
      const evolution = createEvolutionClient()

      // Buscar instâncias ativas desta organização
      const { data: instances } = await supabase
        .from('evolution_instances')
        .select('instance_name')
        .eq('organization_id', orgId)
        .eq('status', 'connected')

      if (instances && instances.length > 0) {
        const typebotPayload = {
          enabled: true,
          url: credentials.viewer_url,
          typebot: credentials.typebot_name,
          expire: 0,
          keywordFinish: "#SAIR",
          delayMessage: 1000,
          unknownMessage: "",
          listeningFromMe: false,
          stopBotFromMe: true,
          keepOpen: false,
          debounceTime: 10
        }

        for (const instance of instances) {
          try {
            await evolution.setTypebot(instance.instance_name, typebotPayload)
          } catch (e) {
            console.error(`Erro ao sincronizar Typebot na instância ${instance.instance_name}:`, e)
          }
        }
      }
    }

    await logAudit({
      user_id: user.id,
      action: 'integration.save',
      resource: 'integrations',
      resource_id: data?.id,
      details: { provider },
      ip_address: getIpFromRequest(request)
    })

    return NextResponse.json({ success: true, integration: data })

  } catch (error: any) {
    console.error('Integrations POST Error:', error)
    return NextResponse.json({ error: 'Erro interno no servidor', details: error?.message || error }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const orgId = user.user_metadata?.organization_id || user.id;
    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider')

    if (!provider) {
      return NextResponse.json({ error: 'Provedor é obrigatório.' }, { status: 400 })
    }
    
    if (provider === 'tvdc_iptv') {
      await supabase.from('iptv_accounts').delete().eq('user_id', user.id).eq('provider', provider);
      await logAudit({
        user_id: user.id,
        action: 'integration.delete',
        resource: 'integrations',
        details: { provider: 'tvdc_iptv' },
        ip_address: getIpFromRequest(request)
      })
      return NextResponse.json({ success: true })
    }

    const { error } = await supabase
      .from('integrations')
      .delete()
      .eq('organization_id', orgId)
      .eq('provider', provider)

    if (error) throw error

    // Sincronização de Desconexão Typebot
    if (provider === 'typebot') {
      const { createEvolutionClient } = await import('@/lib/evolution')
      const evolution = createEvolutionClient()

      const { data: instances } = await supabase
        .from('evolution_instances')
        .select('instance_name')
        .eq('organization_id', orgId)

      if (instances && instances.length > 0) {
        for (const instance of instances) {
          try {
            await evolution.removeTypebot(instance.instance_name)
          } catch (e) {
            console.error(`Erro ao remover Typebot da instância ${instance.instance_name}:`, e)
          }
        }
      }
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Integrations DELETE Error:', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}

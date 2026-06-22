import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { TVdeCasaAdapter } from '@/services/iptv/TVdeCasaAdapter';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // 1. Buscar todas as contas IPTV ativas do usuário
    const { data: accounts, error: accountsError } = await supabase
      .from('iptv_accounts')
      .select('*, services(id, cost)')
      .eq('user_id', user.id);

    if (accountsError || !accounts || accounts.length === 0) {
      return NextResponse.json({ error: 'Nenhuma integração IPTV ativa encontrada.' }, { status: 400 });
    }

    let totalSynced = 0;
    let totalServicesSynced = 0;
    let errors = [];

    // 2. Loop sobre as contas
    for (const account of accounts) {
      if (!account.username || !account.password) {
        errors.push(`Conta ${account.provider} está sem credenciais cadastradas.`);
        continue;
      }

      if (account.provider !== 'tvdc_iptv') {
        errors.push(`O provedor ${account.provider} ainda não é suportado.`);
        continue;
      }

      try {
        console.log(`[IPTV Sync] Autenticando no painel ${account.provider}...`);
        const adapter = new TVdeCasaAdapter();
        const cookies = await adapter.authenticate(account.username, account.password);

        console.log(`[IPTV Sync] Buscando clientes para ${account.provider}...`);
        const extractedClients = await adapter.fetchClients(cookies);

        for (const client of extractedClients) {
          // Converte data de vencimento
          const [dataPart, timePart] = (client.expirationDate || '').split(' ');
          let isoDate = new Date().toISOString().split('T')[0];
          let time = null;
          
          if (dataPart && dataPart.includes('/')) {
            const [dia, mes, ano] = dataPart.split('/');
            isoDate = `${ano}-${mes}-${dia}`;
          }
          if (timePart) {
            time = timePart;
          }
          
          const statusMap: Record<string, string> = {
            'Ativo': 'active',
            'Suspenso': 'inactive'
          };

          const dbStatus = statusMap[client.status] || 'active';
          
          const planValue = account.services?.cost || 0;

          // A) Salva ou atualiza o cliente
          const { data: upsertedClient, error: clientError } = await supabase
            .from('clients')
            .upsert({
              user_id: user.id,
              name: client.nameNotes || client.loginIptv,
              username: client.loginIptv,
              due_date: isoDate,
              due_time: time,
              status: dbStatus,
              screens: client.maxConnections,
              observation: `Senha IPTV: ${client.passwordIptv}`,
              external_id: client.externalId,
              plan_value: planValue,
              registration_date: new Date().toISOString().split('T')[0]
            }, { 
              onConflict: 'external_id' 
            })
            .select('id')
            .single();

          if (clientError || !upsertedClient) {
            console.error(`[IPTV Sync] Erro ao sincronizar cliente ${client.loginIptv}:`, clientError);
            continue;
          }

          // B) Vincula o cliente ao Serviço correspondente (se configurado)
          if (account.linked_service_id) {
            const { data: existingLink } = await supabase
              .from('client_services')
              .select('id')
              .eq('client_id', upsertedClient.id)
              .eq('service_id', account.linked_service_id)
              .single();

            if (!existingLink) {
              await supabase
                .from('client_services')
                .insert({
                  client_id: upsertedClient.id,
                  service_id: account.linked_service_id
                });
            }
          }

          totalSynced++;
        }
        
        totalServicesSynced++;

      } catch (e: any) {
        console.error(`Erro ao sincronizar painel ${account.provider}:`, e);
        errors.push(`Falha no painel ${account.provider}: ${e.message}`);
      }
    }

    if (totalServicesSynced === 0) {
      return NextResponse.json({ 
        error: 'Não foi possível sincronizar nenhum painel.', 
        details: errors 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Sincronização concluída! ${totalSynced} clientes verificados.`,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    console.error('[IPTV Sync] Erro geral:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

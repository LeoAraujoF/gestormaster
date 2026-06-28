import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service-role';
import { messageQueue } from '@/lib/queue';
import { logAudit, getIpFromRequest } from '@/lib/audit';

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const orgId = url.searchParams.get('orgId');

    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 });
    }

    let paymentId: string | null = null;
    
    // Tenta primeiro no body (Webhooks oficiais)
    try {
      const body = await req.json();
      if (body.action === 'payment.created' || body.action === 'payment.updated' || body.type === 'payment') {
        paymentId = body.data?.id;
      }
    } catch (e) {
      // Falhou o JSON parse, ignora e tenta via Query String
    }

    // Tenta via query string (IPN antigo)
    if (!paymentId) {
      paymentId = url.searchParams.get('data.id') || url.searchParams.get('id');
    }

    if (!paymentId) {
      return NextResponse.json({ received: true });
    }

    // 1. Buscar a chave de acesso do Mercado Pago para esta organização
    const { data: mpInt } = await supabaseAdmin
      .from('integrations')
      .select('credentials')
      .eq('organization_id', orgId)
      .eq('provider', 'mercadopago')
      .eq('is_active', true)
      .single();

    if (!mpInt?.credentials?.access_token) {
      console.warn(`[Webhook MP] Organização ${orgId} não possui token ativo do Mercado Pago.`);
      return NextResponse.json({ received: true });
    }

    const accessToken = mpInt.credentials.access_token;

    // 2. Consultar o status real do pagamento na API oficial
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!mpResponse.ok) {
      console.error(`[Webhook MP] Erro ao consultar pagamento ${paymentId}:`, await mpResponse.text());
      return NextResponse.json({ error: 'Failed to fetch payment' }, { status: 500 });
    }

    const paymentData = await mpResponse.json();

    // 3. Se estiver aprovado, vamos mandar o recibo
    if (paymentData.status === 'approved') {
      const extRef = paymentData.external_reference; // "orgId|instance_name|telefone[|RENEWAL|clientId|planName]"

      if (extRef && extRef.includes('|')) {
        const parts = extRef.split('|');
        const refOrgId = parts[0];
        const instance_name = parts[1];
        const telefone = parts[2];
        const isRenewal = parts[3] === 'RENEWAL';
        const clientId = parts[4];
        const planName = parts[5];
        
        // Verificação de segurança
        if (refOrgId === orgId) {
          const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(paymentData.transaction_amount);
          
          let mensagemRecibo = `✅ *Pagamento Confirmado!*\n\nRecebemos o seu pagamento de ${valorFormatado}.\nMuito obrigado!`;

          // 4. Injetar a ordem de envio na fila do WhatsApp
          await messageQueue.add('send-message', {
            organization_id: orgId,
            instance_id: null, // Padrão
            instance_name: instance_name,
            phone: telefone,
            message: mensagemRecibo,
            source: 'mercadopago_webhook'
          });
          
          console.log(`[Webhook MP] Recibo enviado com sucesso para ${telefone} (Instância: ${instance_name})`);

          // 5. Se for renovação, notificar o admin
          if (isRenewal) {
            try {
              // Buscar os dados do cliente
              const { data: clientData } = await supabaseAdmin
                .from('clients')
                .select('name')
                .eq('id', clientId)
                .single();
                
              // Buscar telefone de suporte do administrador (dono da org)
              const { data: orgUser } = await supabaseAdmin.auth.admin.getUserById(orgId);
              let adminPhone = orgUser?.user?.user_metadata?.support_phone;
              
              if (adminPhone) {
                adminPhone = adminPhone.replace(/\D/g, ''); // Limpa formatação
                const adminMsg = `🔔 *NOVA RENOVAÇÃO PAGA!*\n\nO cliente acabou de pagar o Pix de renovação automático pelo robô.\n\n*Cliente:* ${clientData?.name || 'Desconhecido'}\n*Telefone:* ${telefone}\n*Plano Escolhido:* ${planName || 'N/A'}\n*Valor:* ${valorFormatado}\n*ID do Cliente:* ${clientId}\n\n_Acesse o painel para atualizar a data de vencimento do cliente._`;
                
                await messageQueue.add('send-message', {
                  organization_id: orgId,
                  instance_id: null,
                  instance_name: instance_name,
                  phone: adminPhone,
                  message: adminMsg,
                  source: 'mercadopago_webhook_admin'
                });
                console.log(`[Webhook MP] Notificação de renovação enviada para o admin (${adminPhone})`);
              }
            } catch (err) {
              console.error('[Webhook MP] Erro ao notificar admin sobre renovação:', err);
            }
          }

          await logAudit({
            user_id: null,
            action: 'mercadopago.payment',
            resource: 'payments',
            resource_id: String(paymentId),
            details: { orgId, status: 'approved', amount: paymentData.transaction_amount, telefone, instance_name, isRenewal },
            ip_address: getIpFromRequest(req)
          });
        }
      }
    }

    return NextResponse.json({ received: true });

  } catch (error: any) {
    console.error('[Webhook MP] Erro Interno:', error);
    // Sempre devolvemos 200 pro MP parar de retentar se for um erro de parsing nosso
    return NextResponse.json({ received: true });
  }
}

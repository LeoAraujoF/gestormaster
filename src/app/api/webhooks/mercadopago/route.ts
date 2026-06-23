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

    // O MP pode enviar dados no body ou via query string
    if (url.searchParams.get('topic') === 'payment' || url.searchParams.get('type') === 'payment') {
      paymentId = url.searchParams.get('data.id') || url.searchParams.get('id');
    } else {
      const body = await req.json();
      if (body.action === 'payment.created' || body.action === 'payment.updated') {
        paymentId = body.data?.id;
      }
      if (body.type === 'payment') {
        paymentId = body.data?.id;
      }
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
      const extRef = paymentData.external_reference; // "orgId|instance_name|telefone"

      if (extRef && extRef.includes('|')) {
        const [refOrgId, instance_name, telefone] = extRef.split('|');
        
        // Verificação de segurança
        if (refOrgId === orgId) {
          const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(paymentData.transaction_amount);
          
          const mensagemRecibo = `✅ *Pagamento Confirmado!*\n\nRecebemos o seu pagamento de ${valorFormatado}.\nMuito obrigado!`;

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

          await logAudit({
            user_id: null,
            action: 'mercadopago.payment',
            resource: 'payments',
            resource_id: String(paymentId),
            details: { orgId, status: 'approved', amount: paymentData.transaction_amount, telefone, instance_name },
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

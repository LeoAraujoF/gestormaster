import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/service-role';
import { createClient } from '@/lib/supabase/server';
import { logAudit, getIpFromRequest } from '@/lib/audit';

export async function POST(req: Request) {
  try {
    let orgId: string | undefined = undefined;

    // 1. Extração de Chave (Autenticação Híbrida)
    const authHeader = req.headers.get('authorization');
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Autenticação via Chave de API (Robôs e Sistemas Externos)
      const token = authHeader.split(' ')[1];
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      const { data: keyData } = await supabaseAdmin
        .from('api_keys')
        .select('organization_id')
        .eq('key_hash', hash)
        .single();

      if (keyData) {
        orgId = keyData.organization_id;
        // Atualiza o last_used_at de forma assíncrona
        supabaseAdmin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('key_hash', hash).then();
      }
    } else {
      // Autenticação via Sessão Web (Dono do SaaS gerando manualmente no painel)
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        orgId = user.user_metadata?.organization_id;
      }
    }

    if (!orgId) {
      return NextResponse.json({ error: 'Não autorizado. Forneça um Bearer Token válido ou faça login no painel.' }, { status: 401 });
    }

    // 3. Pegar os dados da requisição do cliente
    // { valor: 50.00, descricao: "Camiseta", telefone_pagador: "5511999999999", instance_name: "whatsapp-loja" }
    const payload = await req.json();
    const { valor, descricao, telefone_pagador, instance_name } = payload;

    if (!valor || !telefone_pagador || !instance_name) {
      return NextResponse.json({ error: 'Campos obrigatórios: valor, telefone_pagador, instance_name' }, { status: 400 });
    }

    // 4. Buscar Integração do Mercado Pago
    const { data: mpInt } = await supabaseAdmin
      .from('integrations')
      .select('credentials')
      .eq('organization_id', orgId)
      .eq('provider', 'mercadopago')
      .eq('is_active', true)
      .single();

    if (!mpInt?.credentials?.access_token) {
      return NextResponse.json({ error: 'Integração com Mercado Pago não encontrada ou inativa' }, { status: 400 });
    }

    const accessToken = mpInt.credentials.access_token;

    // 5. Chamar a API Oficial do Mercado Pago
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    
    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'X-Idempotency-Key': crypto.randomUUID()
      },
      body: JSON.stringify({
        transaction_amount: Number(valor),
        description: descricao || "Pagamento via Pix",
        payment_method_id: "pix",
        payer: {
          email: "pagamento@automacao.com", // Obrigatório para o MP, mas pode ser fictício se não houver
        },
        // O Pulo do Gato: Escondemos a origem aqui para quando o webhook voltar sabermos pra quem mandar!
        external_reference: `${orgId}|${instance_name}|${telefone_pagador}`,
        notification_url: `${appUrl}/api/webhooks/mercadopago?orgId=${orgId}`
      })
    });

    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error('Erro MP:', mpData);
      return NextResponse.json({ error: 'Falha ao processar pagamento no Mercado Pago', details: mpData }, { status: 500 });
    }

    // 6. Audit log
    await logAudit({
      user_id: orgId,
      action: 'pix.generate',
      resource: 'payments',
      resource_id: String(mpData.id),
      details: { valor, telefone_pagador, instance_name },
      ip_address: getIpFromRequest(req)
    });

    // 7. Resposta Sucesso (Devolve Copia&Cola e QR Code)
    return NextResponse.json({
      success: true,
      pix_id: mpData.id,
      copia_e_cola: mpData.point_of_interaction?.transaction_data?.qr_code,
      qr_code_base64: mpData.point_of_interaction?.transaction_data?.qr_code_base64,
      ticket_url: mpData.point_of_interaction?.transaction_data?.ticket_url,
    });

  } catch (error: any) {
    console.error('API Pix Error:', error);
    return NextResponse.json({ error: 'Erro interno', message: error.message }, { status: 500 });
  }
}

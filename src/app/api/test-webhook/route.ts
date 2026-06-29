import { NextResponse } from 'next/server';
import { messageQueue } from '@/lib/queue';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const orgId = '1f93ac70-acf2-40a8-9c09-941982d78260';
    const instanceName = 'gestor_66a1f90c_g58xx';
    const phone = '553391318343';

    await messageQueue.add('send-message', {
      organization_id: orgId,
      instance_id: null,
      instance_name: instanceName,
      phone: phone,
      message: '✅ *Pagamento Confirmado!*\n\nRecebemos o seu pagamento de R$ 30,00.\nMuito obrigado! (SIMULAÇÃO)',
      source: 'mercadopago_webhook'
    });

    await messageQueue.add('send-message', {
      organization_id: orgId,
      instance_id: null,
      instance_name: instanceName,
      phone: phone, // manda pro mesmo telefone pra ele ver
      message: '🔔 *NOVA RENOVAÇÃO PAGA!*\n\nO cliente acabou de pagar o Pix de renovação automático pelo robô.\n\n*Cliente:* Teste Simulação\n*Plano Escolhido:* Mensal\n*Valor:* R$ 30,00',
      source: 'mercadopago_webhook_admin'
    });

    return NextResponse.json({ success: true, message: 'Simulated webhook fired!' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

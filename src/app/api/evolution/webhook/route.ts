import { NextResponse } from 'next/server';
import { webhookQueue } from '@/lib/queue';

export async function POST(req: Request) {
  try {
    // 1. Log dos Headers Reais (Para descobrir se a Evolution versão atual envia HMAC)
    const headersList = req.headers;
    console.log('--- [WEBHOOK INBOUND] HEADERS RECEBIDOS ---');
    headersList.forEach((value, key) => console.log(`${key}: ${value}`));
    console.log('-------------------------------------------');

    // 2. Proteção provisória/permanente por Secret Token via Query ou Header
    const url = new URL(req.url);
    const token = url.searchParams.get('token') || headersList.get('authorization');
    const mySecret = process.env.WEBHOOK_SECRET;

    if (mySecret && token !== mySecret) {
      console.warn('Bloqueado: Tentativa de webhook sem token ou token inválido');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    
    // Roteamento para Fila
    // TODO: Adicionar proteção HMAC no futuro.
    
    await webhookQueue.add('evolution-webhook', payload, {
      priority: payload.event === 'CONNECTION_UPDATE' ? 1 : 2 // 1 = Critical, 2 = High
    });

    return NextResponse.json({ received: true }, { status: 200 });

  } catch (error: any) {
    console.error('Webhook error:', error);
    // Devolvemos 500 para forçar a Evolution API a retentar, caso o Redis caia.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

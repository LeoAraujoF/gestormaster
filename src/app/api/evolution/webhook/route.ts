import { NextResponse } from 'next/server';
import { webhookQueue } from '@/lib/queue';

export async function POST(req: Request) {
  try {
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

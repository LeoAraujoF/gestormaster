import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { webhookQueue } from '@/lib/queue';
import { supabaseAdmin } from '@/lib/supabase/service-role';
import { SecretsManager } from '@/lib/encryption';

export async function POST(req: Request) {
  try {
    const headersList = req.headers;

    // 1. Proteção por Secret Token via Query ou Header
    const url = new URL(req.url);
    const token = url.searchParams.get('token') || headersList.get('authorization');
    const secretsEnv = process.env.WEBHOOK_SECRETS || process.env.WEBHOOK_SECRET || '';
    const validSecrets = secretsEnv.split(',').map(s => s.trim()).filter(Boolean);

    if (validSecrets.length === 0) {
      console.warn('Bloqueado: Variável WEBHOOK_SECRETS não configurada no servidor.');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    if (!token || !validSecrets.includes(token)) {
      console.warn('Bloqueado: Tentativa de webhook sem token ou token inválido');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Ler o body como texto bruto para HMAC e depois parsear
    const rawBody = await req.text();
    const payload = JSON.parse(rawBody);

    // 3. Validação HMAC (opcional, controlada pelo admin)
    try {
      const { data: secSettings } = await supabaseAdmin
        .from('security_settings')
        .select('hmac_secret, require_signature')
        .limit(1)
        .single();

      if (secSettings?.require_signature) {
        const incomingSignature = headersList.get('x-hmac-signature') 
          || headersList.get('x-hub-signature-256')
          || headersList.get('x-signature')
          || headersList.get('apikey')
          || headersList.get('x-webhook-secret');

        if (incomingSignature) {
          // Descriptografar o secret armazenado no banco
          const secret = SecretsManager.decrypt(secSettings.hmac_secret);
          
          // 1. Verificar se é apenas o secret estático (Evolution API envia puro no header)
          const isStaticMatch = crypto.timingSafeEqual(
            Buffer.from(incomingSignature.padEnd(secret.length, ' ')), 
            Buffer.from(secret.padEnd(incomingSignature.length, ' '))
          ) && incomingSignature === secret;

          // 2. Computar HMAC esperado (caso a Evolution implemente assinatura real no futuro)
          const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(rawBody)
            .digest('hex');

          let isHmacMatch = false;
          try {
            const sigClean = incomingSignature.replace('sha256=', '');
            const sigBuffer = Buffer.from(sigClean, 'utf8');
            const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
            isHmacMatch = sigBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(sigBuffer, expectedBuffer);
          } catch (e) {}

          if (!isStaticMatch && !isHmacMatch) {
            console.warn('Bloqueado: Assinatura ou Secret inválido no webhook da Evolution');
            return NextResponse.json({ error: 'Invalid webhook secret/signature' }, { status: 401 });
          }

          console.log('[WEBHOOK] Assinatura/Secret validado com sucesso ✓');
        } else {
          console.warn('[WEBHOOK] Validação exigida mas nenhum header (apikey, x-signature) foi recebido. Bloqueando.');
          return NextResponse.json({ error: 'Missing webhook secret' }, { status: 401 });
        }
      }
    } catch (hmacError) {
      // Se falhar ao ler as configs de segurança, não bloqueia o webhook
      console.warn('[WEBHOOK] Erro ao verificar HMAC (não bloqueante):', hmacError);
    }

    // 4. Roteamento para Fila
    await webhookQueue.add('evolution-webhook', payload, {
      priority: payload.event === 'CONNECTION_UPDATE' ? 1 : 2
    });

    return NextResponse.json({ received: true }, { status: 200 });

  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

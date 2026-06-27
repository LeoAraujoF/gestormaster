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
          || headersList.get('x-signature');

        if (incomingSignature) {
          // Descriptografar o secret armazenado no banco
          const secret = SecretsManager.decrypt(secSettings.hmac_secret);
          
          // Computar HMAC esperado
          const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(rawBody)
            .digest('hex');

          // Comparação segura contra timing attacks
          const sigBuffer = Buffer.from(incomingSignature.replace('sha256=', ''), 'utf8');
          const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

          if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
            console.warn('Bloqueado: Assinatura HMAC inválida no webhook da Evolution');
            return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 401 });
          }

          console.log('[WEBHOOK] Assinatura HMAC validada com sucesso ✓');
        } else {
          // Se exige assinatura mas não veio nenhuma, loga mas permite
          // (A Evolution pode não enviar HMAC dependendo da versão/config)
          console.warn('[WEBHOOK] Assinatura HMAC exigida mas não recebida. Permitindo por compatibilidade.');
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

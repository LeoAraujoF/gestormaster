import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/service-role';
import { redisConnection } from '@/lib/redis';
import { getOrganizationMembership } from '@/lib/access-control';
import { organizationHasCapability } from '@/lib/plan-catalog';

function isSafeMessage(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 1_000
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const membership = await getOrganizationMembership(supabase, user.id);
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Organização não autorizada' }, { status: 403 });
    }
    const orgId = membership.organizationId
    if (!(await organizationHasCapability(orgId, 'self_service'))) return NextResponse.json({ error: 'Recurso disponível nos planos Pro e Master', upgrade_required: true }, { status: 403 })

    // Busca configurações
    const { data: integration } = await supabaseAdmin
      .from('integrations')
      .select('credentials')
      .eq('organization_id', orgId)
      .eq('provider', 'autoatendimento')
      .maybeSingle();

    const config = integration?.credentials || {
      enabled: true,
      greetingMessage: "Olá 👋\nComo posso te ajudar hoje?",
      transferMessage: "Um atendente humano assumirá o atendimento em breve. Por favor, aguarde! ⏳",
      invalidPlanMessage: "Não consegui identificar o valor do seu plano. Por favor, escolha a opção 4 para falar com um atendente.",
      pixErrorMessage: "Desculpe, ocorreu um erro ao gerar o seu PIX. O sistema pode estar indisponível."
    };

    // Busca pessoas pausadas no Redis (bot_pause:orgId:phone)
    const pausePattern = `bot_pause:${orgId}:*`;
    let pausedClients: any[] = [];

    try {
      const keys = await redisConnection.keys(pausePattern);
      for (const key of keys) {
        const ttl = await redisConnection.ttl(key);
        const phone = key.split(':').pop();
        pausedClients.push({
          phone,
          expiresInSeconds: ttl
        });
      }
    } catch (redisErr) {
      console.warn("Aviso: Redis inacessível localmente, pulando lista de pausas.", redisErr);
    }

    return NextResponse.json({ config, pausedClients });

  } catch (error: any) {
    console.error('Autoatendimento API GET Error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const membership = await getOrganizationMembership(supabase, user.id);
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Organização não autorizada' }, { status: 403 });
    }
    const orgId = membership.organizationId
    if (!(await organizationHasCapability(orgId, 'self_service'))) return NextResponse.json({ error: 'Recurso disponível nos planos Pro e Master', upgrade_required: true }, { status: 403 })
    const body = await req.json();

    if (body.action === 'save_config') {
      const { enabled, greetingMessage, transferMessage, invalidPlanMessage, pixErrorMessage } = body.config || {};
      if (
        typeof enabled !== 'boolean' ||
        !isSafeMessage(greetingMessage) ||
        !isSafeMessage(transferMessage) ||
        !isSafeMessage(invalidPlanMessage) ||
        !isSafeMessage(pixErrorMessage)
      ) {
        return NextResponse.json({ error: 'Configuração inválida' }, { status: 400 })
      }

      const { data: existing } = await supabaseAdmin
        .from('integrations')
        .select('id')
        .eq('organization_id', orgId)
        .eq('provider', 'autoatendimento')
        .maybeSingle();

      const creds = { enabled, greetingMessage, transferMessage, invalidPlanMessage, pixErrorMessage };

      if (existing) {
        await supabaseAdmin
          .from('integrations')
          .update({ credentials: creds, is_active: enabled })
          .eq('id', existing.id);
      } else {
        await supabaseAdmin
          .from('integrations')
          .insert({
            organization_id: orgId,
            provider: 'autoatendimento',
            credentials: creds,
            is_active: enabled
          });
      }
      return NextResponse.json({ success: true });
    }

    if (body.action === 'unpause') {
      const { phone } = body;
      if (typeof phone !== 'string' || !/^\d{10,15}$/.test(phone)) {
        return NextResponse.json({ error: 'Telefone inválido' }, { status: 400 })
      }
      const pauseKey = `bot_pause:${orgId}:${phone}`;
      await redisConnection.del(pauseKey);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (error: any) {
    console.error('Autoatendimento API POST Error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

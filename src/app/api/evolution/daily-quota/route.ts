import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { getAuthorizedOrganizationId } from '@/lib/access-control'
import { getOrganizationPlanContext } from '@/lib/plan-catalog'
import { resolveOrganizationSendPolicy } from '@/lib/organization-send-policy'
import { peekInstanceDailyUsage } from '@/lib/whatsapp-safety'

/**
 * Consumo diário de mensagens por número.
 *
 * O contador vive no Redis (`whatsapp:instance-daily:<instância>:<dia local>`) e
 * até aqui era completamente invisível: em 10/09/2026 um teto de 80 mensagens por
 * dia — posto como DEFAULT de coluna em agosto, sem nenhum controle na interface —
 * barrou os lembretes das 18h05 e as boas-vindas de 5 clientes novos, e não havia
 * como o operador descobrir o motivo pela tela.
 *
 * O teto agora é do plano: Starter e Pro têm número, Master é ilimitado.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const organizationId = await getAuthorizedOrganizationId(supabase, user.id)
    if (!organizationId) return NextResponse.json({ error: 'Organização não autorizada' }, { status: 403 })

    const [plan, sendPolicy, { data: instances, error }] = await Promise.all([
      getOrganizationPlanContext(organizationId),
      resolveOrganizationSendPolicy(organizationId),
      supabaseAdmin
        .from('evolution_instances')
        .select('id, instance_name, phone_number, status, is_primary, allow_mass')
        .eq('organization_id', organizationId)
        .order('is_primary', { ascending: false }),
    ])

    if (error) throw error

    const limit = plan.limits.dailyMessagesPerInstance
    const unlimited = limit === null

    const numeros = await Promise.all((instances || []).map(async (instance) => {
      // Ilimitado não consome contador, então não há o que ler.
      const usage = unlimited
        ? { used: 0, resetInMs: 0 }
        : await peekInstanceDailyUsage(instance.id, sendPolicy.timeZone)
      const remaining = unlimited ? null : Math.max(0, limit - usage.used)
      return {
        instance_name: instance.instance_name,
        phone_number: instance.phone_number,
        status: instance.status,
        is_primary: instance.is_primary === true,
        allow_mass: instance.allow_mass === true,
        role: instance.is_primary ? 'alerts' : instance.allow_mass ? 'mass' : 'alerts',
        used: unlimited ? null : usage.used,
        remaining,
        exhausted: unlimited ? false : usage.used >= limit,
        reset_in_ms: usage.resetInMs,
      }
    }))

    return NextResponse.json({
      success: true,
      plan: plan.plan,
      limit,
      unlimited,
      timezone: sendPolicy.timeZone,
      // O alerta na tela liga por aqui: basta um número esgotado para a operação
      // já estar travada, porque lembrete e cobrança dependem de número livre.
      any_exhausted: numeros.some((numero) => numero.exhausted),
      exhausted_instances: numeros.filter((numero) => numero.exhausted).map((numero) => numero.instance_name),
      instances: numeros,
    })
  } catch (error: unknown) {
    console.error('daily-quota GET error:', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}

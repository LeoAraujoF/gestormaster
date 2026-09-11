import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { logAudit, getIpFromRequest } from '@/lib/audit'
import { getAuthorizedOrganizationId } from '@/lib/access-control'
import { resolveOrganizationTimezone } from '@/lib/organization-send-policy'
import { dateInTimezone } from '@/lib/contact-policy'

/**
 * Fila de envios: o que está esperando, por que, e cancelar.
 *
 * Em 11/09/2026 lembretes da régua das 18h05 do dia anterior saíram às 08:25 da
 * manhã seguinte e não havia como cancelá-los. Os freios existiam, mas nenhum se
 * apresentava como "cancelar esta mensagem": pausar a régua inteira (que tem outro
 * significado — desliga a régua), parar a campanha (só campanha de leads) ou
 * remover o job no Bull Board (master admin, ferramenta crua). E nada mostrava o
 * que estava na fila nem desde quando.
 *
 * O cancelamento aqui é de estado, não de fila: marca `alert_history` como
 * `cancelled` (e a reserva de contato, quando existe). O worker relê isso
 * imediatamente antes de enviar e encerra sem enviar — o mesmo padrão do freio de
 * campanha, que dispensa acesso ao Redis e mantém uma só fonte de verdade.
 */

const AGUARDANDO = ['pending', 'queued'] as const

/**
 * Extrai o dia pretendido do id do job do agendador, que tem o formato
 * `auto-<regra>-<cliente>-YYYY-MM-DD` (ver scheduler-service). Devolve null para
 * qualquer outro formato — campanha, reenvio manual e contato coordenado não
 * carregam dia no id, e nesses casos a data de criação da linha serve.
 */
function diaDoJobAgendado(sourceJobId: string | null): string | null {
  if (!sourceJobId) return null
  const encontrado = /(\d{4}-\d{2}-\d{2})$/.exec(sourceJobId)
  return encontrado ? encontrado[1] : null
}

const actionSchema = z.union([
  z.object({ action: z.literal('cancel'), ids: z.array(z.string().uuid()).min(1).max(500) }),
  z.object({ action: z.literal('cancel_all') }),
  z.object({ action: z.literal('cancel_stale') }),
])

/** Tradução dos motivos técnicos para o que o operador precisa entender. */
const MOTIVOS: Record<string, string> = {
  INSTANCE_DAILY_LIMIT_REACHED: 'Limite diário do número atingido',
  INSTANCE_SEND_SLOT_SATURATED: 'Fila do número cheia; aguardando vaga',
  INSTANCE_SENDING_PAUSED: 'Envio pausado neste número',
  OUTSIDE_SEND_WINDOW: 'Fora da janela de horário permitido',
  CIRCUIT_BREAKER_OPEN: 'Provedor instável; aguardando recuperação',
  MASS_RUN_PAUSED: 'Campanha pausada',
  INSTANCE_SEND_SLOT: 'Aguardando o intervalo entre mensagens',
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const organizationId = await getAuthorizedOrganizationId(supabase, user.id)
    if (!organizationId) return NextResponse.json({ error: 'Organização não autorizada' }, { status: 403 })

    const timeZone = await resolveOrganizationTimezone(organizationId)
    const hojeLocal = dateInTimezone(new Date(), timeZone)

    const { data: linhas, error } = await supabaseAdmin
      .from('alert_history')
      .select('id, status, error_message, phone, instance_name, created_at, scheduled_at, client_id, lead_id, mass_run_id, source_job_id')
      .eq('organization_id', organizationId)
      .in('status', AGUARDANDO as unknown as string[])
      .order('created_at', { ascending: true })
      .limit(500)

    if (error) throw error

    const clientIds = [...new Set((linhas || []).map((l) => l.client_id).filter(Boolean))] as string[]
    const { data: clientes } = clientIds.length
      ? await supabaseAdmin.from('clients').select('id, name').in('id', clientIds)
      : { data: [] }
    const nomePorCliente = new Map((clientes || []).map((c) => [c.id, c.name as string]))

    const itens = (linhas || []).map((linha) => {
      // Comparação em dia **local**: em UTC erraria por 3 horas toda noite.
      const diaLocal = dateInTimezone(new Date(linha.created_at), timeZone)
      // `created_at` não basta para saber se a mensagem é de um dia anterior: a
      // linha é escrita quando o worker processa, então um lembrete de ontem que
      // só acordou hoje às 08:19 nasce com data de hoje. Foi exatamente o caso
      // de 11/09/2026. O dia pretendido está no id do job do agendador, que
      // termina em YYYY-MM-DD — e é o único lugar na própria linha que guarda
      // essa informação.
      const diaPretendido = diaDoJobAgendado(linha.source_job_id) ?? diaLocal
      return {
        id: linha.id,
        status: linha.status,
        phone: linha.phone,
        client_name: linha.client_id ? nomePorCliente.get(linha.client_id) || 'Cliente' : null,
        is_lead: Boolean(linha.lead_id),
        is_campaign: Boolean(linha.mass_run_id),
        instance_name: linha.instance_name,
        created_at: linha.created_at,
        scheduled_at: linha.scheduled_at,
        reason_code: linha.error_message,
        reason: linha.error_message
          ? MOTIVOS[String(linha.error_message).split(':')[0]] || linha.error_message
          : 'Aguardando processamento',
        // Atrasada: o dia para o qual a mensagem foi agendada já passou. É o caso
        // que o operador quase sempre quer cancelar.
        stale: diaPretendido < hojeLocal,
        created_local_day: diaLocal,
        intended_day: diaPretendido,
      }
    })

    return NextResponse.json({
      success: true,
      timezone: timeZone,
      today_local: hojeLocal,
      total: itens.length,
      stale_total: itens.filter((item) => item.stale).length,
      items: itens,
    })
  } catch (error: unknown) {
    console.error('send-queue GET error:', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const organizationId = await getAuthorizedOrganizationId(supabase, user.id)
    if (!organizationId) return NextResponse.json({ error: 'Organização não autorizada' }, { status: 403 })

    const parsed = actionSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Informe action: cancel (com ids), cancel_all ou cancel_stale.' }, { status: 400 })
    }

    // Decide o conjunto a cancelar sempre a partir do que está aguardando nesta
    // organização: ids de fora, ou de mensagem já enviada, simplesmente não entram.
    let alvoQuery = supabaseAdmin
      .from('alert_history')
      .select('id, created_at, source_job_id')
      .eq('organization_id', organizationId)
      .in('status', AGUARDANDO as unknown as string[])

    if (parsed.data.action === 'cancel') alvoQuery = alvoQuery.in('id', parsed.data.ids)

    const { data: candidatas, error: alvoError } = await alvoQuery
    if (alvoError) throw alvoError

    let ids = (candidatas || []).map((linha) => linha.id)

    if (parsed.data.action === 'cancel_stale') {
      const timeZone = await resolveOrganizationTimezone(organizationId)
      const hojeLocal = dateInTimezone(new Date(), timeZone)
      // Exatamente o mesmo critério do GET, incluindo o dia pretendido do job do
      // agendador. Divergir aqui faria o botão "cancelar as atrasadas" ignorar
      // justamente as linhas que o aviso contou.
      ids = (candidatas || [])
        .filter((linha) => {
          const diaPretendido = diaDoJobAgendado(linha.source_job_id)
            ?? dateInTimezone(new Date(linha.created_at), timeZone)
          return diaPretendido < hojeLocal
        })
        .map((linha) => linha.id)
    }

    if (ids.length === 0) {
      return NextResponse.json({ success: true, cancelled: 0, message: 'Nada aguardando envio para cancelar.' })
    }

    const agora = new Date().toISOString()

    const { error: cancelError } = await supabaseAdmin
      .from('alert_history')
      .update({ status: 'cancelled', failed_at: agora, error_message: 'CANCELLED_BY_OPERATOR' })
      .in('id', ids)
      .eq('organization_id', organizationId)
      .in('status', AGUARDANDO as unknown as string[])

    if (cancelError) throw cancelError

    // A reserva de contato também precisa cair: ela é o que segura o "um contato
    // por cliente por dia", e deixá-la ocupada bloquearia um envio legítimo mais
    // tarde por uma mensagem que o operador acabou de cancelar.
    const { error: reservaError } = await supabaseAdmin
      .from('contact_reservations')
      .update({ status: 'cancelled', decision_reason: 'CANCELLED_BY_OPERATOR', updated_at: agora })
      .in('alert_history_id', ids)
      .not('status', 'in', '("sent","cancelled")')
    if (reservaError) console.error('send-queue: falha ao cancelar reservas', reservaError)

    await logAudit({
      user_id: user.id,
      organization_id: organizationId,
      action: 'whatsapp.cancel_queued_messages',
      resource: 'alert_history',
      details: { action: parsed.data.action, cancelled_count: ids.length },
      ip_address: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true, cancelled: ids.length })
  } catch (error: unknown) {
    console.error('send-queue POST error:', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}

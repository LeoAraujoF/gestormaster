import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { logAudit, getIpFromRequest } from '@/lib/audit'
import { getAuthorizedOrganizationId } from '@/lib/access-control'

/**
 * Controle das execuções de campanha em massa.
 *
 * Existe porque até 10/09/2026 não havia freio: o botão "PARAR CAMPANHA" da tela
 * de Leads só chamava `AbortController.abort()`, que cancela a requisição HTTP.
 * Depois do 202 os jobs já estavam na fila com atraso programado e seguiam
 * saindo — numa campanha de 102 mensagens, 80 continuaram enfileiradas sem
 * nenhuma forma de parar pela interface.
 *
 * O freio aqui é de estado, não de fila: muda o status da execução, e o worker
 * consulta esse status imediatamente antes de cada envio. Não precisa de acesso
 * ao Redis nem remover jobs um a um.
 */

const controlSchema = z.object({
  runId: z.string().uuid(),
  action: z.enum(['pause', 'resume', 'stop']),
})

const STATUS_BY_ACTION = {
  pause: 'paused',
  resume: 'running',
  stop: 'stopped',
} as const

// Só faz sentido agir sobre execução que ainda pode enviar algo.
const ACTIONABLE = ['running', 'paused'] as const

/** Execuções ativas da organização, para a tela saber o que oferecer. */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const organizationId = await getAuthorizedOrganizationId(supabase, user.id)
    if (!organizationId) return NextResponse.json({ error: 'Organização não autorizada' }, { status: 403 })

    const { data: runs, error } = await supabaseAdmin
      .from('mass_campaign_runs')
      .select('id, status, instance_names, total_messages, skipped_messages, created_at, updated_at')
      .eq('organization_id', organizationId)
      .in('status', ACTIONABLE as unknown as string[])
      .order('created_at', { ascending: false })

    if (error) throw error

    // Quantas ainda podem sair, por execução: é o número que o operador precisa
    // para decidir se vale parar.
    const comPendentes = await Promise.all((runs || []).map(async (run) => {
      const { count } = await supabaseAdmin
        .from('alert_history')
        .select('id', { count: 'exact', head: true })
        .eq('mass_run_id', run.id)
        .in('status', ['queued', 'pending'])
      return { ...run, pending_messages: count ?? 0 }
    }))

    return NextResponse.json({ success: true, runs: comPendentes })
  } catch (error: unknown) {
    console.error('campaign-runs GET error:', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const organizationId = await getAuthorizedOrganizationId(supabase, user.id)
    if (!organizationId) return NextResponse.json({ error: 'Organização não autorizada' }, { status: 403 })

    const parsed = controlSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Informe runId e action (pause, resume ou stop).' }, { status: 400 })
    }
    const { runId, action } = parsed.data

    const { data: run, error: runError } = await supabaseAdmin
      .from('mass_campaign_runs')
      .select('id, status, organization_id')
      .eq('id', runId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (runError) throw runError
    if (!run) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 })

    if (!ACTIONABLE.includes(run.status as typeof ACTIONABLE[number])) {
      return NextResponse.json({
        error: run.status === 'stopped'
          ? 'Esta campanha já foi parada.'
          : 'Esta campanha já terminou.',
        status: run.status,
      }, { status: 409 })
    }

    const novoStatus = STATUS_BY_ACTION[action]
    const agora = new Date().toISOString()

    const { error: updateError } = await supabaseAdmin
      .from('mass_campaign_runs')
      .update({
        status: novoStatus,
        updated_at: agora,
        ...(action === 'stop' ? { stop_reason: 'OPERATOR', finished_at: agora } : {}),
        ...(action === 'resume' ? { stop_reason: null } : {}),
      })
      .eq('id', runId)
      .eq('organization_id', organizationId)

    if (updateError) throw updateError

    // As linhas ainda não entregues passam a refletir o freio. Os jobs na fila
    // não são removidos de propósito: cada um acorda, lê o status da execução e
    // encerra sozinho — o que evita depender de acesso ao Redis e mantém um
    // único lugar decidindo se a mensagem sai.
    let afetadas = 0
    if (action === 'stop') {
      const { data: canceladas, error: cancelError } = await supabaseAdmin
        .from('alert_history')
        .update({ status: 'failed', failed_at: agora, error_message: 'MASS_RUN_STOPPED:OPERATOR' })
        .eq('mass_run_id', runId)
        .in('status', ['queued', 'pending'])
        .select('id')
      if (cancelError) throw cancelError
      afetadas = canceladas?.length ?? 0
    }

    await logAudit({
      user_id: user.id,
      organization_id: organizationId,
      action: `whatsapp.campaign_${action}`,
      resource: 'mass_campaign_runs',
      resource_id: runId,
      details: { previous_status: run.status, new_status: novoStatus, cancelled_messages: afetadas },
      ip_address: getIpFromRequest(request),
    })

    return NextResponse.json({
      success: true,
      run_id: runId,
      status: novoStatus,
      cancelled_messages: afetadas,
    })
  } catch (error: unknown) {
    console.error('campaign-runs PATCH error:', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}

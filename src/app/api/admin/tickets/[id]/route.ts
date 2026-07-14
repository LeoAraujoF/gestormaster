import { NextResponse } from 'next/server'
import { AdminAccessError, claimAdminAction, finishAdminAction, protectAdminMutation } from '@/lib/admin-security'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { getIpFromRequest, logAudit } from '@/lib/audit'
import { adminTicketIdSchema, adminTicketStatusPatchSchema, adminTicketStatusSchema, isAdminTicketTransitionAllowed } from '../_contracts'
import { adminTicketErrorResponse, adminTicketNotFoundResponse } from '../_errors'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let claimId: string | null = null
  try {
    const admin = await protectAdminMutation(request)
    const id = adminTicketIdSchema.parse((await params).id)
    const input = adminTicketStatusPatchSchema.parse(await request.json())
    const { data: current, error: currentError } = await supabaseAdmin
      .from('tickets')
      .select('id,status,organization_id,updated_at')
      .eq('id', id)
      .maybeSingle()
    if (currentError) throw currentError
    if (!current) return adminTicketNotFoundResponse()
    const currentStatus = adminTicketStatusSchema.safeParse(current.status)
    if (!currentStatus.success) {
      return NextResponse.json(
        { error: { code: 'ADMIN_TICKET_UNSUPPORTED_STATE', message: 'O chamado possui um status não suportado' } },
        { status: 409 },
      )
    }

    if (currentStatus.data === input.status) {
      return NextResponse.json({ data: current, meta: { unchanged: true } })
    }
    if (!isAdminTicketTransitionAllowed(currentStatus.data, input.status)) {
      return NextResponse.json(
        { error: { code: 'ADMIN_TICKET_INVALID_TRANSITION', message: 'Transição de status não permitida' } },
        { status: 409 },
      )
    }

    claimId = await claimAdminAction(
      admin,
      {
        idempotencyKey: input.idempotencyKey,
        reason: `Transição do chamado ${id}`,
        confirmation: 'ALTERAR STATUS',
      },
      'admin.ticket.status',
    )

    const updatedAt = new Date().toISOString()
    const { data, error } = await supabaseAdmin
      .from('tickets')
      .update({ status: input.status, updated_at: updatedAt })
      .eq('id', id)
      .eq('status', currentStatus.data)
      .select('id,status,organization_id,updated_at')
      .maybeSingle()
    if (error) throw error
    if (!data) throw new AdminAccessError(409, 'ADMIN_TICKET_STATE_CONFLICT', 'O chamado foi alterado por outra sessão')

    await finishAdminAction(claimId, 'completed')
    await logAudit({
      user_id: admin.userId,
      organization_id: current.organization_id,
      action: 'admin.ticket.status',
      resource: 'tickets',
      resource_id: id,
      details: { from: currentStatus.data, to: input.status },
      correlation_id: input.idempotencyKey,
      outcome: 'success',
      ip_address: getIpFromRequest(request),
    })
    return NextResponse.json({ data, meta: {} })
  } catch (error) {
    if (claimId) await finishAdminAction(claimId, 'failed')
    return adminTicketErrorResponse(error)
  }
}

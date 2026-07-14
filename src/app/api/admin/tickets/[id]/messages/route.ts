import { NextResponse } from 'next/server'
import { claimAdminAction, finishAdminAction, protectAdminMutation, requireMasterAdmin } from '@/lib/admin-security'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { getIpFromRequest, logAudit } from '@/lib/audit'
import { adminTicketIdSchema, adminTicketReplySchema, adminTicketStatusSchema } from '../../_contracts'
import { adminTicketErrorResponse, adminTicketNotFoundResponse } from '../../_errors'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireMasterAdmin()
    const id = adminTicketIdSchema.parse((await params).id)
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('tickets')
      .select('id,status,user_id,organization_id,updated_at')
      .eq('id', id)
      .maybeSingle()
    if (ticketError) throw ticketError
    if (!ticket) return adminTicketNotFoundResponse()

    const { data, error } = await supabaseAdmin.from('ticket_messages').select('id,ticket_id,user_id,content,is_from_admin,created_at').eq('ticket_id', id).order('created_at')
    if (error) throw error
    return NextResponse.json({ data: data || [], meta: { ticket } })
  } catch (error) {
    return adminTicketErrorResponse(error)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let claimId: string | null = null
  try {
    const admin = await protectAdminMutation(request)
    const id = adminTicketIdSchema.parse((await params).id)
    const input = adminTicketReplySchema.parse(await request.json())
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('tickets')
      .select('id,status,organization_id,updated_at')
      .eq('id', id)
      .maybeSingle()
    if (ticketError) throw ticketError
    if (!ticket) return adminTicketNotFoundResponse()
    const ticketStatus = adminTicketStatusSchema.safeParse(ticket.status)
    if (!ticketStatus.success) {
      return NextResponse.json(
        { error: { code: 'ADMIN_TICKET_UNSUPPORTED_STATE', message: 'O chamado possui um status não suportado' } },
        { status: 409 },
      )
    }
    if (['closed', 'resolved'].includes(ticketStatus.data)) {
      return NextResponse.json(
        { error: { code: 'ADMIN_TICKET_CLOSED', message: 'Reabra o chamado antes de responder' } },
        { status: 409 },
      )
    }

    claimId = await claimAdminAction(
      admin,
      {
        idempotencyKey: input.idempotencyKey,
        reason: `Resposta ao chamado ${id}`,
        confirmation: 'RESPONDER',
      },
      'admin.ticket.reply',
    )

    const { data, error } = await supabaseAdmin.from('ticket_messages').insert({ ticket_id: id, user_id: admin.userId, content: input.content, is_from_admin: true }).select('id,ticket_id,user_id,content,is_from_admin,created_at').single()
    if (error) throw error

    const nextStatus = ticketStatus.data === 'open' ? 'in_progress' : ticketStatus.data
    const updatedAt = new Date().toISOString()
    const { data: touchedTicket, error: touchError } = await supabaseAdmin
      .from('tickets')
      .update({ status: nextStatus, updated_at: updatedAt })
      .eq('id', id)
      .select('status,updated_at')
      .maybeSingle()

    await finishAdminAction(claimId, 'completed')
    await logAudit({
      user_id: admin.userId,
      organization_id: ticket.organization_id,
      action: 'admin.ticket.reply',
      resource: 'tickets',
      resource_id: id,
      details: {
        message_id: data.id,
        status_from: ticketStatus.data,
        status_to: touchedTicket?.status || ticketStatus.data,
        ticket_touch_succeeded: !touchError && Boolean(touchedTicket),
      },
      correlation_id: input.idempotencyKey,
      outcome: 'success',
      ip_address: getIpFromRequest(request),
    })
    return NextResponse.json({
      data,
      meta: {
        ticketStatus: touchedTicket?.status || ticketStatus.data,
        ticketUpdatedAt: touchedTicket?.updated_at || ticket.updated_at,
        ticketTouchSucceeded: !touchError && Boolean(touchedTicket),
      },
    })
  } catch (error) {
    if (claimId) await finishAdminAction(claimId, 'failed')
    return adminTicketErrorResponse(error)
  }
}

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getIpFromRequest, logAudit } from '@/lib/audit'
import { adminCriticalActionSchema } from '@/lib/admin-types'
import {
  adminErrorResponse,
  claimAdminAction,
  finishAdminAction,
  protectAdminMutation,
} from '@/lib/admin-security'
import { supabaseAdmin } from '@/lib/supabase/service-role'

const incidentIdSchema = z.string().uuid()
const acknowledgeSchema = adminCriticalActionSchema.extend({
  action: z.literal('acknowledge'),
})

export async function PATCH(request: Request, context: RouteContext<'/api/admin/incidents/[id]'>) {
  let claimId: string | null = null
  try {
    const admin = await protectAdminMutation(request, { limit: 20 })
    const id = incidentIdSchema.parse((await context.params).id)
    const input = acknowledgeSchema.parse(await request.json().catch(() => null))
    if (input.confirmation !== 'RECONHECER INCIDENTE') {
      return NextResponse.json(
        { error: { code: 'ADMIN_CONFIRMATION_MISMATCH', message: 'Confirmação inválida' } },
        { status: 400 },
      )
    }

    claimId = await claimAdminAction(admin, input, 'admin.incident.acknowledge')
    const now = new Date().toISOString()
    const { data, error } = await supabaseAdmin
      .from('admin_incidents')
      .update({
        status: 'acknowledged',
        acknowledged_at: now,
        acknowledged_by: admin.userId,
        updated_at: now,
      })
      .eq('id', id)
      .neq('status', 'resolved')
      .select('id,status,acknowledged_at')
      .maybeSingle()

    if (error) throw error
    if (!data) {
      await finishAdminAction(claimId, 'failed')
      claimId = null
      return NextResponse.json(
        { error: { code: 'ADMIN_INCIDENT_NOT_FOUND', message: 'Incidente ativo não encontrado' } },
        { status: 404 },
      )
    }

    await finishAdminAction(claimId, 'completed')
    await logAudit({
      user_id: admin.userId,
      action: 'admin.incident.acknowledge',
      resource: 'admin_incidents',
      resource_id: id,
      reason: input.reason,
      correlation_id: input.idempotencyKey,
      outcome: 'success',
      ip_address: getIpFromRequest(request),
      details: { status: data.status },
    })

    return NextResponse.json({ data, meta: {} })
  } catch (error) {
    if (claimId) await finishAdminAction(claimId, 'failed')
    return adminErrorResponse(error)
  }
}

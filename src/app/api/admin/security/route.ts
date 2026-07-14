import { NextResponse } from 'next/server'

import { getIpFromRequest, logAudit } from '@/lib/audit'
import { adminCriticalActionSchema } from '@/lib/admin-types'
import {
  AdminAccessError,
  adminErrorResponse,
  claimAdminAction,
  finishAdminAction,
  protectAdminMutation,
  requireMasterAdmin,
} from '@/lib/admin-security'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { buildSecurityState, type SecurityAuditRecord, type SecurityInstanceRecord } from './security-state'

export const dynamic = 'force-dynamic'

const privateResponse = { 'Cache-Control': 'private, no-store, max-age=0' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function sanitizeAuditDetails(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null

  const details: Record<string, unknown> = {}
  for (const key of ['instances_total', 'instances_updated', 'instances_failed'] as const) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key])) details[key] = value[key]
  }
  for (const key of ['require_signature', 'previous_value'] as const) {
    if (typeof value[key] === 'boolean') details[key] = value[key]
  }
  if (typeof value.rotated_at === 'string') details.rotated_at = value.rotated_at
  if (typeof value.grace_expires_at === 'string') details.grace_expires_at = value.grace_expires_at

  if (Array.isArray(value.instance_results)) {
    details.instance_results = value.instance_results.flatMap((item) => {
      if (!isRecord(item) || typeof item.instance !== 'string' || typeof item.updated !== 'boolean') return []
      return [{
        instance: item.instance.slice(0, 200),
        updated: item.updated,
        failure_code: typeof item.failure_code === 'string' ? item.failure_code.slice(0, 80) : null,
      }]
    })
  }
  return details
}

function notFound() {
  return NextResponse.json(
    { error: { code: 'ADMIN_SECURITY_NOT_FOUND', message: 'Configuração não encontrada' } },
    { status: 404, headers: privateResponse },
  )
}

export async function GET() {
  try {
    await requireMasterAdmin()

    const [{ data: settings, error: settingsError }, { data: instances, error: instancesError }, { data: events, error: eventsError }] = await Promise.all([
      supabaseAdmin
        .from('security_settings')
        .select('id,require_signature,rotated_at,created_at,updated_at,hmac_secret,hmac_previous_valid_until')
        .limit(1)
        .single(),
      supabaseAdmin
        .from('evolution_instances')
        .select('instance_name,connection_mode,base_url,api_key,status')
        .order('instance_name', { ascending: true }),
      supabaseAdmin
        .from('audit_logs')
        .select('id,action,details,outcome,reason,correlation_id,created_at')
        .like('action', 'admin.security.%')
        .order('created_at', { ascending: false })
        .limit(12),
    ])

    if (settingsError || !settings) return notFound()
    if (instancesError) throw instancesError
    if (eventsError) throw eventsError

    const safeEvents = (events || []).map((event) => ({
      id: String(event.id),
      action: String(event.action),
      details: sanitizeAuditDetails(event.details),
      outcome: event.outcome === 'failure' ? 'failure' as const : 'success' as const,
      reason: typeof event.reason === 'string' ? event.reason : null,
      correlation_id: typeof event.correlation_id === 'string' ? event.correlation_id : null,
      created_at: String(event.created_at),
    }))
    const latestRotation = safeEvents.find((event) => event.action === 'admin.security.rotate_hmac') ?? null
    const hmacConfigured = Boolean(settings.hmac_secret)
    const previousValidUntil = settings.hmac_previous_valid_until
      ? new Date(settings.hmac_previous_valid_until).getTime()
      : Number.NaN
    const rotationGraceUntil = Number.isFinite(previousValidUntil) && previousValidUntil > Date.now()
      ? String(settings.hmac_previous_valid_until)
      : null
    const activeInstances = (instances || []).filter((instance) => String(instance.status) !== 'deleted')
    const state = buildSecurityState({
      hmacConfigured,
      requireSignature: Boolean(settings.require_signature),
      rotatedAt: settings.rotated_at ? String(settings.rotated_at) : null,
      instances: activeInstances as SecurityInstanceRecord[],
      latestRotation: latestRotation as SecurityAuditRecord | null,
      managedProviderConfigured: Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY),
    })

    return NextResponse.json({
      data: {
        settings: {
          id: String(settings.id),
          hmac_configured: hmacConfigured,
          require_signature: Boolean(settings.require_signature),
          rotated_at: settings.rotated_at ? String(settings.rotated_at) : null,
          rotation_grace_until: rotationGraceUntil,
          created_at: String(settings.created_at),
          updated_at: String(settings.updated_at),
        },
        ...state,
        events: safeEvents,
      },
      meta: { generated_at: new Date().toISOString() },
    }, { headers: privateResponse })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

export async function PUT(request: Request) {
  let claimId: string | null = null
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || typeof (body as Record<string, unknown>).require_signature !== 'boolean') {
      return NextResponse.json(
        { error: { code: 'ADMIN_INVALID_INPUT', message: 'Valor de assinatura inválido' } },
        { status: 400, headers: privateResponse },
      )
    }

    const requireSignature = (body as Record<string, unknown>).require_signature as boolean
    const admin = await protectAdminMutation(request, { recentAuth: true, limit: 10 })
    const critical = adminCriticalActionSchema.parse(body)
    const expectedConfirmation = requireSignature ? 'ATIVAR HMAC' : 'DESATIVAR HMAC'
    if (critical.confirmation !== expectedConfirmation) {
      return NextResponse.json(
        { error: { code: 'ADMIN_CONFIRMATION_MISMATCH', message: 'Confirmação inválida' } },
        { status: 400, headers: privateResponse },
      )
    }

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('security_settings')
      .select('id,hmac_secret,require_signature')
      .limit(1)
      .single()
    if (settingsError || !settings) return notFound()

    if (Boolean(settings.require_signature) === requireSignature) {
      return NextResponse.json({
        data: { require_signature: requireSignature, unchanged: true },
        meta: { generated_at: new Date().toISOString() },
      }, { headers: privateResponse })
    }
    if (requireSignature && !settings.hmac_secret) {
      throw new AdminAccessError(409, 'ADMIN_HMAC_NOT_CONFIGURED', 'Rotacione o secret antes de ativar a validação obrigatória')
    }

    const action = requireSignature ? 'admin.security.enable_hmac' : 'admin.security.disable_hmac'
    claimId = await claimAdminAction(admin, critical, action)

    const updatedAt = new Date().toISOString()
    const { error: updateError } = await supabaseAdmin
      .from('security_settings')
      .update({ require_signature: requireSignature, updated_at: updatedAt })
      .eq('id', settings.id)
    if (updateError) throw updateError

    await finishAdminAction(claimId, 'completed')
    await logAudit({
      user_id: admin.userId,
      action,
      resource: 'security_settings',
      details: { require_signature: requireSignature, previous_value: Boolean(settings.require_signature) },
      reason: critical.reason,
      correlation_id: critical.idempotencyKey,
      outcome: 'success',
      ip_address: getIpFromRequest(request),
    })

    return NextResponse.json({
      data: { require_signature: requireSignature, updated_at: updatedAt, unchanged: false },
      meta: { generated_at: new Date().toISOString() },
    }, { headers: privateResponse })
  } catch (error) {
    if (claimId) await finishAdminAction(claimId, 'failed')
    return adminErrorResponse(error)
  }
}

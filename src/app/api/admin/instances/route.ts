import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getIpFromRequest, logAudit } from '@/lib/audit'
import { SecretsManager } from '@/lib/encryption'
import { EvolutionAPI } from '@/lib/evolution'
import {
  adminErrorResponse,
  claimAdminAction,
  finishAdminAction,
  protectAdminMutation,
  requireMasterAdmin,
  type MasterAdminSession,
} from '@/lib/admin-security'
import { adminCriticalActionSchema } from '@/lib/admin-types'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { EvolutionWhatsAppProvider } from '@/providers/whatsapp/EvolutionWhatsAppProvider'

const instanceActionSchema = adminCriticalActionSchema.extend({
  action: z.enum(['set_primary', 'restart', 'disconnect']),
  instanceId: z.string().uuid(),
})

type InstanceAction = z.infer<typeof instanceActionSchema>
type InstanceRecord = {
  id: string
  organization_id: string | null
  user_id: string
  instance_name: string
  phone_number: string | null
  connection_mode: string | null
  status: string | null
  is_primary: boolean | null
  is_warming_up: boolean | null
  qr_code: string | null
  base_url: string | null
  api_key: string | null
  created_at: string
  updated_at: string | null
}
const INSTANCE_COLUMNS = 'id,organization_id,user_id,instance_name,phone_number,connection_mode,status,is_primary,is_warming_up,qr_code,base_url,api_key,created_at,updated_at' as const

function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  return response
}

function normalizeStatus(status: string | null) {
  if (status === 'connected' || status === 'connecting' || status === 'disconnected' || status === 'error') {
    return status
  }
  return 'unknown' as const
}

function normalizeMode(mode: string | null) {
  return mode === 'external' ? 'external' as const : 'integrated' as const
}

function hasConfiguredCredentials(instance: InstanceRecord) {
  if (normalizeMode(instance.connection_mode) === 'integrated') {
    return Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY)
  }
  return Boolean(instance.base_url && instance.api_key)
}

function getEvolutionCredentials(instance: InstanceRecord) {
  if (normalizeMode(instance.connection_mode) === 'integrated') {
    const baseUrl = process.env.EVOLUTION_API_URL || ''
    const apiKey = process.env.EVOLUTION_API_KEY || ''
    return baseUrl && apiKey ? { baseUrl, apiKey } : null
  }

  if (!instance.base_url || !instance.api_key) return null
  try {
    return { baseUrl: instance.base_url, apiKey: SecretsManager.decrypt(instance.api_key) }
  } catch {
    return null
  }
}

async function listAllAuthUsers() {
  const users: Array<{ id: string; email?: string }> = []

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < 1000) break
  }

  return users
}

export async function GET() {
  try {
    await requireMasterAdmin()

    const [instancesResult, organizationsResult, failureResult, authUsers] = await Promise.all([
      supabaseAdmin.from('evolution_instances').select(INSTANCE_COLUMNS).order('created_at', { ascending: false }),
      supabaseAdmin.from('organizations').select('id,name'),
      supabaseAdmin
        .from('audit_logs')
        .select('resource_id,action,created_at')
        .eq('resource', 'evolution_instances')
        .eq('outcome', 'failure')
        .order('created_at', { ascending: false })
        .limit(1000),
      listAllAuthUsers(),
    ])

    if (instancesResult.error || organizationsResult.error || failureResult.error) {
      throw new Error('Falha ao carregar a frota de instâncias')
    }

    const organizationMap = new Map(
      (organizationsResult.data || []).map((organization) => [organization.id, organization.name]),
    )
    const emailMap = new Map(authUsers.map((user) => [user.id, user.email || null]))
    const failureMap = new Map<string, { action: string; at: string }>()

    for (const failure of failureResult.data || []) {
      if (failure.resource_id && !failureMap.has(failure.resource_id)) {
        failureMap.set(failure.resource_id, { action: failure.action, at: failure.created_at })
      }
    }

    const instances = ((instancesResult.data || []) as InstanceRecord[]).map((instance) => {
      const status = normalizeStatus(instance.status)
      const mode = normalizeMode(instance.connection_mode)
      const credentialsConfigured = hasConfiguredCredentials(instance)
      const lastFailure = failureMap.get(instance.id) || null

      return {
        id: instance.id,
        organizationId: instance.organization_id,
        organizationName: instance.organization_id ? organizationMap.get(instance.organization_id) || null : null,
        ownerEmail: emailMap.get(instance.user_id) || null,
        instanceName: instance.instance_name,
        phoneNumber: instance.phone_number,
        mode,
        status,
        isPrimary: Boolean(instance.is_primary),
        isWarmingUp: Boolean(instance.is_warming_up),
        hasQrCode: Boolean(instance.qr_code),
        credentialsConfigured,
        createdAt: instance.created_at,
        lastRecordedActivityAt: instance.updated_at || instance.created_at,
        lastFailure,
        signalCount: Number(!credentialsConfigured) + Number(Boolean(instance.qr_code)) + Number(Boolean(instance.is_warming_up)) + Number(Boolean(lastFailure)),
      }
    })

    const organizationIds = new Set(instances.flatMap((instance) => instance.organizationId ? [instance.organizationId] : []))
    const summary = {
      total: instances.length,
      organizations: organizationIds.size,
      connected: instances.filter((instance) => instance.status === 'connected').length,
      disconnected: instances.filter((instance) => instance.status === 'disconnected').length,
      otherStatuses: instances.filter((instance) => !['connected', 'disconnected'].includes(instance.status)).length,
      withOperationalSignals: instances.filter((instance) => instance.signalCount > 0).length,
    }

    return noStoreJson({
      data: { instances, summary },
      meta: {
        generatedAt: new Date().toISOString(),
        statusSource: 'evolution_instances.status',
        activitySource: 'evolution_instances.updated_at',
        failureSource: 'audit_logs (últimos 1.000 registros de falha)',
      },
    })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

function confirmationText(input: InstanceAction, instanceName: string) {
  if (input.action === 'set_primary') return `PRINCIPAL ${instanceName}`
  if (input.action === 'restart') return `REINICIAR ${instanceName}`
  return `DESCONECTAR ${instanceName}`
}

function actionAuditName(action: InstanceAction['action']) {
  if (action === 'set_primary') return 'admin.instance.set_primary'
  if (action === 'restart') return 'admin.instance.restart'
  return 'admin.instance.disconnect'
}

async function setPrimary(instance: InstanceRecord) {
  const scope = instance.organization_id
    ? { column: 'organization_id', value: instance.organization_id }
    : { column: 'user_id', value: instance.user_id }

  const { data: previousPrimary, error: previousError } = await supabaseAdmin
    .from('evolution_instances')
    .select('id')
    .eq(scope.column, scope.value)
    .eq('is_primary', true)

  if (previousError) throw new Error('INSTANCE_PRIMARY_READ_FAILED')

  const { error: targetError } = await supabaseAdmin
    .from('evolution_instances')
    .update({ is_primary: true })
    .eq('id', instance.id)

  if (targetError) throw new Error('INSTANCE_PRIMARY_UPDATE_FAILED')

  const { error: siblingsError } = await supabaseAdmin
    .from('evolution_instances')
    .update({ is_primary: false })
    .eq(scope.column, scope.value)
    .neq('id', instance.id)

  if (!siblingsError) return

  await supabaseAdmin.from('evolution_instances').update({ is_primary: Boolean(instance.is_primary) }).eq('id', instance.id)
  const previousIds = (previousPrimary || []).map((item) => item.id)
  if (previousIds.length > 0) {
    await supabaseAdmin.from('evolution_instances').update({ is_primary: true }).in('id', previousIds)
  }
  throw new Error('INSTANCE_PRIMARY_UPDATE_FAILED')
}

export async function POST(request: Request) {
  let claimId: string | null = null
  let admin: MasterAdminSession | null = null
  let input: InstanceAction | null = null
  let instance: InstanceRecord | null = null

  try {
    admin = await protectAdminMutation(request, { recentAuth: true, limit: 10 })
    const parsed = instanceActionSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return noStoreJson(
        { error: { code: 'ADMIN_INVALID_INPUT', message: 'Dados da ação inválidos' } },
        { status: 400 },
      )
    }
    input = parsed.data

    const { data, error } = await supabaseAdmin
      .from('evolution_instances')
      .select(INSTANCE_COLUMNS)
      .eq('id', input.instanceId)
      .maybeSingle()

    if (error) throw new Error('INSTANCE_READ_FAILED')
    if (!data) {
      return noStoreJson(
        { error: { code: 'ADMIN_INSTANCE_NOT_FOUND', message: 'Instância não encontrada' } },
        { status: 404 },
      )
    }
    instance = data as InstanceRecord

    if (input.confirmation !== confirmationText(input, instance.instance_name)) {
      return noStoreJson(
        { error: { code: 'ADMIN_CONFIRMATION_MISMATCH', message: 'Confirmação inválida' } },
        { status: 400 },
      )
    }
    if (input.action === 'set_primary' && instance.status !== 'connected') {
      return noStoreJson(
        { error: { code: 'ADMIN_INSTANCE_NOT_CONNECTED', message: 'Apenas uma instância conectada pode ser principal' } },
        { status: 409 },
      )
    }

    const credentials = input.action === 'set_primary' ? null : getEvolutionCredentials(instance)
    if (input.action !== 'set_primary' && !credentials) {
      return noStoreJson(
        { error: { code: 'ADMIN_INSTANCE_CREDENTIALS_MISSING', message: 'Credenciais da instância indisponíveis' } },
        { status: 409 },
      )
    }

    const auditAction = actionAuditName(input.action)
    claimId = await claimAdminAction(admin, input, auditAction)

    if (input.action === 'set_primary') {
      await setPrimary(instance)
    } else if (input.action === 'restart' && credentials) {
      try {
        await new EvolutionWhatsAppProvider(credentials.baseUrl, credentials.apiKey).restartInstance(instance.instance_name)
      } catch {
        throw new Error('INSTANCE_REMOTE_ACTION_FAILED')
      }
    } else if (credentials) {
      try {
        await new EvolutionAPI(credentials).logout(instance.instance_name)
      } catch {
        throw new Error('INSTANCE_REMOTE_ACTION_FAILED')
      }

      const { error: updateError } = await supabaseAdmin
        .from('evolution_instances')
        .update({ status: 'disconnected', qr_code: null, updated_at: new Date().toISOString() })
        .eq('id', instance.id)
      if (updateError) throw new Error('INSTANCE_STATUS_UPDATE_FAILED')
    }

    await finishAdminAction(claimId, 'completed')
    await logAudit({
      organization_id: instance.organization_id,
      user_id: admin.userId,
      action: auditAction,
      resource: 'evolution_instances',
      resource_id: instance.id,
      details: { instance_name: instance.instance_name, connection_mode: normalizeMode(instance.connection_mode) },
      reason: input.reason,
      correlation_id: input.idempotencyKey,
      outcome: 'success',
      ip_address: getIpFromRequest(request),
    })

    return noStoreJson({ data: { action: input.action, instanceId: instance.id }, meta: {} })
  } catch (error) {
    if (claimId) await finishAdminAction(claimId, 'failed')
    if (claimId && admin && input && instance) {
      await logAudit({
        organization_id: instance.organization_id,
        user_id: admin.userId,
        action: actionAuditName(input.action),
        resource: 'evolution_instances',
        resource_id: instance.id,
        details: { instance_name: instance.instance_name, failure_type: error instanceof Error ? error.message : 'UNKNOWN' },
        reason: input.reason,
        correlation_id: input.idempotencyKey,
        outcome: 'failure',
        ip_address: getIpFromRequest(request),
      })
    }
    return adminErrorResponse(error)
  }
}

import crypto from 'crypto'
import { NextResponse } from 'next/server'

import { getTrustedAppUrl } from '@/lib/access-control'
import { getIpFromRequest, logAudit } from '@/lib/audit'
import { adminCriticalActionSchema } from '@/lib/admin-types'
import { adminErrorResponse, claimAdminAction, finishAdminAction, protectAdminMutation } from '@/lib/admin-security'
import { SecretsManager } from '@/lib/encryption'
import { supabaseAdmin } from '@/lib/supabase/service-role'

const privateResponse = { 'Cache-Control': 'private, no-store, max-age=0' }

type RotationResult = {
  instance: string
  updated: boolean
  failure_code: 'missing_name' | 'missing_configuration' | 'provider_rejected' | null
}
export async function POST(request: Request) {
  let claimId: string | null = null
  try {
    const admin = await protectAdminMutation(request, { recentAuth: true, limit: 5 })
    const critical = adminCriticalActionSchema.parse(await request.json())
    if (critical.confirmation !== 'ROTACIONAR HMAC') {
      return NextResponse.json(
        { error: { code: 'ADMIN_CONFIRMATION_MISMATCH', message: 'Confirmação inválida' } },
        { status: 400, headers: privateResponse },
      )
    }
    claimId = await claimAdminAction(admin, critical, 'admin.security.rotate_hmac')

    const rawSecret = `whsec_${crypto.randomBytes(32).toString('hex')}`
    const encryptedSecret = SecretsManager.encrypt(rawSecret)
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('security_settings')
      .select('id,hmac_secret')
      .limit(1)
      .single()
    if (settingsError || !settings) {
      await finishAdminAction(claimId, 'failed')
      claimId = null
      return NextResponse.json(
        { error: { code: 'ADMIN_SECURITY_NOT_FOUND', message: 'Configuração não encontrada' } },
        { status: 404, headers: privateResponse },
      )
    }

    const { data: instances, error: instancesError } = await supabaseAdmin
      .from('evolution_instances')
      .select('instance_name,base_url,api_key,connection_mode,status')
      .order('instance_name', { ascending: true })
    if (instancesError) throw instancesError

    const rotatedAtDate = new Date()
    const rotatedAt = rotatedAtDate.toISOString()
    const graceUntil = settings.hmac_secret
      ? new Date(rotatedAtDate.getTime() + 24 * 60 * 60 * 1000).toISOString()
      : null
    const { error: updateError } = await supabaseAdmin
      .from('security_settings')
      .update({
        hmac_secret: encryptedSecret,
        hmac_previous_secret: settings.hmac_secret || null,
        hmac_previous_valid_until: graceUntil,
        rotated_at: rotatedAt,
        updated_at: rotatedAt,
      })
      .eq('id', settings.id)
    if (updateError) throw updateError

    const results: RotationResult[] = []
    const webhookToken = (process.env.WEBHOOK_SECRETS || process.env.WEBHOOK_SECRET || '')
      .split(',')
      .map((secret) => secret.trim())
      .find(Boolean)
    const { EvolutionWhatsAppProvider } = await import('@/providers/whatsapp/EvolutionWhatsAppProvider')
    const activeInstances = (instances || []).filter((instance) => String(instance.status) !== 'deleted')
    for (const [index, instance] of activeInstances.entries()) {
      const instanceName = typeof instance.instance_name === 'string' ? instance.instance_name.trim() : ''
      if (!instanceName) {
        results.push({ instance: `Registro sem nome ${index + 1}`, updated: false, failure_code: 'missing_name' })
        continue
      }

      const isExternal = instance.connection_mode === 'external'
      const baseUrl = isExternal ? instance.base_url || '' : process.env.EVOLUTION_API_URL || ''
      let apiKey = ''
      try {
        apiKey = isExternal
          ? (instance.api_key ? SecretsManager.decrypt(instance.api_key) : '')
          : process.env.EVOLUTION_API_KEY || ''
      } catch {
        results.push({ instance: instanceName, updated: false, failure_code: 'missing_configuration' })
        continue
      }

      if (!baseUrl || !apiKey) {
        results.push({ instance: instanceName, updated: false, failure_code: 'missing_configuration' })
        continue
      }

      try {
        await new EvolutionWhatsAppProvider(baseUrl, apiKey).setWebhook(
          instanceName,
          `${getTrustedAppUrl()}/api/evolution/webhook`,
          rawSecret,
          webhookToken,
        )
        results.push({ instance: instanceName, updated: true, failure_code: null })
      } catch {
        results.push({ instance: instanceName, updated: false, failure_code: 'provider_rejected' })
      }
    }

    const instancesUpdated = results.filter((item) => item.updated).length
    const instancesFailed = results.length - instancesUpdated
    await finishAdminAction(claimId, 'completed')
    await logAudit({
      user_id: admin.userId,
      action: 'admin.security.rotate_hmac',
      resource: 'security_settings',
      details: {
        rotated_at: rotatedAt,
        grace_expires_at: graceUntil,
        instances_total: results.length,
        instances_updated: instancesUpdated,
        instances_failed: instancesFailed,
        instance_results: results,
      },
      reason: critical.reason,
      correlation_id: critical.idempotencyKey,
      outcome: 'success',
      ip_address: getIpFromRequest(request),
    })

    return NextResponse.json({
      data: {
        rotated_at: rotatedAt,
        grace_expires_at: graceUntil,
        distribution: {
          total: results.length,
          updated: instancesUpdated,
          failed: instancesFailed,
        },
        instances: results,
      },
      meta: { generated_at: new Date().toISOString() },
    }, { headers: privateResponse })
  } catch (error) {
    if (claimId) await finishAdminAction(claimId, 'failed')
    return adminErrorResponse(error)
  }
}

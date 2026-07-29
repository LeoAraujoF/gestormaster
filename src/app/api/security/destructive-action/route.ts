import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getIpFromRequest, logAudit } from '@/lib/audit'
import { isTrustedMutation, requireManager } from '@/lib/client-portal-route'
import { rateLimit } from '@/lib/rate-limit'
import { verifySecurityPin } from '@/lib/security-pin'
import { supabaseAdmin } from '@/lib/supabase/service-role'

export const dynamic = 'force-dynamic'

const resourceSchema = z.enum(['clients', 'services', 'promotions', 'iptv_accounts'])
const requestSchema = z.object({
  resource: resourceSchema,
  ids: z.array(z.uuid()).min(1).max(200).optional(),
  scope: z.literal('all').optional(),
  pin: z.string(),
}).strict().superRefine((value, context) => {
  if (value.scope === 'all' && value.resource !== 'clients') {
    context.addIssue({ code: 'custom', path: ['scope'], message: 'Escopo total permitido apenas para clientes.' })
  }
  if (!value.scope && !value.ids) {
    context.addIssue({ code: 'custom', path: ['ids'], message: 'Informe os registros a excluir.' })
  }
})

type ProtectedResource = z.infer<typeof resourceSchema>

const resourceLabel: Record<ProtectedResource, string> = {
  clients: 'clientes',
  services: 'serviços',
  promotions: 'promoções',
  iptv_accounts: 'contas IPTV',
}

function response(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

function pinFailure(
  result: Exclude<Awaited<ReturnType<typeof verifySecurityPin>>, { ok: true }>
) {
  if (result.code === 'PIN_NOT_CONFIGURED') {
    return response({ error: 'Configure o Cofre PIN em Minha Conta antes de excluir registros.', code: result.code }, 409)
  }
  if (result.code === 'PIN_LOCKED') {
    return response({
      error: 'PIN bloqueado após três tentativas. Aguarde 15 minutos.',
      code: result.code,
      lockedUntil: result.lockedUntil,
    }, 423)
  }
  if (result.code === 'PIN_CONFIGURATION_UNAVAILABLE') {
    return response({ error: 'Proteção por PIN indisponível no servidor.', code: result.code }, 503)
  }
  return response({
    error: 'PIN de segurança incorreto.',
    code: result.code,
    remainingAttempts: result.remainingAttempts,
  }, 401)
}

async function deleteAllClients(organizationId: string) {
  const { count, error: countError } = await supabaseAdmin
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
  if (countError) throw countError

  const { error } = await supabaseAdmin
    .from('clients')
    .delete()
    .eq('organization_id', organizationId)
  if (error) throw error
  return count || 0
}

async function deleteSelected(
  resource: ProtectedResource,
  ids: string[],
  organizationId: string,
  userId: string
) {
  let ownershipQuery = supabaseAdmin.from(resource).select('id').in('id', ids)
  ownershipQuery = resource === 'iptv_accounts'
    ? ownershipQuery.eq('user_id', userId)
    : ownershipQuery.eq('organization_id', organizationId)

  const { data: owned, error: ownershipError } = await ownershipQuery
  if (ownershipError) throw ownershipError
  if (!owned || owned.length !== ids.length) throw new Error('RESOURCE_NOT_FOUND')

  let deleteQuery = supabaseAdmin.from(resource).delete().in('id', ids)
  deleteQuery = resource === 'iptv_accounts'
    ? deleteQuery.eq('user_id', userId)
    : deleteQuery.eq('organization_id', organizationId)

  const { error: deleteError } = await deleteQuery
  if (deleteError) throw deleteError
  return owned.length
}

export async function POST(request: Request) {
  if (!isTrustedMutation(request)) {
    return response({ error: 'Origem da solicitação não autorizada.' }, 403)
  }

  const manager = await requireManager()
  if (!manager) return response({ error: 'Não autenticado.' }, 401)
  if (!['owner', 'admin'].includes(manager.role)) {
    return response({ error: 'Somente proprietários e administradores podem excluir registros.' }, 403)
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return response({ error: 'Solicitação de exclusão inválida.' }, 400)

  const limited = await rateLimit(
    `security-pin:delete:${manager.user.id}:${getIpFromRequest(request)}`,
    12,
    900
  )
  if (!limited.ok) return response({ error: 'Muitas tentativas. Aguarde antes de tentar novamente.' }, 429)

  const verification = await verifySecurityPin(manager.user.id, parsed.data.pin)
  if (!verification.ok) {
    await logAudit({
      organization_id: manager.organizationId,
      user_id: manager.user.id,
      action: 'security.protected_delete',
      resource: parsed.data.resource,
      outcome: 'failure',
      reason: verification.code,
      ip_address: getIpFromRequest(request),
    })
    return pinFailure(verification)
  }

  try {
    const count = parsed.data.scope === 'all'
      ? await deleteAllClients(manager.organizationId)
      : await deleteSelected(
          parsed.data.resource,
          parsed.data.ids || [],
          manager.organizationId,
          manager.user.id
        )

    await logAudit({
      organization_id: manager.organizationId,
      user_id: manager.user.id,
      action: parsed.data.scope === 'all' ? 'client.delete_all' : 'resource.protected_delete',
      resource: parsed.data.resource,
      resource_id: parsed.data.ids?.length === 1 ? parsed.data.ids[0] : undefined,
      details: {
        count,
        scope: parsed.data.scope || 'selected',
      },
      ip_address: getIpFromRequest(request),
    })

    return response({
      success: true,
      count,
      message: `${count} ${resourceLabel[parsed.data.resource]} excluído(s) com sucesso.`,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'RESOURCE_NOT_FOUND') {
      return response({ error: 'Um ou mais registros não foram encontrados ou não pertencem à sua conta.' }, 404)
    }
    console.error('[Protected delete] Falha na exclusão:', error)
    return response({ error: 'Não foi possível concluir a exclusão.' }, 500)
  }
}

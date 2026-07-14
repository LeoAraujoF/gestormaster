import { supabaseAdmin } from '@/lib/supabase/service-role'

interface AuditLogParams {
  organization_id?: string | null
  user_id?: string | null
  action: string
  resource: string
  resource_id?: string | null
  details?: Record<string, any> | null
  ip_address?: string | null
  correlation_id?: string | null
  outcome?: 'success' | 'failure' | null
  reason?: string | null
}

/**
 * Registra um log de auditoria no banco de dados.
 * Usar em rotas de API (server-side) onde temos acesso ao supabaseAdmin.
 *
 * @example
 * await logAudit({
 *   user_id: user.id,
 *   action: 'client.delete',
 *   resource: 'clients',
 *   resource_id: clientId,
 *   details: { client_name: 'João Silva' },
 *   ip_address: getIpFromRequest(request)
 * })
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    await supabaseAdmin.from('audit_logs').insert({
      organization_id: params.organization_id || null,
      user_id: params.user_id || null,
      action: params.action,
      resource: params.resource,
      resource_id: params.resource_id || null,
      details: params.details || null,
      ip_address: params.ip_address || null,
      correlation_id: params.correlation_id || null,
      outcome: params.outcome || 'success',
      reason: params.reason || null,
    })
  } catch (error) {
    // Silently fail — auditoria não deve bloquear a operação principal
    console.error('[Audit] Erro ao registrar log:', error)
  }
}

/**
 * Extrai o IP do request para uso nos logs de auditoria.
 */
export function getIpFromRequest(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp
  return 'unknown'
}

/**
 * Função de auditoria para uso em componentes "use client".
 * Envia o log via API em background (fire-and-forget) para não bloquear a UI.
 */
export function logAuditClient(params: {
  action: string
  resource: string
  resource_id?: string | null
  details?: Record<string, any> | null
}): void {
  // Fire-and-forget: não esperamos a resposta
  fetch('/api/audit/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: params.action,
      resource: params.resource,
      resource_id: params.resource_id || null,
      details: params.details || null,
    }),
  }).catch(() => {
    // Silently fail — auditoria não deve bloquear a UI
  })
}

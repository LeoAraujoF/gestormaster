export type SecurityInstanceRecord = {
  instance_name: string | null
  connection_mode: string | null
  base_url: string | null
  api_key: string | null
}

export type SecurityAuditRecord = {
  action: string
  created_at: string
  details: unknown
}

export type SecurityAlert = {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  description: string
}

export type SecurityRecommendation = {
  id: string
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
}

type RotationResult = {
  instance: string
  updated: boolean
  failure_code: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function rotationEvidence(event: SecurityAuditRecord | null, rotatedAt: string | null) {
  if (!event || !rotatedAt || !isRecord(event.details) || event.details.rotated_at !== rotatedAt) return new Map<string, RotationResult>()

  const rawResults = event.details.instance_results
  if (!Array.isArray(rawResults)) return new Map<string, RotationResult>()

  const results = new Map<string, RotationResult>()
  for (const rawResult of rawResults) {
    if (!isRecord(rawResult) || typeof rawResult.instance !== 'string' || typeof rawResult.updated !== 'boolean') continue
    results.set(rawResult.instance, {
      instance: rawResult.instance,
      updated: rawResult.updated,
      failure_code: typeof rawResult.failure_code === 'string' ? rawResult.failure_code : null,
    })
  }
  return results
}

function daysSince(value: string | null, now: Date) {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return null
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 86_400_000))
}

export function buildSecurityState(input: {
  hmacConfigured: boolean
  requireSignature: boolean
  rotatedAt: string | null
  instances: SecurityInstanceRecord[]
  latestRotation: SecurityAuditRecord | null
  managedProviderConfigured: boolean
  now?: Date
}) {
  const now = input.now ?? new Date()
  const evidence = rotationEvidence(input.latestRotation, input.rotatedAt)
  const rotationAgeDays = daysSince(input.rotatedAt, now)

  const instanceItems = input.instances.map((instance, index) => {
    const name = instance.instance_name?.trim() || `Registro sem nome ${index + 1}`
    const isExternal = instance.connection_mode === 'external'
    const ready = isExternal
      ? Boolean(instance.base_url && instance.api_key)
      : input.managedProviderConfigured
    const result = instance.instance_name ? evidence.get(instance.instance_name) : undefined

    return {
      name,
      mode: isExternal ? 'external' as const : 'managed' as const,
      ready,
      distribution: result ? (result.updated ? 'synced' as const : 'failed' as const) : 'unverified' as const,
      failure_code: result?.failure_code ?? null,
    }
  })

  const coverage = {
    total: instanceItems.length,
    ready: instanceItems.filter((item) => item.ready).length,
    synced: instanceItems.filter((item) => item.distribution === 'synced').length,
    failed: instanceItems.filter((item) => item.distribution === 'failed').length,
    unverified: instanceItems.filter((item) => item.distribution === 'unverified').length,
    verified_at: evidence.size > 0 ? input.latestRotation?.created_at ?? null : null,
    instances: instanceItems,
  }

  const alerts: SecurityAlert[] = []
  if (!input.hmacConfigured) {
    alerts.push({
      id: 'hmac-not-configured',
      severity: 'critical',
      title: 'Secret HMAC não configurado',
      description: 'Rotacione o secret antes de exigir assinatura nos callbacks da Evolution.',
    })
  }
  if (!input.requireSignature) {
    alerts.push({
      id: 'signature-disabled',
      severity: 'critical',
      title: 'Validação obrigatória desativada',
      description: 'Callbacks da Evolution não estão sujeitos à política HMAC obrigatória.',
    })
  }
  if (rotationAgeDays !== null && rotationAgeDays >= 90) {
    alerts.push({
      id: 'rotation-overdue',
      severity: 'warning',
      title: 'Rotação vencida',
      description: `O secret vigente foi rotacionado há ${rotationAgeDays} dias.`,
    })
  }
  if (coverage.failed > 0) {
    alerts.push({
      id: 'distribution-failed',
      severity: 'warning',
      title: 'Distribuição incompleta',
      description: `${coverage.failed} instância(s) falharam na rotação correspondente ao secret vigente.`,
    })
  }
  if (coverage.unverified > 0) {
    alerts.push({
      id: 'coverage-unverified',
      severity: 'info',
      title: 'Cobertura parcialmente não verificada',
      description: `${coverage.unverified} instância(s) não possuem evidência da distribuição do secret vigente.`,
    })
  }
  if (coverage.ready < coverage.total) {
    alerts.push({
      id: 'provider-incomplete',
      severity: 'warning',
      title: 'Integrações incompletas',
      description: `${coverage.total - coverage.ready} instância(s) não possuem credenciais suficientes para uma rotação automática.`,
    })
  }

  const recommendations: SecurityRecommendation[] = []
  if (!input.hmacConfigured) {
    recommendations.push({
      id: 'rotate-first-secret',
      priority: 'high',
      title: 'Gerar o primeiro secret',
      description: 'Faça uma rotação controlada e distribua o novo valor antes de ativar a exigência HMAC.',
    })
  }
  if (input.hmacConfigured && !input.requireSignature) {
    recommendations.push({
      id: 'enable-signature',
      priority: 'high',
      title: 'Ativar validação obrigatória',
      description: 'Depois de validar a cobertura, ative a política HMAC com reautenticação.',
    })
  }
  if (rotationAgeDays !== null && rotationAgeDays >= 90) {
    recommendations.push({
      id: 'rotate-overdue-secret',
      priority: 'high',
      title: 'Rotacionar o secret vencido',
      description: 'Planeje a rotação e confirme o resultado individual de todas as instâncias.',
    })
  }
  if (coverage.failed > 0) {
    recommendations.push({
      id: 'retry-failed-distribution',
      priority: 'high',
      title: 'Corrigir instâncias com falha',
      description: 'Revise endpoint e credencial das instâncias com falha antes da próxima rotação.',
    })
  }
  if (coverage.unverified > 0 && input.hmacConfigured) {
    recommendations.push({
      id: 'verify-distribution',
      priority: 'medium',
      title: 'Produzir evidência de cobertura',
      description: 'Execute uma rotação controlada para registrar a distribuição do secret vigente por instância.',
    })
  }
  if (coverage.ready < coverage.total) {
    recommendations.push({
      id: 'complete-provider-config',
      priority: 'high',
      title: 'Completar credenciais da Evolution',
      description: 'Instâncias sem endpoint ou credencial não podem receber o secret automaticamente.',
    })
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: 'maintain-controls',
      priority: 'low',
      title: 'Manter revisão periódica',
      description: 'A configuração atual não apresenta recomendações corretivas determinísticas.',
    })
  }

  const posture = !input.hmacConfigured || !input.requireSignature
    ? 'critical' as const
    : alerts.length > 0
      ? 'attention' as const
      : 'strong' as const

  return {
    posture,
    rotation_age_days: rotationAgeDays,
    coverage,
    alerts,
    recommendations,
  }
}

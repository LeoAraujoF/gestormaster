export const INTELLIGENCE_AGENTS = ['financial', 'commercial', 'collections', 'executive', 'operational'] as const
export type IntelligenceAgent = typeof INTELLIGENCE_AGENTS[number]
export type FindingSeverity = 'info' | 'opportunity' | 'warning' | 'critical'
export type FindingCoverage = 'insufficient' | 'partial' | 'full'

export type IntelligenceEvidence = {
  metric: string
  value: number | string
  unit?: string
}

export type IntelligenceFinding = {
  id?: string
  agent_type: IntelligenceAgent
  severity: FindingSeverity
  title: string
  summary: string
  evidence: IntelligenceEvidence[]
  recommendation: string
  confidence: number
  coverage: FindingCoverage
  action_url: string | null
  state?: 'new' | 'read' | 'dismissed'
  source: 'deterministic' | 'ai'
  priority: number
}

export type IntelligenceSnapshot = {
  generated_at: string
  period: { start: string; end: string; next_7_days_end: string }
  coverage: { starts_at: string | null; partial: boolean; cycles: number; dispatches: number; scores: number }
  financial: {
    confirmed: number
    at_risk: number
    forecast: number
    default_rate: number
    average_ticket: number
    payments_count: number
    due_next_7_days: number
  }
  commercial: { upgrade_candidates: number; at_risk_clients: number; eligible_clients: number }
  collections: {
    sent_dispatches: number
    converted_dispatches: number
    conversion_rate: number
    comparison_ready: boolean
    best_hour: number | null
    best_hour_rate: number | null
    best_profile: string | null
    best_step: number | null
    best_message_key: string | null
  }
  operational: {
    disconnected_instances: number
    failed_dispatches: number
    stale_components: number
    pending_jobs: number
  }
  deterministic_findings: IntelligenceFinding[]
}

export type IntelligenceDashboardDTO = {
  entitlement: { plan: 'master'; active: true }
  settings: {
    enabled: boolean
    timezone: string
    report_time: string
    enabled_agents: IntelligenceAgent[]
    use_byok_after_quota: boolean
    byok_configured: boolean
    byok_last4: string | null
  }
  usage: { platform_reports: number; byok_reports: number; limit: number; remaining: number }
  run: {
    id: string
    report_date: string
    status: string
    narrative_status: string
    model: string | null
    credential_source: string
    created_at: string
    completed_at: string | null
    coverage: IntelligenceSnapshot['coverage']
  } | null
  findings: Record<IntelligenceAgent, IntelligenceFinding[]>
}

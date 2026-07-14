export const ANALYTICS_HORIZONS = ['month', '3m', '6m', '12m'] as const

export type AnalyticsHorizon = typeof ANALYTICS_HORIZONS[number]
export type AnalyticsCoverageLevel = 'insufficient' | 'partial' | 'full'

export type AnalyticsForecastPoint = {
  month: string
  contractual: number
  expected_cash: number | null
  projected_active_clients: number
}

export type PriceCohort = {
  current_price: number
  active_clients: number
  current_mrr: number
}

export type PriceSimulationResult = {
  current_price: number
  new_price: number
  assumed_churn_pct: number
  eligible_clients: number
  projected_clients: number
  current_mrr: number
  projected_mrr: number
  monthly_delta: number
  annual_delta: number
  break_even_churn_pct: number
  warning: string | null
}

export type AnalyticsScenarioDTO = PriceSimulationResult & {
  id: string
  name: string
  source_snapshot_date: string
  created_at: string
}

export type AnalyticsDashboardDTO = {
  entitlement: { plan: 'pro' | 'master'; active: true }
  permissions: { can_manage_scenarios: boolean }
  generated_at: string
  timezone: string
  horizon: AnalyticsHorizon
  coverage: {
    level: AnalyticsCoverageLevel
    starts_at: string | null
    days: number
    complete_months: number
    matured_cycles: number
    last_snapshot_at: string | null
    stale: boolean
    reasons: string[]
  }
  summary: {
    active_clients: number
    mrr: number
    month_contractual: number
    month_confirmed: number
    month_close_estimate: number | null
    realization_rate: number | null
  }
  comparisons: {
    previous_month_confirmed: number
    confirmed_change_pct: number | null
    rolling_12m_confirmed: number
    new_clients_month: number
  }
  forecast: {
    model_version: number
    contractual_total: number
    expected_cash: number | null
    conservative_cash: number | null
    projected_active_clients: number
    monthly_growth_rate: number | null
    assumptions: string[]
    series: AnalyticsForecastPoint[]
  }
  price_cohorts: PriceCohort[]
}

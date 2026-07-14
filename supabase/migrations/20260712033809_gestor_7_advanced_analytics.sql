-- GestorMaster 2.0 - Fase 7: Analytics Avancado.
-- Execute depois de 20260711190211_gestor_5_intelligence.sql.

ALTER TABLE public.executive_daily_snapshots
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS due_cycles integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_cycles integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_due_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payments_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_clients integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_clients integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS captured_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'executive_daily_snapshots_analytics_nonnegative'
      AND conrelid = 'public.executive_daily_snapshots'::regclass
  ) THEN
    ALTER TABLE public.executive_daily_snapshots
      ADD CONSTRAINT executive_daily_snapshots_analytics_nonnegative CHECK (
        due_cycles >= 0 AND paid_cycles >= 0 AND due_amount >= 0
        AND paid_due_amount >= 0 AND payments_count >= 0
        AND new_clients >= 0 AND cancelled_clients >= 0
      );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.analytics_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  forecast_date date NOT NULL,
  horizon text NOT NULL CHECK (horizon IN ('month','3m','6m','12m')),
  model_version integer NOT NULL DEFAULT 1 CHECK (model_version > 0),
  coverage text NOT NULL CHECK (coverage IN ('insufficient','partial','full')),
  coverage_days integer NOT NULL DEFAULT 0 CHECK (coverage_days >= 0),
  complete_months integer NOT NULL DEFAULT 0 CHECK (complete_months >= 0),
  contractual_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (contractual_total >= 0),
  expected_cash numeric(14,2) CHECK (expected_cash IS NULL OR expected_cash >= 0),
  projected_active_clients numeric(12,2) NOT NULL DEFAULT 0 CHECK (projected_active_clients >= 0),
  assumptions jsonb NOT NULL DEFAULT '{}'::jsonb,
  series jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, forecast_date, horizon, model_version)
);

CREATE INDEX IF NOT EXISTS analytics_forecasts_org_date_idx
  ON public.analytics_forecasts (organization_id, forecast_date DESC, horizon);

CREATE TABLE IF NOT EXISTS public.analytics_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  current_price numeric(12,2) NOT NULL CHECK (current_price > 0),
  new_price numeric(12,2) NOT NULL CHECK (new_price > 0),
  assumed_churn_pct numeric(5,2) NOT NULL CHECK (assumed_churn_pct BETWEEN 0 AND 100),
  eligible_clients integer NOT NULL CHECK (eligible_clients >= 0),
  projected_clients numeric(12,2) NOT NULL CHECK (projected_clients >= 0),
  current_mrr numeric(14,2) NOT NULL CHECK (current_mrr >= 0),
  projected_mrr numeric(14,2) NOT NULL CHECK (projected_mrr >= 0),
  monthly_delta numeric(14,2) NOT NULL,
  annual_delta numeric(14,2) NOT NULL,
  break_even_churn_pct numeric(5,2) NOT NULL CHECK (break_even_churn_pct BETWEEN 0 AND 100),
  source_snapshot_date date NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_scenarios_org_created_idx
  ON public.analytics_scenarios (organization_id, created_at DESC, id DESC);

ALTER TABLE public.analytics_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_scenarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view analytics forecasts" ON public.analytics_forecasts;
CREATE POLICY "Members view analytics forecasts"
  ON public.analytics_forecasts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_members member
    WHERE member.organization_id = analytics_forecasts.organization_id
      AND member.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Members view analytics scenarios" ON public.analytics_scenarios;
CREATE POLICY "Members view analytics scenarios"
  ON public.analytics_scenarios FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_members member
    WHERE member.organization_id = analytics_scenarios.organization_id
      AND member.user_id = (SELECT auth.uid())
  ));

REVOKE ALL ON TABLE public.analytics_forecasts, public.analytics_scenarios FROM anon, authenticated;
GRANT SELECT ON TABLE public.analytics_forecasts, public.analytics_scenarios TO authenticated;

-- GestorMaster 2.0 - Fase 5: GestorMaster Intelligence.
-- Execute depois de gestor_4_executive_dashboard.sql.

CREATE TABLE IF NOT EXISTS public.intelligence_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  report_time time NOT NULL DEFAULT '07:00',
  enabled_agents text[] NOT NULL DEFAULT ARRAY['financial','commercial','collections','executive','operational']::text[],
  use_byok_after_quota boolean NOT NULL DEFAULT false,
  byok_configured boolean NOT NULL DEFAULT false,
  byok_last4 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (enabled_agents <@ ARRAY['financial','commercial','collections','executive','operational']::text[]),
  CHECK (byok_last4 IS NULL OR byok_last4 ~ '^[A-Za-z0-9_-]{4}$')
);

-- Segredo isolado: nenhuma policy para authenticated/anon. Somente service_role.
CREATE TABLE IF NOT EXISTS public.intelligence_credentials (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'openai' CHECK (provider = 'openai'),
  encrypted_api_key text NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.intelligence_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  engine_version integer NOT NULL DEFAULT 1,
  trigger_type text NOT NULL CHECK (trigger_type IN ('scheduled','manual')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  narrative_status text NOT NULL DEFAULT 'pending' CHECK (narrative_status IN ('pending','completed','unavailable','failed')),
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_fingerprint text NOT NULL,
  model text,
  credential_source text NOT NULL DEFAULT 'deterministic' CHECK (credential_source IN ('platform','byok','deterministic')),
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS intelligence_runs_scheduled_uidx
  ON public.intelligence_runs (organization_id, report_date, engine_version)
  WHERE trigger_type = 'scheduled';
CREATE INDEX IF NOT EXISTS intelligence_runs_org_created_idx
  ON public.intelligence_runs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS intelligence_runs_pending_idx
  ON public.intelligence_runs (status, created_at) WHERE status IN ('pending','processing');

CREATE TABLE IF NOT EXISTS public.intelligence_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.intelligence_runs(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_type text NOT NULL CHECK (agent_type IN ('financial','commercial','collections','executive','operational')),
  severity text NOT NULL CHECK (severity IN ('info','opportunity','warning','critical')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 1200),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation text NOT NULL CHECK (char_length(recommendation) BETWEEN 1 AND 1200),
  confidence numeric(4,3) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  coverage text NOT NULL DEFAULT 'partial' CHECK (coverage IN ('insufficient','partial','full')),
  action_url text,
  state text NOT NULL DEFAULT 'new' CHECK (state IN ('new','read','dismissed')),
  source text NOT NULL DEFAULT 'deterministic' CHECK (source IN ('deterministic','ai')),
  priority smallint NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (action_url IS NULL OR action_url ~ '^/[a-z0-9/_-]+$')
);

CREATE INDEX IF NOT EXISTS intelligence_findings_org_state_idx
  ON public.intelligence_findings (organization_id, state, created_at DESC);
CREATE INDEX IF NOT EXISTS intelligence_findings_run_idx
  ON public.intelligence_findings (run_id, priority DESC);

CREATE TABLE IF NOT EXISTS public.intelligence_usage_monthly (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  usage_month date NOT NULL,
  platform_reports integer NOT NULL DEFAULT 0 CHECK (platform_reports >= 0),
  byok_reports integer NOT NULL DEFAULT 0 CHECK (byok_reports >= 0),
  input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  failed_reports integer NOT NULL DEFAULT 0 CHECK (failed_reports >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, usage_month),
  CHECK (usage_month = date_trunc('month', usage_month)::date)
);

CREATE TABLE IF NOT EXISTS public.intelligence_operational_heartbeats (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  component text NOT NULL CHECK (component IN ('scheduler','message_worker','webhook_worker','ai_worker','redis','database','evolution')),
  status text NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy','degraded','offline')),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, component)
);

ALTER TABLE public.intelligence_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_usage_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_operational_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view intelligence settings" ON public.intelligence_settings;
CREATE POLICY "Members view intelligence settings" ON public.intelligence_settings
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = intelligence_settings.organization_id AND m.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Managers update intelligence settings" ON public.intelligence_settings;
CREATE POLICY "Managers update intelligence settings" ON public.intelligence_settings
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = intelligence_settings.organization_id
      AND m.user_id = (SELECT auth.uid()) AND m.role IN ('owner','admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = intelligence_settings.organization_id
      AND m.user_id = (SELECT auth.uid()) AND m.role IN ('owner','admin')
  ));

DROP POLICY IF EXISTS "Members view intelligence runs" ON public.intelligence_runs;
CREATE POLICY "Members view intelligence runs" ON public.intelligence_runs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = intelligence_runs.organization_id AND m.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Members view intelligence findings" ON public.intelligence_findings;
CREATE POLICY "Members view intelligence findings" ON public.intelligence_findings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = intelligence_findings.organization_id AND m.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Members view intelligence usage" ON public.intelligence_usage_monthly;
CREATE POLICY "Members view intelligence usage" ON public.intelligence_usage_monthly
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = intelligence_usage_monthly.organization_id AND m.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Members view intelligence health" ON public.intelligence_operational_heartbeats;
CREATE POLICY "Members view intelligence health" ON public.intelligence_operational_heartbeats
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = intelligence_operational_heartbeats.organization_id AND m.user_id = (SELECT auth.uid())));

REVOKE ALL ON TABLE public.intelligence_credentials FROM anon, authenticated;
GRANT SELECT ON public.intelligence_settings, public.intelligence_runs, public.intelligence_findings,
  public.intelligence_usage_monthly, public.intelligence_operational_heartbeats TO authenticated;
GRANT UPDATE (enabled, timezone, report_time, enabled_agents, use_byok_after_quota, updated_at)
  ON public.intelligence_settings TO authenticated;

CREATE OR REPLACE FUNCTION public.increment_intelligence_usage(
  p_organization_id uuid,
  p_credential_source text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_failed boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month date := date_trunc('month', current_date)::date;
BEGIN
  IF p_credential_source NOT IN ('platform','byok','deterministic') THEN
    RAISE EXCEPTION 'Fonte de credencial inválida';
  END IF;

  INSERT INTO public.intelligence_usage_monthly (
    organization_id, usage_month, platform_reports, byok_reports,
    input_tokens, output_tokens, failed_reports, updated_at
  ) VALUES (
    p_organization_id,
    v_month,
    CASE WHEN p_credential_source = 'platform' AND NOT p_failed THEN 1 ELSE 0 END,
    CASE WHEN p_credential_source = 'byok' AND NOT p_failed THEN 1 ELSE 0 END,
    greatest(p_input_tokens, 0),
    greatest(p_output_tokens, 0),
    CASE WHEN p_failed THEN 1 ELSE 0 END,
    now()
  )
  ON CONFLICT (organization_id, usage_month) DO UPDATE SET
    platform_reports = intelligence_usage_monthly.platform_reports + excluded.platform_reports,
    byok_reports = intelligence_usage_monthly.byok_reports + excluded.byok_reports,
    input_tokens = intelligence_usage_monthly.input_tokens + excluded.input_tokens,
    output_tokens = intelligence_usage_monthly.output_tokens + excluded.output_tokens,
    failed_reports = intelligence_usage_monthly.failed_reports + excluded.failed_reports,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.increment_intelligence_usage(uuid, text, integer, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_intelligence_usage(uuid, text, integer, integer, boolean) TO service_role;

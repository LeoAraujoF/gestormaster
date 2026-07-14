-- GestorMaster 2.0 — Fase 3: Cobrança Inteligente.
-- Execute após gestor_2_phase_completion.sql, primeiro em homologação.

CREATE TABLE IF NOT EXISTS public.collection_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  daily_message_limit smallint NOT NULL DEFAULT 1 CHECK (daily_message_limit BETWEEN 1 AND 3),
  cycle_message_limit smallint NOT NULL DEFAULT 4 CHECK (cycle_message_limit BETWEEN 1 AND 6),
  send_window_start time NOT NULL DEFAULT '08:00',
  send_window_end time NOT NULL DEFAULT '20:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[a-z0-9_-]{2,40}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS public.client_tag_assignments (
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.client_tags(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.billing_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'overdue', 'paid', 'cancelled')),
  pix_charge_id uuid REFERENCES public.pix_charges(id) ON DELETE SET NULL,
  payment_id uuid,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, due_date)
);

CREATE INDEX IF NOT EXISTS billing_cycles_org_status_due_idx
  ON public.billing_cycles (organization_id, status, due_date);

CREATE TABLE IF NOT EXISTS public.client_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('cancelled', 'reactivated')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.collection_scores (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  score smallint NOT NULL CHECK (score BETWEEN 0 AND 100),
  confidence text NOT NULL CHECK (confidence IN ('low', 'high')),
  reason jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.collection_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code IN ('excellent', 'regular', 'attention', 'high_risk', 'vip', 'premium')),
  name text NOT NULL,
  min_score smallint CHECK (min_score BETWEEN 0 AND 100),
  max_score smallint CHECK (max_score BETWEEN 0 AND 100),
  is_override boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code),
  CHECK ((is_override AND min_score IS NULL AND max_score IS NULL) OR (NOT is_override AND min_score IS NOT NULL AND max_score IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.collection_profile_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.collection_profiles(id) ON DELETE CASCADE,
  sequence smallint NOT NULL CHECK (sequence BETWEEN 1 AND 4),
  relative_day smallint NOT NULL CHECK (relative_day BETWEEN -15 AND 30),
  send_time time NOT NULL DEFAULT '09:00',
  message_template text NOT NULL CHECK (char_length(message_template) BETWEEN 1 AND 1000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, sequence)
);

CREATE TABLE IF NOT EXISTS public.collection_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.billing_cycles(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.collection_profiles(id) ON DELETE RESTRICT,
  step_id uuid NOT NULL REFERENCES public.collection_profile_steps(id) ON DELETE RESTRICT,
  alert_history_id uuid REFERENCES public.alert_history(id) ON DELETE SET NULL,
  message_content text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, step_id)
);

CREATE INDEX IF NOT EXISTS collection_dispatches_org_client_created_idx
  ON public.collection_dispatches (organization_id, client_id, created_at DESC);

-- O histórico antigo exige automation_id. Despachos inteligentes não são uma
-- automação fixa, portanto são vinculados diretamente por este identificador.
ALTER TABLE public.alert_history ADD COLUMN IF NOT EXISTS collection_dispatch_id uuid;
ALTER TABLE public.alert_history ALTER COLUMN automation_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS alert_history_collection_dispatch_uidx
  ON public.alert_history (collection_dispatch_id) WHERE collection_dispatch_id IS NOT NULL;

ALTER TABLE public.collection_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_profile_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view collection settings" ON public.collection_settings;
DROP POLICY IF EXISTS "Managers can manage collection settings" ON public.collection_settings;
DROP POLICY IF EXISTS "Members can view collection data" ON public.client_tags;
DROP POLICY IF EXISTS "Managers can manage collection tags" ON public.client_tags;
DROP POLICY IF EXISTS "Members can view client tags" ON public.client_tag_assignments;
DROP POLICY IF EXISTS "Managers can manage client tags" ON public.client_tag_assignments;
DROP POLICY IF EXISTS "Members can view collection operational data" ON public.billing_cycles;
DROP POLICY IF EXISTS "Members can view collection lifecycle data" ON public.client_lifecycle_events;
DROP POLICY IF EXISTS "Members can view collection score" ON public.collection_scores;
DROP POLICY IF EXISTS "Members can view collection profiles" ON public.collection_profiles;
DROP POLICY IF EXISTS "Managers can manage collection profiles" ON public.collection_profiles;
DROP POLICY IF EXISTS "Members can view collection profile steps" ON public.collection_profile_steps;
DROP POLICY IF EXISTS "Managers can manage collection profile steps" ON public.collection_profile_steps;
DROP POLICY IF EXISTS "Members can view collection dispatches" ON public.collection_dispatches;

CREATE POLICY "Members can view collection settings" ON public.collection_settings FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
CREATE POLICY "Managers can manage collection settings" ON public.collection_settings FOR ALL
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

CREATE POLICY "Members can view collection data" ON public.client_tags FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
CREATE POLICY "Managers can manage collection tags" ON public.client_tags FOR ALL
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));
CREATE POLICY "Members can view client tags" ON public.client_tag_assignments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.clients c JOIN public.organization_members m ON m.organization_id = c.organization_id WHERE c.id = client_id AND m.user_id = auth.uid()));
CREATE POLICY "Managers can manage client tags" ON public.client_tag_assignments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.clients c JOIN public.organization_members m ON m.organization_id = c.organization_id WHERE c.id = client_id AND m.user_id = auth.uid() AND m.role IN ('owner', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c JOIN public.client_tags t ON t.id = tag_id JOIN public.organization_members m ON m.organization_id = c.organization_id WHERE c.id = client_id AND t.organization_id = c.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner', 'admin')));

CREATE POLICY "Members can view collection operational data" ON public.billing_cycles FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can view collection lifecycle data" ON public.client_lifecycle_events FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can view collection score" ON public.collection_scores FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can view collection profiles" ON public.collection_profiles FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
CREATE POLICY "Managers can manage collection profiles" ON public.collection_profiles FOR ALL
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));
CREATE POLICY "Members can view collection profile steps" ON public.collection_profile_steps FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.collection_profiles p JOIN public.organization_members m ON m.organization_id = p.organization_id WHERE p.id = profile_id AND m.user_id = auth.uid()));
CREATE POLICY "Managers can manage collection profile steps" ON public.collection_profile_steps FOR ALL
  USING (EXISTS (SELECT 1 FROM public.collection_profiles p JOIN public.organization_members m ON m.organization_id = p.organization_id WHERE p.id = profile_id AND m.user_id = auth.uid() AND m.role IN ('owner', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.collection_profiles p JOIN public.organization_members m ON m.organization_id = p.organization_id WHERE p.id = profile_id AND m.user_id = auth.uid() AND m.role IN ('owner', 'admin')));
CREATE POLICY "Members can view collection dispatches" ON public.collection_dispatches FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.track_client_lifecycle_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('inactive', 'canceled') AND OLD.status NOT IN ('inactive', 'canceled') THEN
    INSERT INTO public.client_lifecycle_events (organization_id, client_id, event_type)
    VALUES (NEW.organization_id, NEW.id, 'cancelled');
    UPDATE public.billing_cycles SET status = 'cancelled', cancelled_at = now()
    WHERE client_id = NEW.id AND status IN ('open', 'overdue');
  ELSIF NEW.status = 'active' AND OLD.status IN ('inactive', 'canceled') THEN
    INSERT INTO public.client_lifecycle_events (organization_id, client_id, event_type)
    VALUES (NEW.organization_id, NEW.id, 'reactivated');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_client_lifecycle_event ON public.clients;
CREATE TRIGGER trg_track_client_lifecycle_event
AFTER UPDATE OF status ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.track_client_lifecycle_event();

CREATE OR REPLACE FUNCTION public.recalculate_collection_score(p_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client public.clients%ROWTYPE;
  v_completed integer;
  v_ontime integer;
  v_overdue_days integer;
  v_cancelled integer;
  v_score integer;
  v_confidence text;
BEGIN
  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado'; END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE paid_at::date <= due_date)
  INTO v_completed, v_ontime
  FROM public.billing_cycles
  WHERE client_id = p_client_id AND status = 'paid' AND paid_at >= now() - interval '12 months';
  SELECT COALESCE(MAX(current_date - due_date), 0) INTO v_overdue_days
  FROM public.billing_cycles WHERE client_id = p_client_id AND status IN ('open', 'overdue') AND due_date < current_date;
  SELECT COUNT(*) INTO v_cancelled FROM public.client_lifecycle_events
  WHERE client_id = p_client_id AND event_type = 'cancelled' AND created_at >= now() - interval '12 months';

  v_score := CASE WHEN v_completed = 0 THEN 30 ELSE round(60.0 * v_ontime / v_completed) END;
  v_score := v_score + CASE WHEN v_overdue_days = 0 THEN 20 WHEN v_overdue_days <= 7 THEN 10 ELSE 0 END;
  v_score := v_score + LEAST(10, GREATEST(0, floor((current_date - v_client.registration_date::date) / 30.0)::integer));
  v_score := v_score + GREATEST(0, 10 - (v_cancelled * 5));
  v_score := LEAST(100, GREATEST(0, v_score));
  v_confidence := CASE WHEN v_completed >= 3 THEN 'high' ELSE 'low' END;

  INSERT INTO public.collection_scores (client_id, organization_id, score, confidence, reason, calculated_at)
  VALUES (v_client.id, v_client.organization_id, v_score, v_confidence,
    jsonb_build_object('completed_cycles', v_completed, 'on_time_cycles', v_ontime, 'overdue_days', v_overdue_days, 'cancellations', v_cancelled), now())
  ON CONFLICT (client_id) DO UPDATE SET score = excluded.score, confidence = excluded.confidence, reason = excluded.reason, calculated_at = excluded.calculated_at;

  RETURN jsonb_build_object('score', v_score, 'confidence', v_confidence);
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_collection_score(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_collection_score(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_collection_score_after_client_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recalculate_collection_score(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_collection_score_after_client_status_change ON public.clients;
CREATE TRIGGER trg_refresh_collection_score_after_client_status_change
AFTER UPDATE OF status ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.refresh_collection_score_after_client_status_change();

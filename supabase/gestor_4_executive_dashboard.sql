-- GestorMaster 2.0 — Fase 4: Dashboard Executivo Confiável.
-- Execute após gestor_3_completion_fix.sql, primeiro em homologação.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_cycle_id uuid REFERENCES public.billing_cycles(id) ON DELETE SET NULL;

UPDATE public.payments SET paid_at = created_at WHERE paid_at IS NULL;

UPDATE public.payments p
SET payment_method = 'pix',
    provider = pc.provider,
    paid_at = coalesce(pc.paid_at, p.paid_at, p.created_at)
FROM public.pix_charges pc
WHERE pc.payment_id = p.id;

UPDATE public.payments p
SET billing_cycle_id = bc.id
FROM public.billing_cycles bc
WHERE bc.payment_id = p.id AND p.billing_cycle_id IS NULL;

CREATE INDEX IF NOT EXISTS payments_org_paid_at_idx
  ON public.payments (organization_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS payments_org_method_idx
  ON public.payments (organization_id, payment_method, paid_at DESC);

CREATE TABLE IF NOT EXISTS public.organization_entitlements (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'pro', 'master')),
  is_active boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'migration' CHECK (source IN ('migration', 'stripe', 'pixgo', 'affiliate', 'admin')),
  provider_customer_id text,
  provider_subscription_id text,
  expires_at timestamptz,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.organization_entitlements (organization_id, plan, is_active, source, provider_customer_id, expires_at)
SELECT
  om.organization_id,
  CASE
    WHEN lower(coalesce(u.raw_user_meta_data->>'plan_name', '')) ~ '(master|premium)' THEN 'master'
    WHEN lower(coalesce(u.raw_user_meta_data->>'plan_name', '')) ~ 'pro' THEN 'pro'
    ELSE 'starter'
  END,
  coalesce((u.raw_app_meta_data->>'has_active_subscription')::boolean, false)
    OR coalesce(u.raw_app_meta_data->>'payment_status', '') IN ('Ativo', 'Pago'),
  'migration',
  u.raw_app_meta_data->>'stripe_customer_id',
  CASE
    WHEN nullif(u.raw_app_meta_data->>'stripe_customer_id', '') IS NOT NULL THEN NULL
    ELSE NULLIF(u.raw_user_meta_data->>'plan_expires_at', '')::timestamptz
  END
FROM public.organization_members om
JOIN auth.users u ON u.id = om.user_id
WHERE om.role = 'owner'
ON CONFLICT (organization_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.executive_daily_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  mrr numeric(12,2) NOT NULL DEFAULT 0,
  active_clients integer NOT NULL DEFAULT 0,
  forecast_month numeric(12,2) NOT NULL DEFAULT 0,
  confirmed_month numeric(12,2) NOT NULL DEFAULT 0,
  at_risk numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS executive_snapshots_org_date_idx
  ON public.executive_daily_snapshots (organization_id, snapshot_date DESC);

ALTER TABLE public.organization_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.executive_daily_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view organization entitlement" ON public.organization_entitlements;
CREATE POLICY "Members can view organization entitlement"
  ON public.organization_entitlements FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Members can view executive snapshots" ON public.executive_daily_snapshots;
CREATE POLICY "Members can view executive snapshots"
  ON public.executive_daily_snapshots FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.sync_pix_payment_reporting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND NEW.payment_id IS NOT NULL THEN
    UPDATE public.payments
    SET payment_method = 'pix',
        provider = NEW.provider,
        paid_at = coalesce(NEW.paid_at, paid_at, created_at)
    WHERE id = NEW.payment_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_pix_payment_reporting ON public.pix_charges;
CREATE TRIGGER trg_sync_pix_payment_reporting
AFTER INSERT OR UPDATE OF status, payment_id, paid_at ON public.pix_charges
FOR EACH ROW EXECUTE FUNCTION public.sync_pix_payment_reporting();

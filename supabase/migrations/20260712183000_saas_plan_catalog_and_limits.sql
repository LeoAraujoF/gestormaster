-- Catálogo central dos planos SaaS e limites de recursos por organização.

CREATE TABLE IF NOT EXISTS public.saas_plan_catalog (
  plan text PRIMARY KEY CHECK (plan IN ('starter', 'pro', 'master')),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 240),
  monthly_price_cents integer CHECK (monthly_price_cents IS NULL OR monthly_price_cents >= 0),
  client_limit integer CHECK (client_limit IS NULL OR client_limit > 0),
  whatsapp_instance_limit integer NOT NULL CHECK (whatsapp_instance_limit > 0),
  capabilities text[] NOT NULL DEFAULT '{}',
  is_public boolean NOT NULL DEFAULT true,
  is_purchasable boolean NOT NULL DEFAULT false,
  sort_order smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.saas_plan_catalog (
  plan, display_name, description, monthly_price_cents, client_limit,
  whatsapp_instance_limit, capabilities, is_public, is_purchasable, sort_order
) VALUES
  ('starter', 'Starter', 'Organização essencial para operações que estão começando.', NULL, 100, 1,
    ARRAY['dashboard','clients','services','finance_basic','pix_manual','promotions','settings','support','automation_basic'], true, false, 1),
  ('pro', 'Pro', 'Automação, cobrança inteligente e crescimento para operações em escala.', 2000, 500, 2,
    ARRAY['dashboard','clients','services','finance_basic','finance_advanced','pix_manual','pix_automatic','promotions','settings','support','automation_basic','automation','intelligent_collections','self_service','analytics','client_portal','leads','warmup','iptv_panels','integrations'], true, true, 2),
  ('master', 'Master', 'Inteligência e recursos avançados para operações de alto volume.', NULL, NULL, 3,
    ARRAY['dashboard','clients','services','finance_basic','finance_advanced','pix_manual','pix_automatic','promotions','settings','support','automation_basic','automation','intelligent_collections','self_service','analytics','client_portal','leads','warmup','iptv_panels','integrations','intelligence','resellers','developer_api'], true, false, 3)
ON CONFLICT (plan) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  client_limit = EXCLUDED.client_limit,
  whatsapp_instance_limit = EXCLUDED.whatsapp_instance_limit,
  capabilities = EXCLUDED.capabilities,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

ALTER TABLE public.saas_plan_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.saas_plan_catalog FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_client_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan text;
  v_limit integer;
  v_count bigint;
BEGIN
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;

  SELECT entitlement.plan INTO v_plan
  FROM public.organization_entitlements entitlement
  WHERE entitlement.organization_id = NEW.organization_id
    AND entitlement.is_active
    AND (entitlement.expires_at IS NULL OR entitlement.expires_at > now());
  v_plan := coalesce(v_plan, 'starter');

  SELECT catalog.client_limit INTO v_limit
  FROM public.saas_plan_catalog catalog WHERE catalog.plan = v_plan;
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_count FROM public.clients client
  WHERE client.organization_id = NEW.organization_id;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Limite de clientes do plano % atingido (%).', v_plan, v_limit
      USING ERRCODE = 'P0001', DETAIL = 'PLAN_LIMIT:clients:' || v_limit;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_whatsapp_instance_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan text;
  v_limit integer;
  v_count bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM public.evolution_instances instance WHERE instance.instance_name = NEW.instance_name) THEN
    RETURN NEW;
  END IF;
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;

  SELECT entitlement.plan INTO v_plan
  FROM public.organization_entitlements entitlement
  WHERE entitlement.organization_id = NEW.organization_id
    AND entitlement.is_active
    AND (entitlement.expires_at IS NULL OR entitlement.expires_at > now());
  v_plan := coalesce(v_plan, 'starter');

  SELECT catalog.whatsapp_instance_limit INTO v_limit
  FROM public.saas_plan_catalog catalog WHERE catalog.plan = v_plan;
  SELECT count(*) INTO v_count FROM public.evolution_instances instance
  WHERE instance.organization_id = NEW.organization_id;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Limite de conexões WhatsApp do plano % atingido (%).', v_plan, v_limit
      USING ERRCODE = 'P0001', DETAIL = 'PLAN_LIMIT:whatsapp_instances:' || v_limit;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_z_enforce_client_plan_limit ON public.clients;
CREATE TRIGGER trg_z_enforce_client_plan_limit
  BEFORE INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION public.enforce_client_plan_limit();

DROP TRIGGER IF EXISTS trg_z_enforce_whatsapp_instance_plan_limit ON public.evolution_instances;
CREATE TRIGGER trg_z_enforce_whatsapp_instance_plan_limit
  BEFORE INSERT ON public.evolution_instances FOR EACH ROW EXECUTE FUNCTION public.enforce_whatsapp_instance_plan_limit();

REVOKE ALL ON FUNCTION public.enforce_client_plan_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_whatsapp_instance_plan_limit() FROM PUBLIC, anon, authenticated;

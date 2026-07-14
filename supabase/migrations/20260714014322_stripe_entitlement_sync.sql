-- Admin Master Etapa 3: assinatura Stripe como fonte oficial do entitlement.

ALTER TABLE public.organization_entitlements
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_event_created_at timestamptz;

CREATE OR REPLACE FUNCTION public.sync_stripe_organization_entitlement(
  p_organization_id uuid,
  p_plan text,
  p_is_active boolean,
  p_provider_customer_id text,
  p_provider_subscription_id text,
  p_provider_status text,
  p_expires_at timestamptz,
  p_updated_by uuid,
  p_event_created_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_rows integer;
BEGIN
  IF p_plan NOT IN ('starter', 'pro', 'master') THEN
    RAISE EXCEPTION 'invalid plan';
  END IF;

  IF p_provider_customer_id IS NULL OR p_provider_subscription_id IS NULL OR p_event_created_at IS NULL THEN
    RAISE EXCEPTION 'missing stripe reference';
  END IF;

  INSERT INTO public.organization_entitlements (
    organization_id,
    plan,
    is_active,
    source,
    provider_customer_id,
    provider_subscription_id,
    provider_status,
    provider_event_created_at,
    expires_at,
    updated_by,
    updated_at
  ) VALUES (
    p_organization_id,
    p_plan,
    p_is_active,
    'stripe',
    p_provider_customer_id,
    p_provider_subscription_id,
    p_provider_status,
    p_event_created_at,
    p_expires_at,
    p_updated_by,
    now()
  )
  ON CONFLICT (organization_id) DO UPDATE
  SET plan = EXCLUDED.plan,
      is_active = EXCLUDED.is_active,
      source = 'stripe',
      provider_customer_id = EXCLUDED.provider_customer_id,
      provider_subscription_id = EXCLUDED.provider_subscription_id,
      provider_status = EXCLUDED.provider_status,
      provider_event_created_at = EXCLUDED.provider_event_created_at,
      expires_at = EXCLUDED.expires_at,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
  WHERE public.organization_entitlements.provider_event_created_at IS NULL
     OR public.organization_entitlements.provider_event_created_at <= EXCLUDED.provider_event_created_at;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_stripe_organization_entitlement(uuid, text, boolean, text, text, text, timestamptz, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_stripe_organization_entitlement(uuid, text, boolean, text, text, text, timestamptz, uuid, timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.sync_stripe_organization_entitlement(uuid, text, boolean, text, text, text, timestamptz, uuid, timestamptz)
  IS 'Sincroniza entitlement Stripe e ignora eventos fora de ordem; execução exclusiva do servidor.';

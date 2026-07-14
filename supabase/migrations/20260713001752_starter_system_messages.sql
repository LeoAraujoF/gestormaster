-- Keep the Starter automation surface limited to the three standard system
-- messages. Server-side jobs may still create promotion records after their
-- own entitlement and recipient checks.
CREATE OR REPLACE FUNCTION public.enforce_starter_automation_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan text;
  v_is_active boolean;
  v_caller_role text := COALESCE(auth.jwt() ->> 'role', '');
BEGIN
  IF v_caller_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT entitlement.plan, entitlement.is_active
    INTO v_plan, v_is_active
  FROM public.organization_entitlements AS entitlement
  WHERE entitlement.organization_id = NEW.organization_id;

  IF COALESCE(v_is_active, false) AND lower(COALESCE(v_plan, '')) = 'starter' THEN
    IF NEW.alert_type::text NOT IN ('activation', 'renewal', 'quick_message') THEN
      RAISE EXCEPTION 'STARTER_AUTOMATION_TYPE_NOT_ALLOWED'
        USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.automations AS existing
      WHERE existing.organization_id = NEW.organization_id
        AND existing.alert_type = NEW.alert_type
        AND existing.id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'STARTER_AUTOMATION_TYPE_ALREADY_EXISTS'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_starter_automation_rules() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_starter_automation_rules() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_starter_automation_rules() FROM authenticated;

DROP TRIGGER IF EXISTS trg_z_enforce_starter_automation_rules ON public.automations;
CREATE TRIGGER trg_z_enforce_starter_automation_rules
BEFORE INSERT OR UPDATE OF organization_id, alert_type
ON public.automations
FOR EACH ROW
EXECUTE FUNCTION public.enforce_starter_automation_rules();
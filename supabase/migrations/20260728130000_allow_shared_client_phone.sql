BEGIN;

DROP INDEX IF EXISTS public.clients_org_phone_e164_uidx;

CREATE INDEX IF NOT EXISTS clients_org_phone_e164_idx
  ON public.clients (organization_id, phone_e164)
  WHERE organization_id IS NOT NULL AND phone_e164 IS NOT NULL;

CREATE OR REPLACE FUNCTION public.complete_phone_change(
  p_verification_id uuid,
  p_code_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_verification public.phone_change_verifications%ROWTYPE;
BEGIN
  SELECT * INTO v_verification
  FROM public.phone_change_verifications
  WHERE id = p_verification_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_verification.used_at IS NOT NULL THEN RETURN jsonb_build_object('status', 'used'); END IF;
  IF v_verification.expires_at <= now() THEN RETURN jsonb_build_object('status', 'expired'); END IF;
  IF v_verification.attempts >= 5 THEN RETURN jsonb_build_object('status', 'locked'); END IF;
  IF v_verification.send_status <> 'sent' THEN RETURN jsonb_build_object('status', 'not_delivered'); END IF;

  IF v_verification.code_hash <> p_code_hash THEN
    UPDATE public.phone_change_verifications
    SET attempts = attempts + 1
    WHERE id = v_verification.id;

    RETURN jsonb_build_object(
      'status', 'invalid',
      'remaining_attempts', 4 - v_verification.attempts
    );
  END IF;

  UPDATE public.clients
  SET
    phone = v_verification.new_phone_e164,
    phone_e164 = v_verification.new_phone_e164,
    updated_at = now()
  WHERE id = v_verification.client_id
    AND organization_id = v_verification.organization_id;

  UPDATE public.phone_change_verifications
  SET used_at = now(), code_ciphertext = NULL
  WHERE id = v_verification.id;

  INSERT INTO public.audit_logs (
    organization_id,
    action,
    resource,
    resource_id,
    details
  )
  VALUES (
    v_verification.organization_id,
    'client.phone_changed',
    'clients',
    v_verification.client_id::text,
    jsonb_build_object('verification_id', v_verification.id)
  );

  RETURN jsonb_build_object(
    'status', 'confirmed',
    'new_phone_e164', v_verification.new_phone_e164
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_phone_change(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_phone_change(uuid, text)
  TO service_role;

COMMIT;

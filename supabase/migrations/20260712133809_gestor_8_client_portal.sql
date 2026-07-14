-- GestorMaster 2.0 - Fase 8: Portal do Cliente.

CREATE TABLE IF NOT EXISTS public.client_portal_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  logo_url text CHECK (logo_url IS NULL OR logo_url ~ '^https://'),
  primary_color text NOT NULL DEFAULT '#111827' CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  allow_renewal boolean NOT NULL DEFAULT true,
  allow_due_date_request boolean NOT NULL DEFAULT true,
  allow_phone_change boolean NOT NULL DEFAULT true,
  allow_support_request boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_portal_settings_updated_by_idx
  ON public.client_portal_settings (updated_by) WHERE updated_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.client_portal_auth_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{9,14}$'),
  code_hash text NOT NULL CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  code_ciphertext text,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  send_status text NOT NULL DEFAULT 'pending' CHECK (send_status IN ('pending', 'sent', 'failed')),
  error_code text,
  requested_ip_hash text CHECK (requested_ip_hash IS NULL OR requested_ip_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  sent_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, client_id) REFERENCES public.clients(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS portal_challenges_org_phone_idx
  ON public.client_portal_auth_challenges (organization_id, phone_e164, created_at DESC);
CREATE INDEX IF NOT EXISTS portal_challenges_client_idx
  ON public.client_portal_auth_challenges (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS portal_challenges_pending_idx
  ON public.client_portal_auth_challenges (send_status, created_at) WHERE send_status = 'pending';

CREATE TABLE IF NOT EXISTS public.client_portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  ip_hash text CHECK (ip_hash IS NULL OR ip_hash ~ '^[a-f0-9]{64}$'),
  user_agent_hash text CHECK (user_agent_hash IS NULL OR user_agent_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, client_id) REFERENCES public.clients(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS portal_sessions_client_idx
  ON public.client_portal_sessions (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS portal_sessions_org_expiry_idx
  ON public.client_portal_sessions (organization_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS portal_sessions_active_idx
  ON public.client_portal_sessions (expires_at) WHERE revoked_at IS NULL;

ALTER TABLE public.client_portal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_auth_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view client portal settings" ON public.client_portal_settings;
CREATE POLICY "Members view client portal settings"
  ON public.client_portal_settings FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_members member
    WHERE member.organization_id = client_portal_settings.organization_id
      AND member.user_id = (SELECT auth.uid())
  ));

REVOKE ALL ON TABLE public.client_portal_settings, public.client_portal_auth_challenges, public.client_portal_sessions FROM anon, authenticated;
GRANT SELECT ON TABLE public.client_portal_settings TO authenticated;

CREATE OR REPLACE FUNCTION public.consume_client_portal_challenge(
  p_challenge_id uuid,
  p_code_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_challenge public.client_portal_auth_challenges%ROWTYPE;
BEGIN
  SELECT * INTO v_challenge
  FROM public.client_portal_auth_challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_challenge.consumed_at IS NOT NULL THEN RETURN jsonb_build_object('status', 'used'); END IF;
  IF v_challenge.expires_at <= now() THEN RETURN jsonb_build_object('status', 'expired'); END IF;
  IF v_challenge.attempts >= 5 THEN RETURN jsonb_build_object('status', 'locked'); END IF;
  IF v_challenge.send_status <> 'sent' THEN RETURN jsonb_build_object('status', 'not_delivered'); END IF;

  IF v_challenge.code_hash <> p_code_hash THEN
    UPDATE public.client_portal_auth_challenges
    SET attempts = least(attempts + 1, 5)
    WHERE id = v_challenge.id;
    RETURN jsonb_build_object(
      'status', 'invalid',
      'remaining_attempts', greatest(4 - v_challenge.attempts, 0)
    );
  END IF;

  UPDATE public.client_portal_auth_challenges
  SET consumed_at = now(), code_ciphertext = NULL
  WHERE id = v_challenge.id;

  RETURN jsonb_build_object(
    'status', 'confirmed',
    'organization_id', v_challenge.organization_id,
    'client_id', v_challenge.client_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_client_portal_challenge(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_client_portal_challenge(uuid, text) TO service_role;

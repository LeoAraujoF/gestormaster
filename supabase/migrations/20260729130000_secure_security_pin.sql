-- Move the security PIN out of auth user metadata and make protected deletes
-- executable only by trusted server code using the service role.

CREATE TABLE IF NOT EXISTS public.user_security_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_digest text NOT NULL,
  pin_salt text NOT NULL,
  failed_attempts smallint NOT NULL DEFAULT 0
    CHECK (failed_attempts BETWEEN 0 AND 3),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_security_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_security_credentials FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_security_credentials
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_security_credentials
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_security_pin_attempt(
  p_user_id uuid,
  p_success boolean
)
RETURNS TABLE (
  verified boolean,
  result_locked_until timestamptz,
  remaining_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  credential public.user_security_credentials%ROWTYPE;
  next_failed_attempts integer;
BEGIN
  SELECT *
    INTO credential
    FROM public.user_security_credentials
   WHERE user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::timestamptz, 0;
    RETURN;
  END IF;

  IF credential.locked_until IS NOT NULL
     AND credential.locked_until > clock_timestamp() THEN
    RETURN QUERY
      SELECT false, credential.locked_until, 0;
    RETURN;
  END IF;

  IF p_success THEN
    UPDATE public.user_security_credentials
       SET failed_attempts = 0,
           locked_until = NULL,
           updated_at = clock_timestamp()
     WHERE user_id = p_user_id;

    RETURN QUERY SELECT true, NULL::timestamptz, 3;
    RETURN;
  END IF;

  next_failed_attempts :=
    CASE
      WHEN credential.locked_until IS NOT NULL
           AND credential.locked_until <= clock_timestamp() THEN 1
      ELSE credential.failed_attempts + 1
    END;

  IF next_failed_attempts >= 3 THEN
    UPDATE public.user_security_credentials
       SET failed_attempts = 3,
           locked_until = clock_timestamp() + interval '15 minutes',
           updated_at = clock_timestamp()
     WHERE user_id = p_user_id
     RETURNING locked_until INTO credential.locked_until;

    RETURN QUERY SELECT false, credential.locked_until, 0;
    RETURN;
  END IF;

  UPDATE public.user_security_credentials
     SET failed_attempts = next_failed_attempts,
         locked_until = NULL,
         updated_at = clock_timestamp()
   WHERE user_id = p_user_id;

  RETURN QUERY SELECT false, NULL::timestamptz, 3 - next_failed_attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.record_security_pin_attempt(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_security_pin_attempt(uuid, boolean)
  TO service_role;

-- The old PIN is considered compromised and is intentionally not migrated.
-- Remove it, revoke every affected refresh session, and force a fresh login
-- before the user creates a new PIN in the private credential store.
WITH cleaned_users AS (
  UPDATE auth.users
     SET raw_user_meta_data =
       COALESCE(raw_user_meta_data, '{}'::jsonb)
         - 'security_pin'
         - 'security_pin_lockout'
   WHERE COALESCE(raw_user_meta_data, '{}'::jsonb)
         ?| ARRAY['security_pin', 'security_pin_lockout']
   RETURNING id
)
DELETE FROM auth.sessions
 WHERE user_id IN (SELECT id FROM cleaned_users);

-- Clients: authenticated users may read/create/update within their tenant.
-- Deletion is reserved for the protected server endpoint.
DROP POLICY IF EXISTS tenant_isolation_clients ON public.clients;
DROP POLICY IF EXISTS tenant_isolation_clients_select ON public.clients;
DROP POLICY IF EXISTS tenant_isolation_clients_insert ON public.clients;
DROP POLICY IF EXISTS tenant_isolation_clients_update ON public.clients;

CREATE POLICY tenant_isolation_clients_select
  ON public.clients FOR SELECT TO authenticated
  USING (organization_id IN (SELECT user_orgs()));

CREATE POLICY tenant_isolation_clients_insert
  ON public.clients FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT user_orgs()));

CREATE POLICY tenant_isolation_clients_update
  ON public.clients FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT user_orgs()))
  WITH CHECK (organization_id IN (SELECT user_orgs()));

-- Services.
DROP POLICY IF EXISTS tenant_isolation_services ON public.services;
DROP POLICY IF EXISTS tenant_isolation_services_select ON public.services;
DROP POLICY IF EXISTS tenant_isolation_services_insert ON public.services;
DROP POLICY IF EXISTS tenant_isolation_services_update ON public.services;

CREATE POLICY tenant_isolation_services_select
  ON public.services FOR SELECT TO authenticated
  USING (organization_id IN (SELECT user_orgs()));

CREATE POLICY tenant_isolation_services_insert
  ON public.services FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT user_orgs()));

CREATE POLICY tenant_isolation_services_update
  ON public.services FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT user_orgs()))
  WITH CHECK (organization_id IN (SELECT user_orgs()));

-- Promotions.
DROP POLICY IF EXISTS tenant_isolation_promotions ON public.promotions;
DROP POLICY IF EXISTS tenant_isolation_promotions_select ON public.promotions;
DROP POLICY IF EXISTS tenant_isolation_promotions_insert ON public.promotions;
DROP POLICY IF EXISTS tenant_isolation_promotions_update ON public.promotions;

CREATE POLICY tenant_isolation_promotions_select
  ON public.promotions FOR SELECT TO authenticated
  USING (organization_id IN (SELECT user_orgs()));

CREATE POLICY tenant_isolation_promotions_insert
  ON public.promotions FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT user_orgs()));

CREATE POLICY tenant_isolation_promotions_update
  ON public.promotions FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT user_orgs()))
  WITH CHECK (organization_id IN (SELECT user_orgs()));

-- IPTV accounts still use user ownership because the legacy table has no
-- organization_id. Deletion is reserved for the protected server endpoint.
DROP POLICY IF EXISTS "Acesso apenas as proprias contas iptv" ON public.iptv_accounts;
DROP POLICY IF EXISTS iptv_accounts_select_own ON public.iptv_accounts;
DROP POLICY IF EXISTS iptv_accounts_insert_own ON public.iptv_accounts;
DROP POLICY IF EXISTS iptv_accounts_update_own ON public.iptv_accounts;

CREATE POLICY iptv_accounts_select_own
  ON public.iptv_accounts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY iptv_accounts_insert_own
  ON public.iptv_accounts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY iptv_accounts_update_own
  ON public.iptv_accounts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Defense in depth: the Data API roles do not receive DELETE or TRUNCATE at
-- the table privilege layer either. The service role keeps its server access.
REVOKE ALL ON TABLE
  public.clients,
  public.services,
  public.promotions,
  public.iptv_accounts
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.clients,
  public.services,
  public.promotions,
  public.iptv_accounts
TO authenticated;

-- Remove the legacy public policies that exposed API-key rows to the public role.
DO $$
DECLARE
  legacy_policy record;
BEGIN
  FOR legacy_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'api_keys'
      AND 'public' = ANY (roles)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.api_keys', legacy_policy.policyname);
  END LOOP;
END
$$;

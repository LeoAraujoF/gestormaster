-- Canonical message delivery state and API-key contract.
-- This migration is additive and keeps legacy columns temporarily for compatibility.

ALTER TYPE public.alert_send_status ADD VALUE IF NOT EXISTS 'queued';
ALTER TYPE public.alert_send_status ADD VALUE IF NOT EXISTS 'accepted';
ALTER TYPE public.alert_send_status ADD VALUE IF NOT EXISTS 'delivered';
ALTER TYPE public.alert_send_status ADD VALUE IF NOT EXISTS 'read';

ALTER TABLE public.alert_history
  ALTER COLUMN client_id DROP NOT NULL;

ALTER TABLE public.alert_history
  ADD COLUMN IF NOT EXISTS lead_id uuid,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS instance_name text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS source_job_id text,
  ADD COLUMN IF NOT EXISTS queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

UPDATE public.alert_history
SET queued_at = COALESCE(queued_at, created_at)
WHERE queued_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'alert_history_lead_id_fkey'
      AND conrelid = 'public.alert_history'::regclass
  ) THEN
    ALTER TABLE public.alert_history
      ADD CONSTRAINT alert_history_lead_id_fkey
      FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS alert_history_provider_message_idx
  ON public.alert_history (instance_name, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS alert_history_lead_id_idx
  ON public.alert_history (lead_id)
  WHERE lead_id IS NOT NULL;

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS key_hash text,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

UPDATE public.api_keys
SET key_hash = encode(digest(key, 'sha256'), 'hex')
WHERE key_hash IS NULL AND key IS NOT NULL;

ALTER TABLE public.api_keys ALTER COLUMN key DROP NOT NULL;
ALTER TABLE public.api_keys ALTER COLUMN user_id DROP NOT NULL;
UPDATE public.api_keys SET key = NULL WHERE key_hash IS NOT NULL;

WITH single_org AS (
  SELECT user_id, min(organization_id::text)::uuid AS organization_id
  FROM public.organization_members
  GROUP BY user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE public.api_keys AS api_key
SET organization_id = single_org.organization_id
FROM single_org
WHERE api_key.organization_id IS NULL
  AND api_key.user_id = single_org.user_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'api_keys_organization_id_fkey'
      AND conrelid = 'public.api_keys'::regclass
  ) THEN
    ALTER TABLE public.api_keys
      ADD CONSTRAINT api_keys_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_hash_uidx
  ON public.api_keys (key_hash)
  WHERE key_hash IS NOT NULL;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver suas próprias chaves" ON public.api_keys;
DROP POLICY IF EXISTS "Usuários podem criar suas próprias chaves" ON public.api_keys;
DROP POLICY IF EXISTS "Usuários podem deletar suas próprias chaves" ON public.api_keys;
DROP POLICY IF EXISTS "Members can manage organization API keys" ON public.api_keys;

CREATE POLICY "Members can view organization API keys"
  ON public.api_keys FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Members can create organization API keys"
  ON public.api_keys FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
    )
    AND user_id = (SELECT auth.uid())
  );

CREATE POLICY "Members can delete organization API keys"
  ON public.api_keys FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

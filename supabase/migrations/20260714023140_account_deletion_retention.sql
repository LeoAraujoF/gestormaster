-- Admin Master Etapa 3: retenção e purga auditável de contas.

ALTER TABLE public.account_deletion_requests
  ADD COLUMN IF NOT EXISTS target_user_id uuid,
  ADD COLUMN IF NOT EXISTS purged_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocked_reason text;

UPDATE public.account_deletion_requests
SET target_user_id = user_id
WHERE target_user_id IS NULL AND user_id IS NOT NULL;

ALTER TABLE public.account_deletion_requests
  DROP CONSTRAINT IF EXISTS account_deletion_requests_user_id_fkey;
ALTER TABLE public.account_deletion_requests
  ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.account_deletion_requests
  ADD CONSTRAINT account_deletion_requests_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS public.idx_account_deletion_pending;
CREATE INDEX idx_account_deletion_pending
  ON public.account_deletion_requests(status, purge_after)
  WHERE status = 'pending' AND blocked_reason IS NULL;

COMMENT ON COLUMN public.account_deletion_requests.target_user_id
  IS 'Identificador imutável preservado após a remoção do usuário do Auth.';
COMMENT ON COLUMN public.account_deletion_requests.blocked_reason
  IS 'Código operacional sem dados sensíveis que impede a purga automática.';

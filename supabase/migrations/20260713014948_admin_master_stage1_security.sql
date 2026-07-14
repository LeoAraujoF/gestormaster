-- Admin Master stage 1: close direct global writes and preserve tenant scope.

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS correlation_id uuid,
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS reason text;

ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_outcome_check;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_outcome_check CHECK (outcome IN ('success', 'failure'));
CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation_id ON public.audit_logs(correlation_id) WHERE correlation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.admin_action_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.admin_action_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_action_idempotency FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_admin_action_idempotency_admin_created
  ON public.admin_action_idempotency(admin_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'restored', 'purged')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  purge_after timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  restored_at timestamptz
);
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_deletion_requests FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_account_deletion_pending ON public.account_deletion_requests(status, purge_after) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS uq_account_deletion_one_pending ON public.account_deletion_requests(user_id) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.admin_revoke_user_sessions(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, public, pg_temp
AS $$ BEGIN DELETE FROM auth.sessions WHERE user_id = p_user_id; END $$;
REVOKE ALL ON FUNCTION public.admin_revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_user_sessions(uuid) TO service_role;

ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
UPDATE public.tickets t
SET organization_id = (
  SELECT om.organization_id
  FROM public.organization_members om
  WHERE om.user_id = t.user_id
  ORDER BY om.created_at NULLS LAST, om.organization_id
  LIMIT 1
)
WHERE t.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_organization_updated ON public.tickets(organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status_updated ON public.tickets(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_created ON public.ticket_messages(ticket_id, created_at);

DROP POLICY IF EXISTS "Admins manage all tickets" ON public.tickets;
DROP POLICY IF EXISTS "Admins manage all ticket messages" ON public.ticket_messages;

DROP POLICY IF EXISTS "Users can view their own tickets" ON public.tickets;
CREATE POLICY "Users can view their own tickets" ON public.tickets
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can insert their own tickets" ON public.tickets;
CREATE POLICY "Users can insert their own tickets" ON public.tickets
  FOR INSERT TO authenticated WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can view messages for their tickets" ON public.ticket_messages;
CREATE POLICY "Users can view messages for their tickets" ON public.ticket_messages
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.user_id = (SELECT auth.uid())
  ));
DROP POLICY IF EXISTS "Users can insert messages for their tickets" ON public.ticket_messages;
CREATE POLICY "Users can insert messages for their tickets" ON public.ticket_messages
  FOR INSERT TO authenticated WITH CHECK (
    user_id = (SELECT auth.uid())
    AND COALESCE(is_from_admin, false) = false
    AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Allow authenticated update system_features" ON public.system_features;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.system_features FROM anon, authenticated;
DROP POLICY IF EXISTS "Allow public read access to system_features" ON public.system_features;
CREATE POLICY "Read system features" ON public.system_features
  FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON TABLE public.system_features TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_account_deletion_organization
  ON public.account_deletion_requests(organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_account_deletion_requested_by
  ON public.account_deletion_requests(requested_by, requested_at DESC);

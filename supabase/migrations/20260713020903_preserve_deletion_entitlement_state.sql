ALTER TABLE public.account_deletion_requests
  ADD COLUMN IF NOT EXISTS previous_entitlement_active boolean;

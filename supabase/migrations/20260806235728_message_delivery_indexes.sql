CREATE INDEX IF NOT EXISTS alert_history_organization_id_idx
  ON public.alert_history (organization_id);

CREATE INDEX IF NOT EXISTS api_keys_organization_id_idx
  ON public.api_keys (organization_id);

CREATE INDEX IF NOT EXISTS api_keys_user_id_idx
  ON public.api_keys (user_id);

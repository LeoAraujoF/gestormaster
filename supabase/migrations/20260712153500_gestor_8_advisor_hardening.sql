-- Fase 8: ajustes indicados pelos advisors após a migração principal.

CREATE INDEX IF NOT EXISTS portal_challenges_org_client_idx
  ON public.client_portal_auth_challenges (organization_id, client_id);
CREATE INDEX IF NOT EXISTS portal_sessions_org_client_idx
  ON public.client_portal_sessions (organization_id, client_id);

ALTER FUNCTION public.get_pix_charge_metrics() SET search_path = '';
ALTER FUNCTION public.set_pix_charges_updated_at() SET search_path = '';
REVOKE ALL ON FUNCTION public.get_pix_charge_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pix_charge_metrics() TO authenticated;

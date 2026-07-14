-- Fase 8: impede duas renovações PIX pendentes para o mesmo cliente.

CREATE UNIQUE INDEX IF NOT EXISTS pix_charges_one_pending_renewal_per_client_uidx
  ON public.pix_charges (organization_id, client_id)
  WHERE status = 'pending' AND purpose = 'renewal' AND client_id IS NOT NULL;

-- Controles por cliente para decidir o envio imediato e o lembrete interno de renovação.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS renewal_reminder_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS renewal_reminder_days_before integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS renewal_reminder_last_sent_due_date date;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_renewal_reminder_days_before_check,
  ADD CONSTRAINT clients_renewal_reminder_days_before_check
    CHECK (renewal_reminder_days_before BETWEEN 1 AND 60);

CREATE INDEX IF NOT EXISTS clients_renewal_reminder_idx
  ON public.clients (organization_id, renewal_reminder_enabled, due_date)
  WHERE renewal_reminder_enabled = true;

COMMENT ON COLUMN public.clients.renewal_reminder_enabled IS 'Envia um lembrete interno ao gestor antes do vencimento.';
COMMENT ON COLUMN public.clients.renewal_reminder_days_before IS 'Quantidade de dias de antecedência do lembrete interno.';
COMMENT ON COLUMN public.clients.renewal_reminder_last_sent_due_date IS 'Vencimento para o qual o lembrete interno já foi enfileirado.';

CREATE OR REPLACE VIEW public.vw_enriched_clients WITH (security_invoker = true) AS
SELECT
  c.id,
  c.organization_id,
  c.user_id,
  c.name,
  c.phone,
  c.plan_value,
  c.status,
  c.screens,
  c.due_date,
  c.created_at,
  (SELECT max(p.created_at) FROM public.payments p WHERE p.client_id = c.id) AS last_payment_date,
  (SELECT count(*) FROM public.payments p WHERE p.client_id = c.id) AS renewal_count,
  (SELECT max(ah.sent_at) FROM public.alert_history ah WHERE ah.client_id = c.id) AS last_charge_sent_date,
  (SELECT ah.status FROM public.alert_history ah WHERE ah.client_id = c.id ORDER BY ah.sent_at DESC LIMIT 1) AS last_communication_status,
  CURRENT_DATE - c.created_at::date AS days_as_client,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'service_id', cs.service_id,
      'username', cs.username,
      'password', cs.password,
      'services', jsonb_build_object('id', s.id, 'name', s.name, 'cost', s.cost)
    ))
    FROM public.client_services cs
    JOIN public.services s ON cs.service_id = s.id
    WHERE cs.client_id = c.id
  ), '[]'::jsonb) AS client_services,
  c.phone_e164,
  c.whatsapp_opt_in,
  c.whatsapp_opt_in_at,
  c.whatsapp_opt_in_source,
  c.whatsapp_opt_in_categories,
  c.whatsapp_opt_out,
  c.whatsapp_opt_out_at,
  c.renewal_reminder_enabled,
  c.renewal_reminder_days_before,
  c.renewal_reminder_last_sent_due_date
FROM public.clients c;

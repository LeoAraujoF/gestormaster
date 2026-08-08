-- Mantém o campo legado `phone`, mas formaliza `phone_e164` como a fonte
-- canônica para qualquer envio ou autenticação via WhatsApp.
-- O backfill só infere Brasil quando não há DDI explícito; números
-- internacionais sem +/00 precisam ser revisados, pois o país é ambíguo.

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_phone_e164_format_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_phone_e164_format_check
  CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$');

ALTER TABLE public.client_portal_auth_challenges
  DROP CONSTRAINT IF EXISTS client_portal_auth_challenges_phone_e164_check;

ALTER TABLE public.client_portal_auth_challenges
  ADD CONSTRAINT client_portal_auth_challenges_phone_e164_check
  CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$');

ALTER TABLE public.phone_change_verifications
  DROP CONSTRAINT IF EXISTS phone_change_verifications_new_phone_e164_check;

ALTER TABLE public.phone_change_verifications
  ADD CONSTRAINT phone_change_verifications_new_phone_e164_check
  CHECK (new_phone_e164 ~ '^\+[1-9][0-9]{7,14}$');

UPDATE public.clients
SET phone_e164 = CASE
  WHEN phone ~ '^\+[1-9][0-9]{7,14}$' THEN phone
  WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^55[1-9][0-9][0-9]{8,9}$'
    THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')
  WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^[1-9][0-9][0-9]{8,9}$'
    THEN '+55' || regexp_replace(phone, '[^0-9]', '', 'g')
  ELSE NULL
END
WHERE phone_e164 IS NULL
  AND phone IS NOT NULL
  AND (
    phone ~ '^\+[1-9][0-9]{7,14}$'
    OR regexp_replace(phone, '[^0-9]', '', 'g') ~ '^55[1-9][0-9][0-9]{8,9}$'
    OR regexp_replace(phone, '[^0-9]', '', 'g') ~ '^[1-9][0-9][0-9]{8,9}$'
  );

CREATE OR REPLACE VIEW public.vw_enriched_clients WITH (security_invoker=true) AS
 SELECT id,
    organization_id,
    user_id,
    name,
    phone,
    plan_value,
    status,
    screens,
    due_date,
    created_at,
    ( SELECT max(p.created_at) AS max
           FROM payments p
          WHERE p.client_id = c.id) AS last_payment_date,
    ( SELECT count(*) AS count
           FROM payments p
          WHERE p.client_id = c.id) AS renewal_count,
    ( SELECT max(ah.sent_at) AS max
           FROM alert_history ah
          WHERE ah.client_id = c.id) AS last_charge_sent_date,
    ( SELECT ah.status
           FROM alert_history ah
          WHERE ah.client_id = c.id
          ORDER BY ah.sent_at DESC
         LIMIT 1) AS last_communication_status,
    CURRENT_DATE - created_at::date AS days_as_client,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('service_id', cs.service_id, 'username', cs.username, 'password', cs.password, 'services', jsonb_build_object('id', s.id, 'name', s.name, 'cost', s.cost))) AS jsonb_agg
           FROM client_services cs
             JOIN services s ON cs.service_id = s.id
          WHERE cs.client_id = c.id), '[]'::jsonb) AS client_services,
    phone_e164
   FROM clients c;

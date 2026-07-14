-- GestorMaster 2.0 — conclusão segura das fases 1 e 2.
-- Execute após pix_charges.sql e security_hardening.sql, primeiro em homologação.

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS phone_e164 text;

UPDATE public.clients
SET phone_e164 = CASE
  WHEN regexp_replace(coalesce(phone, ''), '\D', '', 'g') ~ '^55[1-9][0-9][0-9]{8,9}$'
    THEN '+' || regexp_replace(phone, '\D', '', 'g')
  WHEN regexp_replace(coalesce(phone, ''), '\D', '', 'g') ~ '^[1-9][0-9][0-9]{8,9}$'
    THEN '+55' || regexp_replace(phone, '\D', '', 'g')
  ELSE NULL
END
WHERE phone_e164 IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS clients_org_phone_e164_uidx
  ON public.clients (organization_id, phone_e164)
  WHERE organization_id IS NOT NULL AND phone_e164 IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.client_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('due_date', 'human_support')),
  requested_due_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_from_phone text NOT NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (request_type = 'due_date' AND requested_due_date IS NOT NULL)
    OR request_type = 'human_support'
  )
);

CREATE INDEX IF NOT EXISTS client_change_requests_org_status_idx
  ON public.client_change_requests (organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.phone_change_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  new_phone_e164 text NOT NULL,
  code_hash text NOT NULL,
  attempts smallint NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_change_verifications_client_idx
  ON public.phone_change_verifications (client_id, expires_at DESC);

ALTER TABLE public.client_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_change_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view pix charges" ON public.pix_charges;
DROP POLICY IF EXISTS "Users can manage authorized pix_charges" ON public.pix_charges;
CREATE POLICY "Members can view pix charges"
  ON public.pix_charges FOR SELECT
  USING (
    user_id = auth.uid()
    OR organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can view change requests"
  ON public.client_change_requests FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Métricas estritamente por organização: inclui receita PIX total e inadimplência
-- financeira (cobranças que venceram sem pagamento).
CREATE OR REPLACE FUNCTION public.get_pix_charge_metrics(p_organization_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  result json;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_organization_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Organização não autorizada';
  END IF;

  SELECT json_build_object(
    'pending_count', COUNT(*) FILTER (WHERE status = 'pending' AND (expires_at IS NULL OR expires_at > now())),
    'pending_amount', COALESCE(SUM(amount) FILTER (WHERE status = 'pending' AND (expires_at IS NULL OR expires_at > now())), 0),
    'overdue_count', COUNT(*) FILTER (WHERE status = 'pending' AND expires_at <= now()),
    'overdue_amount', COALESCE(SUM(amount) FILTER (WHERE status = 'pending' AND expires_at <= now()), 0),
    'paid_total_count', COUNT(*) FILTER (WHERE status = 'paid'),
    'paid_total_amount', COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0),
    'paid_today_count', COUNT(*) FILTER (WHERE status = 'paid' AND paid_at::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date),
    'paid_today_amount', COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND paid_at::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date), 0),
    'paid_month_count', COUNT(*) FILTER (WHERE status = 'paid' AND date_trunc('month', paid_at AT TIME ZONE 'America/Sao_Paulo') = date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')),
    'paid_month_amount', COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND date_trunc('month', paid_at AT TIME ZONE 'America/Sao_Paulo') = date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')), 0)
  ) INTO result
  FROM public.pix_charges
  WHERE organization_id = p_organization_id;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pix_charge_metrics(uuid) TO authenticated;

-- Finalização financeira atômica. O webhook só agenda mensagens após o commit.
CREATE OR REPLACE FUNCTION public.finalize_pix_charge(
  p_charge_id uuid,
  p_provider_payment_id text,
  p_amount numeric(12,2)
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge public.pix_charges%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_new_due_date date;
  v_payment_id uuid;
BEGIN
  SELECT * INTO v_charge FROM public.pix_charges WHERE id = p_charge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cobrança PIX não encontrada'; END IF;
  IF v_charge.processed_at IS NOT NULL THEN
    RETURN jsonb_build_object('already_processed', true, 'charge_id', v_charge.id, 'payment_id', v_charge.payment_id);
  END IF;
  IF v_charge.provider_payment_id IS NOT NULL AND v_charge.provider_payment_id <> p_provider_payment_id THEN
    RAISE EXCEPTION 'Pagamento não pertence à cobrança';
  END IF;
  IF round(v_charge.amount, 2) <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'Valor pago diverge da cobrança';
  END IF;

  UPDATE public.pix_charges
  SET provider_payment_id = p_provider_payment_id,
      status = 'paid',
      paid_at = now(),
      processed_at = now()
  WHERE id = v_charge.id;

  IF v_charge.client_id IS NOT NULL AND v_charge.purpose IN ('renewal', 'charge') THEN
    SELECT * INTO v_client FROM public.clients WHERE id = v_charge.client_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cliente da cobrança não encontrado'; END IF;

    v_new_due_date := GREATEST(v_client.due_date, current_date) + make_interval(months => GREATEST(v_charge.months_to_renew, 1));
    UPDATE public.clients SET due_date = v_new_due_date, status = 'active' WHERE id = v_client.id;

    INSERT INTO public.payments (organization_id, user_id, client_id, amount_paid, net_profit, months_renewed)
    VALUES (v_charge.organization_id, coalesce(v_client.user_id, v_charge.user_id), v_client.id, v_charge.amount, v_charge.amount, GREATEST(v_charge.months_to_renew, 1))
    RETURNING id INTO v_payment_id;

    UPDATE public.pix_charges SET payment_id = v_payment_id WHERE id = v_charge.id;
  END IF;

  INSERT INTO public.audit_logs (organization_id, user_id, action, resource, resource_id, details)
  VALUES (
    v_charge.organization_id,
    v_charge.user_id,
    'pix.payment.finalized',
    'pix_charges',
    v_charge.id::text,
    jsonb_build_object('provider_payment_id', p_provider_payment_id, 'amount', p_amount, 'payment_id', v_payment_id)
  );

  RETURN jsonb_build_object(
    'already_processed', false,
    'charge_id', v_charge.id,
    'payment_id', v_payment_id,
    'new_due_date', v_new_due_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_pix_charge(uuid, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_pix_charge(uuid, text, numeric) TO service_role;

-- Confirmação de telefone com bloqueio de linha: evita duas mensagens concorrentes
-- consumirem o mesmo código ou ultrapassarem o limite de tentativas.
CREATE OR REPLACE FUNCTION public.complete_phone_change(
  p_verification_id uuid,
  p_code_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verification public.phone_change_verifications%ROWTYPE;
BEGIN
  SELECT * INTO v_verification
  FROM public.phone_change_verifications
  WHERE id = p_verification_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_verification.used_at IS NOT NULL THEN RETURN jsonb_build_object('status', 'used'); END IF;
  IF v_verification.expires_at <= now() THEN RETURN jsonb_build_object('status', 'expired'); END IF;
  IF v_verification.attempts >= 5 THEN RETURN jsonb_build_object('status', 'locked'); END IF;

  IF v_verification.code_hash <> p_code_hash THEN
    UPDATE public.phone_change_verifications
    SET attempts = attempts + 1
    WHERE id = v_verification.id;
    RETURN jsonb_build_object('status', 'invalid', 'remaining_attempts', 4 - v_verification.attempts);
  END IF;

  UPDATE public.clients
  SET phone = v_verification.new_phone_e164,
      phone_e164 = v_verification.new_phone_e164
  WHERE id = v_verification.client_id
    AND organization_id = v_verification.organization_id;

  UPDATE public.phone_change_verifications
  SET used_at = now()
  WHERE id = v_verification.id;

  INSERT INTO public.audit_logs (organization_id, action, resource, resource_id, details)
  VALUES (
    v_verification.organization_id,
    'client.phone_changed',
    'clients',
    v_verification.client_id::text,
    jsonb_build_object('verification_id', v_verification.id, 'new_phone_e164', v_verification.new_phone_e164)
  );

  RETURN jsonb_build_object('status', 'confirmed', 'new_phone_e164', v_verification.new_phone_e164);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_phone_change(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_phone_change(uuid, text) TO service_role;

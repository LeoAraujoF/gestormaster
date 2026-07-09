-- ==========================================
-- FASE 1 — Automação de Recebimento (PIX)
-- Tabela de cobranças PIX dinâmicas
-- ==========================================
-- Execute no SQL Editor do Supabase (ou via CLI).
-- Service role (workers/webhooks) ignora RLS.

CREATE TABLE IF NOT EXISTS public.pix_charges (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL,
  user_id           uuid NOT NULL,
  client_id         uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  provider          text NOT NULL DEFAULT 'mercadopago',
  provider_payment_id text,
  purpose           text NOT NULL DEFAULT 'manual'
                    CHECK (purpose IN ('manual', 'renewal', 'charge')),
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paid', 'expired', 'cancelled', 'failed')),
  amount            numeric(12,2) NOT NULL,
  description       text,
  phone             text,
  instance_name     text,
  months_to_renew   integer NOT NULL DEFAULT 1,
  plan_name         text,
  copia_e_cola      text,
  qr_code_base64    text,
  ticket_url        text,
  external_reference text,
  expires_at        timestamptz,
  paid_at           timestamptz,
  payment_id        uuid, -- FK lógica para payments.id (após confirmação)
  processed_at      timestamptz, -- idempotência do webhook
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Um payment_id do gateway = uma cobrança (evita duplicidade)
CREATE UNIQUE INDEX IF NOT EXISTS pix_charges_provider_payment_uidx
  ON public.pix_charges (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pix_charges_org_status_idx
  ON public.pix_charges (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS pix_charges_user_status_idx
  ON public.pix_charges (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS pix_charges_client_idx
  ON public.pix_charges (client_id, created_at DESC)
  WHERE client_id IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_pix_charges_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pix_charges_updated_at ON public.pix_charges;
CREATE TRIGGER trg_pix_charges_updated_at
  BEFORE UPDATE ON public.pix_charges
  FOR EACH ROW
  EXECUTE FUNCTION public.set_pix_charges_updated_at();

-- RLS: dono vê só as próprias cobranças
ALTER TABLE public.pix_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own pix_charges" ON public.pix_charges;
CREATE POLICY "Users can manage own pix_charges"
  ON public.pix_charges
  FOR ALL
  USING (
    auth.uid() = user_id
    OR organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  )
  WITH CHECK (
    auth.uid() = user_id
    OR organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  );

-- Métricas rápidas (opcional; a API também calcula)
CREATE OR REPLACE FUNCTION public.get_pix_charge_metrics()
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  uid uuid := auth.uid();
  result json;
BEGIN
  SELECT json_build_object(
    'pending_count', COUNT(*) FILTER (WHERE status = 'pending' AND (expires_at IS NULL OR expires_at > now())),
    'pending_amount', COALESCE(SUM(amount) FILTER (WHERE status = 'pending' AND (expires_at IS NULL OR expires_at > now())), 0),
    'paid_today_count', COUNT(*) FILTER (WHERE status = 'paid' AND paid_at::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date),
    'paid_today_amount', COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND paid_at::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date), 0),
    'paid_month_count', COUNT(*) FILTER (
      WHERE status = 'paid'
        AND date_trunc('month', paid_at AT TIME ZONE 'America/Sao_Paulo')
          = date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
    ),
    'paid_month_amount', COALESCE(SUM(amount) FILTER (
      WHERE status = 'paid'
        AND date_trunc('month', paid_at AT TIME ZONE 'America/Sao_Paulo')
          = date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
    ), 0)
  )
  INTO result
  FROM public.pix_charges
  WHERE user_id = uid;

  RETURN COALESCE(result, json_build_object(
    'pending_count', 0,
    'pending_amount', 0,
    'paid_today_count', 0,
    'paid_today_amount', 0,
    'paid_month_count', 0,
    'paid_month_amount', 0
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pix_charge_metrics() TO authenticated;

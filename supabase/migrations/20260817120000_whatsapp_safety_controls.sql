-- Controles de consentimento e ritmo de envio para reduzir bloqueios no WhatsApp.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_source text,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_categories text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out_at timestamptz;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_source text,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_categories text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out_at timestamptz;

ALTER TABLE public.evolution_instances
  ADD COLUMN IF NOT EXISTS daily_message_limit integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS message_min_interval_ms integer NOT NULL DEFAULT 15000,
  ADD COLUMN IF NOT EXISTS sending_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sending_pause_reason text,
  ADD COLUMN IF NOT EXISTS sending_paused_at timestamptz;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_whatsapp_opt_in_categories_check,
  ADD CONSTRAINT clients_whatsapp_opt_in_categories_check
    CHECK (whatsapp_opt_in_categories <@ ARRAY['operational', 'billing', 'marketing']::text[]);

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_whatsapp_opt_in_categories_check,
  ADD CONSTRAINT leads_whatsapp_opt_in_categories_check
    CHECK (whatsapp_opt_in_categories <@ ARRAY['operational', 'billing', 'marketing']::text[]);

ALTER TABLE public.evolution_instances
  DROP CONSTRAINT IF EXISTS evolution_instances_daily_message_limit_check,
  ADD CONSTRAINT evolution_instances_daily_message_limit_check
    CHECK (daily_message_limit BETWEEN 1 AND 10000),
  DROP CONSTRAINT IF EXISTS evolution_instances_message_min_interval_ms_check,
  ADD CONSTRAINT evolution_instances_message_min_interval_ms_check
    CHECK (message_min_interval_ms BETWEEN 1000 AND 300000);

CREATE INDEX IF NOT EXISTS clients_whatsapp_opt_in_idx
  ON public.clients (organization_id, whatsapp_opt_in, whatsapp_opt_out);

CREATE INDEX IF NOT EXISTS leads_whatsapp_opt_in_idx
  ON public.leads (user_id, whatsapp_opt_in, whatsapp_opt_out);

-- O aquecimento artificial não deve continuar ativo após a aplicação da migração.
UPDATE public.evolution_instances
SET is_warming_up = false
WHERE is_warming_up = true;

COMMENT ON COLUMN public.clients.whatsapp_opt_in IS 'Consentimento explícito para receber mensagens WhatsApp.';
COMMENT ON COLUMN public.clients.whatsapp_opt_in_categories IS 'Categorias autorizadas: operational, billing e marketing.';
COMMENT ON COLUMN public.leads.whatsapp_opt_in IS 'Consentimento explícito para receber campanhas WhatsApp.';
COMMENT ON COLUMN public.evolution_instances.daily_message_limit IS 'Limite diário de mensagens normais desta instância.';
COMMENT ON COLUMN public.evolution_instances.message_min_interval_ms IS 'Intervalo mínimo entre mensagens normais desta instância.';

-- GestorMaster - schema consolidado de produção
-- Snapshot estrutural para um projeto Supabase novo ou banco vazio.
-- Não contém usuários, organizações, clientes, pagamentos, credenciais ou dados operacionais.
-- Inclui apenas configurações globais necessárias para inicializar o SaaS.

BEGIN;

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_min_messages = warning;
SET search_path = public, extensions;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


-- Tipos

CREATE TYPE public.alert_send_status AS ENUM ('sent', 'failed', 'pending');

CREATE TYPE public.alert_type AS ENUM ('before_due', 'on_due', 'after_due', 'renewal', 'promotion', 'quick_message', 'activation', 'welcome');

CREATE TYPE public.client_status AS ENUM ('active', 'inactive', 'pending', 'vencido', 'suspended', 'canceled');

CREATE TYPE public.instance_status AS ENUM ('connected', 'disconnected');


-- Tabelas

CREATE TABLE public.account_deletion_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  organization_id uuid,
  requested_by uuid NOT NULL,
  reason text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  requested_at timestamp with time zone DEFAULT now() NOT NULL,
  purge_after timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
  restored_at timestamp with time zone,
  previous_entitlement_active boolean,
  target_user_id uuid,
  purged_at timestamp with time zone,
  last_attempt_at timestamp with time zone,
  attempt_count integer DEFAULT 0 NOT NULL,
  blocked_reason text
);

CREATE TABLE public.admin_action_idempotency (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  idempotency_key uuid NOT NULL,
  admin_user_id uuid NOT NULL,
  action text NOT NULL,
  status text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone
);

CREATE TABLE public.admin_incidents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  fingerprint text NOT NULL,
  source text NOT NULL,
  severity text NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
  occurrence_count integer DEFAULT 1 NOT NULL,
  first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
  last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
  acknowledged_at timestamp with time zone,
  acknowledged_by uuid,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.admin_operational_heartbeats (
  component text NOT NULL,
  status text DEFAULT 'healthy'::text NOT NULL,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
  version text,
  metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.affiliate_earnings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  referrer_id uuid,
  referred_user_id uuid,
  amount numeric(10,2) NOT NULL,
  status character varying(50) DEFAULT 'pending'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  paid_at timestamp with time zone
);

CREATE TABLE public.alert_history (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  client_id uuid NOT NULL,
  automation_id uuid,
  sent_at timestamp with time zone,
  status alert_send_status DEFAULT 'pending'::alert_send_status NOT NULL,
  message_content text,
  error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  scheduled_at timestamp with time zone,
  organization_id uuid,
  collection_dispatch_id uuid,
  contact_reservation_id uuid,
  contact_origin text,
  contact_category text,
  contact_decision text,
  contact_decision_reason text
);

CREATE TABLE public.analytics_forecasts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  forecast_date date NOT NULL,
  horizon text NOT NULL,
  model_version integer DEFAULT 1 NOT NULL,
  coverage text NOT NULL,
  coverage_days integer DEFAULT 0 NOT NULL,
  complete_months integer DEFAULT 0 NOT NULL,
  contractual_total numeric(14,2) DEFAULT 0 NOT NULL,
  expected_cash numeric(14,2),
  projected_active_clients numeric(12,2) DEFAULT 0 NOT NULL,
  assumptions jsonb DEFAULT '{}'::jsonb NOT NULL,
  series jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.analytics_scenarios (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  name text NOT NULL,
  current_price numeric(12,2) NOT NULL,
  new_price numeric(12,2) NOT NULL,
  assumed_churn_pct numeric(5,2) NOT NULL,
  eligible_clients integer NOT NULL,
  projected_clients numeric(12,2) NOT NULL,
  current_mrr numeric(14,2) NOT NULL,
  projected_mrr numeric(14,2) NOT NULL,
  monthly_delta numeric(14,2) NOT NULL,
  annual_delta numeric(14,2) NOT NULL,
  break_even_churn_pct numeric(5,2) NOT NULL,
  source_snapshot_date date NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.api_keys (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  key text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.audit_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid,
  user_id uuid,
  action text NOT NULL,
  resource text NOT NULL,
  resource_id text,
  details jsonb,
  ip_address text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  correlation_id uuid,
  outcome text DEFAULT 'success'::text NOT NULL,
  reason text
);

CREATE TABLE public.automations (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  alert_type alert_type NOT NULL,
  days_offset integer DEFAULT 0 NOT NULL,
  message_template text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  send_time time without time zone DEFAULT '09:00:00'::time without time zone,
  organization_id uuid
);

CREATE TABLE public.billing_cycles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  due_date date NOT NULL,
  amount numeric(12,2) NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  pix_charge_id uuid,
  payment_id uuid,
  paid_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.campaigns (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  name text NOT NULL,
  message_template text NOT NULL,
  selected_instances text[] DEFAULT '{}'::text[],
  created_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'draft'::text NOT NULL
);

CREATE TABLE public.client_change_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  request_type text NOT NULL,
  requested_due_date date,
  status text DEFAULT 'pending'::text NOT NULL,
  requested_from_phone text NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.client_lifecycle_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  event_type text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.client_portal_auth_challenges (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  phone_e164 text NOT NULL,
  code_hash text NOT NULL,
  code_ciphertext text,
  attempts smallint DEFAULT 0 NOT NULL,
  send_status text DEFAULT 'pending'::text NOT NULL,
  error_code text,
  requested_ip_hash text,
  expires_at timestamp with time zone NOT NULL,
  sent_at timestamp with time zone,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.client_portal_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  token_hash text NOT NULL,
  ip_hash text,
  user_agent_hash text,
  expires_at timestamp with time zone NOT NULL,
  last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.client_portal_settings (
  organization_id uuid NOT NULL,
  enabled boolean DEFAULT false NOT NULL,
  slug text NOT NULL,
  display_name text NOT NULL,
  logo_url text,
  primary_color text DEFAULT '#111827'::text NOT NULL,
  allow_renewal boolean DEFAULT true NOT NULL,
  allow_due_date_request boolean DEFAULT true NOT NULL,
  allow_phone_change boolean DEFAULT true NOT NULL,
  allow_support_request boolean DEFAULT true NOT NULL,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.client_services (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  client_id uuid NOT NULL,
  service_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  username text,
  password text
);

CREATE TABLE public.client_tag_assignments (
  client_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  assigned_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.client_tags (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.clients (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  plan_value numeric(10,2) DEFAULT 0.00 NOT NULL,
  observation text,
  description text,
  registration_date date DEFAULT CURRENT_DATE NOT NULL,
  status client_status DEFAULT 'active'::client_status NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  due_date date DEFAULT CURRENT_DATE NOT NULL,
  username text,
  screens integer DEFAULT 1,
  organization_id uuid,
  external_id text,
  due_time text,
  phone_e164 text
);

CREATE TABLE public.collection_dispatches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  cycle_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  step_id uuid NOT NULL,
  alert_history_id uuid,
  message_content text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  scheduled_for timestamp with time zone NOT NULL,
  sent_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  attempt_count smallint DEFAULT 0 NOT NULL,
  last_attempt_at timestamp with time zone
);

CREATE TABLE public.collection_profile_steps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id uuid NOT NULL,
  sequence smallint NOT NULL,
  relative_day smallint NOT NULL,
  send_time time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
  message_template text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.collection_profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  min_score smallint,
  max_score smallint,
  is_override boolean DEFAULT false NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.collection_scores (
  client_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  score smallint NOT NULL,
  confidence text NOT NULL,
  reason jsonb DEFAULT '{}'::jsonb NOT NULL,
  calculated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.collection_settings (
  organization_id uuid NOT NULL,
  enabled boolean DEFAULT false NOT NULL,
  timezone text DEFAULT 'America/Sao_Paulo'::text NOT NULL,
  daily_message_limit smallint DEFAULT 1 NOT NULL,
  cycle_message_limit smallint DEFAULT 4 NOT NULL,
  send_window_start time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
  send_window_end time without time zone DEFAULT '20:00:00'::time without time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.contact_reservations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  contact_date date NOT NULL,
  timezone text DEFAULT 'America/Sao_Paulo'::text NOT NULL,
  category text NOT NULL,
  priority smallint NOT NULL,
  source text NOT NULL,
  source_id uuid,
  requested_by uuid,
  automation_id uuid,
  alert_history_id uuid,
  message_content text,
  media_url text,
  status text DEFAULT 'reserved'::text NOT NULL,
  decision_reason text,
  defer_count smallint DEFAULT 0 NOT NULL,
  deferred_until date,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  sent_at timestamp with time zone
);

CREATE TABLE public.credit_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  reseller_id uuid,
  service_name text NOT NULL,
  credits_amount integer NOT NULL,
  total_value numeric NOT NULL,
  status text DEFAULT 'pending_payment'::text,
  payment_method text,
  created_at timestamp with time zone DEFAULT now(),
  base_cost numeric DEFAULT 0,
  net_profit numeric DEFAULT 0
);

CREATE TABLE public.credit_transfers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sender_id uuid,
  receiver_id uuid,
  amount integer NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.evolution_instances (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  instance_name text NOT NULL,
  status instance_status DEFAULT 'disconnected'::instance_status NOT NULL,
  qr_code text,
  api_key text,
  base_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  connection_mode text DEFAULT 'integrated'::text,
  min_delay integer DEFAULT 10,
  max_delay integer DEFAULT 25,
  reject_calls boolean DEFAULT false,
  reject_calls_message text DEFAULT 'As chamadas de voz e vídeo estão desativadas para este número. Por favor, envie uma mensagem de texto.'::text,
  is_primary boolean DEFAULT false,
  organization_id uuid,
  is_warming_up boolean DEFAULT false,
  phone_number text
);

CREATE TABLE public.executive_daily_snapshots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  mrr numeric(12,2) DEFAULT 0 NOT NULL,
  active_clients integer DEFAULT 0 NOT NULL,
  forecast_month numeric(12,2) DEFAULT 0 NOT NULL,
  confirmed_month numeric(12,2) DEFAULT 0 NOT NULL,
  at_risk numeric(12,2) DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  timezone text DEFAULT 'America/Sao_Paulo'::text NOT NULL,
  due_cycles integer DEFAULT 0 NOT NULL,
  paid_cycles integer DEFAULT 0 NOT NULL,
  due_amount numeric(12,2) DEFAULT 0 NOT NULL,
  paid_due_amount numeric(12,2) DEFAULT 0 NOT NULL,
  payments_count integer DEFAULT 0 NOT NULL,
  new_clients integer DEFAULT 0 NOT NULL,
  cancelled_clients integer DEFAULT 0 NOT NULL,
  captured_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.fixed_costs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  amount numeric(10,2) DEFAULT 0 NOT NULL,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.integrations (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  organization_id uuid NOT NULL,
  provider character varying(50) NOT NULL,
  credentials jsonb NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.intelligence_credentials (
  organization_id uuid NOT NULL,
  provider text DEFAULT 'openai'::text NOT NULL,
  encrypted_api_key text NOT NULL,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.intelligence_findings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  run_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  agent_type text NOT NULL,
  severity text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
  recommendation text NOT NULL,
  confidence numeric(4,3) DEFAULT 0 NOT NULL,
  coverage text DEFAULT 'partial'::text NOT NULL,
  action_url text,
  state text DEFAULT 'new'::text NOT NULL,
  source text DEFAULT 'deterministic'::text NOT NULL,
  priority smallint DEFAULT 50 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.intelligence_operational_heartbeats (
  organization_id uuid NOT NULL,
  component text NOT NULL,
  status text DEFAULT 'healthy'::text NOT NULL,
  metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
  last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.intelligence_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  report_date date NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  engine_version integer DEFAULT 1 NOT NULL,
  trigger_type text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  narrative_status text DEFAULT 'pending'::text NOT NULL,
  source_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
  data_fingerprint text NOT NULL,
  model text,
  credential_source text DEFAULT 'deterministic'::text NOT NULL,
  input_tokens integer DEFAULT 0 NOT NULL,
  output_tokens integer DEFAULT 0 NOT NULL,
  error_code text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.intelligence_settings (
  organization_id uuid NOT NULL,
  enabled boolean DEFAULT false NOT NULL,
  timezone text DEFAULT 'America/Sao_Paulo'::text NOT NULL,
  report_time time without time zone DEFAULT '07:00:00'::time without time zone NOT NULL,
  enabled_agents text[] DEFAULT ARRAY['financial'::text, 'commercial'::text, 'collections'::text, 'executive'::text, 'operational'::text] NOT NULL,
  use_byok_after_quota boolean DEFAULT false NOT NULL,
  byok_configured boolean DEFAULT false NOT NULL,
  byok_last4 text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.intelligence_usage_monthly (
  organization_id uuid NOT NULL,
  usage_month date NOT NULL,
  platform_reports integer DEFAULT 0 NOT NULL,
  byok_reports integer DEFAULT 0 NOT NULL,
  input_tokens bigint DEFAULT 0 NOT NULL,
  output_tokens bigint DEFAULT 0 NOT NULL,
  failed_reports integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.iptv_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  username text NOT NULL,
  password text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  linked_service_id uuid
);

CREATE TABLE public.leads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  status text DEFAULT 'novo'::text,
  source text DEFAULT 'CSV'::text,
  notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  custom_fields jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.message_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  badge text DEFAULT 'PIX'::text NOT NULL,
  message text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.organization_entitlements (
  organization_id uuid NOT NULL,
  plan text DEFAULT 'starter'::text NOT NULL,
  is_active boolean DEFAULT false NOT NULL,
  source text DEFAULT 'migration'::text NOT NULL,
  provider_customer_id text,
  provider_subscription_id text,
  expires_at timestamp with time zone,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  provider_status text,
  provider_event_created_at timestamp with time zone
);

CREATE TABLE public.organization_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.organizations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  monthly_goal numeric DEFAULT 10000
);

CREATE TABLE public.payments (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  client_id uuid NOT NULL,
  amount_paid numeric(10,2) DEFAULT 0.00 NOT NULL,
  net_profit numeric(10,2) DEFAULT 0.00 NOT NULL,
  months_renewed integer DEFAULT 1 NOT NULL,
  payment_date date DEFAULT CURRENT_DATE NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  organization_id uuid,
  payment_method text DEFAULT 'legacy'::text NOT NULL,
  provider text,
  paid_at timestamp with time zone,
  billing_cycle_id uuid
);

CREATE TABLE public.phone_change_verifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  new_phone_e164 text NOT NULL,
  code_hash text NOT NULL,
  code_ciphertext text,
  attempts smallint DEFAULT 0 NOT NULL,
  send_status text DEFAULT 'sent'::text NOT NULL,
  error_code text,
  requested_via text DEFAULT 'whatsapp_bot'::text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  sent_at timestamp with time zone,
  used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.pix_charges (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  client_id uuid,
  provider text DEFAULT 'mercadopago'::text NOT NULL,
  provider_payment_id text,
  purpose text DEFAULT 'manual'::text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  amount numeric(12,2) NOT NULL,
  description text,
  phone text,
  instance_name text,
  months_to_renew integer DEFAULT 1 NOT NULL,
  plan_name text,
  copia_e_cola text,
  qr_code_base64 text,
  ticket_url text,
  external_reference text,
  expires_at timestamp with time zone,
  paid_at timestamp with time zone,
  payment_id uuid,
  processed_at timestamp with time zone,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.promotions (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  discount_value numeric(10,2) DEFAULT 0.00 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  start_date date,
  end_date date,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  organization_id uuid
);

CREATE TABLE public.reseller_services (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  reseller_id uuid,
  service_name text NOT NULL,
  base_price numeric NOT NULL,
  profit_margin numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.resellers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  name text NOT NULL,
  email text,
  whatsapp text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  current_debt numeric DEFAULT 0
);

CREATE TABLE public.revenda_settings (
  user_id uuid NOT NULL,
  mp_access_token text,
  stripe_secret text,
  notification_number text,
  created_at timestamp with time zone DEFAULT now(),
  pix_key text,
  pix_type text
);

CREATE TABLE public.saas_plan_catalog (
  plan text NOT NULL,
  display_name text NOT NULL,
  description text NOT NULL,
  monthly_price_cents integer,
  client_limit integer,
  whatsapp_instance_limit integer NOT NULL,
  capabilities text[] DEFAULT '{}'::text[] NOT NULL,
  is_public boolean DEFAULT true NOT NULL,
  is_purchasable boolean DEFAULT false NOT NULL,
  sort_order smallint NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.security_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  hmac_secret text NOT NULL,
  require_signature boolean DEFAULT true,
  rotated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  hmac_previous_secret text,
  hmac_previous_valid_until timestamp with time zone
);

CREATE TABLE public.services (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  cost numeric(10,2) DEFAULT 0.00 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  organization_id uuid,
  panel_type text,
  panel_url text,
  panel_username text,
  panel_password text,
  plans jsonb DEFAULT '[]'::jsonb
);

CREATE TABLE public.system_features (
  key text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  is_enabled boolean DEFAULT true,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.system_updates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  update_type text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  is_published boolean DEFAULT true
);

CREATE TABLE public.ticket_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ticket_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  is_from_admin boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.tickets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  subject text NOT NULL,
  description text NOT NULL,
  page_url text,
  status text DEFAULT 'open'::text NOT NULL,
  priority text DEFAULT 'medium'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  organization_id uuid
);

CREATE TABLE public.user_update_reads (
  user_id uuid NOT NULL,
  update_id uuid NOT NULL,
  read_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.users (
  id uuid NOT NULL,
  email text,
  full_name text,
  phone text,
  whatsapp text,
  plan_name text,
  plan_expires_at timestamp with time zone,
  has_active_subscription boolean DEFAULT false,
  credits integer DEFAULT 0,
  referred_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.withdrawal_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  amount numeric(10,2) NOT NULL,
  pix_key text NOT NULL,
  status text DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT now()
);


-- Constraints

ALTER TABLE ONLY public.account_deletion_requests ADD CONSTRAINT account_deletion_requests_status_check CHECK (status = ANY (ARRAY['pending'::text, 'restored'::text, 'purged'::text]));

ALTER TABLE ONLY public.admin_action_idempotency ADD CONSTRAINT admin_action_idempotency_status_check CHECK (status = ANY (ARRAY['processing'::text, 'completed'::text, 'failed'::text]));

ALTER TABLE ONLY public.admin_incidents ADD CONSTRAINT admin_incidents_evidence_object CHECK (jsonb_typeof(evidence) = 'object'::text);

ALTER TABLE ONLY public.admin_incidents ADD CONSTRAINT admin_incidents_fingerprint_length CHECK (char_length(fingerprint) >= 3 AND char_length(fingerprint) <= 180);

ALTER TABLE ONLY public.admin_incidents ADD CONSTRAINT admin_incidents_occurrence_count CHECK (occurrence_count > 0);

ALTER TABLE ONLY public.admin_incidents ADD CONSTRAINT admin_incidents_severity CHECK (severity = ANY (ARRAY['warning'::text, 'critical'::text]));

ALTER TABLE ONLY public.admin_incidents ADD CONSTRAINT admin_incidents_source_length CHECK (char_length(source) >= 2 AND char_length(source) <= 80);

ALTER TABLE ONLY public.admin_incidents ADD CONSTRAINT admin_incidents_status CHECK (status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'resolved'::text]));

ALTER TABLE ONLY public.admin_incidents ADD CONSTRAINT admin_incidents_summary_length CHECK (char_length(summary) >= 3 AND char_length(summary) <= 1000);

ALTER TABLE ONLY public.admin_incidents ADD CONSTRAINT admin_incidents_title_length CHECK (char_length(title) >= 3 AND char_length(title) <= 160);

ALTER TABLE ONLY public.admin_operational_heartbeats ADD CONSTRAINT admin_operational_heartbeats_component_length CHECK (char_length(component) >= 2 AND char_length(component) <= 80);

ALTER TABLE ONLY public.admin_operational_heartbeats ADD CONSTRAINT admin_operational_heartbeats_metrics_object CHECK (jsonb_typeof(metrics) = 'object'::text);

ALTER TABLE ONLY public.admin_operational_heartbeats ADD CONSTRAINT admin_operational_heartbeats_status CHECK (status = ANY (ARRAY['healthy'::text, 'degraded'::text]));

ALTER TABLE ONLY public.analytics_forecasts ADD CONSTRAINT analytics_forecasts_complete_months_check CHECK (complete_months >= 0);

ALTER TABLE ONLY public.analytics_forecasts ADD CONSTRAINT analytics_forecasts_contractual_total_check CHECK (contractual_total >= 0::numeric);

ALTER TABLE ONLY public.analytics_forecasts ADD CONSTRAINT analytics_forecasts_coverage_check CHECK (coverage = ANY (ARRAY['insufficient'::text, 'partial'::text, 'full'::text]));

ALTER TABLE ONLY public.analytics_forecasts ADD CONSTRAINT analytics_forecasts_coverage_days_check CHECK (coverage_days >= 0);

ALTER TABLE ONLY public.analytics_forecasts ADD CONSTRAINT analytics_forecasts_expected_cash_check CHECK (expected_cash IS NULL OR expected_cash >= 0::numeric);

ALTER TABLE ONLY public.analytics_forecasts ADD CONSTRAINT analytics_forecasts_horizon_check CHECK (horizon = ANY (ARRAY['month'::text, '3m'::text, '6m'::text, '12m'::text]));

ALTER TABLE ONLY public.analytics_forecasts ADD CONSTRAINT analytics_forecasts_model_version_check CHECK (model_version > 0);

ALTER TABLE ONLY public.analytics_forecasts ADD CONSTRAINT analytics_forecasts_projected_active_clients_check CHECK (projected_active_clients >= 0::numeric);

ALTER TABLE ONLY public.analytics_scenarios ADD CONSTRAINT analytics_scenarios_assumed_churn_pct_check CHECK (assumed_churn_pct >= 0::numeric AND assumed_churn_pct <= 100::numeric);

ALTER TABLE ONLY public.analytics_scenarios ADD CONSTRAINT analytics_scenarios_break_even_churn_pct_check CHECK (break_even_churn_pct >= 0::numeric AND break_even_churn_pct <= 100::numeric);

ALTER TABLE ONLY public.analytics_scenarios ADD CONSTRAINT analytics_scenarios_current_mrr_check CHECK (current_mrr >= 0::numeric);

ALTER TABLE ONLY public.analytics_scenarios ADD CONSTRAINT analytics_scenarios_current_price_check CHECK (current_price > 0::numeric);

ALTER TABLE ONLY public.analytics_scenarios ADD CONSTRAINT analytics_scenarios_eligible_clients_check CHECK (eligible_clients >= 0);

ALTER TABLE ONLY public.analytics_scenarios ADD CONSTRAINT analytics_scenarios_name_check CHECK (char_length(name) >= 1 AND char_length(name) <= 80);

ALTER TABLE ONLY public.analytics_scenarios ADD CONSTRAINT analytics_scenarios_new_price_check CHECK (new_price > 0::numeric);

ALTER TABLE ONLY public.analytics_scenarios ADD CONSTRAINT analytics_scenarios_projected_clients_check CHECK (projected_clients >= 0::numeric);

ALTER TABLE ONLY public.analytics_scenarios ADD CONSTRAINT analytics_scenarios_projected_mrr_check CHECK (projected_mrr >= 0::numeric);

ALTER TABLE ONLY public.audit_logs ADD CONSTRAINT audit_logs_outcome_check CHECK (outcome = ANY (ARRAY['success'::text, 'failure'::text]));

ALTER TABLE ONLY public.billing_cycles ADD CONSTRAINT billing_cycles_amount_check CHECK (amount > 0::numeric);

ALTER TABLE ONLY public.billing_cycles ADD CONSTRAINT billing_cycles_status_check CHECK (status = ANY (ARRAY['open'::text, 'overdue'::text, 'paid'::text, 'cancelled'::text]));

ALTER TABLE ONLY public.client_change_requests ADD CONSTRAINT client_change_requests_check CHECK (request_type = 'due_date'::text AND requested_due_date IS NOT NULL OR request_type = 'human_support'::text);

ALTER TABLE ONLY public.client_change_requests ADD CONSTRAINT client_change_requests_request_type_check CHECK (request_type = ANY (ARRAY['due_date'::text, 'human_support'::text]));

ALTER TABLE ONLY public.client_change_requests ADD CONSTRAINT client_change_requests_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text]));

ALTER TABLE ONLY public.client_lifecycle_events ADD CONSTRAINT client_lifecycle_events_event_type_check CHECK (event_type = ANY (ARRAY['cancelled'::text, 'reactivated'::text]));

ALTER TABLE ONLY public.client_portal_auth_challenges ADD CONSTRAINT client_portal_auth_challenges_attempts_check CHECK (attempts >= 0 AND attempts <= 5);

ALTER TABLE ONLY public.client_portal_auth_challenges ADD CONSTRAINT client_portal_auth_challenges_code_hash_check CHECK (code_hash ~ '^[a-f0-9]{64}$'::text);

ALTER TABLE ONLY public.client_portal_auth_challenges ADD CONSTRAINT client_portal_auth_challenges_phone_e164_check CHECK (phone_e164 ~ '^\+[1-9][0-9]{9,14}$'::text);

ALTER TABLE ONLY public.client_portal_auth_challenges ADD CONSTRAINT client_portal_auth_challenges_requested_ip_hash_check CHECK (requested_ip_hash IS NULL OR requested_ip_hash ~ '^[a-f0-9]{64}$'::text);

ALTER TABLE ONLY public.client_portal_auth_challenges ADD CONSTRAINT client_portal_auth_challenges_send_status_check CHECK (send_status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text]));

ALTER TABLE ONLY public.client_portal_sessions ADD CONSTRAINT client_portal_sessions_ip_hash_check CHECK (ip_hash IS NULL OR ip_hash ~ '^[a-f0-9]{64}$'::text);

ALTER TABLE ONLY public.client_portal_sessions ADD CONSTRAINT client_portal_sessions_token_hash_check CHECK (token_hash ~ '^[a-f0-9]{64}$'::text);

ALTER TABLE ONLY public.client_portal_sessions ADD CONSTRAINT client_portal_sessions_user_agent_hash_check CHECK (user_agent_hash IS NULL OR user_agent_hash ~ '^[a-f0-9]{64}$'::text);

ALTER TABLE ONLY public.client_portal_settings ADD CONSTRAINT client_portal_settings_display_name_check CHECK (char_length(display_name) >= 1 AND char_length(display_name) <= 80);

ALTER TABLE ONLY public.client_portal_settings ADD CONSTRAINT client_portal_settings_logo_url_check CHECK (logo_url IS NULL OR logo_url ~ '^https://'::text);

ALTER TABLE ONLY public.client_portal_settings ADD CONSTRAINT client_portal_settings_primary_color_check CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'::text);

ALTER TABLE ONLY public.client_portal_settings ADD CONSTRAINT client_portal_settings_slug_check CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'::text);

ALTER TABLE ONLY public.client_tags ADD CONSTRAINT client_tags_code_check CHECK (code ~ '^[a-z0-9_-]{2,40}$'::text);

ALTER TABLE ONLY public.client_tags ADD CONSTRAINT client_tags_name_check CHECK (char_length(name) >= 2 AND char_length(name) <= 60);

ALTER TABLE ONLY public.clients ADD CONSTRAINT clients_phone_e164_format_check CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{9,14}$'::text);

ALTER TABLE ONLY public.collection_dispatches ADD CONSTRAINT collection_dispatches_status_check CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'retryable'::text, 'sent'::text, 'failed'::text, 'cancelled'::text]));

ALTER TABLE ONLY public.collection_profile_steps ADD CONSTRAINT collection_profile_steps_message_template_check CHECK (char_length(message_template) >= 1 AND char_length(message_template) <= 1000);

ALTER TABLE ONLY public.collection_profile_steps ADD CONSTRAINT collection_profile_steps_relative_day_check CHECK (relative_day >= '-15'::integer AND relative_day <= 30);

ALTER TABLE ONLY public.collection_profile_steps ADD CONSTRAINT collection_profile_steps_sequence_check CHECK (sequence >= 1 AND sequence <= 4);

ALTER TABLE ONLY public.collection_profiles ADD CONSTRAINT collection_profiles_check CHECK (is_override AND min_score IS NULL AND max_score IS NULL OR NOT is_override AND min_score IS NOT NULL AND max_score IS NOT NULL);

ALTER TABLE ONLY public.collection_profiles ADD CONSTRAINT collection_profiles_code_check CHECK (code = ANY (ARRAY['excellent'::text, 'regular'::text, 'attention'::text, 'high_risk'::text, 'vip'::text, 'premium'::text]));

ALTER TABLE ONLY public.collection_profiles ADD CONSTRAINT collection_profiles_max_score_check CHECK (max_score >= 0 AND max_score <= 100);

ALTER TABLE ONLY public.collection_profiles ADD CONSTRAINT collection_profiles_min_score_check CHECK (min_score >= 0 AND min_score <= 100);

ALTER TABLE ONLY public.collection_scores ADD CONSTRAINT collection_scores_confidence_check CHECK (confidence = ANY (ARRAY['low'::text, 'high'::text]));

ALTER TABLE ONLY public.collection_scores ADD CONSTRAINT collection_scores_score_check CHECK (score >= 0 AND score <= 100);

ALTER TABLE ONLY public.collection_settings ADD CONSTRAINT collection_settings_cycle_message_limit_check CHECK (cycle_message_limit >= 1 AND cycle_message_limit <= 6);

ALTER TABLE ONLY public.collection_settings ADD CONSTRAINT collection_settings_daily_message_limit_check CHECK (daily_message_limit >= 1 AND daily_message_limit <= 3);

ALTER TABLE ONLY public.contact_reservations ADD CONSTRAINT contact_reservations_category_check CHECK (category = ANY (ARRAY['billing'::text, 'operational'::text, 'promotion'::text, 'manual'::text]));

ALTER TABLE ONLY public.contact_reservations ADD CONSTRAINT contact_reservations_defer_count_check CHECK (defer_count >= 0 AND defer_count <= 3);

ALTER TABLE ONLY public.contact_reservations ADD CONSTRAINT contact_reservations_priority_check CHECK (priority = ANY (ARRAY[100, 200, 300, 400]));

ALTER TABLE ONLY public.contact_reservations ADD CONSTRAINT contact_reservations_source_check CHECK (source = ANY (ARRAY['intelligent_collection'::text, 'legacy_automation'::text, 'mass'::text, 'manual'::text, 'system'::text]));

ALTER TABLE ONLY public.contact_reservations ADD CONSTRAINT contact_reservations_status_check CHECK (status = ANY (ARRAY['reserved'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'cancelled'::text, 'deferred'::text]));

ALTER TABLE ONLY public.evolution_instances ADD CONSTRAINT evolution_instances_connection_mode_check CHECK (connection_mode = ANY (ARRAY['integrated'::text, 'external'::text]));

ALTER TABLE ONLY public.executive_daily_snapshots ADD CONSTRAINT executive_daily_snapshots_analytics_nonnegative CHECK (due_cycles >= 0 AND paid_cycles >= 0 AND due_amount >= 0::numeric AND paid_due_amount >= 0::numeric AND payments_count >= 0 AND new_clients >= 0 AND cancelled_clients >= 0);

ALTER TABLE ONLY public.intelligence_credentials ADD CONSTRAINT intelligence_credentials_provider_check CHECK (provider = 'openai'::text);

ALTER TABLE ONLY public.intelligence_findings ADD CONSTRAINT intelligence_findings_action_url_check CHECK (action_url IS NULL OR action_url ~ '^/[a-z0-9/_-]+$'::text);

ALTER TABLE ONLY public.intelligence_findings ADD CONSTRAINT intelligence_findings_agent_type_check CHECK (agent_type = ANY (ARRAY['financial'::text, 'commercial'::text, 'collections'::text, 'executive'::text, 'operational'::text]));

ALTER TABLE ONLY public.intelligence_findings ADD CONSTRAINT intelligence_findings_confidence_check CHECK (confidence >= 0::numeric AND confidence <= 1::numeric);

ALTER TABLE ONLY public.intelligence_findings ADD CONSTRAINT intelligence_findings_coverage_check CHECK (coverage = ANY (ARRAY['insufficient'::text, 'partial'::text, 'full'::text]));

ALTER TABLE ONLY public.intelligence_findings ADD CONSTRAINT intelligence_findings_priority_check CHECK (priority >= 0 AND priority <= 100);

ALTER TABLE ONLY public.intelligence_findings ADD CONSTRAINT intelligence_findings_recommendation_check CHECK (char_length(recommendation) >= 1 AND char_length(recommendation) <= 1200);

ALTER TABLE ONLY public.intelligence_findings ADD CONSTRAINT intelligence_findings_severity_check CHECK (severity = ANY (ARRAY['info'::text, 'opportunity'::text, 'warning'::text, 'critical'::text]));

ALTER TABLE ONLY public.intelligence_findings ADD CONSTRAINT intelligence_findings_source_check CHECK (source = ANY (ARRAY['deterministic'::text, 'ai'::text]));

ALTER TABLE ONLY public.intelligence_findings ADD CONSTRAINT intelligence_findings_state_check CHECK (state = ANY (ARRAY['new'::text, 'read'::text, 'dismissed'::text]));

ALTER TABLE ONLY public.intelligence_findings ADD CONSTRAINT intelligence_findings_summary_check CHECK (char_length(summary) >= 1 AND char_length(summary) <= 1200);

ALTER TABLE ONLY public.intelligence_findings ADD CONSTRAINT intelligence_findings_title_check CHECK (char_length(title) >= 1 AND char_length(title) <= 120);

ALTER TABLE ONLY public.intelligence_operational_heartbeats ADD CONSTRAINT intelligence_operational_heartbeats_component_check CHECK (component = ANY (ARRAY['scheduler'::text, 'message_worker'::text, 'webhook_worker'::text, 'ai_worker'::text, 'redis'::text, 'database'::text, 'evolution'::text]));

ALTER TABLE ONLY public.intelligence_operational_heartbeats ADD CONSTRAINT intelligence_operational_heartbeats_status_check CHECK (status = ANY (ARRAY['healthy'::text, 'degraded'::text, 'offline'::text]));

ALTER TABLE ONLY public.intelligence_runs ADD CONSTRAINT intelligence_runs_check CHECK (period_end >= period_start);

ALTER TABLE ONLY public.intelligence_runs ADD CONSTRAINT intelligence_runs_credential_source_check CHECK (credential_source = ANY (ARRAY['platform'::text, 'byok'::text, 'deterministic'::text]));

ALTER TABLE ONLY public.intelligence_runs ADD CONSTRAINT intelligence_runs_input_tokens_check CHECK (input_tokens >= 0);

ALTER TABLE ONLY public.intelligence_runs ADD CONSTRAINT intelligence_runs_narrative_status_check CHECK (narrative_status = ANY (ARRAY['pending'::text, 'completed'::text, 'unavailable'::text, 'failed'::text]));

ALTER TABLE ONLY public.intelligence_runs ADD CONSTRAINT intelligence_runs_output_tokens_check CHECK (output_tokens >= 0);

ALTER TABLE ONLY public.intelligence_runs ADD CONSTRAINT intelligence_runs_status_check CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text]));

ALTER TABLE ONLY public.intelligence_runs ADD CONSTRAINT intelligence_runs_trigger_type_check CHECK (trigger_type = ANY (ARRAY['scheduled'::text, 'manual'::text]));

ALTER TABLE ONLY public.intelligence_settings ADD CONSTRAINT intelligence_settings_byok_last4_check CHECK (byok_last4 IS NULL OR byok_last4 ~ '^[A-Za-z0-9_-]{4}$'::text);

ALTER TABLE ONLY public.intelligence_settings ADD CONSTRAINT intelligence_settings_enabled_agents_check CHECK (enabled_agents <@ ARRAY['financial'::text, 'commercial'::text, 'collections'::text, 'executive'::text, 'operational'::text]);

ALTER TABLE ONLY public.intelligence_usage_monthly ADD CONSTRAINT intelligence_usage_monthly_byok_reports_check CHECK (byok_reports >= 0);

ALTER TABLE ONLY public.intelligence_usage_monthly ADD CONSTRAINT intelligence_usage_monthly_failed_reports_check CHECK (failed_reports >= 0);

ALTER TABLE ONLY public.intelligence_usage_monthly ADD CONSTRAINT intelligence_usage_monthly_input_tokens_check CHECK (input_tokens >= 0);

ALTER TABLE ONLY public.intelligence_usage_monthly ADD CONSTRAINT intelligence_usage_monthly_output_tokens_check CHECK (output_tokens >= 0);

ALTER TABLE ONLY public.intelligence_usage_monthly ADD CONSTRAINT intelligence_usage_monthly_platform_reports_check CHECK (platform_reports >= 0);

ALTER TABLE ONLY public.intelligence_usage_monthly ADD CONSTRAINT intelligence_usage_monthly_usage_month_check CHECK (usage_month = date_trunc('month'::text, usage_month::timestamp with time zone)::date);

ALTER TABLE ONLY public.organization_entitlements ADD CONSTRAINT organization_entitlements_plan_check CHECK (plan = ANY (ARRAY['starter'::text, 'pro'::text, 'master'::text]));

ALTER TABLE ONLY public.organization_entitlements ADD CONSTRAINT organization_entitlements_source_check CHECK (source = ANY (ARRAY['migration'::text, 'stripe'::text, 'pixgo'::text, 'affiliate'::text, 'admin'::text]));

ALTER TABLE ONLY public.organization_members ADD CONSTRAINT organization_members_role_check CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]));

ALTER TABLE ONLY public.phone_change_verifications ADD CONSTRAINT phone_change_verifications_attempts_check CHECK (attempts >= 0 AND attempts <= 5);

ALTER TABLE ONLY public.phone_change_verifications ADD CONSTRAINT phone_change_verifications_code_hash_check CHECK (code_hash ~ '^[a-f0-9]{64}$'::text);

ALTER TABLE ONLY public.phone_change_verifications ADD CONSTRAINT phone_change_verifications_new_phone_e164_check CHECK (new_phone_e164 ~ '^\+[1-9][0-9]{9,14}$'::text);

ALTER TABLE ONLY public.phone_change_verifications ADD CONSTRAINT phone_change_verifications_requested_via_check CHECK (requested_via = ANY (ARRAY['whatsapp_bot'::text, 'portal'::text]));

ALTER TABLE ONLY public.phone_change_verifications ADD CONSTRAINT phone_change_verifications_send_status_check CHECK (send_status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text]));

ALTER TABLE ONLY public.pix_charges ADD CONSTRAINT pix_charges_purpose_check CHECK (purpose = ANY (ARRAY['manual'::text, 'renewal'::text, 'charge'::text]));

ALTER TABLE ONLY public.pix_charges ADD CONSTRAINT pix_charges_status_check CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'expired'::text, 'cancelled'::text, 'failed'::text]));

ALTER TABLE ONLY public.saas_plan_catalog ADD CONSTRAINT saas_plan_catalog_client_limit_check CHECK (client_limit IS NULL OR client_limit > 0);

ALTER TABLE ONLY public.saas_plan_catalog ADD CONSTRAINT saas_plan_catalog_description_check CHECK (char_length(description) >= 1 AND char_length(description) <= 240);

ALTER TABLE ONLY public.saas_plan_catalog ADD CONSTRAINT saas_plan_catalog_display_name_check CHECK (char_length(display_name) >= 1 AND char_length(display_name) <= 40);

ALTER TABLE ONLY public.saas_plan_catalog ADD CONSTRAINT saas_plan_catalog_monthly_price_cents_check CHECK (monthly_price_cents IS NULL OR monthly_price_cents >= 0);

ALTER TABLE ONLY public.saas_plan_catalog ADD CONSTRAINT saas_plan_catalog_plan_check CHECK (plan = ANY (ARRAY['starter'::text, 'pro'::text, 'master'::text]));

ALTER TABLE ONLY public.saas_plan_catalog ADD CONSTRAINT saas_plan_catalog_whatsapp_instance_limit_check CHECK (whatsapp_instance_limit > 0);

ALTER TABLE ONLY public.account_deletion_requests ADD CONSTRAINT account_deletion_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.admin_action_idempotency ADD CONSTRAINT admin_action_idempotency_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.admin_incidents ADD CONSTRAINT admin_incidents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.admin_operational_heartbeats ADD CONSTRAINT admin_operational_heartbeats_pkey PRIMARY KEY (component);

ALTER TABLE ONLY public.affiliate_earnings ADD CONSTRAINT affiliate_earnings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.alert_history ADD CONSTRAINT alert_history_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.analytics_forecasts ADD CONSTRAINT analytics_forecasts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.analytics_scenarios ADD CONSTRAINT analytics_scenarios_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.api_keys ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.audit_logs ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.automations ADD CONSTRAINT automations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.billing_cycles ADD CONSTRAINT billing_cycles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.campaigns ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.client_change_requests ADD CONSTRAINT client_change_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.client_lifecycle_events ADD CONSTRAINT client_lifecycle_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.client_portal_auth_challenges ADD CONSTRAINT client_portal_auth_challenges_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.client_portal_sessions ADD CONSTRAINT client_portal_sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.client_portal_settings ADD CONSTRAINT client_portal_settings_pkey PRIMARY KEY (organization_id);

ALTER TABLE ONLY public.client_services ADD CONSTRAINT client_services_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.client_tag_assignments ADD CONSTRAINT client_tag_assignments_pkey PRIMARY KEY (client_id, tag_id);

ALTER TABLE ONLY public.client_tags ADD CONSTRAINT client_tags_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.collection_dispatches ADD CONSTRAINT collection_dispatches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.collection_profile_steps ADD CONSTRAINT collection_profile_steps_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.collection_profiles ADD CONSTRAINT collection_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.collection_scores ADD CONSTRAINT collection_scores_pkey PRIMARY KEY (client_id);

ALTER TABLE ONLY public.collection_settings ADD CONSTRAINT collection_settings_pkey PRIMARY KEY (organization_id);

ALTER TABLE ONLY public.contact_reservations ADD CONSTRAINT contact_reservations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.credit_requests ADD CONSTRAINT credit_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.credit_transfers ADD CONSTRAINT credit_transfers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.executive_daily_snapshots ADD CONSTRAINT executive_daily_snapshots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.fixed_costs ADD CONSTRAINT fixed_costs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.integrations ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.intelligence_credentials ADD CONSTRAINT intelligence_credentials_pkey PRIMARY KEY (organization_id);

ALTER TABLE ONLY public.intelligence_findings ADD CONSTRAINT intelligence_findings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.intelligence_operational_heartbeats ADD CONSTRAINT intelligence_operational_heartbeats_pkey PRIMARY KEY (organization_id, component);

ALTER TABLE ONLY public.intelligence_runs ADD CONSTRAINT intelligence_runs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.intelligence_settings ADD CONSTRAINT intelligence_settings_pkey PRIMARY KEY (organization_id);

ALTER TABLE ONLY public.intelligence_usage_monthly ADD CONSTRAINT intelligence_usage_monthly_pkey PRIMARY KEY (organization_id, usage_month);

ALTER TABLE ONLY public.iptv_accounts ADD CONSTRAINT iptv_accounts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.leads ADD CONSTRAINT leads_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.message_templates ADD CONSTRAINT message_templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.organization_entitlements ADD CONSTRAINT organization_entitlements_pkey PRIMARY KEY (organization_id);

ALTER TABLE ONLY public.organization_members ADD CONSTRAINT organization_members_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.organizations ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payments ADD CONSTRAINT payments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.phone_change_verifications ADD CONSTRAINT phone_change_verifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pix_charges ADD CONSTRAINT pix_charges_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.promotions ADD CONSTRAINT promotions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reseller_services ADD CONSTRAINT reseller_services_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.resellers ADD CONSTRAINT resellers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.revenda_settings ADD CONSTRAINT revenda_settings_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.saas_plan_catalog ADD CONSTRAINT saas_plan_catalog_pkey PRIMARY KEY (plan);

ALTER TABLE ONLY public.security_settings ADD CONSTRAINT security_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.services ADD CONSTRAINT services_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.system_features ADD CONSTRAINT system_features_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.system_updates ADD CONSTRAINT system_updates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ticket_messages ADD CONSTRAINT ticket_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tickets ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_update_reads ADD CONSTRAINT user_update_reads_pkey PRIMARY KEY (user_id, update_id);

ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.withdrawal_requests ADD CONSTRAINT withdrawal_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.admin_action_idempotency ADD CONSTRAINT admin_action_idempotency_idempotency_key_key UNIQUE (idempotency_key);

ALTER TABLE ONLY public.admin_incidents ADD CONSTRAINT admin_incidents_fingerprint_key UNIQUE (fingerprint);

ALTER TABLE ONLY public.analytics_forecasts ADD CONSTRAINT analytics_forecasts_organization_id_forecast_date_horizon_m_key UNIQUE (organization_id, forecast_date, horizon, model_version);

ALTER TABLE ONLY public.api_keys ADD CONSTRAINT api_keys_key_key UNIQUE (key);

ALTER TABLE ONLY public.billing_cycles ADD CONSTRAINT billing_cycles_client_id_due_date_key UNIQUE (client_id, due_date);

ALTER TABLE ONLY public.client_portal_sessions ADD CONSTRAINT client_portal_sessions_token_hash_key UNIQUE (token_hash);

ALTER TABLE ONLY public.client_portal_settings ADD CONSTRAINT client_portal_settings_slug_key UNIQUE (slug);

ALTER TABLE ONLY public.client_services ADD CONSTRAINT client_services_client_id_service_id_key UNIQUE (client_id, service_id);

ALTER TABLE ONLY public.client_tags ADD CONSTRAINT client_tags_organization_id_code_key UNIQUE (organization_id, code);

ALTER TABLE ONLY public.clients ADD CONSTRAINT clients_external_id_key UNIQUE (external_id);

ALTER TABLE ONLY public.collection_dispatches ADD CONSTRAINT collection_dispatches_cycle_id_step_id_key UNIQUE (cycle_id, step_id);

ALTER TABLE ONLY public.collection_profile_steps ADD CONSTRAINT collection_profile_steps_profile_id_sequence_key UNIQUE (profile_id, sequence);

ALTER TABLE ONLY public.collection_profiles ADD CONSTRAINT collection_profiles_organization_id_code_key UNIQUE (organization_id, code);

ALTER TABLE ONLY public.evolution_instances ADD CONSTRAINT evolution_instances_instance_name_key UNIQUE (instance_name);

ALTER TABLE ONLY public.executive_daily_snapshots ADD CONSTRAINT executive_daily_snapshots_organization_id_snapshot_date_key UNIQUE (organization_id, snapshot_date);

ALTER TABLE ONLY public.integrations ADD CONSTRAINT integrations_organization_id_provider_key UNIQUE (organization_id, provider);

ALTER TABLE ONLY public.organization_members ADD CONSTRAINT organization_members_organization_id_user_id_key UNIQUE (organization_id, user_id);

ALTER TABLE ONLY public.account_deletion_requests ADD CONSTRAINT account_deletion_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.account_deletion_requests ADD CONSTRAINT account_deletion_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.account_deletion_requests ADD CONSTRAINT account_deletion_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.admin_action_idempotency ADD CONSTRAINT admin_action_idempotency_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.admin_incidents ADD CONSTRAINT admin_incidents_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.affiliate_earnings ADD CONSTRAINT affiliate_earnings_referred_user_id_fkey FOREIGN KEY (referred_user_id) REFERENCES auth.users(id);

ALTER TABLE ONLY public.affiliate_earnings ADD CONSTRAINT affiliate_earnings_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES auth.users(id);

ALTER TABLE ONLY public.affiliate_earnings ADD CONSTRAINT fk_affiliate_earnings_referred_user FOREIGN KEY (referred_user_id) REFERENCES users(id);

ALTER TABLE ONLY public.affiliate_earnings ADD CONSTRAINT fk_affiliate_earnings_referrer FOREIGN KEY (referrer_id) REFERENCES users(id);

ALTER TABLE ONLY public.alert_history ADD CONSTRAINT alert_history_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.alert_history ADD CONSTRAINT alert_history_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.alert_history ADD CONSTRAINT alert_history_contact_reservation_id_fkey FOREIGN KEY (contact_reservation_id) REFERENCES contact_reservations(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.alert_history ADD CONSTRAINT alert_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.alert_history ADD CONSTRAINT alert_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.analytics_forecasts ADD CONSTRAINT analytics_forecasts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.analytics_scenarios ADD CONSTRAINT analytics_scenarios_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.analytics_scenarios ADD CONSTRAINT analytics_scenarios_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.api_keys ADD CONSTRAINT api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.audit_logs ADD CONSTRAINT audit_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.audit_logs ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.automations ADD CONSTRAINT automations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.automations ADD CONSTRAINT automations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.billing_cycles ADD CONSTRAINT billing_cycles_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.billing_cycles ADD CONSTRAINT billing_cycles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.billing_cycles ADD CONSTRAINT billing_cycles_pix_charge_id_fkey FOREIGN KEY (pix_charge_id) REFERENCES pix_charges(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.campaigns ADD CONSTRAINT campaigns_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.client_change_requests ADD CONSTRAINT client_change_requests_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.client_change_requests ADD CONSTRAINT client_change_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.client_change_requests ADD CONSTRAINT client_change_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.client_lifecycle_events ADD CONSTRAINT client_lifecycle_events_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.client_lifecycle_events ADD CONSTRAINT client_lifecycle_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.client_portal_auth_challenges ADD CONSTRAINT client_portal_auth_challenges_organization_id_client_id_fkey FOREIGN KEY (organization_id, client_id) REFERENCES clients(organization_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY public.client_portal_auth_challenges ADD CONSTRAINT client_portal_auth_challenges_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.client_portal_sessions ADD CONSTRAINT client_portal_sessions_organization_id_client_id_fkey FOREIGN KEY (organization_id, client_id) REFERENCES clients(organization_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY public.client_portal_sessions ADD CONSTRAINT client_portal_sessions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.client_portal_settings ADD CONSTRAINT client_portal_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.client_portal_settings ADD CONSTRAINT client_portal_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.client_services ADD CONSTRAINT client_services_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.client_services ADD CONSTRAINT client_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.client_tag_assignments ADD CONSTRAINT client_tag_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.client_tag_assignments ADD CONSTRAINT client_tag_assignments_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.client_tag_assignments ADD CONSTRAINT client_tag_assignments_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES client_tags(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.client_tags ADD CONSTRAINT client_tags_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.clients ADD CONSTRAINT clients_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.clients ADD CONSTRAINT clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.collection_dispatches ADD CONSTRAINT collection_dispatches_alert_history_id_fkey FOREIGN KEY (alert_history_id) REFERENCES alert_history(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.collection_dispatches ADD CONSTRAINT collection_dispatches_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.collection_dispatches ADD CONSTRAINT collection_dispatches_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES billing_cycles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.collection_dispatches ADD CONSTRAINT collection_dispatches_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.collection_dispatches ADD CONSTRAINT collection_dispatches_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES collection_profiles(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.collection_dispatches ADD CONSTRAINT collection_dispatches_step_id_fkey FOREIGN KEY (step_id) REFERENCES collection_profile_steps(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.collection_profile_steps ADD CONSTRAINT collection_profile_steps_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES collection_profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.collection_profiles ADD CONSTRAINT collection_profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.collection_scores ADD CONSTRAINT collection_scores_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.collection_scores ADD CONSTRAINT collection_scores_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.collection_settings ADD CONSTRAINT collection_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.contact_reservations ADD CONSTRAINT contact_reservations_alert_history_id_fkey FOREIGN KEY (alert_history_id) REFERENCES alert_history(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.contact_reservations ADD CONSTRAINT contact_reservations_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.contact_reservations ADD CONSTRAINT contact_reservations_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.contact_reservations ADD CONSTRAINT contact_reservations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.contact_reservations ADD CONSTRAINT contact_reservations_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.credit_requests ADD CONSTRAINT credit_requests_reseller_id_fkey FOREIGN KEY (reseller_id) REFERENCES resellers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.credit_transfers ADD CONSTRAINT credit_transfers_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id);

ALTER TABLE ONLY public.credit_transfers ADD CONSTRAINT credit_transfers_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id);

ALTER TABLE ONLY public.evolution_instances ADD CONSTRAINT evolution_instances_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.evolution_instances ADD CONSTRAINT evolution_instances_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.executive_daily_snapshots ADD CONSTRAINT executive_daily_snapshots_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fixed_costs ADD CONSTRAINT fixed_costs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.intelligence_credentials ADD CONSTRAINT intelligence_credentials_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.intelligence_credentials ADD CONSTRAINT intelligence_credentials_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.intelligence_findings ADD CONSTRAINT intelligence_findings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.intelligence_findings ADD CONSTRAINT intelligence_findings_run_id_fkey FOREIGN KEY (run_id) REFERENCES intelligence_runs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.intelligence_operational_heartbeats ADD CONSTRAINT intelligence_operational_heartbeats_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.intelligence_runs ADD CONSTRAINT intelligence_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.intelligence_runs ADD CONSTRAINT intelligence_runs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.intelligence_settings ADD CONSTRAINT intelligence_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.intelligence_usage_monthly ADD CONSTRAINT intelligence_usage_monthly_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.iptv_accounts ADD CONSTRAINT iptv_accounts_linked_service_id_fkey FOREIGN KEY (linked_service_id) REFERENCES services(id);

ALTER TABLE ONLY public.iptv_accounts ADD CONSTRAINT iptv_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE ONLY public.leads ADD CONSTRAINT leads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.message_templates ADD CONSTRAINT message_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.organization_entitlements ADD CONSTRAINT organization_entitlements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.organization_entitlements ADD CONSTRAINT organization_entitlements_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.organization_members ADD CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.organization_members ADD CONSTRAINT organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.payments ADD CONSTRAINT payments_billing_cycle_id_fkey FOREIGN KEY (billing_cycle_id) REFERENCES billing_cycles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.payments ADD CONSTRAINT payments_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.payments ADD CONSTRAINT payments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.payments ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.phone_change_verifications ADD CONSTRAINT phone_change_verifications_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.phone_change_verifications ADD CONSTRAINT phone_change_verifications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.pix_charges ADD CONSTRAINT pix_charges_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.promotions ADD CONSTRAINT promotions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.promotions ADD CONSTRAINT promotions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reseller_services ADD CONSTRAINT reseller_services_reseller_id_fkey FOREIGN KEY (reseller_id) REFERENCES resellers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.resellers ADD CONSTRAINT resellers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.revenda_settings ADD CONSTRAINT revenda_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.services ADD CONSTRAINT services_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.services ADD CONSTRAINT services_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ticket_messages ADD CONSTRAINT ticket_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ticket_messages ADD CONSTRAINT ticket_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tickets ADD CONSTRAINT tickets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tickets ADD CONSTRAINT tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_update_reads ADD CONSTRAINT user_update_reads_update_id_fkey FOREIGN KEY (update_id) REFERENCES system_updates(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_update_reads ADD CONSTRAINT user_update_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.users ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id);

ALTER TABLE ONLY public.users ADD CONSTRAINT users_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES users(id);

ALTER TABLE ONLY public.withdrawal_requests ADD CONSTRAINT withdrawal_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


-- Índices

CREATE UNIQUE INDEX uq_account_deletion_one_pending ON public.account_deletion_requests USING btree (user_id) WHERE (status = 'pending'::text);

CREATE INDEX idx_account_deletion_pending ON public.account_deletion_requests USING btree (status, purge_after) WHERE ((status = 'pending'::text) AND (blocked_reason IS NULL));

CREATE INDEX idx_account_deletion_organization ON public.account_deletion_requests USING btree (organization_id) WHERE (organization_id IS NOT NULL);

CREATE INDEX idx_account_deletion_requested_by ON public.account_deletion_requests USING btree (requested_by, requested_at DESC);

CREATE INDEX idx_admin_action_idempotency_admin_created ON public.admin_action_idempotency USING btree (admin_user_id, created_at DESC);

CREATE INDEX admin_incidents_active_idx ON public.admin_incidents USING btree (severity, last_seen_at DESC) WHERE (status <> 'resolved'::text);

CREATE INDEX admin_incidents_history_idx ON public.admin_incidents USING btree (last_seen_at DESC, id);

CREATE INDEX admin_incidents_acknowledged_by_idx ON public.admin_incidents USING btree (acknowledged_by) WHERE (acknowledged_by IS NOT NULL);

CREATE INDEX admin_operational_heartbeats_seen_idx ON public.admin_operational_heartbeats USING btree (last_seen_at DESC);

CREATE INDEX idx_alert_history_user_id ON public.alert_history USING btree (user_id);

CREATE INDEX idx_alert_history_client_id ON public.alert_history USING btree (client_id);

CREATE INDEX idx_alert_history_automation_id ON public.alert_history USING btree (automation_id);

CREATE INDEX idx_alert_history_status ON public.alert_history USING btree (status);

CREATE INDEX idx_alert_history_sent_at ON public.alert_history USING btree (sent_at);

CREATE UNIQUE INDEX alert_history_collection_dispatch_uidx ON public.alert_history USING btree (collection_dispatch_id) WHERE (collection_dispatch_id IS NOT NULL);

CREATE UNIQUE INDEX alert_history_contact_reservation_uidx ON public.alert_history USING btree (contact_reservation_id) WHERE (contact_reservation_id IS NOT NULL);

CREATE INDEX analytics_forecasts_org_date_idx ON public.analytics_forecasts USING btree (organization_id, forecast_date DESC, horizon);

CREATE INDEX analytics_scenarios_org_created_idx ON public.analytics_scenarios USING btree (organization_id, created_at DESC, id DESC);

CREATE INDEX analytics_scenarios_created_by_idx ON public.analytics_scenarios USING btree (created_by) WHERE (created_by IS NOT NULL);

CREATE INDEX idx_audit_logs_organization_id ON public.audit_logs USING btree (organization_id);

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);

CREATE INDEX idx_audit_logs_resource ON public.audit_logs USING btree (resource);

CREATE INDEX idx_audit_logs_correlation_id ON public.audit_logs USING btree (correlation_id) WHERE (correlation_id IS NOT NULL);

CREATE INDEX idx_automations_user_id ON public.automations USING btree (user_id);

CREATE INDEX idx_automations_alert_type ON public.automations USING btree (alert_type);

CREATE INDEX idx_automations_is_active ON public.automations USING btree (is_active);

CREATE INDEX billing_cycles_org_status_due_idx ON public.billing_cycles USING btree (organization_id, status, due_date);

CREATE INDEX client_change_requests_org_status_idx ON public.client_change_requests USING btree (organization_id, status, created_at DESC);

CREATE INDEX client_change_requests_client_idx ON public.client_change_requests USING btree (client_id, created_at DESC);

CREATE INDEX client_change_requests_reviewed_by_idx ON public.client_change_requests USING btree (reviewed_by) WHERE (reviewed_by IS NOT NULL);

CREATE INDEX portal_challenges_org_phone_idx ON public.client_portal_auth_challenges USING btree (organization_id, phone_e164, created_at DESC);

CREATE INDEX portal_challenges_client_idx ON public.client_portal_auth_challenges USING btree (client_id, created_at DESC);

CREATE INDEX portal_challenges_pending_idx ON public.client_portal_auth_challenges USING btree (send_status, created_at) WHERE (send_status = 'pending'::text);

CREATE INDEX portal_challenges_org_client_idx ON public.client_portal_auth_challenges USING btree (organization_id, client_id);

CREATE INDEX portal_sessions_client_idx ON public.client_portal_sessions USING btree (client_id, created_at DESC);

CREATE INDEX portal_sessions_org_expiry_idx ON public.client_portal_sessions USING btree (organization_id, expires_at DESC);

CREATE INDEX portal_sessions_active_idx ON public.client_portal_sessions USING btree (expires_at) WHERE (revoked_at IS NULL);

CREATE INDEX portal_sessions_org_client_idx ON public.client_portal_sessions USING btree (organization_id, client_id);

CREATE INDEX client_portal_settings_updated_by_idx ON public.client_portal_settings USING btree (updated_by) WHERE (updated_by IS NOT NULL);

CREATE INDEX idx_client_services_client_id ON public.client_services USING btree (client_id);

CREATE INDEX idx_client_services_service_id ON public.client_services USING btree (service_id);

CREATE INDEX idx_clients_user_id ON public.clients USING btree (user_id);

CREATE INDEX idx_clients_status ON public.clients USING btree (status);

CREATE INDEX idx_clients_org_id ON public.clients USING btree (organization_id);

CREATE UNIQUE INDEX clients_org_phone_e164_uidx ON public.clients USING btree (organization_id, phone_e164) WHERE ((organization_id IS NOT NULL) AND (phone_e164 IS NOT NULL));

CREATE INDEX collection_dispatches_org_client_created_idx ON public.collection_dispatches USING btree (organization_id, client_id, created_at DESC);

CREATE INDEX contact_reservations_org_client_date_idx ON public.contact_reservations USING btree (organization_id, client_id, contact_date DESC);

CREATE INDEX contact_reservations_deferred_idx ON public.contact_reservations USING btree (deferred_until, status) WHERE (status = 'deferred'::text);

CREATE UNIQUE INDEX contact_reservations_active_automatic_uidx ON public.contact_reservations USING btree (organization_id, client_id, contact_date) WHERE ((status = ANY (ARRAY['reserved'::text, 'processing'::text, 'sent'::text])) AND (category <> 'manual'::text));

CREATE UNIQUE INDEX contact_reservations_source_uidx ON public.contact_reservations USING btree (source, source_id, client_id, contact_date) WHERE ((source_id IS NOT NULL) AND (status <> 'cancelled'::text));

CREATE INDEX idx_evolution_instances_user_id ON public.evolution_instances USING btree (user_id);

CREATE INDEX idx_evolution_instances_org_id ON public.evolution_instances USING btree (organization_id);

CREATE INDEX executive_snapshots_org_date_idx ON public.executive_daily_snapshots USING btree (organization_id, snapshot_date DESC);

CREATE INDEX intelligence_findings_org_state_idx ON public.intelligence_findings USING btree (organization_id, state, created_at DESC);

CREATE INDEX intelligence_findings_run_idx ON public.intelligence_findings USING btree (run_id, priority DESC);

CREATE UNIQUE INDEX intelligence_runs_scheduled_uidx ON public.intelligence_runs USING btree (organization_id, report_date, engine_version) WHERE (trigger_type = 'scheduled'::text);

CREATE INDEX intelligence_runs_org_created_idx ON public.intelligence_runs USING btree (organization_id, created_at DESC);

CREATE INDEX intelligence_runs_pending_idx ON public.intelligence_runs USING btree (status, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));

CREATE INDEX idx_message_templates_user ON public.message_templates USING btree (user_id);

CREATE INDEX idx_organization_members_user_id ON public.organization_members USING btree (user_id);

CREATE INDEX idx_payments_user_id ON public.payments USING btree (user_id);

CREATE INDEX idx_payments_client_id ON public.payments USING btree (client_id);

CREATE INDEX idx_payments_date ON public.payments USING btree (payment_date);

CREATE INDEX payments_org_paid_at_idx ON public.payments USING btree (organization_id, paid_at DESC);

CREATE INDEX payments_org_method_idx ON public.payments USING btree (organization_id, payment_method, paid_at DESC);

CREATE INDEX phone_change_verifications_client_idx ON public.phone_change_verifications USING btree (client_id, expires_at DESC);

CREATE INDEX phone_change_verifications_org_idx ON public.phone_change_verifications USING btree (organization_id, created_at DESC);

CREATE UNIQUE INDEX pix_charges_provider_payment_uidx ON public.pix_charges USING btree (provider, provider_payment_id) WHERE (provider_payment_id IS NOT NULL);

CREATE INDEX pix_charges_org_status_idx ON public.pix_charges USING btree (organization_id, status, created_at DESC);

CREATE INDEX pix_charges_user_status_idx ON public.pix_charges USING btree (user_id, status, created_at DESC);

CREATE INDEX pix_charges_client_idx ON public.pix_charges USING btree (client_id, created_at DESC) WHERE (client_id IS NOT NULL);

CREATE UNIQUE INDEX pix_charges_one_pending_renewal_per_client_uidx ON public.pix_charges USING btree (organization_id, client_id) WHERE ((status = 'pending'::text) AND (purpose = 'renewal'::text) AND (client_id IS NOT NULL));

CREATE INDEX idx_promotions_user_id ON public.promotions USING btree (user_id);

CREATE INDEX idx_promotions_is_active ON public.promotions USING btree (is_active);

CREATE INDEX idx_services_user_id ON public.services USING btree (user_id);

CREATE INDEX idx_ticket_messages_ticket_created ON public.ticket_messages USING btree (ticket_id, created_at);

CREATE INDEX idx_tickets_organization_updated ON public.tickets USING btree (organization_id, updated_at DESC);

CREATE INDEX idx_tickets_status_updated ON public.tickets USING btree (status, updated_at DESC);


-- Funções

CREATE OR REPLACE FUNCTION public.activate_deferred_contact(p_reservation_id uuid)
 RETURNS TABLE(reservation_id uuid, decision text, reason text, next_attempt_date date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_row public.contact_reservations%ROWTYPE;
  v_conflict boolean;
BEGIN
  SELECT * INTO v_row FROM public.contact_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONTACT_RESERVATION_NOT_FOUND'; END IF;
  IF v_row.status <> 'deferred' THEN
    RETURN QUERY SELECT v_row.id, v_row.status, COALESCE(v_row.decision_reason, 'UNCHANGED'), v_row.deferred_until;
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_row.organization_id::text || ':' || v_row.client_id::text || ':' || v_row.deferred_until::text, 0
  ));
  SELECT EXISTS (
    SELECT 1 FROM public.contact_reservations cr
    WHERE cr.organization_id = v_row.organization_id AND cr.client_id = v_row.client_id
      AND cr.contact_date = v_row.deferred_until
      AND cr.status IN ('reserved', 'processing', 'sent') AND cr.category <> 'manual'
  ) INTO v_conflict;
  IF v_conflict THEN
    IF v_row.defer_count >= 3 THEN
      UPDATE public.contact_reservations SET status = 'cancelled', decision_reason = 'MAX_DEFER_ATTEMPTS', updated_at = now()
      WHERE id = v_row.id;
      RETURN QUERY SELECT v_row.id, 'cancelled'::text, 'MAX_DEFER_ATTEMPTS'::text, NULL::date;
    ELSE
      UPDATE public.contact_reservations
      SET defer_count = defer_count + 1, deferred_until = deferred_until + 1,
          decision_reason = 'DEFERRED_BY_HIGHER_PRIORITY', updated_at = now()
      WHERE id = v_row.id RETURNING deferred_until INTO v_row.deferred_until;
      RETURN QUERY SELECT v_row.id, 'deferred'::text, 'DEFERRED_BY_HIGHER_PRIORITY'::text, v_row.deferred_until;
    END IF;
    RETURN;
  END IF;
  UPDATE public.contact_reservations
  SET contact_date = deferred_until, status = 'reserved', decision_reason = 'DEFERRED_CONTACT_RELEASED', updated_at = now()
  WHERE id = v_row.id;
  RETURN QUERY SELECT v_row.id, 'reserved'::text, 'DEFERRED_CONTACT_RELEASED'::text, NULL::date;
END;
$function$

CREATE OR REPLACE FUNCTION public.admin_revoke_user_sessions(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'auth', 'public', 'pg_temp'
AS $function$ BEGIN DELETE FROM auth.sessions WHERE user_id = p_user_id; END $function$

CREATE OR REPLACE FUNCTION public.claim_collection_dispatch(p_dispatch_id uuid, p_is_retry boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_claimed uuid;
BEGIN
  UPDATE public.collection_dispatches
  SET status = 'processing',
      attempt_count = attempt_count + 1,
      last_attempt_at = now(),
      error_message = NULL,
      updated_at = now()
  WHERE id = p_dispatch_id
    AND (
      status IN ('pending', 'retryable')
      OR (status = 'processing' AND p_is_retry)
    )
  RETURNING id INTO v_claimed;

  RETURN v_claimed IS NOT NULL;
END;
$function$

CREATE OR REPLACE FUNCTION public.claim_contact_reservation(p_reservation_id uuid, p_is_retry boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_claimed uuid;
BEGIN
  UPDATE public.contact_reservations
  SET status = 'processing', updated_at = now()
  WHERE id = p_reservation_id
    AND (status = 'reserved' OR (p_is_retry AND status IN ('processing', 'failed')))
  RETURNING id INTO v_claimed;
  RETURN v_claimed IS NOT NULL;
END;
$function$

CREATE OR REPLACE FUNCTION public.complete_phone_change(p_verification_id uuid, p_code_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_verification public.phone_change_verifications%ROWTYPE;
BEGIN
  SELECT * INTO v_verification FROM public.phone_change_verifications
  WHERE id = p_verification_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_verification.used_at IS NOT NULL THEN RETURN jsonb_build_object('status', 'used'); END IF;
  IF v_verification.expires_at <= now() THEN RETURN jsonb_build_object('status', 'expired'); END IF;
  IF v_verification.attempts >= 5 THEN RETURN jsonb_build_object('status', 'locked'); END IF;
  IF v_verification.send_status <> 'sent' THEN RETURN jsonb_build_object('status', 'not_delivered'); END IF;

  IF v_verification.code_hash <> p_code_hash THEN
    UPDATE public.phone_change_verifications SET attempts = attempts + 1 WHERE id = v_verification.id;
    RETURN jsonb_build_object('status', 'invalid', 'remaining_attempts', 4 - v_verification.attempts);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.clients
    WHERE organization_id = v_verification.organization_id
      AND phone_e164 = v_verification.new_phone_e164
      AND id <> v_verification.client_id
  ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;

  UPDATE public.clients SET phone = v_verification.new_phone_e164, phone_e164 = v_verification.new_phone_e164, updated_at = now()
  WHERE id = v_verification.client_id AND organization_id = v_verification.organization_id;
  UPDATE public.phone_change_verifications SET used_at = now(), code_ciphertext = NULL WHERE id = v_verification.id;
  INSERT INTO public.audit_logs (organization_id, action, resource, resource_id, details)
  VALUES (v_verification.organization_id, 'client.phone_changed', 'clients', v_verification.client_id::text,
    jsonb_build_object('verification_id', v_verification.id));
  RETURN jsonb_build_object('status', 'confirmed', 'new_phone_e164', v_verification.new_phone_e164);
END;
$function$

CREATE OR REPLACE FUNCTION public.consume_client_portal_challenge(p_challenge_id uuid, p_code_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_challenge public.client_portal_auth_challenges%ROWTYPE;
BEGIN
  SELECT * INTO v_challenge
  FROM public.client_portal_auth_challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_challenge.consumed_at IS NOT NULL THEN RETURN jsonb_build_object('status', 'used'); END IF;
  IF v_challenge.expires_at <= now() THEN RETURN jsonb_build_object('status', 'expired'); END IF;
  IF v_challenge.attempts >= 5 THEN RETURN jsonb_build_object('status', 'locked'); END IF;
  IF v_challenge.send_status <> 'sent' THEN RETURN jsonb_build_object('status', 'not_delivered'); END IF;

  IF v_challenge.code_hash <> p_code_hash THEN
    UPDATE public.client_portal_auth_challenges
    SET attempts = least(attempts + 1, 5)
    WHERE id = v_challenge.id;
    RETURN jsonb_build_object(
      'status', 'invalid',
      'remaining_attempts', greatest(4 - v_challenge.attempts, 0)
    );
  END IF;

  UPDATE public.client_portal_auth_challenges
  SET consumed_at = now(), code_ciphertext = NULL
  WHERE id = v_challenge.id;

  RETURN jsonb_build_object(
    'status', 'confirmed',
    'organization_id', v_challenge.organization_id,
    'client_id', v_challenge.client_id
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.enforce_client_plan_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_plan text;
  v_limit integer;
  v_count bigint;
BEGIN
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;

  SELECT entitlement.plan INTO v_plan
  FROM public.organization_entitlements entitlement
  WHERE entitlement.organization_id = NEW.organization_id
    AND entitlement.is_active
    AND (entitlement.expires_at IS NULL OR entitlement.expires_at > now());
  v_plan := coalesce(v_plan, 'starter');

  SELECT catalog.client_limit INTO v_limit
  FROM public.saas_plan_catalog catalog WHERE catalog.plan = v_plan;
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_count FROM public.clients client
  WHERE client.organization_id = NEW.organization_id;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Limite de clientes do plano % atingido (%).', v_plan, v_limit
      USING ERRCODE = 'P0001', DETAIL = 'PLAN_LIMIT:clients:' || v_limit;
  END IF;
  RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.enforce_starter_automation_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_plan text;
  v_is_active boolean;
  v_caller_role text := COALESCE(auth.jwt() ->> 'role', '');
BEGIN
  IF v_caller_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT entitlement.plan, entitlement.is_active
    INTO v_plan, v_is_active
  FROM public.organization_entitlements AS entitlement
  WHERE entitlement.organization_id = NEW.organization_id;

  IF COALESCE(v_is_active, false) AND lower(COALESCE(v_plan, '')) = 'starter' THEN
    IF NEW.alert_type::text NOT IN ('activation', 'renewal', 'quick_message') THEN
      RAISE EXCEPTION 'STARTER_AUTOMATION_TYPE_NOT_ALLOWED'
        USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.automations AS existing
      WHERE existing.organization_id = NEW.organization_id
        AND existing.alert_type = NEW.alert_type
        AND existing.id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'STARTER_AUTOMATION_TYPE_ALREADY_EXISTS'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.enforce_whatsapp_instance_plan_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_plan text;
  v_limit integer;
  v_count bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM public.evolution_instances instance WHERE instance.instance_name = NEW.instance_name) THEN
    RETURN NEW;
  END IF;
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;

  SELECT entitlement.plan INTO v_plan
  FROM public.organization_entitlements entitlement
  WHERE entitlement.organization_id = NEW.organization_id
    AND entitlement.is_active
    AND (entitlement.expires_at IS NULL OR entitlement.expires_at > now());
  v_plan := coalesce(v_plan, 'starter');

  SELECT catalog.whatsapp_instance_limit INTO v_limit
  FROM public.saas_plan_catalog catalog WHERE catalog.plan = v_plan;
  SELECT count(*) INTO v_count FROM public.evolution_instances instance
  WHERE instance.organization_id = NEW.organization_id;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Limite de conexÃµes WhatsApp do plano % atingido (%).', v_plan, v_limit
      USING ERRCODE = 'P0001', DETAIL = 'PLAN_LIMIT:whatsapp_instances:' || v_limit;
  END IF;
  RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.finalize_pix_charge(p_charge_id uuid, p_provider_payment_id text, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_charge public.pix_charges%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_new_due_date date;
  v_payment_id uuid;
BEGIN
  SELECT * INTO v_charge FROM public.pix_charges WHERE id = p_charge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CobranÃ§a PIX nÃ£o encontrada'; END IF;
  IF v_charge.processed_at IS NOT NULL THEN
    RETURN jsonb_build_object('already_processed', true, 'charge_id', v_charge.id, 'payment_id', v_charge.payment_id);
  END IF;
  IF v_charge.provider_payment_id IS NOT NULL AND v_charge.provider_payment_id <> p_provider_payment_id THEN
    RAISE EXCEPTION 'Pagamento nÃ£o pertence Ã  cobranÃ§a';
  END IF;
  IF round(v_charge.amount, 2) <> round(p_amount, 2) THEN RAISE EXCEPTION 'Valor pago diverge da cobranÃ§a'; END IF;

  UPDATE public.pix_charges
  SET provider_payment_id = p_provider_payment_id, status = 'paid', paid_at = now(), processed_at = now()
  WHERE id = v_charge.id;

  IF v_charge.client_id IS NOT NULL AND v_charge.purpose IN ('renewal', 'charge') THEN
    SELECT * INTO v_client FROM public.clients
    WHERE id = v_charge.client_id AND organization_id = v_charge.organization_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cliente da cobranÃ§a nÃ£o encontrado'; END IF;

    v_new_due_date := (greatest(v_client.due_date, current_date) + make_interval(months => greatest(v_charge.months_to_renew, 1)))::date;
    UPDATE public.clients SET due_date = v_new_due_date, status = 'active', updated_at = now() WHERE id = v_client.id;

    INSERT INTO public.payments (
      organization_id, user_id, client_id, amount_paid, net_profit, months_renewed,
      payment_method, provider, paid_at
    ) VALUES (
      v_charge.organization_id, coalesce(v_client.user_id, v_charge.user_id), v_client.id,
      v_charge.amount, v_charge.amount, greatest(v_charge.months_to_renew, 1),
      'pix', v_charge.provider, now()
    ) RETURNING id INTO v_payment_id;

    UPDATE public.pix_charges SET payment_id = v_payment_id WHERE id = v_charge.id;
  END IF;

  INSERT INTO public.audit_logs (organization_id, user_id, action, resource, resource_id, details)
  VALUES (v_charge.organization_id, v_charge.user_id, 'pix.payment.finalized', 'pix_charges', v_charge.id::text,
    jsonb_build_object('provider_payment_id', p_provider_payment_id, 'amount', p_amount, 'payment_id', v_payment_id));

  RETURN jsonb_build_object('already_processed', false, 'charge_id', v_charge.id, 'payment_id', v_payment_id, 'new_due_date', v_new_due_date);
END;
$function$

CREATE OR REPLACE FUNCTION public.get_advanced_dashboard_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_org_id UUID;
  v_monthly_goal NUMERIC;
  result JSONB;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.organization_members WHERE user_id = auth.uid() LIMIT 1;
  SELECT monthly_goal INTO v_monthly_goal FROM public.organizations WHERE id = v_org_id LIMIT 1;

  WITH
  client_stats AS (
      SELECT
        COUNT(*) as total_clients,
        COUNT(*) FILTER (WHERE status = 'active') as active_clients,
        COUNT(*) FILTER (WHERE status = 'inactive') as inactive_clients,
        COUNT(*) FILTER (WHERE status = 'vencido') as default_clients,
        COALESCE(SUM(plan_value) FILTER (WHERE status = 'active'), 0) as mrr,
        COALESCE(SUM(plan_value) FILTER (WHERE status = 'vencido'), 0) as default_amount,
        COALESCE(SUM(plan_value) FILTER (WHERE status IN ('active', 'vencido', 'pending')), 0) as expected_revenue,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) as new_clients_this_month,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND created_at < date_trunc('month', CURRENT_DATE)) as new_clients_last_month
      FROM public.clients
      WHERE organization_id = v_org_id
  ),
  payment_stats AS (
      SELECT
        COALESCE(SUM(amount_paid) FILTER (WHERE created_at >= current_date), 0) as received_today,
        COALESCE(SUM(amount_paid) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)), 0) as received_month,
        COALESCE(SUM(amount_paid) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND created_at < date_trunc('month', CURRENT_DATE)), 0) as received_last_month,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) as renewals_this_month,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND created_at < date_trunc('month', CURRENT_DATE)) as renewals_last_month
      FROM public.payments
      WHERE organization_id = v_org_id
  ),
  top_clients AS (
      SELECT COALESCE(jsonb_agg(tc), '[]'::jsonb) as top_5
      FROM (
          SELECT c.name, SUM(p.amount_paid) as total_paid
          FROM public.payments p
          JOIN public.clients c ON c.id = p.client_id
          WHERE p.organization_id = v_org_id
          GROUP BY c.id, c.name
          ORDER BY total_paid DESC
          LIMIT 5
      ) tc
  ),
  service_revenue AS (
      SELECT COALESCE(jsonb_agg(sr), '[]'::jsonb) as revenue_by_service
      FROM (
          SELECT s.name as service_name, SUM(c.plan_value) as total_value
          FROM public.client_services cs
          JOIN public.services s ON s.id = cs.service_id
          JOIN public.clients c ON c.id = cs.client_id
          WHERE c.organization_id = v_org_id AND c.status = 'active'
          GROUP BY s.id, s.name
          ORDER BY total_value DESC
      ) sr
  ),
  revenue_evolution AS (
      SELECT COALESCE(jsonb_agg(re), '[]'::jsonb) as evolution_30d
      FROM (
          SELECT to_char(created_at, 'DD/MM') as date, SUM(amount_paid) as amount
          FROM public.payments
          WHERE organization_id = v_org_id AND created_at >= current_date - INTERVAL '30 days'
          GROUP BY to_char(created_at, 'DD/MM'), date_trunc('day', created_at)
          ORDER BY date_trunc('day', created_at)
      ) re
  ),
  receipt_distribution AS (
      SELECT jsonb_build_array(
          jsonb_build_object('method', 'PIX', 'value', COALESCE((SELECT SUM(amount_paid) FROM public.payments WHERE organization_id = v_org_id AND created_at >= date_trunc('month', CURRENT_DATE)), 0) * 0.8),
          jsonb_build_object('method', 'Cartão', 'value', COALESCE((SELECT SUM(amount_paid) FROM public.payments WHERE organization_id = v_org_id AND created_at >= date_trunc('month', CURRENT_DATE)), 0) * 0.15),
          jsonb_build_object('method', 'Outros', 'value', COALESCE((SELECT SUM(amount_paid) FROM public.payments WHERE organization_id = v_org_id AND created_at >= date_trunc('month', CURRENT_DATE)), 0) * 0.05)
      ) as receipt_methods
  ),
  automation_stats AS (
      SELECT
        COUNT(*) FILTER (WHERE sent_at >= current_date AND status = 'sent') as alerts_sent_today
      FROM public.alert_history
      WHERE organization_id = v_org_id
  )
  SELECT
    jsonb_build_object(
      'monthly_goal', COALESCE(v_monthly_goal, 10000),
      'mrr', cs.mrr,
      'active_clients', cs.active_clients,
      'total_clients', cs.total_clients,
      'default_clients', cs.default_clients,
      'default_amount', cs.default_amount,
      'expected_revenue', cs.expected_revenue,
      'received_today', ps.received_today,
      'received_month', ps.received_month,
      'received_last_month', ps.received_last_month,
      'renewals_this_month', ps.renewals_this_month,
      'renewals_last_month', ps.renewals_last_month,
      'new_clients_this_month', cs.new_clients_this_month,
      'new_clients_last_month', cs.new_clients_last_month,
      'alerts_sent_today', as_st.alerts_sent_today,
      'top_clients', tc.top_5,
      'revenue_by_service', sr.revenue_by_service,
      'revenue_evolution', re.evolution_30d,
      'receipt_methods', rd.receipt_methods
    ) INTO result
  FROM client_stats cs
  CROSS JOIN payment_stats ps
  CROSS JOIN top_clients tc
  CROSS JOIN service_revenue sr
  CROSS JOIN revenue_evolution re
  CROSS JOIN receipt_distribution rd
  CROSS JOIN automation_stats as_st;

  RETURN result;
END;
$function$

CREATE OR REPLACE FUNCTION public.get_clients_by_service()
 RETURNS TABLE(service_name text, client_count bigint)
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select
    service.name as service_name,
    count(distinct relation.client_id) as client_count
  from public.services as service
  left join public.client_services as relation
    on relation.service_id = service.id
  left join public.clients as client
    on client.id = relation.client_id
   and client.status = 'active'
  where service.organization_id in (select public.user_orgs())
  group by service.id, service.name
  order by client_count desc;
$function$

CREATE OR REPLACE FUNCTION public.get_clients_management_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_org_id UUID;
  result JSONB;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.organization_members WHERE user_id = auth.uid() LIMIT 1;

  WITH
  c_stats AS (
      SELECT
        COUNT(*) as total_clients,
        COUNT(*) FILTER (WHERE status = 'active') as active_clients,
        COUNT(*) FILTER (WHERE status = 'vencido') as overdue_clients,
        COUNT(*) FILTER (WHERE status = 'suspended') as suspended_clients,
        COUNT(*) FILTER (WHERE status = 'canceled' OR status = 'inactive') as canceled_clients,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) as new_clients_this_month,
        COUNT(*) FILTER (WHERE phone IS NULL OR TRIM(phone) = '') as no_whatsapp_clients,
        COUNT(*) FILTER (WHERE due_date = CURRENT_DATE) as due_today_clients,
        COUNT(*) FILTER (WHERE due_date = CURRENT_DATE + INTERVAL '1 day') as due_tomorrow_clients,
        COUNT(*) FILTER (WHERE due_date > CURRENT_DATE AND due_date <= CURRENT_DATE + INTERVAL '7 days') as due_in_7_days_clients
      FROM public.clients
      WHERE organization_id = v_org_id
  ),
  ns_stats AS (
      SELECT COUNT(c.id) as no_service_clients
      FROM public.clients c
      LEFT JOIN public.client_services cs ON c.id = cs.client_id
      WHERE c.organization_id = v_org_id AND cs.id IS NULL
  ),
  status_dist AS (
      SELECT COALESCE(jsonb_agg(s), '[]'::jsonb) as chart_clients_by_status
      FROM (
          SELECT COALESCE(status::TEXT, 'unknown') as name, COUNT(*) as value
          FROM public.clients
          WHERE organization_id = v_org_id
          GROUP BY status
      ) s
  ),
  plan_dist AS (
      SELECT COALESCE(jsonb_agg(p), '[]'::jsonb) as chart_clients_by_plan
      FROM (
          SELECT s.name as name, COUNT(cs.client_id) as value
          FROM public.client_services cs
          JOIN public.services s ON s.id = cs.service_id
          JOIN public.clients c ON c.id = cs.client_id
          WHERE c.organization_id = v_org_id AND c.status = 'active'
          GROUP BY s.id, s.name
          ORDER BY value DESC
      ) p
  ),
  base_growth AS (
      SELECT COALESCE(jsonb_agg(bg), '[]'::jsonb) as chart_base_growth
      FROM (
          SELECT to_char(date_trunc('month', created_at), 'Mon') as month, COUNT(*) as new_clients
          FROM public.clients
          WHERE organization_id = v_org_id AND created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '5 months')
          GROUP BY date_trunc('month', created_at)
          ORDER BY date_trunc('month', created_at)
      ) bg
  )
  SELECT
    jsonb_build_object(
      'total_clients', c.total_clients,
      'active_clients', c.active_clients,
      'overdue_clients', c.overdue_clients,
      'suspended_clients', c.suspended_clients,
      'canceled_clients', c.canceled_clients,
      'new_clients_this_month', c.new_clients_this_month,
      'no_whatsapp_clients', c.no_whatsapp_clients,
      'no_service_clients', ns.no_service_clients,
      'pending_pix_clients', 0,
      'due_today_clients', c.due_today_clients,
      'due_tomorrow_clients', c.due_tomorrow_clients,
      'due_in_7_days_clients', c.due_in_7_days_clients,
      'chart_clients_by_status', sd.chart_clients_by_status,
      'chart_clients_by_plan', pd.chart_clients_by_plan,
      'chart_base_growth', bg.chart_base_growth
    ) INTO result
  FROM c_stats c
  CROSS JOIN ns_stats ns
  CROSS JOIN status_dist sd
  CROSS JOIN plan_dist pd
  CROSS JOIN base_growth bg;

  RETURN result;
END;
$function$

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics()
 RETURNS TABLE(total_active_clients bigint, total_inactive_clients bigint, total_pending_clients bigint, total_vencido_clients bigint, total_clients bigint, monthly_revenue numeric, monthly_costs numeric, monthly_net_revenue numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
BEGIN
  -- Obtém a organização principal do usuário atual
  SELECT organization_id INTO v_org_id FROM public.organization_members WHERE user_id = auth.uid() LIMIT 1;

  RETURN QUERY
  WITH client_stats AS (
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'active') as active,
      COUNT(*) FILTER (WHERE status = 'inactive') as inactive,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'vencido') as vencido,
      COALESCE(SUM(plan_value) FILTER (WHERE status = 'active'), 0) as revenue
    FROM public.clients
    WHERE organization_id = v_org_id
  ),
  service_stats AS (
    SELECT COALESCE(SUM(cost), 0) as costs
    FROM public.services
    WHERE organization_id = v_org_id
  )
  SELECT
    client_stats.active::BIGINT,
    client_stats.inactive::BIGINT,
    client_stats.pending::BIGINT,
    client_stats.vencido::BIGINT,
    client_stats.total::BIGINT,
    client_stats.revenue::NUMERIC,
    service_stats.costs::NUMERIC,
    (client_stats.revenue - service_stats.costs)::NUMERIC
  FROM client_stats, service_stats;
END;
$function$

CREATE OR REPLACE FUNCTION public.get_monthly_growth()
 RETURNS TABLE(month text, total_clients bigint, new_clients bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
BEGIN
  -- Obtém a organização principal do usuário atual
  SELECT organization_id INTO v_org_id FROM public.organization_members WHERE user_id = auth.uid() LIMIT 1;

  RETURN QUERY
  WITH months AS (
    SELECT to_char(date_trunc('month', d), 'Mon') AS month_name, date_trunc('month', d) AS month_date
    FROM generate_series(
      date_trunc('month', CURRENT_DATE - INTERVAL '5 months'),
      date_trunc('month', CURRENT_DATE),
      '1 month'
    ) d
  ),
  monthly_data AS (
    SELECT
      date_trunc('month', created_at) AS month_date,
      COUNT(*) AS new_clients_count
    FROM public.clients
    WHERE organization_id = v_org_id AND created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '5 months')
    GROUP BY 1
  ),
  running_total AS (
    SELECT
      m.month_date,
      m.month_name,
      COALESCE(md.new_clients_count, 0) AS new_clients_count_col,
      (
        SELECT COUNT(*)
        FROM public.clients c
        WHERE c.organization_id = v_org_id AND c.created_at < m.month_date + INTERVAL '1 month'
      ) AS total_clients_cumulative
    FROM months m
    LEFT JOIN monthly_data md ON m.month_date = md.month_date
    ORDER BY m.month_date
  )
  SELECT
    running_total.month_name,
    running_total.total_clients_cumulative::BIGINT,
    running_total.new_clients_count_col::BIGINT
  FROM running_total;
END;
$function$

CREATE OR REPLACE FUNCTION public.get_pix_charge_metrics()
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$

CREATE OR REPLACE FUNCTION public.get_pix_charge_metrics(p_organization_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  result json;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_organization_id AND user_id = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'OrganizaÃ§Ã£o nÃ£o autorizada';
  END IF;

  SELECT json_build_object(
    'pending_count', count(*) FILTER (WHERE status = 'pending' AND (expires_at IS NULL OR expires_at > now())),
    'pending_amount', coalesce(sum(amount) FILTER (WHERE status = 'pending' AND (expires_at IS NULL OR expires_at > now())), 0),
    'overdue_count', count(*) FILTER (WHERE status = 'pending' AND expires_at <= now()),
    'overdue_amount', coalesce(sum(amount) FILTER (WHERE status = 'pending' AND expires_at <= now()), 0),
    'paid_total_count', count(*) FILTER (WHERE status = 'paid'),
    'paid_total_amount', coalesce(sum(amount) FILTER (WHERE status = 'paid'), 0)
  ) INTO result
  FROM public.pix_charges
  WHERE organization_id = p_organization_id;
  RETURN result;
END;
$function$

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.users (id, email, full_name, plan_name)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    COALESCE(new.raw_user_meta_data->>'plan_name', 'Free')
  );
  RETURN new;
END;
$function$

CREATE OR REPLACE FUNCTION public.handle_new_user_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    new_org_id UUID;
BEGIN
    -- 1. Cria a organização
    INSERT INTO public.organizations (name)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name', 'Minha Organização') || ' (Org)')
    RETURNING id INTO new_org_id;

    -- 2. Adiciona o usuário como owner
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (new_org_id, NEW.id, 'owner');

    RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.increment_intelligence_usage(p_organization_id uuid, p_credential_source text, p_input_tokens integer, p_output_tokens integer, p_failed boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_month date := date_trunc('month', current_date)::date;
BEGIN
  IF p_credential_source NOT IN ('platform','byok','deterministic') THEN
    RAISE EXCEPTION 'Fonte de credencial inválida';
  END IF;

  INSERT INTO public.intelligence_usage_monthly (
    organization_id, usage_month, platform_reports, byok_reports,
    input_tokens, output_tokens, failed_reports, updated_at
  ) VALUES (
    p_organization_id,
    v_month,
    CASE WHEN p_credential_source = 'platform' AND NOT p_failed THEN 1 ELSE 0 END,
    CASE WHEN p_credential_source = 'byok' AND NOT p_failed THEN 1 ELSE 0 END,
    greatest(p_input_tokens, 0),
    greatest(p_output_tokens, 0),
    CASE WHEN p_failed THEN 1 ELSE 0 END,
    now()
  )
  ON CONFLICT (organization_id, usage_month) DO UPDATE SET
    platform_reports = intelligence_usage_monthly.platform_reports + excluded.platform_reports,
    byok_reports = intelligence_usage_monthly.byok_reports + excluded.byok_reports,
    input_tokens = intelligence_usage_monthly.input_tokens + excluded.input_tokens,
    output_tokens = intelligence_usage_monthly.output_tokens + excluded.output_tokens,
    failed_reports = intelligence_usage_monthly.failed_reports + excluded.failed_reports,
    updated_at = now();
END;
$function$

CREATE OR REPLACE FUNCTION public.initialize_intelligent_collections(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'Organização não encontrada';
  END IF;

  INSERT INTO public.collection_settings (organization_id)
  VALUES (p_organization_id)
  ON CONFLICT (organization_id) DO NOTHING;

  INSERT INTO public.client_tags (organization_id, code, name)
  VALUES
    (p_organization_id, 'vip', 'VIP'),
    (p_organization_id, 'premium', 'Premium')
  ON CONFLICT (organization_id, code) DO NOTHING;

  INSERT INTO public.collection_profiles (organization_id, code, name, min_score, max_score, is_override)
  VALUES
    (p_organization_id, 'excellent', 'Excelente', 80, 100, false),
    (p_organization_id, 'regular', 'Regular', 60, 79, false),
    (p_organization_id, 'attention', 'Atenção', 40, 59, false),
    (p_organization_id, 'high_risk', 'Risco alto', 0, 39, false),
    (p_organization_id, 'vip', 'VIP', NULL, NULL, true),
    (p_organization_id, 'premium', 'Premium', NULL, NULL, true)
  ON CONFLICT (organization_id, code) DO NOTHING;

  INSERT INTO public.collection_profile_steps
    (profile_id, sequence, relative_day, send_time, message_template)
  SELECT p.id, v.sequence, v.relative_day, v.send_time::time, v.message_template
  FROM public.collection_profiles p
  JOIN (VALUES
    ('excellent', 1, -1, '10:00', 'Olá {{primeiro_nome}}! Seu plano vence amanhã ({{vencimento}}). Se preferir, já pode renovar pelo PIX.'),
    ('excellent', 2, 2, '10:00', 'Olá {{primeiro_nome}}! Ainda não identificamos a renovação do plano. Posso ajudar com o PIX?'),
    ('regular', 1, -3, '09:00', 'Olá {{primeiro_nome}}! Seu plano vence em {{vencimento}}. Valor: {{valor}}.'),
    ('regular', 2, 0, '09:00', 'Olá {{primeiro_nome}}! Seu plano vence hoje. Posso gerar seu PIX de {{valor}}?'),
    ('regular', 3, 3, '10:00', 'Olá {{primeiro_nome}}! Seu pagamento ainda está pendente. Posso enviar uma segunda via do PIX?'),
    ('attention', 1, -3, '09:00', 'Olá {{primeiro_nome}}! Lembramos que seu plano vence em {{vencimento}}. Valor: {{valor}}.'),
    ('attention', 2, 0, '09:00', 'Olá {{primeiro_nome}}! Hoje é o vencimento do seu plano. Posso ajudar com a renovação?'),
    ('attention', 3, 1, '10:00', 'Olá {{primeiro_nome}}! Seu plano está pendente desde {{vencimento}}. Envio o PIX para regularizar?'),
    ('attention', 4, 5, '10:00', 'Olá {{primeiro_nome}}! Precisamos regularizar o plano para evitar interrupção. Fale conosco caso precise de ajuda.'),
    ('high_risk', 1, -5, '09:00', 'Olá {{primeiro_nome}}! Antecipamos o lembrete do vencimento em {{vencimento}}. Valor: {{valor}}.'),
    ('high_risk', 2, -1, '09:00', 'Olá {{primeiro_nome}}! Seu plano vence amanhã. Posso encaminhar o PIX?'),
    ('high_risk', 3, 1, '10:00', 'Olá {{primeiro_nome}}! Seu pagamento está pendente. Posso ajudar a regularizar?'),
    ('high_risk', 4, 7, '10:00', 'Olá {{primeiro_nome}}! Seu caso será encaminhado ao atendimento para ajudar na regularização.'),
    ('vip', 1, -1, '11:00', 'Olá {{primeiro_nome}}! Passando para lembrar, com todo cuidado, do vencimento do seu plano amanhã ({{vencimento}}).'),
    ('premium', 1, -1, '10:00', 'Olá {{primeiro_nome}}! Seu plano vence amanhã ({{vencimento}}). Conte conosco se precisar de algo.'),
    ('premium', 2, 2, '10:00', 'Olá {{primeiro_nome}}! Seu plano segue pendente. Posso enviar uma segunda via do PIX?')
  ) AS v(code, sequence, relative_day, send_time, message_template)
    ON v.code = p.code
  WHERE p.organization_id = p_organization_id
  ON CONFLICT (profile_id, sequence) DO NOTHING;

  RETURN jsonb_build_object(
    'initialized', true,
    'organization_id', p_organization_id,
    'enabled', (SELECT enabled FROM public.collection_settings WHERE organization_id = p_organization_id)
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.recalculate_collection_score(p_client_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client public.clients%ROWTYPE;
  v_completed integer;
  v_ontime integer;
  v_overdue_days integer;
  v_cancelled integer;
  v_score integer;
  v_confidence text;
BEGIN
  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado'; END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE paid_at::date <= due_date)
  INTO v_completed, v_ontime
  FROM public.billing_cycles
  WHERE client_id = p_client_id AND status = 'paid' AND paid_at >= now() - interval '12 months';
  SELECT COALESCE(MAX(current_date - due_date), 0) INTO v_overdue_days
  FROM public.billing_cycles WHERE client_id = p_client_id AND status IN ('open', 'overdue') AND due_date < current_date;
  SELECT COUNT(*) INTO v_cancelled FROM public.client_lifecycle_events
  WHERE client_id = p_client_id AND event_type = 'cancelled' AND created_at >= now() - interval '12 months';

  v_score := CASE WHEN v_completed = 0 THEN 30 ELSE round(60.0 * v_ontime / v_completed) END;
  v_score := v_score + CASE WHEN v_overdue_days = 0 THEN 20 WHEN v_overdue_days <= 7 THEN 10 ELSE 0 END;
  v_score := v_score + LEAST(10, GREATEST(0, floor((current_date - v_client.registration_date::date) / 30.0)::integer));
  v_score := v_score + GREATEST(0, 10 - (v_cancelled * 5));
  v_score := LEAST(100, GREATEST(0, v_score));
  v_confidence := CASE WHEN v_completed >= 3 THEN 'high' ELSE 'low' END;

  INSERT INTO public.collection_scores (client_id, organization_id, score, confidence, reason, calculated_at)
  VALUES (v_client.id, v_client.organization_id, v_score, v_confidence,
    jsonb_build_object('completed_cycles', v_completed, 'on_time_cycles', v_ontime, 'overdue_days', v_overdue_days, 'cancellations', v_cancelled), now())
  ON CONFLICT (client_id) DO UPDATE SET score = excluded.score, confidence = excluded.confidence, reason = excluded.reason, calculated_at = excluded.calculated_at;

  RETURN jsonb_build_object('score', v_score, 'confidence', v_confidence);
END;
$function$

CREATE OR REPLACE FUNCTION public.refresh_collection_score_after_client_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.recalculate_collection_score(NEW.id);
  RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.reserve_contact(p_organization_id uuid, p_client_id uuid, p_contact_date date, p_timezone text, p_category text, p_source text, p_source_id uuid DEFAULT NULL::uuid, p_requested_by uuid DEFAULT NULL::uuid, p_automation_id uuid DEFAULT NULL::uuid, p_message_content text DEFAULT NULL::text, p_media_url text DEFAULT NULL::text, p_allow_manual_override boolean DEFAULT false)
 RETURNS TABLE(reservation_id uuid, decision text, reason text, existing_category text, next_attempt_date date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_priority smallint;
  v_existing public.contact_reservations%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_category NOT IN ('billing', 'operational', 'promotion', 'manual') THEN
    RAISE EXCEPTION 'INVALID_CONTACT_CATEGORY';
  END IF;
  IF p_source NOT IN ('intelligent_collection', 'legacy_automation', 'mass', 'manual', 'system') THEN
    RAISE EXCEPTION 'INVALID_CONTACT_SOURCE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id AND c.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'CLIENT_ORGANIZATION_MISMATCH';
  END IF;

  v_priority := CASE p_category
    WHEN 'billing' THEN 300
    WHEN 'operational' THEN 200
    WHEN 'promotion' THEN 100
    ELSE 400
  END;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text || ':' || p_client_id::text || ':' || p_contact_date::text, 0
  ));

  IF p_source_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.contact_reservations cr
    WHERE cr.source = p_source AND cr.source_id = p_source_id
      AND cr.client_id = p_client_id AND cr.contact_date = p_contact_date
      AND cr.status <> 'cancelled'
    ORDER BY cr.created_at DESC LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_existing.id, 'idempotent'::text,
        COALESCE(v_existing.decision_reason, 'SOURCE_ALREADY_RESERVED'),
        v_existing.category, v_existing.deferred_until;
      RETURN;
    END IF;
  END IF;

  SELECT * INTO v_existing
  FROM public.contact_reservations cr
  WHERE cr.organization_id = p_organization_id AND cr.client_id = p_client_id
    AND cr.status IN ('reserved', 'processing', 'sent')
    AND (
      cr.contact_date = p_contact_date
      OR (p_category = 'manual' AND cr.created_at >= now() - interval '24 hours')
    )
  ORDER BY cr.priority DESC, cr.created_at DESC LIMIT 1;

  IF p_category = 'manual' THEN
    IF FOUND AND NOT p_allow_manual_override THEN
      RETURN QUERY SELECT NULL::uuid, 'confirmation_required'::text,
        'CONTACTED_WITHIN_24_HOURS'::text, v_existing.category, NULL::date;
      RETURN;
    END IF;
    INSERT INTO public.contact_reservations (
      organization_id, client_id, contact_date, timezone, category, priority, source,
      source_id, requested_by, automation_id, message_content, media_url, decision_reason
    ) VALUES (
      p_organization_id, p_client_id, p_contact_date, COALESCE(NULLIF(p_timezone, ''), 'America/Sao_Paulo'),
      p_category, v_priority, p_source, p_source_id, p_requested_by, p_automation_id,
      p_message_content, p_media_url,
      CASE WHEN FOUND THEN 'MANUAL_OVERRIDE_CONFIRMED' ELSE 'CONTACT_RESERVED' END
    ) RETURNING id INTO v_id;
    RETURN QUERY SELECT v_id, 'reserved'::text,
      CASE WHEN FOUND THEN 'MANUAL_OVERRIDE_CONFIRMED' ELSE 'CONTACT_RESERVED' END,
      CASE WHEN FOUND THEN v_existing.category ELSE NULL END, NULL::date;
    RETURN;
  END IF;

  IF FOUND THEN
    IF v_priority > v_existing.priority AND v_existing.status = 'reserved' THEN
      UPDATE public.contact_reservations
      SET status = CASE WHEN category = 'promotion' AND defer_count < 3 THEN 'deferred' ELSE 'cancelled' END,
          defer_count = CASE WHEN category = 'promotion' AND defer_count < 3 THEN defer_count + 1 ELSE defer_count END,
          deferred_until = CASE WHEN category = 'promotion' AND defer_count < 3 THEN p_contact_date + 1 ELSE deferred_until END,
          decision_reason = 'SUPERSEDED_BY_HIGHER_PRIORITY', updated_at = now()
      WHERE id = v_existing.id;
    ELSE
      IF p_category = 'promotion' THEN
        INSERT INTO public.contact_reservations (
          organization_id, client_id, contact_date, timezone, category, priority, source,
          source_id, requested_by, automation_id, message_content, media_url,
          status, decision_reason, defer_count, deferred_until
        ) VALUES (
          p_organization_id, p_client_id, p_contact_date, COALESCE(NULLIF(p_timezone, ''), 'America/Sao_Paulo'),
          p_category, v_priority, p_source, p_source_id, p_requested_by, p_automation_id,
          p_message_content, p_media_url, 'deferred', 'DEFERRED_BY_HIGHER_PRIORITY', 1, p_contact_date + 1
        ) RETURNING id INTO v_id;
        RETURN QUERY SELECT v_id, 'deferred'::text, 'DEFERRED_BY_HIGHER_PRIORITY'::text,
          v_existing.category, p_contact_date + 1;
      ELSE
        RETURN QUERY SELECT NULL::uuid, 'blocked'::text, 'HIGHER_OR_EQUAL_PRIORITY_EXISTS'::text,
          v_existing.category, NULL::date;
      END IF;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.contact_reservations (
    organization_id, client_id, contact_date, timezone, category, priority, source,
    source_id, requested_by, automation_id, message_content, media_url, decision_reason
  ) VALUES (
    p_organization_id, p_client_id, p_contact_date, COALESCE(NULLIF(p_timezone, ''), 'America/Sao_Paulo'),
    p_category, v_priority, p_source, p_source_id, p_requested_by, p_automation_id,
    p_message_content, p_media_url, 'CONTACT_RESERVED'
  ) RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, 'reserved'::text, 'CONTACT_RESERVED'::text,
    CASE WHEN FOUND THEN v_existing.category ELSE NULL END, NULL::date;
END;
$function$

CREATE OR REPLACE FUNCTION public.set_default_organization_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.organization_id IS NULL THEN
    -- Pega a organização primária do usuário que está fazendo o INSERT
    SELECT organization_id INTO NEW.organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.set_pix_charges_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.set_ticket_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT om.organization_id INTO NEW.organization_id
    FROM public.organization_members om
    WHERE om.user_id = NEW.user_id
    ORDER BY om.created_at NULLS LAST, om.organization_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.sync_pix_payment_reporting()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'paid' AND NEW.payment_id IS NOT NULL THEN
    UPDATE public.payments
    SET payment_method = 'pix',
        provider = NEW.provider,
        paid_at = coalesce(NEW.paid_at, paid_at, created_at)
    WHERE id = NEW.payment_id;
  END IF;
  RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.sync_stripe_organization_entitlement(p_organization_id uuid, p_plan text, p_is_active boolean, p_provider_customer_id text, p_provider_subscription_id text, p_provider_status text, p_expires_at timestamp with time zone, p_updated_by uuid, p_event_created_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  affected_rows integer;
BEGIN
  IF p_plan NOT IN ('starter', 'pro', 'master') THEN
    RAISE EXCEPTION 'invalid plan';
  END IF;

  IF p_provider_customer_id IS NULL OR p_provider_subscription_id IS NULL OR p_event_created_at IS NULL THEN
    RAISE EXCEPTION 'missing stripe reference';
  END IF;

  INSERT INTO public.organization_entitlements (
    organization_id,
    plan,
    is_active,
    source,
    provider_customer_id,
    provider_subscription_id,
    provider_status,
    provider_event_created_at,
    expires_at,
    updated_by,
    updated_at
  ) VALUES (
    p_organization_id,
    p_plan,
    p_is_active,
    'stripe',
    p_provider_customer_id,
    p_provider_subscription_id,
    p_provider_status,
    p_event_created_at,
    p_expires_at,
    p_updated_by,
    now()
  )
  ON CONFLICT (organization_id) DO UPDATE
  SET plan = EXCLUDED.plan,
      is_active = EXCLUDED.is_active,
      source = 'stripe',
      provider_customer_id = EXCLUDED.provider_customer_id,
      provider_subscription_id = EXCLUDED.provider_subscription_id,
      provider_status = EXCLUDED.provider_status,
      provider_event_created_at = EXCLUDED.provider_event_created_at,
      expires_at = EXCLUDED.expires_at,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
  WHERE public.organization_entitlements.provider_event_created_at IS NULL
     OR public.organization_entitlements.provider_event_created_at <= EXCLUDED.provider_event_created_at;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows > 0;
END;
$function$

CREATE OR REPLACE FUNCTION public.track_client_lifecycle_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('inactive', 'canceled') AND OLD.status NOT IN ('inactive', 'canceled') THEN
    INSERT INTO public.client_lifecycle_events (organization_id, client_id, event_type)
    VALUES (NEW.organization_id, NEW.id, 'cancelled');
    UPDATE public.billing_cycles SET status = 'cancelled', cancelled_at = now()
    WHERE client_id = NEW.id AND status IN ('open', 'overdue');
  ELSIF NEW.status = 'active' AND OLD.status IN ('inactive', 'canceled') THEN
    INSERT INTO public.client_lifecycle_events (organization_id, client_id, event_type)
    VALUES (NEW.organization_id, NEW.id, 'reactivated');
  END IF;
  RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.update_monthly_goal(new_goal numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_org_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if new_goal is null or new_goal <= 0 or new_goal > 100000000 then
    raise exception 'INVALID_MONTHLY_GOAL' using errcode = '22023';
  end if;

  select member.organization_id
    into v_org_id
  from public.organization_members as member
  where member.user_id = (select auth.uid())
    and member.role::text in ('owner', 'admin')
  order by case when member.role::text = 'owner' then 0 else 1 end
  limit 1;

  if v_org_id is null then
    raise exception 'ORGANIZATION_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  update public.organizations
  set monthly_goal = new_goal,
      updated_at = now()
  where id = v_org_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.user_has_access_to_client(p_client_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id
    AND organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.user_orgs()
 RETURNS SETOF uuid
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid();
$function$


-- Views

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
          WHERE cs.client_id = c.id), '[]'::jsonb) AS client_services
   FROM clients c;;


-- Triggers

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER on_auth_user_created_org AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user_organization();

CREATE TRIGGER trg_set_org_id_alert_history BEFORE INSERT ON alert_history FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();

CREATE TRIGGER set_updated_at_automations BEFORE UPDATE ON automations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_set_org_id_automations BEFORE INSERT ON automations FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();

CREATE TRIGGER trg_z_enforce_starter_automation_rules BEFORE INSERT OR UPDATE OF organization_id, alert_type ON automations FOR EACH ROW EXECUTE FUNCTION enforce_starter_automation_rules();

CREATE TRIGGER set_updated_at_clients BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_refresh_collection_score_after_client_status_change AFTER UPDATE OF status ON clients FOR EACH ROW EXECUTE FUNCTION refresh_collection_score_after_client_status_change();

CREATE TRIGGER trg_set_org_id_clients BEFORE INSERT ON clients FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();

CREATE TRIGGER trg_track_client_lifecycle_event AFTER UPDATE OF status ON clients FOR EACH ROW EXECUTE FUNCTION track_client_lifecycle_event();

CREATE TRIGGER trg_z_enforce_client_plan_limit BEFORE INSERT ON clients FOR EACH ROW EXECUTE FUNCTION enforce_client_plan_limit();

CREATE TRIGGER set_updated_at_evolution_instances BEFORE UPDATE ON evolution_instances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_set_org_id_evolution_instances BEFORE INSERT ON evolution_instances FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();

CREATE TRIGGER trg_z_enforce_whatsapp_instance_plan_limit BEFORE INSERT ON evolution_instances FOR EACH ROW EXECUTE FUNCTION enforce_whatsapp_instance_plan_limit();

CREATE TRIGGER trg_set_org_id_payments BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();

CREATE TRIGGER trg_pix_charges_updated_at BEFORE UPDATE ON pix_charges FOR EACH ROW EXECUTE FUNCTION set_pix_charges_updated_at();

CREATE TRIGGER trg_sync_pix_payment_reporting AFTER INSERT OR UPDATE OF status, payment_id, paid_at ON pix_charges FOR EACH ROW EXECUTE FUNCTION sync_pix_payment_reporting();

CREATE TRIGGER set_updated_at_promotions BEFORE UPDATE ON promotions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_set_org_id_promotions BEFORE INSERT ON promotions FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();

CREATE TRIGGER set_updated_at_services BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_set_org_id_services BEFORE INSERT ON services FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();

CREATE TRIGGER trg_set_ticket_organization BEFORE INSERT ON tickets FOR EACH ROW EXECUTE FUNCTION set_ticket_organization();


-- Row Level Security

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.admin_action_idempotency ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.admin_incidents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.admin_operational_heartbeats ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.affiliate_earnings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.alert_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.analytics_forecasts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.analytics_scenarios ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.billing_cycles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.client_change_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.client_lifecycle_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.client_portal_auth_challenges ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.client_portal_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.client_portal_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.client_services ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.client_tag_assignments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.client_tags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.collection_dispatches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.collection_profile_steps ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.collection_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.collection_scores ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.collection_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contact_reservations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.credit_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.credit_transfers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.evolution_instances ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.executive_daily_snapshots ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fixed_costs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.intelligence_credentials ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.intelligence_findings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.intelligence_operational_heartbeats ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.intelligence_runs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.intelligence_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.intelligence_usage_monthly ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iptv_accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organization_entitlements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.phone_change_verifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pix_charges ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reseller_services ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.resellers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.revenda_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.saas_plan_catalog ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.system_features ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.system_updates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_update_reads ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;


-- Políticas RLS

DROP POLICY IF EXISTS "Users can view own affiliate earnings" ON public.affiliate_earnings;
CREATE POLICY "Users can view own affiliate earnings" ON public.affiliate_earnings FOR SELECT TO PUBLIC
USING ((referrer_id = auth.uid()));

DROP POLICY IF EXISTS "Service role full access to alert history" ON public.alert_history;
CREATE POLICY "Service role full access to alert history" ON public.alert_history FOR ALL TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS tenant_isolation_alert_history ON public.alert_history;
CREATE POLICY tenant_isolation_alert_history ON public.alert_history FOR ALL TO PUBLIC
USING ((organization_id IN ( SELECT user_orgs() AS user_orgs)))
WITH CHECK ((organization_id IN ( SELECT user_orgs() AS user_orgs)));

DROP POLICY IF EXISTS "Members view analytics forecasts" ON public.analytics_forecasts;
CREATE POLICY "Members view analytics forecasts" ON public.analytics_forecasts FOR SELECT TO authenticated
USING ((EXISTS ( SELECT 1
   FROM organization_members member
  WHERE ((member.organization_id = analytics_forecasts.organization_id) AND (member.user_id = ( SELECT auth.uid() AS uid))))));

DROP POLICY IF EXISTS "Members view analytics scenarios" ON public.analytics_scenarios;
CREATE POLICY "Members view analytics scenarios" ON public.analytics_scenarios FOR SELECT TO authenticated
USING ((EXISTS ( SELECT 1
   FROM organization_members member
  WHERE ((member.organization_id = analytics_scenarios.organization_id) AND (member.user_id = ( SELECT auth.uid() AS uid))))));

DROP POLICY IF EXISTS "Usuários podem criar suas próprias chaves" ON public.api_keys;
CREATE POLICY "Usuários podem criar suas próprias chaves" ON public.api_keys FOR INSERT TO PUBLIC
WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Usuários podem deletar suas próprias chaves" ON public.api_keys;
CREATE POLICY "Usuários podem deletar suas próprias chaves" ON public.api_keys FOR DELETE TO PUBLIC
USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Usuários podem ver suas próprias chaves" ON public.api_keys;
CREATE POLICY "Usuários podem ver suas próprias chaves" ON public.api_keys FOR SELECT TO PUBLIC
USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS tenant_isolation_automations ON public.automations;
CREATE POLICY tenant_isolation_automations ON public.automations FOR ALL TO PUBLIC
USING ((organization_id IN ( SELECT user_orgs() AS user_orgs)))
WITH CHECK ((organization_id IN ( SELECT user_orgs() AS user_orgs)));

DROP POLICY IF EXISTS "Members can view collection operational data" ON public.billing_cycles;
CREATE POLICY "Members can view collection operational data" ON public.billing_cycles FOR SELECT TO PUBLIC
USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));

DROP POLICY IF EXISTS "Users can manage their own campaigns" ON public.campaigns;
CREATE POLICY "Users can manage their own campaigns" ON public.campaigns FOR ALL TO PUBLIC
USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Managers can view change requests" ON public.client_change_requests;
CREATE POLICY "Managers can view change requests" ON public.client_change_requests FOR SELECT TO authenticated
USING ((EXISTS ( SELECT 1
   FROM organization_members member
  WHERE ((member.organization_id = client_change_requests.organization_id) AND (member.user_id = ( SELECT auth.uid() AS uid)) AND (member.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

DROP POLICY IF EXISTS "Members can view collection lifecycle data" ON public.client_lifecycle_events;
CREATE POLICY "Members can view collection lifecycle data" ON public.client_lifecycle_events FOR SELECT TO PUBLIC
USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));

DROP POLICY IF EXISTS "Members view client portal settings" ON public.client_portal_settings;
CREATE POLICY "Members view client portal settings" ON public.client_portal_settings FOR SELECT TO authenticated
USING ((EXISTS ( SELECT 1
   FROM organization_members member
  WHERE ((member.organization_id = client_portal_settings.organization_id) AND (member.user_id = ( SELECT auth.uid() AS uid))))));

DROP POLICY IF EXISTS tenant_isolation_client_services ON public.client_services;
CREATE POLICY tenant_isolation_client_services ON public.client_services FOR ALL TO authenticated
USING ((EXISTS ( SELECT 1
   FROM clients client
  WHERE ((client.id = client_services.client_id) AND (client.organization_id IN ( SELECT user_orgs() AS user_orgs))))))
WITH CHECK ((EXISTS ( SELECT 1
   FROM clients client
  WHERE ((client.id = client_services.client_id) AND (client.organization_id IN ( SELECT user_orgs() AS user_orgs))))));

DROP POLICY IF EXISTS "Managers can manage client tags" ON public.client_tag_assignments;
CREATE POLICY "Managers can manage client tags" ON public.client_tag_assignments FOR ALL TO PUBLIC
USING ((EXISTS ( SELECT 1
   FROM (clients c
     JOIN organization_members m ON ((m.organization_id = c.organization_id)))
  WHERE ((c.id = client_tag_assignments.client_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))
WITH CHECK ((EXISTS ( SELECT 1
   FROM ((clients c
     JOIN client_tags t ON ((t.id = client_tag_assignments.tag_id)))
     JOIN organization_members m ON ((m.organization_id = c.organization_id)))
  WHERE ((c.id = client_tag_assignments.client_id) AND (t.organization_id = c.organization_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

DROP POLICY IF EXISTS "Members can view client tags" ON public.client_tag_assignments;
CREATE POLICY "Members can view client tags" ON public.client_tag_assignments FOR SELECT TO PUBLIC
USING ((EXISTS ( SELECT 1
   FROM (clients c
     JOIN organization_members m ON ((m.organization_id = c.organization_id)))
  WHERE ((c.id = client_tag_assignments.client_id) AND (m.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Managers can manage collection tags" ON public.client_tags;
CREATE POLICY "Managers can manage collection tags" ON public.client_tags FOR ALL TO PUBLIC
USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = auth.uid()) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))
WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = auth.uid()) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

DROP POLICY IF EXISTS "Members can view collection data" ON public.client_tags;
CREATE POLICY "Members can view collection data" ON public.client_tags FOR SELECT TO PUBLIC
USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));

DROP POLICY IF EXISTS tenant_isolation_clients ON public.clients;
CREATE POLICY tenant_isolation_clients ON public.clients FOR ALL TO PUBLIC
USING ((organization_id IN ( SELECT user_orgs() AS user_orgs)))
WITH CHECK ((organization_id IN ( SELECT user_orgs() AS user_orgs)));

DROP POLICY IF EXISTS "Members can view collection dispatches" ON public.collection_dispatches;
CREATE POLICY "Members can view collection dispatches" ON public.collection_dispatches FOR SELECT TO PUBLIC
USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));

DROP POLICY IF EXISTS "Managers can manage collection profile steps" ON public.collection_profile_steps;
CREATE POLICY "Managers can manage collection profile steps" ON public.collection_profile_steps FOR ALL TO PUBLIC
USING ((EXISTS ( SELECT 1
   FROM (collection_profiles p
     JOIN organization_members m ON ((m.organization_id = p.organization_id)))
  WHERE ((p.id = collection_profile_steps.profile_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))
WITH CHECK ((EXISTS ( SELECT 1
   FROM (collection_profiles p
     JOIN organization_members m ON ((m.organization_id = p.organization_id)))
  WHERE ((p.id = collection_profile_steps.profile_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

DROP POLICY IF EXISTS "Members can view collection profile steps" ON public.collection_profile_steps;
CREATE POLICY "Members can view collection profile steps" ON public.collection_profile_steps FOR SELECT TO PUBLIC
USING ((EXISTS ( SELECT 1
   FROM (collection_profiles p
     JOIN organization_members m ON ((m.organization_id = p.organization_id)))
  WHERE ((p.id = collection_profile_steps.profile_id) AND (m.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Managers can manage collection profiles" ON public.collection_profiles;
CREATE POLICY "Managers can manage collection profiles" ON public.collection_profiles FOR ALL TO PUBLIC
USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = auth.uid()) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))
WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = auth.uid()) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

DROP POLICY IF EXISTS "Members can view collection profiles" ON public.collection_profiles;
CREATE POLICY "Members can view collection profiles" ON public.collection_profiles FOR SELECT TO PUBLIC
USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));

DROP POLICY IF EXISTS "Members can view collection score" ON public.collection_scores;
CREATE POLICY "Members can view collection score" ON public.collection_scores FOR SELECT TO PUBLIC
USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));

DROP POLICY IF EXISTS "Managers can manage collection settings" ON public.collection_settings;
CREATE POLICY "Managers can manage collection settings" ON public.collection_settings FOR ALL TO PUBLIC
USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = auth.uid()) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))
WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = auth.uid()) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

DROP POLICY IF EXISTS "Members can view collection settings" ON public.collection_settings;
CREATE POLICY "Members can view collection settings" ON public.collection_settings FOR SELECT TO PUBLIC
USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));

DROP POLICY IF EXISTS "Members can view contact reservations" ON public.contact_reservations;
CREATE POLICY "Members can view contact reservations" ON public.contact_reservations FOR SELECT TO authenticated
USING ((EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.organization_id = contact_reservations.organization_id) AND (om.user_id = ( SELECT auth.uid() AS uid))))));

DROP POLICY IF EXISTS "Users can manage own credit_requests" ON public.credit_requests;
CREATE POLICY "Users can manage own credit_requests" ON public.credit_requests FOR ALL TO PUBLIC
USING ((EXISTS ( SELECT 1
   FROM resellers
  WHERE ((resellers.id = credit_requests.reseller_id) AND (resellers.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Service role full access to evolution instances" ON public.evolution_instances;
CREATE POLICY "Service role full access to evolution instances" ON public.evolution_instances FOR SELECT TO service_role
USING (true);

DROP POLICY IF EXISTS tenant_isolation_evolution_instances ON public.evolution_instances;
CREATE POLICY tenant_isolation_evolution_instances ON public.evolution_instances FOR ALL TO PUBLIC
USING ((organization_id IN ( SELECT user_orgs() AS user_orgs)))
WITH CHECK ((organization_id IN ( SELECT user_orgs() AS user_orgs)));

DROP POLICY IF EXISTS "Members can view executive snapshots" ON public.executive_daily_snapshots;
CREATE POLICY "Members can view executive snapshots" ON public.executive_daily_snapshots FOR SELECT TO PUBLIC
USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));

DROP POLICY IF EXISTS "Users can manage their own fixed costs" ON public.fixed_costs;
CREATE POLICY "Users can manage their own fixed costs" ON public.fixed_costs FOR ALL TO PUBLIC
USING ((auth.uid() = user_id))
WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS tenant_isolation_integrations ON public.integrations;
CREATE POLICY tenant_isolation_integrations ON public.integrations FOR ALL TO PUBLIC
USING ((organization_id IN ( SELECT user_orgs() AS user_orgs)));

DROP POLICY IF EXISTS "Members view intelligence findings" ON public.intelligence_findings;
CREATE POLICY "Members view intelligence findings" ON public.intelligence_findings FOR SELECT TO authenticated
USING ((EXISTS ( SELECT 1
   FROM organization_members m
  WHERE ((m.organization_id = intelligence_findings.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));

DROP POLICY IF EXISTS "Members view intelligence health" ON public.intelligence_operational_heartbeats;
CREATE POLICY "Members view intelligence health" ON public.intelligence_operational_heartbeats FOR SELECT TO authenticated
USING ((EXISTS ( SELECT 1
   FROM organization_members m
  WHERE ((m.organization_id = intelligence_operational_heartbeats.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));

DROP POLICY IF EXISTS "Members view intelligence runs" ON public.intelligence_runs;
CREATE POLICY "Members view intelligence runs" ON public.intelligence_runs FOR SELECT TO authenticated
USING ((EXISTS ( SELECT 1
   FROM organization_members m
  WHERE ((m.organization_id = intelligence_runs.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));

DROP POLICY IF EXISTS "Managers update intelligence settings" ON public.intelligence_settings;
CREATE POLICY "Managers update intelligence settings" ON public.intelligence_settings FOR UPDATE TO authenticated
USING ((EXISTS ( SELECT 1
   FROM organization_members m
  WHERE ((m.organization_id = intelligence_settings.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))
WITH CHECK ((EXISTS ( SELECT 1
   FROM organization_members m
  WHERE ((m.organization_id = intelligence_settings.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

DROP POLICY IF EXISTS "Members view intelligence settings" ON public.intelligence_settings;
CREATE POLICY "Members view intelligence settings" ON public.intelligence_settings FOR SELECT TO authenticated
USING ((EXISTS ( SELECT 1
   FROM organization_members m
  WHERE ((m.organization_id = intelligence_settings.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));

DROP POLICY IF EXISTS "Members view intelligence usage" ON public.intelligence_usage_monthly;
CREATE POLICY "Members view intelligence usage" ON public.intelligence_usage_monthly FOR SELECT TO authenticated
USING ((EXISTS ( SELECT 1
   FROM organization_members m
  WHERE ((m.organization_id = intelligence_usage_monthly.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));

DROP POLICY IF EXISTS "Acesso apenas as proprias contas iptv" ON public.iptv_accounts;
CREATE POLICY "Acesso apenas as proprias contas iptv" ON public.iptv_accounts FOR ALL TO PUBLIC
USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can manage own leads" ON public.leads;
CREATE POLICY "Users can manage own leads" ON public.leads FOR ALL TO authenticated
USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users manage own templates" ON public.message_templates;
CREATE POLICY "Users manage own templates" ON public.message_templates FOR ALL TO PUBLIC
USING ((user_id = auth.uid()))
WITH CHECK ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Members can view organization entitlement" ON public.organization_entitlements;
CREATE POLICY "Members can view organization entitlement" ON public.organization_entitlements FOR SELECT TO PUBLIC
USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));

DROP POLICY IF EXISTS "Users can view own memberships" ON public.organization_members;
CREATE POLICY "Users can view own memberships" ON public.organization_members FOR SELECT TO PUBLIC
USING ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view their own organizations" ON public.organizations;
CREATE POLICY "Users can view their own organizations" ON public.organizations FOR SELECT TO PUBLIC
USING ((id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = auth.uid()))));

DROP POLICY IF EXISTS tenant_isolation_payments ON public.payments;
CREATE POLICY tenant_isolation_payments ON public.payments FOR ALL TO PUBLIC
USING ((organization_id IN ( SELECT user_orgs() AS user_orgs)))
WITH CHECK ((organization_id IN ( SELECT user_orgs() AS user_orgs)));

DROP POLICY IF EXISTS "Members can view pix charges" ON public.pix_charges;
CREATE POLICY "Members can view pix charges" ON public.pix_charges FOR SELECT TO authenticated
USING ((EXISTS ( SELECT 1
   FROM organization_members member
  WHERE ((member.organization_id = pix_charges.organization_id) AND (member.user_id = ( SELECT auth.uid() AS uid))))));

DROP POLICY IF EXISTS tenant_isolation_promotions ON public.promotions;
CREATE POLICY tenant_isolation_promotions ON public.promotions FOR ALL TO PUBLIC
USING ((organization_id IN ( SELECT user_orgs() AS user_orgs)))
WITH CHECK ((organization_id IN ( SELECT user_orgs() AS user_orgs)));

DROP POLICY IF EXISTS "Users can manage own reseller_services" ON public.reseller_services;
CREATE POLICY "Users can manage own reseller_services" ON public.reseller_services FOR ALL TO PUBLIC
USING ((EXISTS ( SELECT 1
   FROM resellers
  WHERE ((resellers.id = reseller_services.reseller_id) AND (resellers.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Users can manage own resellers" ON public.resellers;
CREATE POLICY "Users can manage own resellers" ON public.resellers FOR ALL TO PUBLIC
USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can manage own settings" ON public.revenda_settings;
CREATE POLICY "Users can manage own settings" ON public.revenda_settings FOR ALL TO PUBLIC
USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS tenant_isolation_services ON public.services;
CREATE POLICY tenant_isolation_services ON public.services FOR ALL TO PUBLIC
USING ((organization_id IN ( SELECT user_orgs() AS user_orgs)))
WITH CHECK ((organization_id IN ( SELECT user_orgs() AS user_orgs)));

DROP POLICY IF EXISTS "Read system features" ON public.system_features;
CREATE POLICY "Read system features" ON public.system_features FOR SELECT TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert system_updates" ON public.system_updates;
CREATE POLICY "Allow authenticated insert system_updates" ON public.system_updates FOR INSERT TO PUBLIC
WITH CHECK ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Allow authenticated update system_updates" ON public.system_updates;
CREATE POLICY "Allow authenticated update system_updates" ON public.system_updates FOR UPDATE TO PUBLIC
USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Allow public read access to system_updates" ON public.system_updates;
CREATE POLICY "Allow public read access to system_updates" ON public.system_updates FOR SELECT TO PUBLIC
USING (true);

DROP POLICY IF EXISTS "Permitir leitura de atualizações" ON public.system_updates;
CREATE POLICY "Permitir leitura de atualizações" ON public.system_updates FOR SELECT TO PUBLIC
USING (true);

DROP POLICY IF EXISTS "Users can insert messages for their tickets" ON public.ticket_messages;
CREATE POLICY "Users can insert messages for their tickets" ON public.ticket_messages FOR INSERT TO authenticated
WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (COALESCE(is_from_admin, false) = false) AND (EXISTS ( SELECT 1
   FROM tickets t
  WHERE ((t.id = ticket_messages.ticket_id) AND (t.user_id = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "Users can view messages for their tickets" ON public.ticket_messages;
CREATE POLICY "Users can view messages for their tickets" ON public.ticket_messages FOR SELECT TO authenticated
USING ((EXISTS ( SELECT 1
   FROM tickets t
  WHERE ((t.id = ticket_messages.ticket_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));

DROP POLICY IF EXISTS "Users can insert their own tickets" ON public.tickets;
CREATE POLICY "Users can insert their own tickets" ON public.tickets FOR INSERT TO authenticated
WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = ( SELECT auth.uid() AS uid))))));

DROP POLICY IF EXISTS "Users can update their own ticket timestamp" ON public.tickets;
CREATE POLICY "Users can update their own ticket timestamp" ON public.tickets FOR UPDATE TO authenticated
USING ((( SELECT auth.uid() AS uid) = user_id))
WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

DROP POLICY IF EXISTS "Users can view their own tickets" ON public.tickets;
CREATE POLICY "Users can view their own tickets" ON public.tickets FOR SELECT TO authenticated
USING ((( SELECT auth.uid() AS uid) = user_id));

DROP POLICY IF EXISTS "Users can insert their own reads" ON public.user_update_reads;
CREATE POLICY "Users can insert their own reads" ON public.user_update_reads FOR INSERT TO PUBLIC
WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view their own reads" ON public.user_update_reads;
CREATE POLICY "Users can view their own reads" ON public.user_update_reads FOR SELECT TO PUBLIC
USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can read their own data" ON public.users;
CREATE POLICY "Users can read their own data" ON public.users FOR SELECT TO PUBLIC
USING ((auth.uid() = id));

DROP POLICY IF EXISTS "Users can update their own data" ON public.users;
CREATE POLICY "Users can update their own data" ON public.users FOR UPDATE TO PUBLIC
USING ((auth.uid() = id));

DROP POLICY IF EXISTS "Users can view own withdrawal requests" ON public.withdrawal_requests;
CREATE POLICY "Users can view own withdrawal requests" ON public.withdrawal_requests FOR SELECT TO PUBLIC
USING ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Auth Delete" ON storage.objects;
CREATE POLICY "Auth Delete" ON storage.objects FOR DELETE TO PUBLIC
USING (((bucket_id = 'mass_media'::text) AND (auth.role() = 'authenticated'::text)));

DROP POLICY IF EXISTS "Auth Insert" ON storage.objects;
CREATE POLICY "Auth Insert" ON storage.objects FOR INSERT TO PUBLIC
WITH CHECK (((bucket_id = 'mass_media'::text) AND (auth.role() = 'authenticated'::text)));

DROP POLICY IF EXISTS "Auth Update" ON storage.objects;
CREATE POLICY "Auth Update" ON storage.objects FOR UPDATE TO PUBLIC
USING (((bucket_id = 'mass_media'::text) AND (auth.role() = 'authenticated'::text)));


-- Comentários do schema

COMMENT ON COLUMN public.account_deletion_requests.target_user_id IS 'Identificador imutável preservado após a remoção do usuário do Auth.';

COMMENT ON COLUMN public.account_deletion_requests.blocked_reason IS 'Código operacional sem dados sensíveis que impede a purga automática.';

COMMENT ON TABLE public.admin_incidents IS 'Incidentes operacionais do Admin Master, acessíveis somente pelo servidor.';

COMMENT ON TABLE public.admin_operational_heartbeats IS 'Heartbeats globais de componentes internos, acessíveis somente pelo servidor.';

COMMENT ON COLUMN public.client_services.username IS 'Login opcional do cliente neste serviço/painel';

COMMENT ON COLUMN public.client_services.password IS 'Senha opcional do cliente neste serviço/painel';

COMMENT ON COLUMN public.security_settings.hmac_previous_secret IS 'Encrypted previous Evolution webhook secret retained during rotation grace.';

COMMENT ON COLUMN public.security_settings.hmac_previous_valid_until IS 'Exclusive deadline after which the previous Evolution webhook secret is rejected.';


-- Permissões da Data API

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

REVOKE ALL ON TABLE public.account_deletion_requests FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.account_deletion_requests TO service_role;

REVOKE ALL ON TABLE public.admin_action_idempotency FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_action_idempotency TO service_role;

REVOKE ALL ON TABLE public.admin_incidents FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_incidents TO service_role;

REVOKE ALL ON TABLE public.admin_operational_heartbeats FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_operational_heartbeats TO service_role;

REVOKE ALL ON TABLE public.affiliate_earnings FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.affiliate_earnings TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.affiliate_earnings TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.affiliate_earnings TO service_role;

REVOKE ALL ON TABLE public.alert_history FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.alert_history TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.alert_history TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.alert_history TO service_role;

REVOKE ALL ON TABLE public.analytics_forecasts FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.analytics_forecasts TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.analytics_forecasts TO service_role;

REVOKE ALL ON TABLE public.analytics_scenarios FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.analytics_scenarios TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.analytics_scenarios TO service_role;

REVOKE ALL ON TABLE public.api_keys FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.api_keys TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.api_keys TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.api_keys TO service_role;

REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_logs TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_logs TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_logs TO service_role;

REVOKE ALL ON TABLE public.automations FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.automations TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.automations TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.automations TO service_role;

REVOKE ALL ON TABLE public.billing_cycles FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_cycles TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_cycles TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_cycles TO service_role;

REVOKE ALL ON TABLE public.campaigns FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.campaigns TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.campaigns TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.campaigns TO service_role;

REVOKE ALL ON TABLE public.client_change_requests FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.client_change_requests TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.client_change_requests TO service_role;

REVOKE ALL ON TABLE public.client_lifecycle_events FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.client_lifecycle_events TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.client_lifecycle_events TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.client_lifecycle_events TO service_role;

REVOKE ALL ON TABLE public.client_portal_auth_challenges FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.client_portal_auth_challenges TO service_role;

REVOKE ALL ON TABLE public.client_portal_sessions FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.client_portal_sessions TO service_role;

REVOKE ALL ON TABLE public.client_portal_settings FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.client_portal_settings TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.client_portal_settings TO service_role;

REVOKE ALL ON TABLE public.client_services FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.client_services TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.client_services TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.client_services TO service_role;

REVOKE ALL ON TABLE public.client_tag_assignments FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.client_tag_assignments TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.client_tag_assignments TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.client_tag_assignments TO service_role;

REVOKE ALL ON TABLE public.client_tags FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.client_tags TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.client_tags TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.client_tags TO service_role;

REVOKE ALL ON TABLE public.clients FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.clients TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.clients TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.clients TO service_role;

REVOKE ALL ON TABLE public.collection_dispatches FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.collection_dispatches TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.collection_dispatches TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.collection_dispatches TO service_role;

REVOKE ALL ON TABLE public.collection_profile_steps FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.collection_profile_steps TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.collection_profile_steps TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.collection_profile_steps TO service_role;

REVOKE ALL ON TABLE public.collection_profiles FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.collection_profiles TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.collection_profiles TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.collection_profiles TO service_role;

REVOKE ALL ON TABLE public.collection_scores FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.collection_scores TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.collection_scores TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.collection_scores TO service_role;

REVOKE ALL ON TABLE public.collection_settings FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.collection_settings TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.collection_settings TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.collection_settings TO service_role;

REVOKE ALL ON TABLE public.contact_reservations FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.contact_reservations TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contact_reservations TO service_role;

REVOKE ALL ON TABLE public.credit_requests FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.credit_requests TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.credit_requests TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.credit_requests TO service_role;

REVOKE ALL ON TABLE public.credit_transfers FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.credit_transfers TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.credit_transfers TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.credit_transfers TO service_role;

REVOKE ALL ON TABLE public.evolution_instances FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.evolution_instances TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.evolution_instances TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.evolution_instances TO service_role;

REVOKE ALL ON TABLE public.executive_daily_snapshots FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.executive_daily_snapshots TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.executive_daily_snapshots TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.executive_daily_snapshots TO service_role;

REVOKE ALL ON TABLE public.fixed_costs FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fixed_costs TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fixed_costs TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fixed_costs TO service_role;

REVOKE ALL ON TABLE public.integrations FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.integrations TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.integrations TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.integrations TO service_role;

REVOKE ALL ON TABLE public.intelligence_credentials FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.intelligence_credentials TO service_role;

REVOKE ALL ON TABLE public.intelligence_findings FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.intelligence_findings TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.intelligence_findings TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.intelligence_findings TO service_role;

REVOKE ALL ON TABLE public.intelligence_operational_heartbeats FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.intelligence_operational_heartbeats TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.intelligence_operational_heartbeats TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.intelligence_operational_heartbeats TO service_role;

REVOKE ALL ON TABLE public.intelligence_runs FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.intelligence_runs TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.intelligence_runs TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.intelligence_runs TO service_role;

REVOKE ALL ON TABLE public.intelligence_settings FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.intelligence_settings TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.intelligence_settings TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.intelligence_settings TO service_role;

REVOKE ALL ON TABLE public.intelligence_usage_monthly FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.intelligence_usage_monthly TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.intelligence_usage_monthly TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.intelligence_usage_monthly TO service_role;

REVOKE ALL ON TABLE public.iptv_accounts FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.iptv_accounts TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.iptv_accounts TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.iptv_accounts TO service_role;

REVOKE ALL ON TABLE public.leads FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.leads TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.leads TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.leads TO service_role;

REVOKE ALL ON TABLE public.message_templates FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.message_templates TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.message_templates TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.message_templates TO service_role;

REVOKE ALL ON TABLE public.organization_entitlements FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.organization_entitlements TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.organization_entitlements TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.organization_entitlements TO service_role;

REVOKE ALL ON TABLE public.organization_members FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.organization_members TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.organization_members TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.organization_members TO service_role;

REVOKE ALL ON TABLE public.organizations FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.organizations TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.organizations TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.organizations TO service_role;

REVOKE ALL ON TABLE public.payments FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payments TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payments TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payments TO service_role;

REVOKE ALL ON TABLE public.phone_change_verifications FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.phone_change_verifications TO service_role;

REVOKE ALL ON TABLE public.pix_charges FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pix_charges TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pix_charges TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pix_charges TO service_role;

REVOKE ALL ON TABLE public.promotions FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.promotions TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.promotions TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.promotions TO service_role;

REVOKE ALL ON TABLE public.reseller_services FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.reseller_services TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.reseller_services TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.reseller_services TO service_role;

REVOKE ALL ON TABLE public.resellers FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.resellers TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.resellers TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.resellers TO service_role;

REVOKE ALL ON TABLE public.revenda_settings FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.revenda_settings TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.revenda_settings TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.revenda_settings TO service_role;

REVOKE ALL ON TABLE public.saas_plan_catalog FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.saas_plan_catalog TO service_role;

REVOKE ALL ON TABLE public.security_settings FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.security_settings TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.security_settings TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.security_settings TO service_role;

REVOKE ALL ON TABLE public.services FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.services TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.services TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.services TO service_role;

REVOKE ALL ON TABLE public.system_features FROM PUBLIC, anon, authenticated, service_role;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.system_features TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.system_features TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.system_features TO service_role;

REVOKE ALL ON TABLE public.system_updates FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.system_updates TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.system_updates TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.system_updates TO service_role;

REVOKE ALL ON TABLE public.ticket_messages FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ticket_messages TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ticket_messages TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ticket_messages TO service_role;

REVOKE ALL ON TABLE public.tickets FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tickets TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.tickets TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tickets TO service_role;

REVOKE ALL ON TABLE public.user_update_reads FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_update_reads TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_update_reads TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_update_reads TO service_role;

REVOKE ALL ON TABLE public.users FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.users TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.users TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.users TO service_role;

REVOKE ALL ON TABLE public.vw_enriched_clients FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.vw_enriched_clients TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.vw_enriched_clients TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.vw_enriched_clients TO service_role;

REVOKE ALL ON TABLE public.withdrawal_requests FROM PUBLIC, anon, authenticated, service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.withdrawal_requests TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.withdrawal_requests TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.withdrawal_requests TO service_role;



REVOKE ALL ON FUNCTION public.activate_deferred_contact(p_reservation_id uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.activate_deferred_contact(p_reservation_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_revoke_user_sessions(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_revoke_user_sessions(p_user_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.claim_collection_dispatch(p_dispatch_id uuid, p_is_retry boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.claim_collection_dispatch(p_dispatch_id uuid, p_is_retry boolean) TO service_role;

REVOKE ALL ON FUNCTION public.claim_contact_reservation(p_reservation_id uuid, p_is_retry boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.claim_contact_reservation(p_reservation_id uuid, p_is_retry boolean) TO service_role;

REVOKE ALL ON FUNCTION public.complete_phone_change(p_verification_id uuid, p_code_hash text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.complete_phone_change(p_verification_id uuid, p_code_hash text) TO service_role;

REVOKE ALL ON FUNCTION public.consume_client_portal_challenge(p_challenge_id uuid, p_code_hash text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.consume_client_portal_challenge(p_challenge_id uuid, p_code_hash text) TO service_role;

REVOKE ALL ON FUNCTION public.enforce_client_plan_limit() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.enforce_client_plan_limit() TO service_role;

REVOKE ALL ON FUNCTION public.enforce_starter_automation_rules() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.enforce_starter_automation_rules() TO service_role;

REVOKE ALL ON FUNCTION public.enforce_whatsapp_instance_plan_limit() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.enforce_whatsapp_instance_plan_limit() TO service_role;

REVOKE ALL ON FUNCTION public.finalize_pix_charge(p_charge_id uuid, p_provider_payment_id text, p_amount numeric) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.finalize_pix_charge(p_charge_id uuid, p_provider_payment_id text, p_amount numeric) TO service_role;

REVOKE ALL ON FUNCTION public.get_advanced_dashboard_metrics() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_advanced_dashboard_metrics() TO service_role;

REVOKE ALL ON FUNCTION public.get_clients_by_service() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_clients_by_service() TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_clients_by_service() TO service_role;

REVOKE ALL ON FUNCTION public.get_clients_management_metrics() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_clients_management_metrics() TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_clients_management_metrics() TO service_role;

REVOKE ALL ON FUNCTION public.get_dashboard_metrics() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics() TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics() TO service_role;

REVOKE ALL ON FUNCTION public.get_monthly_growth() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_monthly_growth() TO service_role;

REVOKE ALL ON FUNCTION public.get_pix_charge_metrics() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_pix_charge_metrics() TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_pix_charge_metrics() TO service_role;

REVOKE ALL ON FUNCTION public.get_pix_charge_metrics(p_organization_id uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_pix_charge_metrics(p_organization_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_pix_charge_metrics(p_organization_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

REVOKE ALL ON FUNCTION public.handle_new_user_organization() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.handle_new_user_organization() TO service_role;

REVOKE ALL ON FUNCTION public.increment_intelligence_usage(p_organization_id uuid, p_credential_source text, p_input_tokens integer, p_output_tokens integer, p_failed boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.increment_intelligence_usage(p_organization_id uuid, p_credential_source text, p_input_tokens integer, p_output_tokens integer, p_failed boolean) TO service_role;

REVOKE ALL ON FUNCTION public.initialize_intelligent_collections(p_organization_id uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.initialize_intelligent_collections(p_organization_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.recalculate_collection_score(p_client_id uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.recalculate_collection_score(p_client_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.refresh_collection_score_after_client_status_change() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.refresh_collection_score_after_client_status_change() TO service_role;

REVOKE ALL ON FUNCTION public.reserve_contact(p_organization_id uuid, p_client_id uuid, p_contact_date date, p_timezone text, p_category text, p_source text, p_source_id uuid, p_requested_by uuid, p_automation_id uuid, p_message_content text, p_media_url text, p_allow_manual_override boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.reserve_contact(p_organization_id uuid, p_client_id uuid, p_contact_date date, p_timezone text, p_category text, p_source text, p_source_id uuid, p_requested_by uuid, p_automation_id uuid, p_message_content text, p_media_url text, p_allow_manual_override boolean) TO service_role;

REVOKE ALL ON FUNCTION public.set_default_organization_id() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.set_default_organization_id() TO service_role;

REVOKE ALL ON FUNCTION public.set_pix_charges_updated_at() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.set_pix_charges_updated_at() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_pix_charges_updated_at() TO anon;

GRANT EXECUTE ON FUNCTION public.set_pix_charges_updated_at() TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_pix_charges_updated_at() TO service_role;

REVOKE ALL ON FUNCTION public.set_ticket_organization() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.set_ticket_organization() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_ticket_organization() TO anon;

GRANT EXECUTE ON FUNCTION public.set_ticket_organization() TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_ticket_organization() TO service_role;

REVOKE ALL ON FUNCTION public.sync_pix_payment_reporting() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.sync_pix_payment_reporting() TO service_role;

REVOKE ALL ON FUNCTION public.sync_stripe_organization_entitlement(p_organization_id uuid, p_plan text, p_is_active boolean, p_provider_customer_id text, p_provider_subscription_id text, p_provider_status text, p_expires_at timestamp with time zone, p_updated_by uuid, p_event_created_at timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.sync_stripe_organization_entitlement(p_organization_id uuid, p_plan text, p_is_active boolean, p_provider_customer_id text, p_provider_subscription_id text, p_provider_status text, p_expires_at timestamp with time zone, p_updated_by uuid, p_event_created_at timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.track_client_lifecycle_event() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.track_client_lifecycle_event() TO service_role;

REVOKE ALL ON FUNCTION public.update_monthly_goal(new_goal numeric) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.update_monthly_goal(new_goal numeric) TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_monthly_goal(new_goal numeric) TO service_role;

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;

REVOKE ALL ON FUNCTION public.user_has_access_to_client(p_client_id uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.user_has_access_to_client(p_client_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.user_has_access_to_client(p_client_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.user_orgs() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.user_orgs() TO authenticated;

GRANT EXECUTE ON FUNCTION public.user_orgs() TO service_role;


-- Storage

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('mass_media', 'mass_media', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- Configurações globais de inicialização
-- Nenhum dado de tenant ou dado operacional é copiado.

INSERT INTO public.system_features
SELECT *
FROM jsonb_populate_recordset(
  NULL::public.system_features,
  $gestormaster_features$[{"key": "action_connect_instance", "name": "Conectar Nova Instância WhatsApp", "category": "Ação", "is_enabled": true, "updated_at": "2026-06-18T02:54:14.529981+00:00"}, {"key": "action_create_api_key", "name": "Criar Chave API", "category": "Ação", "is_enabled": false, "updated_at": "2026-06-18T02:54:14.529981+00:00"}, {"key": "action_create_client", "name": "Criar Novo Cliente", "category": "Ação", "is_enabled": true, "updated_at": "2026-06-18T02:54:14.529981+00:00"}, {"key": "action_create_promo", "name": "Criar Nova Promoção", "category": "Ação", "is_enabled": true, "updated_at": "2026-06-18T02:54:14.529981+00:00"}, {"key": "action_create_service", "name": "Criar Novo Serviço", "category": "Ação", "is_enabled": true, "updated_at": "2026-06-18T02:54:14.529981+00:00"}, {"key": "action_open_ticket", "name": "Abrir Chamado de Suporte", "category": "Ação", "is_enabled": true, "updated_at": "2026-06-18T02:54:14.529981+00:00"}, {"key": "action_pix_rapido", "name": "Gerar Pix Rápido", "category": "Ação", "is_enabled": true, "updated_at": "2026-06-18T02:54:14.529981+00:00"}, {"key": "action_start_campaign", "name": "Iniciar Disparo em Massa", "category": "Ação", "is_enabled": true, "updated_at": "2026-06-18T02:54:14.529981+00:00"}, {"key": "integration_ai_assistant", "name": "Int. Assistente I.A.", "category": "Integração", "is_enabled": false, "updated_at": "2026-06-21T22:17:40.624184+00:00"}, {"key": "integration_mercadopago", "name": "Int. Mercado Pago", "category": "Integração", "is_enabled": true, "updated_at": "2026-06-21T22:17:40.624184+00:00"}, {"key": "integration_tvdc_iptv", "name": "Int. Painel TVdeCasa", "category": "Integração", "is_enabled": false, "updated_at": "2026-06-21T22:17:40.624184+00:00"}, {"key": "integration_typebot", "name": "Int. Typebot", "category": "Integração", "is_enabled": false, "updated_at": "2026-06-21T22:17:40.624184+00:00"}, {"key": "page_aquecimento", "name": "Aquecimento de Chip", "category": "Página", "is_enabled": true, "updated_at": "2026-06-18T02:54:14.529981+00:00"}, {"key": "page_automacao", "name": "Automação (Disparos)", "category": "Página", "is_enabled": true, "updated_at": "2026-06-18T02:54:14.529981+00:00"}, {"key": "page_clientes", "name": "Clientes", "category": "Página", "is_enabled": true, "updated_at": "2026-06-18T02:54:14.529981+00:00"}, {"key": "page_configuracoes", "name": "Configurações / Instâncias", "category": "Página", "is_enabled": true, "updated_at": "2026-06-18T02:54:14.529981+00:00"}, {"key": "page_desenvolvedor", "name": "API / Desenvolvedor", "category": "Página", "is_enabled": false, "updated_at": "2026-06-18T02:54:14.529981+00:00"}, {"key": "page_fila", "name": "Fila de Envios", "category": "Página", "is_enabled": true, "updated_at": "2026-06-18T02:54:14.529981+00:00"}, {"key": "page_financeiro", "name": "Financeiro", "category": "Página", "is_enabled": true, "updated_at": "2026-06-18T02:54:14.529981+00:00"}, {"key": "page_integracoes", "name": "Integrações", "category": "Página", "is_enabled": true, "updated_at": "2026-06-18T02:54:14.529981+00:00"}, {"key": "page_integracoes_paineis", "name": "Página - Painéis IPTV", "category": "Página", "is_enabled": false, "updated_at": "2026-06-21T22:17:40.624184+00:00"}, {"key": "page_leads", "name": "Leads", "category": "Página", "is_enabled": true, "updated_at": "2026-06-18T02:54:14.529981+00:00"}, {"key": "page_painel", "name": "Dashboard / Painel", "category": "Página", "is_enabled": true, "updated_at": "2026-06-18T02:54:14.529981+00:00"}, {"key": "page_promocoes", "name": "Promoções", "category": "Página", "is_enabled": true, "updated_at": "2026-06-18T02:54:14.529981+00:00"}, {"key": "page_revendas", "name": "Revendas (White-label)", "category": "Página", "is_enabled": false, "updated_at": "2026-06-18T02:54:14.529981+00:00"}, {"key": "page_servicos", "name": "Serviços", "category": "Página", "is_enabled": true, "updated_at": "2026-06-18T02:54:14.529981+00:00"}, {"key": "page_suporte", "name": "Suporte (Tickets)", "category": "Página", "is_enabled": true, "updated_at": "2026-06-18T02:54:14.529981+00:00"}]$gestormaster_features$::jsonb
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.saas_plan_catalog
SELECT *
FROM jsonb_populate_recordset(
  NULL::public.saas_plan_catalog,
  $gestormaster_plans$[{"plan": "master", "is_public": true, "created_at": "2026-07-12T22:11:14.093121+00:00", "sort_order": 3, "updated_at": "2026-07-13T01:12:27.545624+00:00", "description": "Inteligência e recursos avançados para operações de alto volume.", "capabilities": ["dashboard", "clients", "services", "finance_basic", "finance_advanced", "pix_manual", "pix_automatic", "promotions", "settings", "support", "automation_basic", "automation", "intelligent_collections", "self_service", "analytics", "client_portal", "leads", "warmup", "iptv_panels", "integrations", "intelligence", "resellers", "developer_api"], "client_limit": null, "display_name": "Master", "is_purchasable": true, "monthly_price_cents": 4000, "whatsapp_instance_limit": 3}, {"plan": "pro", "is_public": true, "created_at": "2026-07-12T22:11:14.093121+00:00", "sort_order": 2, "updated_at": "2026-07-13T01:12:27.545624+00:00", "description": "Automação, cobrança inteligente e crescimento para operações em escala.", "capabilities": ["dashboard", "clients", "services", "finance_basic", "finance_advanced", "pix_manual", "pix_automatic", "promotions", "settings", "support", "automation_basic", "automation", "intelligent_collections", "self_service", "analytics", "client_portal", "leads", "warmup", "iptv_panels", "integrations"], "client_limit": 500, "display_name": "Pro", "is_purchasable": true, "monthly_price_cents": 3000, "whatsapp_instance_limit": 2}, {"plan": "starter", "is_public": true, "created_at": "2026-07-12T22:11:14.093121+00:00", "sort_order": 1, "updated_at": "2026-07-13T01:12:27.545624+00:00", "description": "Organização essencial para operações que estão começando.", "capabilities": ["dashboard", "clients", "services", "finance_basic", "pix_manual", "promotions", "settings", "support", "automation_basic"], "client_limit": 100, "display_name": "Starter", "is_purchasable": true, "monthly_price_cents": 2000, "whatsapp_instance_limit": 1}]$gestormaster_plans$::jsonb
)
ON CONFLICT (plan) DO NOTHING;


COMMIT;

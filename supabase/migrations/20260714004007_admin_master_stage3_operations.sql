-- Admin Master Etapa 3: telemetria global e incidentes internos.
-- Estas tabelas nunca são consultadas diretamente pelo navegador.

create table if not exists public.admin_operational_heartbeats (
  component text primary key,
  status text not null default 'healthy',
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  version text,
  metrics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint admin_operational_heartbeats_component_length
    check (char_length(component) between 2 and 80),
  constraint admin_operational_heartbeats_status
    check (status in ('healthy', 'degraded')),
  constraint admin_operational_heartbeats_metrics_object
    check (jsonb_typeof(metrics) = 'object')
);

create table if not exists public.admin_incidents (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  source text not null,
  severity text not null,
  status text not null default 'open',
  title text not null,
  summary text not null,
  evidence jsonb not null default '{}'::jsonb,
  occurrence_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_incidents_fingerprint_length
    check (char_length(fingerprint) between 3 and 180),
  constraint admin_incidents_source_length
    check (char_length(source) between 2 and 80),
  constraint admin_incidents_severity
    check (severity in ('warning', 'critical')),
  constraint admin_incidents_status
    check (status in ('open', 'acknowledged', 'resolved')),
  constraint admin_incidents_title_length
    check (char_length(title) between 3 and 160),
  constraint admin_incidents_summary_length
    check (char_length(summary) between 3 and 1000),
  constraint admin_incidents_evidence_object
    check (jsonb_typeof(evidence) = 'object'),
  constraint admin_incidents_occurrence_count
    check (occurrence_count > 0)
);

create index if not exists admin_operational_heartbeats_seen_idx
  on public.admin_operational_heartbeats (last_seen_at desc);

create index if not exists admin_incidents_active_idx
  on public.admin_incidents (severity, last_seen_at desc)
  where status <> 'resolved';

create index if not exists admin_incidents_history_idx
  on public.admin_incidents (last_seen_at desc, id);

alter table public.admin_operational_heartbeats enable row level security;
alter table public.admin_incidents enable row level security;

revoke all on table public.admin_operational_heartbeats from public, anon, authenticated;
revoke all on table public.admin_incidents from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_operational_heartbeats to service_role;
grant select, insert, update, delete on table public.admin_incidents to service_role;

comment on table public.admin_operational_heartbeats is
  'Heartbeats globais de componentes internos, acessíveis somente pelo servidor.';
comment on table public.admin_incidents is
  'Incidentes operacionais do Admin Master, acessíveis somente pelo servidor.';

-- Motor de envio: papel por número, identidade da execução em massa e trava
-- contra envio duplicado.
--
-- Contexto: em 10/09/2026 uma campanha de 102 mensagens saiu para 68 pessoas —
-- 34 eram repetição, porque a base tem o mesmo telefone cadastrado como vários
-- leads e a rota só deduplicava por `lead_id`. Além disso não havia como parar
-- uma campanha já enfileirada: o botão "PARAR CAMPANHA" apenas abortava a
-- requisição HTTP, e os jobs seguiam saindo com o atraso programado.
--
-- Três mudanças, nesta ordem de dependência:
--   1. `allow_mass` em evolution_instances — qual número pode ser usado em massa
--   2. `mass_campaign_runs` — a execução passa a ter identidade, o que permite
--      pausar/parar e saber que um número está ocupado com massa
--   3. `alert_history.mass_run_id` + índice único por (run, telefone) — o banco
--      passa a garantir uma mensagem por pessoa por campanha

-- ---------------------------------------------------------------------------
-- 1. Papel do número
-- ---------------------------------------------------------------------------
ALTER TABLE public.evolution_instances
  ADD COLUMN IF NOT EXISTS allow_mass boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.evolution_instances.allow_mass IS
  'Número liberado para disparo em massa. O principal (is_primary) fica reservado a lembretes e alertas; quando um número está em uma campanha em massa ativa ele não é usado para lembrete.';

-- Backfill preservando o comportamento atual: todo número que não é o principal
-- já podia ser escolhido para massa, então continua podendo. Sem isto, a
-- primeira campanha depois do deploy falharia por não achar número liberado.
UPDATE public.evolution_instances
   SET allow_mass = true
 WHERE COALESCE(is_primary, false) = false
   AND allow_mass = false;

-- ---------------------------------------------------------------------------
-- 2. Identidade da execução em massa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mass_campaign_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- running: jobs podem sair | paused: jobs reagendam e esperam
  -- stopped: operador interrompeu, jobs restantes são cancelados sem enviar
  -- completed: nada mais pendente
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'paused', 'stopped', 'completed')),
  instance_names text[] NOT NULL DEFAULT '{}',
  total_messages integer NOT NULL DEFAULT 0,
  skipped_messages integer NOT NULL DEFAULT 0,
  stop_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

COMMENT ON TABLE public.mass_campaign_runs IS
  'Uma execução de campanha em massa. Diferente de public.campaigns, que guarda o template salvo (nome, mensagem, instâncias escolhidas): esta linha é a execução em si, e é o que permite pausar/parar uma campanha já enfileirada e saber que um número está ocupado com massa.';

-- Consulta quente: "esta organização tem campanha ativa?" e "quais números
-- estão ocupados?" — ambas rodam por mensagem no worker.
CREATE INDEX IF NOT EXISTS mass_campaign_runs_org_status_idx
  ON public.mass_campaign_runs (organization_id, status);

CREATE INDEX IF NOT EXISTS mass_campaign_runs_active_idx
  ON public.mass_campaign_runs (organization_id)
  WHERE status IN ('running', 'paused');

ALTER TABLE public.mass_campaign_runs ENABLE ROW LEVEL SECURITY;

-- Uma policy por operação, por organização — mesmo modelo das outras tabelas
-- transacionais (ver SEGURANCA_ACOES.md). O worker escreve com service role e
-- não passa por RLS.
DROP POLICY IF EXISTS tenant_isolation_mass_campaign_runs_select ON public.mass_campaign_runs;
DROP POLICY IF EXISTS tenant_isolation_mass_campaign_runs_insert ON public.mass_campaign_runs;
DROP POLICY IF EXISTS tenant_isolation_mass_campaign_runs_update ON public.mass_campaign_runs;

CREATE POLICY tenant_isolation_mass_campaign_runs_select
  ON public.mass_campaign_runs FOR SELECT TO authenticated
  USING (organization_id IN (SELECT user_orgs()));

CREATE POLICY tenant_isolation_mass_campaign_runs_insert
  ON public.mass_campaign_runs FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT user_orgs()));

CREATE POLICY tenant_isolation_mass_campaign_runs_update
  ON public.mass_campaign_runs FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT user_orgs()))
  WITH CHECK (organization_id IN (SELECT user_orgs()));

-- Deliberadamente sem policy de DELETE: histórico de execução não se apaga pela
-- interface; uma campanha encerrada fica como 'stopped' ou 'completed'.

-- ---------------------------------------------------------------------------
-- 3. Vínculo e trava contra envio duplicado
-- ---------------------------------------------------------------------------
ALTER TABLE public.alert_history
  ADD COLUMN IF NOT EXISTS mass_run_id uuid
    REFERENCES public.mass_campaign_runs(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.alert_history.mass_run_id IS
  'Execução de campanha em massa que originou esta mensagem. NULL para lembrete, alerta, cobrança e reenvio manual.';

CREATE INDEX IF NOT EXISTS alert_history_mass_run_idx
  ON public.alert_history (mass_run_id)
  WHERE mass_run_id IS NOT NULL;

-- A garantia de verdade contra envio duplicado: uma mensagem por telefone por
-- campanha, imposta pelo banco. Mesmo que a rota erre a deduplicação, ou que
-- uma retentativa reinsira, o índice recusa a segunda linha do mesmo número na
-- mesma execução.
CREATE UNIQUE INDEX IF NOT EXISTS alert_history_mass_run_phone_uidx
  ON public.alert_history (mass_run_id, phone)
  WHERE mass_run_id IS NOT NULL AND phone IS NOT NULL;

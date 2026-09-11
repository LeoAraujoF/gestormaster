-- Limite diário de mensagens passa a ser do plano, não um padrão invisível.
--
-- Contexto: o teto de 80 mensagens/dia por número entrou em 17/08/2026
-- (20260817120000_whatsapp_safety_controls.sql) como DEFAULT da coluna
-- evolution_instances.daily_message_limit. Nunca houve controle na interface
-- para vê-lo ou alterá-lo — nenhum lugar do app grava essa coluna, só lê. Em
-- 10/09/2026 esse teto invisível barrou os lembretes das 18h05 e as
-- boas-vindas de 5 clientes novos, e não havia como o operador descobrir o
-- motivo pela tela.
--
-- Agora o teto é característica do plano, na mesma convenção que client_limit
-- já usa nesta tabela: NULL significa ilimitado.

ALTER TABLE public.saas_plan_catalog
  ADD COLUMN IF NOT EXISTS daily_message_limit integer;

COMMENT ON COLUMN public.saas_plan_catalog.daily_message_limit IS
  'Limite de mensagens por dia por número de WhatsApp. NULL = ilimitado (mesma convenção de client_limit). O intervalo mínimo entre mensagens e a pausa por rajada continuam valendo mesmo quando ilimitado — são eles que seguram o ritmo.';

ALTER TABLE public.saas_plan_catalog
  DROP CONSTRAINT IF EXISTS saas_plan_catalog_daily_message_limit_check,
  ADD CONSTRAINT saas_plan_catalog_daily_message_limit_check
    CHECK (daily_message_limit IS NULL OR daily_message_limit BETWEEN 1 AND 10000);

-- Starter mantém o teto que já valia na prática (80), para não mudar o
-- comportamento de quem está no plano básico. Pro sobe para 300, coerente com
-- o salto de 100 para 500 clientes. Master fica ilimitado.
UPDATE public.saas_plan_catalog SET daily_message_limit = 80   WHERE plan = 'starter';
UPDATE public.saas_plan_catalog SET daily_message_limit = 300  WHERE plan = 'pro';
UPDATE public.saas_plan_catalog SET daily_message_limit = NULL WHERE plan = 'master';

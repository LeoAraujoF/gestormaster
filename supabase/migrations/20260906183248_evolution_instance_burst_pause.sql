-- Pausa por rajada: além do intervalo entre mensagens (min_delay/max_delay),
-- permite configurar "a cada N mensagens, pausar por M minutos" — o mesmo
-- padrão de disparo em massa (pauseCount/pauseDurationMinutes) já usado em
-- campanhas de leads, agora disponível por instância para qualquer envio.
-- 0 em qualquer um dos dois campos desativa a pausa por rajada.

ALTER TABLE public.evolution_instances
  ADD COLUMN IF NOT EXISTS burst_message_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS burst_pause_minutes integer NOT NULL DEFAULT 0;

ALTER TABLE public.evolution_instances
  DROP CONSTRAINT IF EXISTS evolution_instances_burst_message_count_check,
  ADD CONSTRAINT evolution_instances_burst_message_count_check
    CHECK (burst_message_count BETWEEN 0 AND 2000),
  DROP CONSTRAINT IF EXISTS evolution_instances_burst_pause_minutes_check,
  ADD CONSTRAINT evolution_instances_burst_pause_minutes_check
    CHECK (burst_pause_minutes BETWEEN 0 AND 240);

COMMENT ON COLUMN public.evolution_instances.burst_message_count IS 'A cada quantas mensagens aplicar uma pausa longa. 0 desativa.';
COMMENT ON COLUMN public.evolution_instances.burst_pause_minutes IS 'Duração da pausa longa após burst_message_count mensagens. 0 desativa.';

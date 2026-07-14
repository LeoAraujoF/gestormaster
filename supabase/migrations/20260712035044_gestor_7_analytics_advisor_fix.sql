-- Fase 7: indice recomendado pelo advisor para a FK de auditoria.
CREATE INDEX IF NOT EXISTS analytics_scenarios_created_by_idx
  ON public.analytics_scenarios (created_by)
  WHERE created_by IS NOT NULL;

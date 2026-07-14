UPDATE public.saas_plan_catalog
SET description = CASE plan
  WHEN 'starter' THEN 'Organização essencial para operações que estão começando.'
  WHEN 'pro' THEN 'Automação, cobrança inteligente e crescimento para operações em escala.'
  WHEN 'master' THEN 'Inteligência e recursos avançados para operações de alto volume.'
END,
updated_at = now()
WHERE plan IN ('starter', 'pro', 'master');

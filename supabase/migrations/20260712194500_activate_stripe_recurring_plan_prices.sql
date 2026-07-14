UPDATE public.saas_plan_catalog
SET monthly_price_cents = CASE plan
  WHEN 'starter' THEN 2000
  WHEN 'pro' THEN 3000
  WHEN 'master' THEN 4000
END,
is_purchasable = true,
updated_at = now()
WHERE plan IN ('starter', 'pro', 'master');

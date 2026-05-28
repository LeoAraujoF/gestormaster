-- ==============================================================================
-- MIGRATION: Atualização das Funções RPC (Gráficos do Dashboard)
-- DESCRIÇÃO: Refatora as funções get_dashboard_metrics e get_monthly_growth
--            para calcular as métricas baseadas no organization_id em vez de
--            user_id, permitindo que todos os sócios vejam os mesmos números.
-- ==============================================================================

-- 1. Atualização do get_dashboard_metrics
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics()
RETURNS TABLE (
  total_active_clients BIGINT,
  total_inactive_clients BIGINT,
  total_pending_clients BIGINT,
  total_clients BIGINT,
  monthly_revenue NUMERIC,
  monthly_costs NUMERIC,
  monthly_net_revenue NUMERIC
) AS $$
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
    client_stats.total::BIGINT,
    client_stats.revenue::NUMERIC,
    service_stats.costs::NUMERIC,
    (client_stats.revenue - service_stats.costs)::NUMERIC
  FROM client_stats, service_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Atualização do get_monthly_growth
CREATE OR REPLACE FUNCTION public.get_monthly_growth()
RETURNS TABLE (
  month TEXT,
  total_clients BIGINT,
  new_clients BIGINT
) AS $$
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
      COALESCE(md.new_clients_count, 0) AS new_clients,
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
    month_name AS month,
    total_clients_cumulative::BIGINT AS total_clients,
    new_clients::BIGINT
  FROM running_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

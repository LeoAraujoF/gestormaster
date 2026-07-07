-- MIGRATION: 05_advanced_clients_rpc.sql

-- 1. Criar ou substituir RPC de KPIs da Carteira
CREATE OR REPLACE FUNCTION public.get_clients_management_metrics()
RETURNS JSONB AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Criar View para Clientes Enriquecidos
CREATE OR REPLACE VIEW public.vw_enriched_clients AS
SELECT 
    c.id,
    c.organization_id,
    c.user_id,
    c.name,
    c.phone,
    c.plan_value,
    c.status,
    c.due_date,
    c.created_at,
    (SELECT MAX(created_at) FROM public.payments p WHERE p.client_id = c.id) as last_payment_date,
    (SELECT COUNT(*) FROM public.payments p WHERE p.client_id = c.id) as renewal_count,
    (SELECT MAX(sent_at) FROM public.alert_history ah WHERE ah.client_id = c.id) as last_charge_sent_date,
    (SELECT status FROM public.alert_history ah WHERE ah.client_id = c.id ORDER BY sent_at DESC LIMIT 1) as last_communication_status,
    (CURRENT_DATE - c.created_at::date) as days_as_client,
    -- Fetching the services related to the client
    COALESCE(
        (SELECT jsonb_agg(
            jsonb_build_object(
              'service_id', cs.service_id, 
              'services', jsonb_build_object('id', s.id, 'name', s.name, 'cost', s.cost)
            )
          )
         FROM public.client_services cs
         JOIN public.services s ON cs.service_id = s.id
         WHERE cs.client_id = c.id), '[]'::jsonb
    ) as client_services
FROM public.clients c;

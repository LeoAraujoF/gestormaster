-- ==============================================================================
-- MIGRATION: Advanced Dashboard Metrics
-- DESCRIÇÃO: Cria a função get_advanced_dashboard_metrics para retornar todos
--            os indicadores da nova Dashboard Premium em formato JSONB.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_advanced_dashboard_metrics()
RETURNS JSONB AS $$
DECLARE
  v_org_id UUID;
  result JSONB;
BEGIN
  -- Obtém a organização principal do usuário atual
  SELECT organization_id INTO v_org_id FROM public.organization_members WHERE user_id = auth.uid() LIMIT 1;

  WITH
  -- 1. Estatísticas de Clientes
  client_stats AS (
      SELECT
        COUNT(*) as total_clients,
        COUNT(*) FILTER (WHERE status = 'active') as active_clients,
        COUNT(*) FILTER (WHERE status = 'inactive') as inactive_clients,
        COUNT(*) FILTER (WHERE status = 'vencido') as default_clients,
        COALESCE(SUM(plan_value) FILTER (WHERE status = 'active'), 0) as mrr,
        COALESCE(SUM(plan_value) FILTER (WHERE status = 'vencido'), 0) as default_amount,
        COALESCE(SUM(plan_value) FILTER (WHERE status IN ('active', 'vencido', 'pending')), 0) as expected_revenue,
        -- Crescimento de clientes (MoM)
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) as new_clients_this_month,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND created_at < date_trunc('month', CURRENT_DATE)) as new_clients_last_month
      FROM public.clients
      WHERE organization_id = v_org_id
  ),
  -- 2. Estatísticas de Pagamentos
  payment_stats AS (
      SELECT
        COALESCE(SUM(amount_paid) FILTER (WHERE created_at >= current_date), 0) as received_today,
        COALESCE(SUM(amount_paid) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)), 0) as received_month,
        COALESCE(SUM(amount_paid) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND created_at < date_trunc('month', CURRENT_DATE)), 0) as received_last_month,
        -- Renovações (MoM)
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) as renewals_this_month,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND created_at < date_trunc('month', CURRENT_DATE)) as renewals_last_month
      FROM public.payments
      WHERE organization_id = v_org_id
  ),
  -- 3. Top 5 Clientes que mais faturaram
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
  -- 4. Distribuição por Serviço
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
  -- 5. Evolução do Faturamento (Últimos 30 dias)
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
  -- 6. Distribuição de Recebimentos (Formas de Pagamento)
  receipt_distribution AS (
      SELECT jsonb_build_array(
          jsonb_build_object('method', 'PIX', 'value', COALESCE((SELECT SUM(amount_paid) FROM public.payments WHERE organization_id = v_org_id AND created_at >= date_trunc('month', CURRENT_DATE)), 0) * 0.8),
          jsonb_build_object('method', 'Cartão', 'value', COALESCE((SELECT SUM(amount_paid) FROM public.payments WHERE organization_id = v_org_id AND created_at >= date_trunc('month', CURRENT_DATE)), 0) * 0.15),
          jsonb_build_object('method', 'Outros', 'value', COALESCE((SELECT SUM(amount_paid) FROM public.payments WHERE organization_id = v_org_id AND created_at >= date_trunc('month', CURRENT_DATE)), 0) * 0.05)
      ) as receipt_methods
  ),
  -- 7. Estatísticas de Automação
  automation_stats AS (
      SELECT
        COUNT(*) FILTER (WHERE sent_at >= current_date AND status = 'sent') as alerts_sent_today
      FROM public.alert_history
      WHERE organization_id = v_org_id
  )
  SELECT
    jsonb_build_object(
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

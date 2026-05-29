-- ==============================================================================
-- MIGRATION: Tenant Isolation (RLS & Triggers)
-- DESCRIÇÃO: Ativa RLS em todas as tabelas transacionais e cria triggers para
--            injetar o organization_id automaticamente em novos registros.
--            Isso elimina a necessidade de reescrever todo o Front-end!
-- ==============================================================================

-- 1. FUNÇÃO: Auto-injetar organization_id em novos registros (INSERT)
CREATE OR REPLACE FUNCTION public.set_default_organization_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    -- Pega a organização primária do usuário que está fazendo o INSERT
    SELECT organization_id INTO NEW.organization_id 
    FROM public.organization_members 
    WHERE user_id = auth.uid() 
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Aplicar o Trigger em todas as tabelas transacionais
DROP TRIGGER IF EXISTS trg_set_org_id_clients ON public.clients;
CREATE TRIGGER trg_set_org_id_clients BEFORE INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_default_organization_id();

DROP TRIGGER IF EXISTS trg_set_org_id_services ON public.services;
CREATE TRIGGER trg_set_org_id_services BEFORE INSERT ON public.services FOR EACH ROW EXECUTE FUNCTION public.set_default_organization_id();

DROP TRIGGER IF EXISTS trg_set_org_id_promotions ON public.promotions;
CREATE TRIGGER trg_set_org_id_promotions BEFORE INSERT ON public.promotions FOR EACH ROW EXECUTE FUNCTION public.set_default_organization_id();

DROP TRIGGER IF EXISTS trg_set_org_id_automations ON public.automations;
CREATE TRIGGER trg_set_org_id_automations BEFORE INSERT ON public.automations FOR EACH ROW EXECUTE FUNCTION public.set_default_organization_id();

DROP TRIGGER IF EXISTS trg_set_org_id_alert_history ON public.alert_history;
CREATE TRIGGER trg_set_org_id_alert_history BEFORE INSERT ON public.alert_history FOR EACH ROW EXECUTE FUNCTION public.set_default_organization_id();

DROP TRIGGER IF EXISTS trg_set_org_id_payments ON public.payments;
CREATE TRIGGER trg_set_org_id_payments BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_default_organization_id();

DROP TRIGGER IF EXISTS trg_set_org_id_evolution_instances ON public.evolution_instances;
CREATE TRIGGER trg_set_org_id_evolution_instances BEFORE INSERT ON public.evolution_instances FOR EACH ROW EXECUTE FUNCTION public.set_default_organization_id();

-- 3. ATIVAR RLS EM TODAS AS TABELAS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_services ENABLE ROW LEVEL SECURITY; -- Tabela pivô

-- 4. CRIAR POLÍTICAS DE ISOLAMENTO (TENANT ISOLATION)
-- Regra: O usuário só pode fazer SELECT, INSERT, UPDATE ou DELETE se o organization_id
-- do registro pertencer a uma organização na qual ele é membro.

CREATE OR REPLACE FUNCTION auth.user_orgs()
RETURNS SETOF UUID AS $$
  SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Clients
CREATE POLICY "tenant_isolation_clients" ON public.clients FOR ALL 
USING (organization_id IN (SELECT auth.user_orgs()));

-- Services
CREATE POLICY "tenant_isolation_services" ON public.services FOR ALL 
USING (organization_id IN (SELECT auth.user_orgs()));

-- Promotions
CREATE POLICY "tenant_isolation_promotions" ON public.promotions FOR ALL 
USING (organization_id IN (SELECT auth.user_orgs()));

-- Automations
CREATE POLICY "tenant_isolation_automations" ON public.automations FOR ALL 
USING (organization_id IN (SELECT auth.user_orgs()));

-- Alert History
CREATE POLICY "tenant_isolation_alert_history" ON public.alert_history FOR ALL 
USING (organization_id IN (SELECT auth.user_orgs()));

-- Payments
CREATE POLICY "tenant_isolation_payments" ON public.payments FOR ALL 
USING (organization_id IN (SELECT auth.user_orgs()));

-- Client_Services (Pivô) - Usa o cliente como âncora
CREATE POLICY "tenant_isolation_client_services" ON public.client_services FOR ALL 
USING (client_id IN (SELECT id FROM public.clients WHERE organization_id IN (SELECT auth.user_orgs())));

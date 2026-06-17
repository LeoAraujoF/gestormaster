-- ==========================================
-- SCRIPT DE SEGURANÇA (RLS) - GESTOR MASTER
-- ==========================================
-- Este script habilita a segurança de linha (Row Level Security) 
-- para garantir que cada usuário só enxergue os SEUS PRÓPRIOS dados.

-- 1. Habilitando o RLS em todas as tabelas sensíveis
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_requests ENABLE ROW LEVEL SECURITY;

-- Nota: client_services geralmente herda segurança via views ou tem user_id próprio.
-- Se client_services tiver a coluna user_id, descomente a linha abaixo:
-- ALTER TABLE public.client_services ENABLE ROW LEVEL SECURITY;


-- 2. Criando Políticas (Policies) - Acesso Total (CRUD) apenas para o próprio dono (user_id = auth.uid())

-- Tabela Clientes
DROP POLICY IF EXISTS "Acesso apenas aos proprios clientes" ON public.clients;
CREATE POLICY "Acesso apenas aos proprios clientes" ON public.clients 
FOR ALL USING (auth.uid() = user_id);

-- Tabela Automations
DROP POLICY IF EXISTS "Acesso apenas as proprias automacoes" ON public.automations;
CREATE POLICY "Acesso apenas as proprias automacoes" ON public.automations 
FOR ALL USING (auth.uid() = user_id);

-- Tabela Evolution Instances (WhatsApp)
DROP POLICY IF EXISTS "Acesso apenas as proprias instancias" ON public.evolution_instances;
CREATE POLICY "Acesso apenas as proprias instancias" ON public.evolution_instances 
FOR ALL USING (auth.uid() = user_id);

-- Tabela Payments (Pagamentos)
DROP POLICY IF EXISTS "Acesso apenas aos proprios pagamentos" ON public.payments;
CREATE POLICY "Acesso apenas aos proprios pagamentos" ON public.payments 
FOR ALL USING (auth.uid() = user_id);

-- Tabela Services
DROP POLICY IF EXISTS "Acesso apenas aos proprios servicos" ON public.services;
CREATE POLICY "Acesso apenas aos proprios servicos" ON public.services 
FOR ALL USING (auth.uid() = user_id);

-- Tabela Promotions
DROP POLICY IF EXISTS "Acesso apenas as proprias promocoes" ON public.promotions;
CREATE POLICY "Acesso apenas as proprias promocoes" ON public.promotions 
FOR ALL USING (auth.uid() = user_id);

-- Tabela Alert History (Histórico de Disparos)
DROP POLICY IF EXISTS "Acesso apenas ao proprio historico" ON public.alert_history;
CREATE POLICY "Acesso apenas ao proprio historico" ON public.alert_history 
FOR ALL USING (auth.uid() = user_id);

-- Tabela Resellers (Revendedores)
DROP POLICY IF EXISTS "Acesso apenas as proprias revendas" ON public.resellers;
CREATE POLICY "Acesso apenas as proprias revendas" ON public.resellers 
FOR ALL USING (auth.uid() = user_id);

-- Tabela Credit Requests
DROP POLICY IF EXISTS "Acesso apenas aos proprios creditos" ON public.credit_requests;
CREATE POLICY "Acesso apenas aos proprios creditos" ON public.credit_requests 
FOR ALL USING (auth.uid() = user_id);

-- ==========================================
-- REGRA DE ADMINISTRAÇÃO (Opcional)
-- Se você possui um e-mail Master/Admin (ex: suporte@gestormaster.com),
-- você pode criar uma política global Bypass para você depois.
-- ==========================================

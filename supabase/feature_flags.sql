-- 1. Create the system_features table
CREATE TABLE IF NOT EXISTS public.system_features (
    key text PRIMARY KEY,
    name text NOT NULL,
    category text NOT NULL,
    is_enabled boolean DEFAULT true,
    updated_at timestamp with time zone DEFAULT now()
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.system_features ENABLE ROW LEVEL SECURITY;

-- 3. Create a policy that allows everyone to read the feature flags
CREATE POLICY "Allow public read access to system_features" 
ON public.system_features FOR SELECT USING (true);

-- 4. Create a policy that allows authenticated users (Admins) to update
CREATE POLICY "Allow authenticated update system_features" 
ON public.system_features FOR UPDATE USING (auth.role() = 'authenticated');

-- 5. Insert the initial rows (22 feature flags)
INSERT INTO public.system_features (key, name, category, is_enabled) VALUES
-- PAGES
('page_painel', 'Dashboard / Painel', 'Página', true),
('page_clientes', 'Clientes', 'Página', true),
('page_leads', 'Leads', 'Página', true),
('page_automacao', 'Automação (Disparos)', 'Página', true),
('page_fila', 'Fila de Envios', 'Página', true),
('page_financeiro', 'Financeiro', 'Página', true),
('page_promocoes', 'Promoções', 'Página', true),
('page_servicos', 'Serviços', 'Página', true),
('page_aquecimento', 'Aquecimento de Chip', 'Página', true),
('page_configuracoes', 'Configurações / Instâncias', 'Página', true),
('page_integracoes', 'Integrações', 'Página', true),
('page_desenvolvedor', 'API / Desenvolvedor', 'Página', true),
('page_suporte', 'Suporte (Tickets)', 'Página', true),
('page_revendas', 'Revendas (White-label)', 'Página', true),

-- ACTIONS
('action_create_client', 'Criar Novo Cliente', 'Ação', true),
('action_start_campaign', 'Iniciar Disparo em Massa', 'Ação', true),
('action_create_promo', 'Criar Nova Promoção', 'Ação', true),
('action_create_service', 'Criar Novo Serviço', 'Ação', true),
('action_pix_rapido', 'Gerar Pix Rápido', 'Ação', true),
('action_connect_instance', 'Conectar Nova Instância WhatsApp', 'Ação', true),
('action_create_api_key', 'Criar Chave API', 'Ação', true),
('action_open_ticket', 'Abrir Chamado de Suporte', 'Ação', true)
ON CONFLICT (key) DO NOTHING;

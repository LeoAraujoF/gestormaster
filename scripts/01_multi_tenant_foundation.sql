-- ==============================================================================
-- MIGRATION: Multi-tenant Foundation & Audit Logs
-- DESCRIÇÃO: Cria a estrutura de "Workspaces" (organizations), sistema de
--            auditoria (audit_logs) e adapta as tabelas transacionais existentes.
-- ==============================================================================

-- 1. Tabela de Organizações (Tenants)
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- 2. Tabela de Membros da Organização (RBAC)
CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
    UNIQUE(organization_id, user_id)
);

-- 3. Tabela de Logs de Auditoria (Audit Logs)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- Ex: 'login', 'create_instance', 'delete_client'
    resource TEXT NOT NULL, -- Ex: 'evolution_instance', 'client'
    resource_id TEXT, -- ID opcional do registro alterado
    details JSONB, -- Payload adicional
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- ==============================================================================
-- ADICIONANDO COLUNA ORGANIZATION_ID NAS TABELAS EXISTENTES
-- ==============================================================================
-- Nota: Inicialmente nulas para não quebrar dados legados. Em um script 
-- de migração real com dados em produção, popularíamos via script.

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.alert_history ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.evolution_instances ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- ==============================================================================
-- INDEXES DE PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_id ON public.audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_clients_org_id ON public.clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_evolution_instances_org_id ON public.evolution_instances(organization_id);

-- ==============================================================================
-- ATIVANDO RLS (Row Level Security)
-- ==============================================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Exemplo de Policy para Organizações: Um usuário só pode ver as orgs das quais é membro
CREATE POLICY "Users can view their own organizations" 
    ON public.organizations 
    FOR SELECT 
    USING (id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

-- Exemplo de Policy para Evolution Instances: Usuário só pode acessar instâncias da sua org
-- Nota: Será necessário refatorar o app inteiro para usar essa estrutura, 
-- por enquanto deixamos o acesso via user_id também liberado para não quebrar o MVP atual.
CREATE POLICY "Users can access instances from their org" 
    ON public.evolution_instances 
    FOR ALL 
    USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()) OR user_id = auth.uid());

-- Função auxiliar para o Supabase RLS no futuro
-- create or replace function auth.user_organizations()
-- returns setof uuid as $$
--   select organization_id from public.organization_members where user_id = auth.uid();
-- $$ language sql security definer;

-- ==============================================================================
-- MIGRATION: Backfill de Organizações e Triggers de Cadastro
-- DESCRIÇÃO: Cria automaticamente uma "Organização Pessoal" para os usuários
--            que já existem e garante que novos cadastros ganhem uma organização.
-- ==============================================================================

-- 1. FUNÇÃO: Criar organização para novos usuários
CREATE OR REPLACE FUNCTION public.handle_new_user_organization() 
RETURNS TRIGGER AS $$
DECLARE
    new_org_id UUID;
BEGIN
    -- 1. Cria a organização
    INSERT INTO public.organizations (name)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name', 'Minha Organização') || ' (Org)')
    RETURNING id INTO new_org_id;

    -- 2. Adiciona o usuário como owner
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (new_org_id, NEW.id, 'owner');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. TRIGGER: Dispara a função sempre que um novo usuário for criado no auth.users
DROP TRIGGER IF EXISTS on_auth_user_created_org ON auth.users;
CREATE TRIGGER on_auth_user_created_org
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_organization();

-- 3. SCRIPT DE BACKFILL: Para usuários antigos que já estão no banco
DO $$
DECLARE
    r RECORD;
    new_org_id UUID;
BEGIN
    FOR r IN SELECT id, raw_user_meta_data FROM auth.users WHERE id NOT IN (SELECT user_id FROM public.organization_members) LOOP
        
        -- Cria a organização
        INSERT INTO public.organizations (name)
        VALUES (COALESCE(r.raw_user_meta_data->>'full_name', 'Organização Legada') || ' (Org)')
        RETURNING id INTO new_org_id;

        -- Vincula o usuário
        INSERT INTO public.organization_members (organization_id, user_id, role)
        VALUES (new_org_id, r.id, 'owner');

        -- Atualiza os registros legados deste usuário para apontar para a nova organização
        UPDATE public.clients SET organization_id = new_org_id WHERE user_id = r.id;
        UPDATE public.services SET organization_id = new_org_id WHERE user_id = r.id;
        UPDATE public.promotions SET organization_id = new_org_id WHERE user_id = r.id;
        UPDATE public.automations SET organization_id = new_org_id WHERE user_id = r.id;
        UPDATE public.alert_history SET organization_id = new_org_id WHERE user_id = r.id;
        UPDATE public.evolution_instances SET organization_id = new_org_id WHERE user_id = r.id;
        UPDATE public.payments SET organization_id = new_org_id WHERE user_id = r.id;
        
    END LOOP;
END;
$$;

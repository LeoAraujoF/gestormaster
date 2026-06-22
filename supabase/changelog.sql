-- 1. Tabela de atualizações (Changelog)
CREATE TABLE IF NOT EXISTS public.system_updates (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title text NOT NULL,
    content text NOT NULL,
    type text NOT NULL, -- 'feature', 'bugfix', 'announcement'
    is_published boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 2. Tabela de leituras (Rastreamento de quem leu)
CREATE TABLE IF NOT EXISTS public.user_update_reads (
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    update_id uuid REFERENCES public.system_updates(id) ON DELETE CASCADE,
    read_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (user_id, update_id)
);

-- 3. Habilitar RLS
ALTER TABLE public.system_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_update_reads ENABLE ROW LEVEL SECURITY;

-- 4. Políticas para system_updates
-- Todos podem ler
CREATE POLICY "Allow public read access to system_updates" 
ON public.system_updates FOR SELECT USING (true);

-- Apenas admins (ou role authenticated) podem inserir/atualizar
CREATE POLICY "Allow authenticated insert system_updates" 
ON public.system_updates FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated update system_updates" 
ON public.system_updates FOR UPDATE USING (auth.role() = 'authenticated');

-- 5. Políticas para user_update_reads
-- Usuário só pode ver suas próprias leituras
CREATE POLICY "Users can view their own reads" 
ON public.user_update_reads FOR SELECT USING (auth.uid() = user_id);

-- Usuário só pode inserir leitura para si mesmo
CREATE POLICY "Users can insert their own reads" 
ON public.user_update_reads FOR INSERT WITH CHECK (auth.uid() = user_id);

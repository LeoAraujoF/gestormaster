-- 1. Remove as politicas antigas (que estao causando o erro 500)
DROP POLICY IF EXISTS "Users can view own integrations" ON integrations;
DROP POLICY IF EXISTS "Users can insert own integrations" ON integrations;
DROP POLICY IF EXISTS "Users can update own integrations" ON integrations;
DROP POLICY IF EXISTS "Users can delete own integrations" ON integrations;

-- 2. Regra de Leitura (Extraindo do JWT ao inves de ler a auth.users)
CREATE POLICY "Users can view own integrations" 
ON integrations FOR SELECT 
USING (
  organization_id = auth.uid() OR 
  organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
);

-- 3. Regra de Insercao
CREATE POLICY "Users can insert own integrations" 
ON integrations FOR INSERT 
WITH CHECK (
  organization_id = auth.uid() OR 
  organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
);

-- 4. Regra de Edicao
CREATE POLICY "Users can update own integrations" 
ON integrations FOR UPDATE 
USING (
  organization_id = auth.uid() OR 
  organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
);

-- 5. Regra de Exclusao
CREATE POLICY "Users can delete own integrations" 
ON integrations FOR DELETE 
USING (
  organization_id = auth.uid() OR 
  organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
);

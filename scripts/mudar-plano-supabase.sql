-- ==============================================================================
-- SCRIPT MANUAL: ALTERAÇÃO DE PLANO DE USUÁRIO (GESTOR MASTER)
-- ==============================================================================
-- Como usar:
-- 1. Abra o painel do Supabase.
-- 2. Vá no menu "SQL Editor" na barra lateral esquerda.
-- 3. Clique em "New Query".
-- 4. Copie o comando desejado abaixo, altere o email, e aperte "Run".

---------------------------------------------------------------------------------
-- OPÇÃO 1: DAR ACESSO PREMIUM (Desbloqueia Múltiplos Chips e Automação Total)
---------------------------------------------------------------------------------
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb), 
  '{plan_name}', 
  '"Premium"' -- ATENÇÃO: As aspas duplas dentro das simples são obrigatórias!
)
WHERE email = 'email_do_cliente@gmail.com';


---------------------------------------------------------------------------------
-- OPÇÃO 2: REBAIXAR PARA PLANO LITE (Modo Básico)
---------------------------------------------------------------------------------
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb), 
  '{plan_name}', 
  '"Lite"'
)
WHERE email = 'email_do_cliente@gmail.com';


---------------------------------------------------------------------------------
-- OPÇÃO 3: CHECAR O PLANO DE UM USUÁRIO ESPECÍFICO
---------------------------------------------------------------------------------
SELECT 
  email, 
  raw_user_meta_data->>'plan_name' as plano_atual,
  created_at
FROM auth.users
WHERE email = 'email_do_cliente@gmail.com';

-- =====================================================================
-- Migração: acessos (usuário/senha) por serviço na tabela client_services
-- Projeto: Gestor Master · relativo ao pedido "usuário e senha por variante"
-- =====================================================================

-- 1) Colunas novas (idempotente) --------------------------------------
ALTER TABLE public.client_services
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS password text;

COMMENT ON COLUMN public.client_services.username IS 'Login opcional do cliente neste serviço/painel';
COMMENT ON COLUMN public.client_services.password IS 'Senha opcional do cliente neste serviço/painel';

-- 2) (Opcional) impedir serviço duplicado no mesmo cliente -------------
--    Só rode se ainda não houver essa constraint. Facilita upsert.
-- ALTER TABLE public.client_services
--   ADD CONSTRAINT client_services_client_service_uniq
--   UNIQUE (client_id, service_id);

-- =====================================================================
-- NOTA DE SEGURANÇA
-- A senha fica em texto plano nesta coluna (mesmo padrão da tabela
-- iptv_accounts do projeto). Garanta que:
--   • a RLS de client_services restrinja SELECT/UPDATE ao dono do cliente;
--   • a coluna password NUNCA seja exposta em selects públicos/logs.
-- Se quiser criptografar em repouso, use pgcrypto:
--   -- UPDATE ... SET password = pgp_sym_encrypt('senha', current_setting('app.enc_key'))
--   -- SELECT pgp_sym_decrypt(password::bytea, current_setting('app.enc_key'))
-- =====================================================================

-- 1. Remove a coluna external_id da tabela de clientes (se ela existir)
ALTER TABLE public.clients DROP COLUMN IF EXISTS external_id;

-- 2. Apaga a tabela inteira de contas iptv (se ela existir)
DROP TABLE IF EXISTS public.iptv_accounts CASCADE;
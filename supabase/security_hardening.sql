-- Endurecimento de segurança: execute uma vez no SQL Editor do Supabase.

-- Links públicos de revendedores passam a ser capacidades aleatórias, em vez
-- de expor registros por um UUID que pode vazar em logs ou referers.
ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS public_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS resellers_public_token_uidx
  ON public.resellers (public_token);

ALTER TABLE public.affiliate_earnings
  ADD COLUMN IF NOT EXISTS source_event_id text;

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_earnings_source_event_uidx
  ON public.affiliate_earnings (source_event_id)
  WHERE source_event_id IS NOT NULL;

-- Deduplicar qualquer evento recebido de provedores de pagamento.
CREATE TABLE IF NOT EXISTS public.webhook_events (
  provider text NOT NULL,
  event_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy para usuários: apenas o service role dos handlers pode acessar.

-- APIs legadas não devem persistir segredos em claro.
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS key_hash text;

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS organization_id uuid;

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

-- Converte chaves legadas em texto puro para hash e torna a coluna antiga
-- inutilizável. As chaves existentes precisam ser recriadas pelos usuários.
UPDATE public.api_keys
SET key_hash = encode(digest(key, 'sha256'), 'hex')
WHERE key_hash IS NULL AND key IS NOT NULL;

ALTER TABLE public.api_keys ALTER COLUMN key DROP NOT NULL;
UPDATE public.api_keys SET key = NULL WHERE key_hash IS NOT NULL;

UPDATE public.api_keys AS api_key
SET organization_id = member.organization_id
FROM public.organization_members AS member
WHERE api_key.organization_id IS NULL
  AND api_key.user_id = member.user_id;

ALTER TABLE public.api_keys ALTER COLUMN user_id DROP NOT NULL;

DROP POLICY IF EXISTS "Usuários podem ver suas próprias chaves" ON public.api_keys;
DROP POLICY IF EXISTS "Usuários podem criar suas próprias chaves" ON public.api_keys;
DROP POLICY IF EXISTS "Usuários podem deletar suas próprias chaves" ON public.api_keys;
DROP POLICY IF EXISTS "Members can manage organization API keys" ON public.api_keys;

CREATE POLICY "Members can manage organization API keys"
  ON public.api_keys
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- RLS do ledger PIX baseado em membership, nunca em user_metadata mutável.
DROP POLICY IF EXISTS "Users can manage own pix_charges" ON public.pix_charges;
CREATE POLICY "Users can manage authorized pix_charges"
  ON public.pix_charges
  FOR ALL
  USING (
    auth.uid() = user_id
    OR organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

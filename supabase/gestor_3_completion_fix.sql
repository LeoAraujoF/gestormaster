-- Fase 3 — correções de conclusão.
-- Execute após gestor_3_intelligent_collections.sql.

ALTER TABLE public.collection_dispatches
  DROP CONSTRAINT IF EXISTS collection_dispatches_status_check;

ALTER TABLE public.collection_dispatches
  ADD CONSTRAINT collection_dispatches_status_check
  CHECK (status IN ('pending', 'processing', 'retryable', 'sent', 'failed', 'cancelled'));

ALTER TABLE public.collection_dispatches
  ADD COLUMN IF NOT EXISTS attempt_count smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_collection_dispatch(
  p_dispatch_id uuid,
  p_is_retry boolean DEFAULT false
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed uuid;
BEGIN
  UPDATE public.collection_dispatches
  SET status = 'processing',
      attempt_count = attempt_count + 1,
      last_attempt_at = now(),
      error_message = NULL,
      updated_at = now()
  WHERE id = p_dispatch_id
    AND (
      status IN ('pending', 'retryable')
      OR (status = 'processing' AND p_is_retry)
    )
  RETURNING id INTO v_claimed;

  RETURN v_claimed IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_collection_dispatch(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_collection_dispatch(uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.initialize_intelligent_collections(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'Organização não encontrada';
  END IF;

  INSERT INTO public.collection_settings (organization_id)
  VALUES (p_organization_id)
  ON CONFLICT (organization_id) DO NOTHING;

  INSERT INTO public.client_tags (organization_id, code, name)
  VALUES
    (p_organization_id, 'vip', 'VIP'),
    (p_organization_id, 'premium', 'Premium')
  ON CONFLICT (organization_id, code) DO NOTHING;

  INSERT INTO public.collection_profiles (organization_id, code, name, min_score, max_score, is_override)
  VALUES
    (p_organization_id, 'excellent', 'Excelente', 80, 100, false),
    (p_organization_id, 'regular', 'Regular', 60, 79, false),
    (p_organization_id, 'attention', 'Atenção', 40, 59, false),
    (p_organization_id, 'high_risk', 'Risco alto', 0, 39, false),
    (p_organization_id, 'vip', 'VIP', NULL, NULL, true),
    (p_organization_id, 'premium', 'Premium', NULL, NULL, true)
  ON CONFLICT (organization_id, code) DO NOTHING;

  INSERT INTO public.collection_profile_steps
    (profile_id, sequence, relative_day, send_time, message_template)
  SELECT p.id, v.sequence, v.relative_day, v.send_time::time, v.message_template
  FROM public.collection_profiles p
  JOIN (VALUES
    ('excellent', 1, -1, '10:00', 'Olá {{primeiro_nome}}! Seu plano vence amanhã ({{vencimento}}). Se preferir, já pode renovar pelo PIX.'),
    ('excellent', 2, 2, '10:00', 'Olá {{primeiro_nome}}! Ainda não identificamos a renovação do plano. Posso ajudar com o PIX?'),
    ('regular', 1, -3, '09:00', 'Olá {{primeiro_nome}}! Seu plano vence em {{vencimento}}. Valor: {{valor}}.'),
    ('regular', 2, 0, '09:00', 'Olá {{primeiro_nome}}! Seu plano vence hoje. Posso gerar seu PIX de {{valor}}?'),
    ('regular', 3, 3, '10:00', 'Olá {{primeiro_nome}}! Seu pagamento ainda está pendente. Posso enviar uma segunda via do PIX?'),
    ('attention', 1, -3, '09:00', 'Olá {{primeiro_nome}}! Lembramos que seu plano vence em {{vencimento}}. Valor: {{valor}}.'),
    ('attention', 2, 0, '09:00', 'Olá {{primeiro_nome}}! Hoje é o vencimento do seu plano. Posso ajudar com a renovação?'),
    ('attention', 3, 1, '10:00', 'Olá {{primeiro_nome}}! Seu plano está pendente desde {{vencimento}}. Envio o PIX para regularizar?'),
    ('attention', 4, 5, '10:00', 'Olá {{primeiro_nome}}! Precisamos regularizar o plano para evitar interrupção. Fale conosco caso precise de ajuda.'),
    ('high_risk', 1, -5, '09:00', 'Olá {{primeiro_nome}}! Antecipamos o lembrete do vencimento em {{vencimento}}. Valor: {{valor}}.'),
    ('high_risk', 2, -1, '09:00', 'Olá {{primeiro_nome}}! Seu plano vence amanhã. Posso encaminhar o PIX?'),
    ('high_risk', 3, 1, '10:00', 'Olá {{primeiro_nome}}! Seu pagamento está pendente. Posso ajudar a regularizar?'),
    ('high_risk', 4, 7, '10:00', 'Olá {{primeiro_nome}}! Seu caso será encaminhado ao atendimento para ajudar na regularização.'),
    ('vip', 1, -1, '11:00', 'Olá {{primeiro_nome}}! Passando para lembrar, com todo cuidado, do vencimento do seu plano amanhã ({{vencimento}}).'),
    ('premium', 1, -1, '10:00', 'Olá {{primeiro_nome}}! Seu plano vence amanhã ({{vencimento}}). Conte conosco se precisar de algo.'),
    ('premium', 2, 2, '10:00', 'Olá {{primeiro_nome}}! Seu plano segue pendente. Posso enviar uma segunda via do PIX?')
  ) AS v(code, sequence, relative_day, send_time, message_template)
    ON v.code = p.code
  WHERE p.organization_id = p_organization_id
  ON CONFLICT (profile_id, sequence) DO NOTHING;

  RETURN jsonb_build_object(
    'initialized', true,
    'organization_id', p_organization_id,
    'enabled', (SELECT enabled FROM public.collection_settings WHERE organization_id = p_organization_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.initialize_intelligent_collections(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.initialize_intelligent_collections(uuid) TO service_role;

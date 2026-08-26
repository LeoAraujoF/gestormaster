-- Reabre um histórico falho de forma atômica antes de um novo job BullMQ.
-- O histórico é reutilizado para preservar rastreabilidade e evitar duplicidade.

CREATE OR REPLACE FUNCTION public.prepare_alert_history_retry(
  p_alert_history_id uuid,
  p_user_id uuid,
  p_allow_pending boolean DEFAULT false,
  p_retry_job_id text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_history public.alert_history%ROWTYPE;
  v_reservation_status text;
  v_dispatch_status text;
BEGIN
  SELECT * INTO v_history
  FROM public.alert_history
  WHERE id = p_alert_history_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF v_history.status IN ('accepted', 'sent', 'delivered', 'read') THEN
    RETURN 'already_sent';
  END IF;

  IF v_history.status IN ('queued', 'pending') THEN
    IF NOT p_allow_pending THEN
      RETURN 'already_queued';
    END IF;

    -- O primeiro request grava o token antes de publicar no Redis. Requests
    -- concorrentes respeitam esse claim; após 5 minutos ele pode ser retomado
    -- caso o processo tenha caído entre o banco e a fila.
    IF v_history.source_job_id LIKE 'manual-retry:%'
       AND v_history.source_job_id IS DISTINCT FROM p_retry_job_id
       AND v_history.queued_at IS NOT NULL
       AND v_history.queued_at > now() - interval '5 minutes' THEN
      RETURN 'already_queued';
    END IF;
  END IF;

  IF v_history.status NOT IN ('failed', 'queued', 'pending') THEN
    RETURN 'not_retryable';
  END IF;

  IF v_history.contact_reservation_id IS NOT NULL THEN
    SELECT status INTO v_reservation_status
    FROM public.contact_reservations
    WHERE id = v_history.contact_reservation_id
    FOR UPDATE;

    IF NOT FOUND OR v_reservation_status IN ('cancelled', 'sent') THEN
      RETURN 'not_retryable';
    END IF;

    IF v_reservation_status NOT IN ('reserved', 'processing', 'failed') THEN
      RETURN 'not_retryable';
    END IF;
  END IF;

  IF v_history.collection_dispatch_id IS NOT NULL THEN
    SELECT status INTO v_dispatch_status
    FROM public.collection_dispatches
    WHERE id = v_history.collection_dispatch_id
    FOR UPDATE;

    IF NOT FOUND OR v_dispatch_status IN ('cancelled', 'sent') THEN
      RETURN 'not_retryable';
    END IF;

    IF v_dispatch_status NOT IN ('pending', 'processing', 'retryable', 'failed') THEN
      RETURN 'not_retryable';
    END IF;
  END IF;

  UPDATE public.alert_history
  SET status = 'pending',
      error_message = NULL,
      failed_at = NULL,
      accepted_at = NULL,
      sent_at = NULL,
      delivered_at = NULL,
      read_at = NULL,
      provider_message_id = NULL,
      provider_status = NULL,
      source_job_id = COALESCE(p_retry_job_id, source_job_id),
      queued_at = now(),
      scheduled_at = now()
  WHERE id = v_history.id;

  IF v_history.contact_reservation_id IS NOT NULL THEN
    UPDATE public.contact_reservations
    SET status = 'reserved',
        decision_reason = 'MANUAL_RETRY_QUEUED',
        updated_at = now()
    WHERE id = v_history.contact_reservation_id;
  END IF;

  IF v_history.collection_dispatch_id IS NOT NULL THEN
    UPDATE public.collection_dispatches
    SET status = 'pending',
        error_message = NULL,
        updated_at = now()
    WHERE id = v_history.collection_dispatch_id;
  END IF;

  RETURN 'queued';
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_alert_history_retry(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prepare_alert_history_retry(uuid, uuid, boolean, text) TO service_role;

-- A reserva só é idempotente enquanto ainda pode bloquear um novo contato.
-- Reservas canceladas ou encerradas com falha devem permitir nova tentativa.
DROP INDEX IF EXISTS public.contact_reservations_source_uidx;

CREATE UNIQUE INDEX contact_reservations_source_uidx
  ON public.contact_reservations (source, source_id, client_id, contact_date)
  WHERE source_id IS NOT NULL AND status NOT IN ('cancelled', 'failed');

CREATE OR REPLACE FUNCTION public.reserve_contact(p_organization_id uuid, p_client_id uuid, p_contact_date date, p_timezone text, p_category text, p_source text, p_source_id uuid DEFAULT NULL::uuid, p_requested_by uuid DEFAULT NULL::uuid, p_automation_id uuid DEFAULT NULL::uuid, p_message_content text DEFAULT NULL::text, p_media_url text DEFAULT NULL::text, p_allow_manual_override boolean DEFAULT false)
 RETURNS TABLE(reservation_id uuid, decision text, reason text, existing_category text, next_attempt_date date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_priority smallint;
  v_existing public.contact_reservations%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_category NOT IN ('billing', 'operational', 'promotion', 'manual') THEN
    RAISE EXCEPTION 'INVALID_CONTACT_CATEGORY';
  END IF;
  IF p_source NOT IN ('intelligent_collection', 'legacy_automation', 'mass', 'manual', 'system') THEN
    RAISE EXCEPTION 'INVALID_CONTACT_SOURCE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id AND c.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'CLIENT_ORGANIZATION_MISMATCH';
  END IF;

  v_priority := CASE p_category
    WHEN 'billing' THEN 300
    WHEN 'operational' THEN 200
    WHEN 'promotion' THEN 100
    ELSE 400
  END;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text || ':' || p_client_id::text || ':' || p_contact_date::text, 0
  ));

  IF p_source_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.contact_reservations cr
    WHERE cr.source = p_source AND cr.source_id = p_source_id
      AND cr.client_id = p_client_id AND cr.contact_date = p_contact_date
      AND cr.status NOT IN ('cancelled', 'failed')
    ORDER BY cr.created_at DESC LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_existing.id, 'idempotent'::text,
        COALESCE(v_existing.decision_reason, 'SOURCE_ALREADY_RESERVED'),
        v_existing.category, v_existing.deferred_until;
      RETURN;
    END IF;
  END IF;

  SELECT * INTO v_existing
  FROM public.contact_reservations cr
  WHERE cr.organization_id = p_organization_id AND cr.client_id = p_client_id
    AND cr.status IN ('reserved', 'processing', 'sent')
    AND (
      cr.contact_date = p_contact_date
      OR (p_category = 'manual' AND cr.created_at >= now() - interval '24 hours')
    )
  ORDER BY cr.priority DESC, cr.created_at DESC LIMIT 1;

  IF p_category = 'manual' THEN
    IF FOUND AND NOT p_allow_manual_override THEN
      RETURN QUERY SELECT NULL::uuid, 'confirmation_required'::text,
        'CONTACTED_WITHIN_24_HOURS'::text, v_existing.category, NULL::date;
      RETURN;
    END IF;
    INSERT INTO public.contact_reservations (
      organization_id, client_id, contact_date, timezone, category, priority, source,
      source_id, requested_by, automation_id, message_content, media_url, decision_reason
    ) VALUES (
      p_organization_id, p_client_id, p_contact_date, COALESCE(NULLIF(p_timezone, ''), 'America/Sao_Paulo'),
      p_category, v_priority, p_source, p_source_id, p_requested_by, p_automation_id,
      p_message_content, p_media_url,
      CASE WHEN FOUND THEN 'MANUAL_OVERRIDE_CONFIRMED' ELSE 'CONTACT_RESERVED' END
    ) RETURNING id INTO v_id;
    RETURN QUERY SELECT v_id, 'reserved'::text,
      CASE WHEN FOUND THEN 'MANUAL_OVERRIDE_CONFIRMED' ELSE 'CONTACT_RESERVED' END,
      CASE WHEN FOUND THEN v_existing.category ELSE NULL END, NULL::date;
    RETURN;
  END IF;

  IF FOUND THEN
    IF v_priority > v_existing.priority AND v_existing.status = 'reserved' THEN
      UPDATE public.contact_reservations
      SET status = CASE WHEN category = 'promotion' AND defer_count < 3 THEN 'deferred' ELSE 'cancelled' END,
          defer_count = CASE WHEN category = 'promotion' AND defer_count < 3 THEN defer_count + 1 ELSE defer_count END,
          deferred_until = CASE WHEN category = 'promotion' AND defer_count < 3 THEN p_contact_date + 1 ELSE deferred_until END,
          decision_reason = 'SUPERSEDED_BY_HIGHER_PRIORITY', updated_at = now()
      WHERE id = v_existing.id;
    ELSE
      IF p_category = 'promotion' THEN
        INSERT INTO public.contact_reservations (
          organization_id, client_id, contact_date, timezone, category, priority, source,
          source_id, requested_by, automation_id, message_content, media_url,
          status, decision_reason, defer_count, deferred_until
        ) VALUES (
          p_organization_id, p_client_id, p_contact_date, COALESCE(NULLIF(p_timezone, ''), 'America/Sao_Paulo'),
          p_category, v_priority, p_source, p_source_id, p_requested_by, p_automation_id,
          p_message_content, p_media_url, 'deferred', 'DEFERRED_BY_HIGHER_PRIORITY', 1, p_contact_date + 1
        ) RETURNING id INTO v_id;
        RETURN QUERY SELECT v_id, 'deferred'::text, 'DEFERRED_BY_HIGHER_PRIORITY'::text,
          v_existing.category, p_contact_date + 1;
      ELSE
        RETURN QUERY SELECT NULL::uuid, 'blocked'::text, 'HIGHER_OR_EQUAL_PRIORITY_EXISTS'::text,
          v_existing.category, NULL::date;
      END IF;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.contact_reservations (
    organization_id, client_id, contact_date, timezone, category, priority, source,
    source_id, requested_by, automation_id, message_content, media_url, decision_reason
  ) VALUES (
    p_organization_id, p_client_id, p_contact_date, COALESCE(NULLIF(p_timezone, ''), 'America/Sao_Paulo'),
    p_category, v_priority, p_source, p_source_id, p_requested_by, p_automation_id,
    p_message_content, p_media_url, 'CONTACT_RESERVED'
  ) RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, 'reserved'::text, 'CONTACT_RESERVED'::text,
    CASE WHEN FOUND THEN v_existing.category ELSE NULL END, NULL::date;
END;
$function$;

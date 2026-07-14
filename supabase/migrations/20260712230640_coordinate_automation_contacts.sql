CREATE TABLE public.contact_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contact_date date NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  category text NOT NULL CHECK (category IN ('billing', 'operational', 'promotion', 'manual')),
  priority smallint NOT NULL CHECK (priority IN (100, 200, 300, 400)),
  source text NOT NULL CHECK (source IN ('intelligent_collection', 'legacy_automation', 'mass', 'manual', 'system')),
  source_id uuid,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  automation_id uuid REFERENCES public.automations(id) ON DELETE SET NULL,
  alert_history_id uuid REFERENCES public.alert_history(id) ON DELETE SET NULL,
  message_content text,
  media_url text,
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'processing', 'sent', 'failed', 'cancelled', 'deferred')),
  decision_reason text,
  defer_count smallint NOT NULL DEFAULT 0 CHECK (defer_count BETWEEN 0 AND 3),
  deferred_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX contact_reservations_org_client_date_idx
  ON public.contact_reservations (organization_id, client_id, contact_date DESC);
CREATE INDEX contact_reservations_deferred_idx
  ON public.contact_reservations (deferred_until, status)
  WHERE status = 'deferred';
CREATE UNIQUE INDEX contact_reservations_active_automatic_uidx
  ON public.contact_reservations (organization_id, client_id, contact_date)
  WHERE status IN ('reserved', 'processing', 'sent') AND category <> 'manual';
CREATE UNIQUE INDEX contact_reservations_source_uidx
  ON public.contact_reservations (source, source_id, client_id, contact_date)
  WHERE source_id IS NOT NULL AND status <> 'cancelled';

ALTER TABLE public.contact_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.contact_reservations FROM anon, authenticated;
GRANT SELECT ON TABLE public.contact_reservations TO authenticated;
GRANT ALL ON TABLE public.contact_reservations TO service_role;

CREATE POLICY "Members can view contact reservations"
  ON public.contact_reservations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = contact_reservations.organization_id
        AND om.user_id = (SELECT auth.uid())
    )
  );

ALTER TABLE public.alert_history
  ADD COLUMN IF NOT EXISTS contact_reservation_id uuid REFERENCES public.contact_reservations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_origin text,
  ADD COLUMN IF NOT EXISTS contact_category text,
  ADD COLUMN IF NOT EXISTS contact_decision text,
  ADD COLUMN IF NOT EXISTS contact_decision_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS alert_history_contact_reservation_uidx
  ON public.alert_history (contact_reservation_id)
  WHERE contact_reservation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reserve_contact(
  p_organization_id uuid,
  p_client_id uuid,
  p_contact_date date,
  p_timezone text,
  p_category text,
  p_source text,
  p_source_id uuid DEFAULT NULL,
  p_requested_by uuid DEFAULT NULL,
  p_automation_id uuid DEFAULT NULL,
  p_message_content text DEFAULT NULL,
  p_media_url text DEFAULT NULL,
  p_allow_manual_override boolean DEFAULT false
)
RETURNS TABLE (
  reservation_id uuid,
  decision text,
  reason text,
  existing_category text,
  next_attempt_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
      AND cr.status <> 'cancelled'
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
$$;

CREATE OR REPLACE FUNCTION public.activate_deferred_contact(p_reservation_id uuid)
RETURNS TABLE (reservation_id uuid, decision text, reason text, next_attempt_date date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row public.contact_reservations%ROWTYPE;
  v_conflict boolean;
BEGIN
  SELECT * INTO v_row FROM public.contact_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONTACT_RESERVATION_NOT_FOUND'; END IF;
  IF v_row.status <> 'deferred' THEN
    RETURN QUERY SELECT v_row.id, v_row.status, COALESCE(v_row.decision_reason, 'UNCHANGED'), v_row.deferred_until;
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_row.organization_id::text || ':' || v_row.client_id::text || ':' || v_row.deferred_until::text, 0
  ));
  SELECT EXISTS (
    SELECT 1 FROM public.contact_reservations cr
    WHERE cr.organization_id = v_row.organization_id AND cr.client_id = v_row.client_id
      AND cr.contact_date = v_row.deferred_until
      AND cr.status IN ('reserved', 'processing', 'sent') AND cr.category <> 'manual'
  ) INTO v_conflict;
  IF v_conflict THEN
    IF v_row.defer_count >= 3 THEN
      UPDATE public.contact_reservations SET status = 'cancelled', decision_reason = 'MAX_DEFER_ATTEMPTS', updated_at = now()
      WHERE id = v_row.id;
      RETURN QUERY SELECT v_row.id, 'cancelled'::text, 'MAX_DEFER_ATTEMPTS'::text, NULL::date;
    ELSE
      UPDATE public.contact_reservations
      SET defer_count = defer_count + 1, deferred_until = deferred_until + 1,
          decision_reason = 'DEFERRED_BY_HIGHER_PRIORITY', updated_at = now()
      WHERE id = v_row.id RETURNING deferred_until INTO v_row.deferred_until;
      RETURN QUERY SELECT v_row.id, 'deferred'::text, 'DEFERRED_BY_HIGHER_PRIORITY'::text, v_row.deferred_until;
    END IF;
    RETURN;
  END IF;
  UPDATE public.contact_reservations
  SET contact_date = deferred_until, status = 'reserved', decision_reason = 'DEFERRED_CONTACT_RELEASED', updated_at = now()
  WHERE id = v_row.id;
  RETURN QUERY SELECT v_row.id, 'reserved'::text, 'DEFERRED_CONTACT_RELEASED'::text, NULL::date;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_contact_reservation(p_reservation_id uuid, p_is_retry boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_claimed uuid;
BEGIN
  UPDATE public.contact_reservations
  SET status = 'processing', updated_at = now()
  WHERE id = p_reservation_id
    AND (status = 'reserved' OR (p_is_retry AND status IN ('processing', 'failed')))
  RETURNING id INTO v_claimed;
  RETURN v_claimed IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_contact(uuid, uuid, date, text, text, text, uuid, uuid, uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activate_deferred_contact(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_contact_reservation(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_contact(uuid, uuid, date, text, text, text, uuid, uuid, uuid, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_deferred_contact(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_contact_reservation(uuid, boolean) TO service_role;

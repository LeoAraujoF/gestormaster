CREATE OR REPLACE FUNCTION public.set_ticket_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT om.organization_id INTO NEW.organization_id
    FROM public.organization_members om
    WHERE om.user_id = NEW.user_id
    ORDER BY om.created_at NULLS LAST, om.organization_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_ticket_organization ON public.tickets;
CREATE TRIGGER trg_set_ticket_organization
BEFORE INSERT ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.set_ticket_organization();

DROP POLICY IF EXISTS "Users can update their own ticket timestamp" ON public.tickets;
CREATE POLICY "Users can update their own ticket timestamp" ON public.tickets
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE UPDATE ON TABLE public.tickets FROM authenticated;
GRANT UPDATE(updated_at) ON TABLE public.tickets TO authenticated;

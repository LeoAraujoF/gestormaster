-- Lock down legacy SECURITY DEFINER functions that were created with default
-- PUBLIC execution and mutable search paths. Active browser RPCs remain
-- available only to authenticated users; trigger and retired RPC functions do
-- not remain callable through the Data API.

alter function public.get_advanced_dashboard_metrics()
  set search_path = pg_catalog, public;
alter function public.get_clients_management_metrics()
  set search_path = pg_catalog, public;
alter function public.update_monthly_goal(numeric)
  set search_path = pg_catalog, public;
alter function public.user_has_access_to_client(uuid)
  set search_path = pg_catalog, public;

create or replace function public.update_monthly_goal(new_goal numeric)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_org_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if new_goal is null or new_goal <= 0 or new_goal > 100000000 then
    raise exception 'INVALID_MONTHLY_GOAL' using errcode = '22023';
  end if;

  select member.organization_id
    into v_org_id
  from public.organization_members as member
  where member.user_id = (select auth.uid())
    and member.role::text in ('owner', 'admin')
  order by case when member.role::text = 'owner' then 0 else 1 end
  limit 1;

  if v_org_id is null then
    raise exception 'ORGANIZATION_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  update public.organizations
  set monthly_goal = new_goal,
      updated_at = now()
  where id = v_org_id;
end;
$$;

revoke execute on function public.get_advanced_dashboard_metrics() from public, anon, authenticated;
revoke execute on function public.get_clients_management_metrics() from public, anon;
revoke execute on function public.get_dashboard_metrics() from public, anon;
revoke execute on function public.get_monthly_growth() from public, anon, authenticated;
revoke execute on function public.get_clients_by_service() from public, anon;
revoke execute on function public.update_monthly_goal(numeric) from public, anon;
revoke execute on function public.user_has_access_to_client(uuid) from public, anon;
revoke execute on function public.user_orgs() from public, anon;
revoke execute on function public.sync_pix_payment_reporting() from public, anon, authenticated;
revoke execute on function public.track_client_lifecycle_event() from public, anon, authenticated;

grant execute on function public.get_clients_management_metrics() to authenticated;
grant execute on function public.get_dashboard_metrics() to authenticated;
grant execute on function public.get_clients_by_service() to authenticated;
grant execute on function public.update_monthly_goal(numeric) to authenticated;
grant execute on function public.user_has_access_to_client(uuid) to authenticated;
grant execute on function public.user_orgs() to authenticated;

grant execute on function public.get_advanced_dashboard_metrics() to service_role;
grant execute on function public.get_monthly_growth() to service_role;
grant execute on function public.sync_pix_payment_reporting() to service_role;
grant execute on function public.track_client_lifecycle_event() to service_role;

-- New functions created by the migration owner must be explicitly exposed.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

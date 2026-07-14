-- Read-only tenant RPCs can safely run as the caller now that their dependent
-- tables have organization-aware RLS. Keep SECURITY DEFINER only for the
-- narrowly validated monthly-goal mutation.

drop policy if exists "Acesso apenas aos servicos dos proprios clientes"
  on public.client_services;
drop policy if exists "tenant_isolation_client_services"
  on public.client_services;

create policy "tenant_isolation_client_services"
on public.client_services
for all
to authenticated
using (
  exists (
    select 1
    from public.clients as client
    where client.id = client_services.client_id
      and client.organization_id in (select public.user_orgs())
  )
)
with check (
  exists (
    select 1
    from public.clients as client
    where client.id = client_services.client_id
      and client.organization_id in (select public.user_orgs())
  )
);

alter function public.get_clients_management_metrics() security invoker;
alter function public.get_dashboard_metrics() security invoker;
alter function public.user_has_access_to_client(uuid) security invoker;
alter function public.user_orgs() security invoker;

create or replace function public.get_clients_by_service()
returns table(service_name text, client_count bigint)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select
    service.name as service_name,
    count(distinct relation.client_id) as client_count
  from public.services as service
  left join public.client_services as relation
    on relation.service_id = service.id
  left join public.clients as client
    on client.id = relation.client_id
   and client.status = 'active'
  where service.organization_id in (select public.user_orgs())
  group by service.id, service.name
  order by client_count desc;
$$;

revoke execute on function public.get_clients_by_service() from public, anon;
grant execute on function public.get_clients_by_service() to authenticated;

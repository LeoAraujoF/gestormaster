create index if not exists admin_incidents_acknowledged_by_idx
  on public.admin_incidents (acknowledged_by)
  where acknowledged_by is not null;

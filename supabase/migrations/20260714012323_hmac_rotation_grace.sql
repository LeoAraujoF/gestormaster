-- Keep the previous Evolution webhook secret available only to server-side
-- consumers for a short, explicit rotation overlap. security_settings is
-- already deny-by-default for Data API clients.
alter table public.security_settings
  add column if not exists hmac_previous_secret text,
  add column if not exists hmac_previous_valid_until timestamptz;

comment on column public.security_settings.hmac_previous_secret is
  'Encrypted previous Evolution webhook secret retained during rotation grace.';
comment on column public.security_settings.hmac_previous_valid_until is
  'Exclusive deadline after which the previous Evolution webhook secret is rejected.';

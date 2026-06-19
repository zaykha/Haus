alter table public.client_organizations
  add column if not exists phone text,
  add column if not exists address text;

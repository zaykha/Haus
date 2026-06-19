create table if not exists public.client_organization_liaisons (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  client_organization_id uuid not null references public.client_organizations(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists client_organization_liaisons_profile_org_key
  on public.client_organization_liaisons (profile_id, client_organization_id);

create index if not exists client_organization_liaisons_profile_idx
  on public.client_organization_liaisons (profile_id);

create index if not exists client_organization_liaisons_org_idx
  on public.client_organization_liaisons (client_organization_id);

insert into public.client_organization_liaisons (profile_id, client_organization_id, is_primary)
select
  profiles.id,
  profiles.client_organization_id,
  true
from public.profiles
where profiles.role = 'client'
  and profiles.client_organization_id is not null
on conflict (profile_id, client_organization_id) do update
set is_primary = excluded.is_primary;

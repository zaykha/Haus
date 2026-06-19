with ranked_memberships as (
  select
    id,
    profile_id,
    row_number() over (
      partition by profile_id
      order by is_primary desc, created_at asc, id asc
    ) as rank_in_profile
  from public.client_organization_liaisons
)
update public.client_organization_liaisons as memberships
set is_primary = ranked_memberships.rank_in_profile = 1
from ranked_memberships
where memberships.id = ranked_memberships.id;

create unique index if not exists client_organization_liaisons_one_primary_per_profile
  on public.client_organization_liaisons (profile_id)
  where is_primary;

alter table public.profiles
  drop column if exists client_organization_id;

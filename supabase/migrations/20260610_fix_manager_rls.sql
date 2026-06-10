create or replace function public.is_manager(uid uuid)
returns boolean
language sql
stable
as $$
  select
    exists (
      select 1
      from public.profiles
      where id = uid
        and role in ('communication_manager', 'creative_manager')
    )
    or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') in ('communication_manager', 'creative_manager');
$$;

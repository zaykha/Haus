create or replace function public.is_manager(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.profiles
      where id = uid
        and role in ('communication_manager', 'creative_manager')
    )
    or exists (
      select 1
      from public.profiles
      where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and role in ('communication_manager', 'creative_manager')
    )
    or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') in ('communication_manager', 'creative_manager')
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('communication_manager', 'creative_manager')
    or coalesce(auth.jwt() ->> 'role', '') in ('communication_manager', 'creative_manager');
$$;

create or replace function public.can_access_project(uid uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and (
        public.is_manager(uid)
        or p.client_id = uid
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = p.id
            and pm.profile_id = uid
        )
        or exists (
          select 1
          from public.tasks t
          where t.project_id = p.id
            and t.assignee_id = uid
        )
      )
  );
$$;

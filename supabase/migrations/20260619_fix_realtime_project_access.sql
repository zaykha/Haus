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
        or exists (
          select 1
          from public.client_organization_liaisons col
          where col.profile_id = uid
            and col.client_organization_id = p.client_organization_id
        )
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

alter table if exists public.projects replica identity full;
alter table if exists public.tasks replica identity full;
alter table if exists public.project_members replica identity full;
alter table if exists public.project_files replica identity full;
alter table if exists public.project_comments replica identity full;
alter table if exists public.project_feedback replica identity full;
alter table if exists public.project_activity replica identity full;
alter table if exists public.client_organization_liaisons replica identity full;
alter table if exists public.profiles replica identity full;

do $$
begin
  if to_regclass('public.projects') is not null then
    begin
      alter publication supabase_realtime add table public.projects;
    exception
      when duplicate_object then null;
    end;
  end if;

  if to_regclass('public.tasks') is not null then
    begin
      alter publication supabase_realtime add table public.tasks;
    exception
      when duplicate_object then null;
    end;
  end if;

  if to_regclass('public.project_members') is not null then
    begin
      alter publication supabase_realtime add table public.project_members;
    exception
      when duplicate_object then null;
    end;
  end if;

  if to_regclass('public.project_files') is not null then
    begin
      alter publication supabase_realtime add table public.project_files;
    exception
      when duplicate_object then null;
    end;
  end if;

  if to_regclass('public.project_comments') is not null then
    begin
      alter publication supabase_realtime add table public.project_comments;
    exception
      when duplicate_object then null;
    end;
  end if;

  if to_regclass('public.project_feedback') is not null then
    begin
      alter publication supabase_realtime add table public.project_feedback;
    exception
      when duplicate_object then null;
    end;
  end if;

  if to_regclass('public.project_activity') is not null then
    begin
      alter publication supabase_realtime add table public.project_activity;
    exception
      when duplicate_object then null;
    end;
  end if;

  if to_regclass('public.client_organization_liaisons') is not null then
    begin
      alter publication supabase_realtime add table public.client_organization_liaisons;
    exception
      when duplicate_object then null;
    end;
  end if;

  if to_regclass('public.profiles') is not null then
    begin
      alter publication supabase_realtime add table public.profiles;
    exception
      when duplicate_object then null;
    end;
  end if;
end
$$;

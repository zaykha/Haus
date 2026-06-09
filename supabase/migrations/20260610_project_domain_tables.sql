alter table public.profiles
add column if not exists company text;

alter table public.projects
add column if not exists image_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_stage_check'
  ) then
    alter table public.projects
    add constraint projects_stage_check
    check (stage in ('intake', 'concept', 'design', 'review', 'delivery'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_status_check'
  ) then
    alter table public.projects
    add constraint projects_status_check
    check (status in ('active', 'review', 'approved', 'revision', 'done'));
  end if;
end
$$;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  assignee_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  due_date date not null,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists tasks_project_id_idx on public.tasks(project_id);
create index if not exists tasks_assignee_id_idx on public.tasks(assignee_id);
create index if not exists tasks_due_date_idx on public.tasks(due_date);

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  version text not null,
  file_url text,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  visibility text not null default 'internal' check (visibility in ('internal', 'client')),
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists project_files_project_id_idx on public.project_files(project_id);
create index if not exists project_files_uploaded_by_idx on public.project_files(uploaded_by);

create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null,
  internal_only boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists project_comments_project_id_idx on public.project_comments(project_id);
create index if not exists project_comments_author_id_idx on public.project_comments(author_id);

create table if not exists public.project_feedback (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('approve', 'request_revision', 'comment')),
  body text not null,
  rating integer check (rating between 1 and 5),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists project_feedback_project_id_idx on public.project_feedback(project_id);
create index if not exists project_feedback_author_id_idx on public.project_feedback(author_id);

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row
execute function public.set_updated_at();

drop trigger if exists project_files_set_updated_at on public.project_files;
create trigger project_files_set_updated_at
before update on public.project_files
for each row
execute function public.set_updated_at();

drop trigger if exists project_comments_set_updated_at on public.project_comments;
create trigger project_comments_set_updated_at
before update on public.project_comments
for each row
execute function public.set_updated_at();

drop trigger if exists project_feedback_set_updated_at on public.project_feedback;
create trigger project_feedback_set_updated_at
before update on public.project_feedback
for each row
execute function public.set_updated_at();

create or replace function public.is_manager(uid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = uid
      and role in ('communication_manager', 'creative_manager')
  );
$$;

create or replace function public.can_access_project(uid uuid, target_project_id uuid)
returns boolean
language sql
stable
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

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;
alter table public.project_files enable row level security;
alter table public.project_comments enable row level security;
alter table public.project_feedback enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "Authenticated users can read profiles" on public.profiles;
create policy "Authenticated users can read profiles"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Managers can read all projects" on public.projects;
create policy "Managers can read all projects"
on public.projects
for select
to authenticated
using (public.can_access_project(auth.uid(), id));

drop policy if exists "Managers can insert projects" on public.projects;
create policy "Managers can insert projects"
on public.projects
for insert
to authenticated
with check (public.is_manager(auth.uid()));

drop policy if exists "Managers can update projects" on public.projects;
create policy "Managers can update projects"
on public.projects
for update
to authenticated
using (public.is_manager(auth.uid()))
with check (public.is_manager(auth.uid()));

drop policy if exists "Managers can delete projects" on public.projects;
create policy "Managers can delete projects"
on public.projects
for delete
to authenticated
using (public.is_manager(auth.uid()));

drop policy if exists "Visible project members can read memberships" on public.project_members;
create policy "Visible project members can read memberships"
on public.project_members
for select
to authenticated
using (public.can_access_project(auth.uid(), project_id));

drop policy if exists "Managers can manage memberships" on public.project_members;
create policy "Managers can manage memberships"
on public.project_members
for all
to authenticated
using (public.is_manager(auth.uid()))
with check (public.is_manager(auth.uid()));

drop policy if exists "Visible users can read tasks" on public.tasks;
create policy "Visible users can read tasks"
on public.tasks
for select
to authenticated
using (public.can_access_project(auth.uid(), project_id));

drop policy if exists "Managers can manage tasks" on public.tasks;
create policy "Managers can manage tasks"
on public.tasks
for all
to authenticated
using (public.is_manager(auth.uid()))
with check (public.is_manager(auth.uid()));

drop policy if exists "Assignees can update their tasks" on public.tasks;
create policy "Assignees can update their tasks"
on public.tasks
for update
to authenticated
using (assignee_id = auth.uid())
with check (assignee_id = auth.uid());

drop policy if exists "Visible users can read files" on public.project_files;
create policy "Visible users can read files"
on public.project_files
for select
to authenticated
using (
  public.can_access_project(auth.uid(), project_id)
  and (
    visibility = 'client'
    or public.is_manager(auth.uid())
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_files.project_id
        and pm.profile_id = auth.uid()
    )
  )
);

drop policy if exists "Internal users can manage files" on public.project_files;
create policy "Internal users can manage files"
on public.project_files
for insert
to authenticated
with check (
  public.can_access_project(auth.uid(), project_id)
  and exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role <> 'client'
  )
);

drop policy if exists "Internal users can update files" on public.project_files;
create policy "Internal users can update files"
on public.project_files
for update
to authenticated
using (
  public.can_access_project(auth.uid(), project_id)
  and exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role <> 'client'
  )
)
with check (
  public.can_access_project(auth.uid(), project_id)
  and exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role <> 'client'
  )
);

drop policy if exists "Visible users can read comments" on public.project_comments;
create policy "Visible users can read comments"
on public.project_comments
for select
to authenticated
using (
  public.can_access_project(auth.uid(), project_id)
  and (
    internal_only = false
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role <> 'client'
    )
  )
);

drop policy if exists "Visible users can insert comments" on public.project_comments;
create policy "Visible users can insert comments"
on public.project_comments
for insert
to authenticated
with check (
  public.can_access_project(auth.uid(), project_id)
  and (
    internal_only = false
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role <> 'client'
    )
  )
);

drop policy if exists "Visible users can read feedback" on public.project_feedback;
create policy "Visible users can read feedback"
on public.project_feedback
for select
to authenticated
using (public.can_access_project(auth.uid(), project_id));

drop policy if exists "Visible users can insert feedback" on public.project_feedback;
create policy "Visible users can insert feedback"
on public.project_feedback
for insert
to authenticated
with check (public.can_access_project(auth.uid(), project_id));

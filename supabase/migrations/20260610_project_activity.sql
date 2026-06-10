create table if not exists public.project_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (
    action in (
      'workflow_updated',
      'task_created',
      'task_status_changed',
      'task_submitted',
      'task_revision_requested',
      'task_approved',
      'file_uploaded',
      'comment_added',
      'internal_note_added',
      'feedback_added'
    )
  ),
  message text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists project_activity_project_id_idx on public.project_activity(project_id);
create index if not exists project_activity_actor_id_idx on public.project_activity(actor_id);
create index if not exists project_activity_created_at_idx on public.project_activity(created_at desc);

alter table public.project_activity enable row level security;

drop policy if exists "Visible users can read activity" on public.project_activity;
create policy "Visible users can read activity"
on public.project_activity
for select
to authenticated
using (public.can_access_project(auth.uid(), project_id));

drop policy if exists "Visible users can insert activity" on public.project_activity;
create policy "Visible users can insert activity"
on public.project_activity
for insert
to authenticated
with check (public.can_access_project(auth.uid(), project_id));

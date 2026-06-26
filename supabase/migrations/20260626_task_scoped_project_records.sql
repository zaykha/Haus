-- Add nullable task linkage for project comments, feedback, and activity records.
-- This allows task-specific feedback/activity cleanup when a task is deleted.

alter table public.project_comments
  add column if not exists task_id uuid references public.tasks(id) on delete cascade;

alter table public.project_feedback
  add column if not exists task_id uuid references public.tasks(id) on delete cascade;

alter table public.project_activity
  add column if not exists task_id uuid references public.tasks(id) on delete cascade;

create index if not exists project_comments_task_id_idx on public.project_comments(task_id);
create index if not exists project_feedback_task_id_idx on public.project_feedback(task_id);
create index if not exists project_activity_task_id_idx on public.project_activity(task_id);

comment on column public.project_comments.task_id is
  'Optional task linkage for comments that belong to a specific task.';

comment on column public.project_feedback.task_id is
  'Optional task linkage for feedback that belongs to a specific task.';

comment on column public.project_activity.task_id is
  'Optional task linkage for activity items that belong to a specific task.';

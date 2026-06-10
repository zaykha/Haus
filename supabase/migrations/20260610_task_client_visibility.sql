alter table public.tasks
add column if not exists client_visible boolean not null default false;

alter table public.tasks
add column if not exists manager_review_status text not null default 'internal';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_manager_review_status_check'
  ) then
    alter table public.tasks
    add constraint tasks_manager_review_status_check
    check (manager_review_status in ('internal', 'ready_for_client', 'revision_requested'));
  end if;
end
$$;

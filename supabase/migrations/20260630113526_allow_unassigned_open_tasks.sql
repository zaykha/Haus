alter table public.tasks
alter column assignee_id drop not null;

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
            and (
              t.assignee_id = uid
              or (
                t.assignee_id is null
                and exists (
                  select 1
                  from public.profiles viewer
                  where viewer.id = uid
                    and viewer.role <> 'client'
                )
              )
            )
        )
      )
  );
$$;

drop policy if exists "Assignees can update their tasks" on public.tasks;
create policy "Assignees can update their tasks"
on public.tasks
for update
to authenticated
using (
  assignee_id = auth.uid()
  or (
    assignee_id is null
    and exists (
      select 1
      from public.profiles viewer
      where viewer.id = auth.uid()
        and viewer.role = 'designer'
    )
  )
)
with check (
  assignee_id = auth.uid()
  or (
    assignee_id is null
    and exists (
      select 1
      from public.profiles viewer
      where viewer.id = auth.uid()
        and viewer.role = 'designer'
    )
  )
);

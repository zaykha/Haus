alter table public.projects
  add column if not exists project_code text,
  add column if not exists requested_date date,
  add column if not exists department_name text,
  add column if not exists project_request_name text,
  add column if not exists contact_person text,
  add column if not exists contact_number text,
  add column if not exists project_type text,
  add column if not exists priority_level text,
  add column if not exists first_draft_date date,
  add column if not exists final_deliverable_date date,
  add column if not exists project_objective text,
  add column if not exists project_brief text,
  add column if not exists creative_advice text,
  add column if not exists reference_attachment_url text;

create unique index if not exists projects_project_code_key
  on public.projects (project_code)
  where project_code is not null;

comment on column public.projects.project_code is 'Spreadsheet Project ID, e.g. AEK001';
comment on column public.projects.requested_date is 'Requested Date from intake sheet';
comment on column public.projects.department_name is 'Department Name column from intake sheet';
comment on column public.projects.project_request_name is 'Project Request Name from intake sheet';
comment on column public.projects.contact_person is 'Contact Person snapshot for the project';
comment on column public.projects.contact_number is 'Contact Number snapshot for the project';
comment on column public.projects.project_type is 'Project Type from intake sheet';
comment on column public.projects.priority_level is 'Priority Level from intake sheet';
comment on column public.projects.first_draft_date is 'First Draft Date from intake sheet';
comment on column public.projects.final_deliverable_date is 'Final Deliverable Date from intake sheet';
comment on column public.projects.project_objective is 'Project Objective from intake sheet';
comment on column public.projects.project_brief is 'Project Brief from intake sheet';
comment on column public.projects.creative_advice is 'Creative Advice from intake sheet';
comment on column public.projects.reference_attachment_url is 'Reference attachment URL or storage path';

update public.projects p
set
  requested_date = coalesce(p.requested_date, p.created_at::date),
  project_request_name = coalesce(nullif(p.project_request_name, ''), p.name),
  project_type = coalesce(nullif(p.project_type, ''), p.category),
  final_deliverable_date = coalesce(p.final_deliverable_date, p.due_date),
  project_brief = coalesce(nullif(p.project_brief, ''), p.description),
  contact_person = coalesce(
    nullif(p.contact_person, ''),
    client_profile.name
  ),
  contact_number = coalesce(
    nullif(p.contact_number, ''),
    client_profile.phone
  )
from public.profiles client_profile
where p.client_id = client_profile.id;

update public.projects
set
  requested_date = coalesce(requested_date, created_at::date),
  project_request_name = coalesce(nullif(project_request_name, ''), name),
  project_type = coalesce(nullif(project_type, ''), category),
  final_deliverable_date = coalesce(final_deliverable_date, due_date),
  project_brief = coalesce(nullif(project_brief, ''), description)
where true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_priority_level_check'
  ) then
    alter table public.projects
      add constraint projects_priority_level_check
      check (
        priority_level is null
        or priority_level in ('Low', 'Medium', 'High', 'Urgent')
      );
  end if;
end
$$;

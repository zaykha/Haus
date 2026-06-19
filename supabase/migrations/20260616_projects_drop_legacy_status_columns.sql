alter table public.projects
  drop column if exists request_status,
  drop column if exists status;

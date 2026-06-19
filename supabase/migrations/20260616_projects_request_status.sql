alter table public.projects
  add column if not exists request_status text;

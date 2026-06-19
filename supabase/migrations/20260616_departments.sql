create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.departments enable row level security;

drop policy if exists "Authenticated users can read departments" on public.departments;
create policy "Authenticated users can read departments"
on public.departments
for select
to authenticated
using (true);

drop policy if exists "Managers can insert departments" on public.departments;
create policy "Managers can insert departments"
on public.departments
for insert
to authenticated
with check (public.is_manager(auth.uid()));

drop policy if exists "Managers can update departments" on public.departments;
create policy "Managers can update departments"
on public.departments
for update
to authenticated
using (public.is_manager(auth.uid()))
with check (public.is_manager(auth.uid()));

drop policy if exists "Managers can delete departments" on public.departments;
create policy "Managers can delete departments"
on public.departments
for delete
to authenticated
using (public.is_manager(auth.uid()));

insert into public.departments (name)
values
  ('Admin'),
  ('Audit'),
  ('Commercial'),
  ('Executive Office'),
  ('Finance'),
  ('Human Resource'),
  ('IT'),
  ('Legal'),
  ('Marketing & Branding'),
  ('Procurement'),
  ('R&D and Technical'),
  ('Warehouse')
on conflict (name) do nothing;

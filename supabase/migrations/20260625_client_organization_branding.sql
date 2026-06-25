-- Add organization branding fields for client-facing theming.
-- `logo_url` stores the uploaded logo asset URL.
-- `brand_color` stores the primary hex color selected in the workspace UI.

alter table public.client_organizations
  add column if not exists logo_url text,
  add column if not exists brand_color text;

comment on column public.client_organizations.logo_url is
  'Public URL for the organization logo used in client-facing workspace screens.';

comment on column public.client_organizations.brand_color is
  'Primary brand color hex value used to derive client-facing organization theme styles.';

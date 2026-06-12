# Known Issues (MVP Notes)

This file tracks practical MVP issues and deployment-related gotchas.

## Supabase schema/type sync

- Supabase generated types may need regeneration if the database schema changes.

## UI polish

- Some UI polish (loading states, edge-case empty states, minor layout differences on narrow viewports) may still be needed after first production deployment.

## Email invitations

- Invitation emails may still rely on manual invite links depending on whether automated email delivery is configured.

## RLS / production hardening

- RLS policies should be reviewed and tested thoroughly before enabling public production access.
- Verify table policies and Storage policies for the upload bucket.

## Payments

- Payment features are not included unless already implemented in the codebase/migrations.


# Supabase Setup (Haus)

This document summarizes the Supabase setup expected by the Haus Next.js app.

## Roles (App-level)

The app uses role names:

- `communication_manager`
- `creative_manager`
- `designer`
- `client`

These roles are used by the app UI and permission checks to decide what users can see/do.

## Auth / profile system (high-level)

Haus is invitation-based:

- Managers create invitations via the app.
- Users join/activate access by accepting invite links (`/accept-invite`).
- After acceptance, the server-side Supabase logic assigns the user into the correct workspace/team membership and role.

## Main workflow: Client approve vs. request revision

Haus task workflow includes manager review state and client feedback.

### Client approve

- Task status becomes: `approved`
- Manager review status becomes: `internal`
- A feedback record is created

### Client request revision

- Task status becomes: `in_progress`
- Manager review status becomes: `revision_requested`
- A feedback record is created with the revision comment

## Storage buckets (uploads / screenshots)

The app supports image uploads (including designer completion screenshots).

- Default bucket name: `project-images`
- Optional override: `NEXT_PUBLIC_SUPABASE_PROJECT_IMAGES_BUCKET`

If you override the bucket name, ensure:

- the bucket exists in Supabase Storage
- RLS/policies allow the expected read/write operations for authenticated users (per your project’s permission model)

## RLS / permission notes

Haus relies on Supabase Row Level Security (RLS) for:

- workspace/project/task visibility per role
- task update permissions
- client-visible vs manager/internal-only data
- storage access

Before public production use, review:

- RLS policies for every table involved in the workflow
- storage policies for the upload bucket
- any policy assumptions about manager/designer/client membership


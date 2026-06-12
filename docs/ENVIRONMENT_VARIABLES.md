# Environment Variables

This document lists the environment variables required by Haus.

## Summary

| Variable | Required | Used by | Browser safe? | Notes |
|---|---:|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (for Supabase mode) | `lib/config.ts` → `appConfig.supabaseUrl` | ✅ Yes | Public. Must be your Supabase project URL (without trailing `/rest/v1`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes (for Supabase mode) | `lib/config.ts` → `appConfig.supabaseAnonKey` | ✅ Yes | Public anon key. Used by the browser client. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (server/admin operations) | `lib/supabase/admin.ts` | ❌ No | **Server-only.** Used to create a Supabase admin client on the server. Never expose to browser code. |
| `NEXT_PUBLIC_SUPABASE_PROJECT_IMAGES_BUCKET` | No | `lib/config.ts` → `projectImagesBucket` | ✅ Yes | Optional override of Supabase Storage bucket name. If unset, app defaults to `project-images`. |

## Security rules

- `NEXT_PUBLIC_*` variables are visible in the browser bundle.
- `SUPABASE_SERVICE_ROLE_KEY` is private and must be set only on the server (e.g. Vercel Environment Variables).
- Never reference `SUPABASE_SERVICE_ROLE_KEY` in React client components.


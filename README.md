# Haus

Haus is a mobile-first MVP for a design project tracking portal built with Next.js App Router and prepared for invitation-based onboarding with optional Supabase-backed services.

## Stack

- Next.js App Router
- React
- TypeScript
- Supabase client helpers
- `pnpm`

## Run

1. Install Node.js 20+ and `pnpm`.
2. Install dependencies:

```bash
pnpm install
```

3. Start the app:

```bash
pnpm dev
```

## Environment

Optional `.env.local` keys:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Without these values, the app uses local persisted state in the browser with no preloaded users or project data.

## Invitations

- Managers create manual invite links from `/team`.
- Invite links open `/accept-invite?token=...`.
- Supabase auth user creation happens only through server routes under `app/api/invitations/*`.
- The service role key is server-only and must never be exposed to the client.

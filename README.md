# Haus

Haus is a mobile-first MVP for a design project management and client portal for creative/design teams.

## Tech stack

- Next.js (App Router)
- React
- Supabase
- styled-components
- TypeScript
- `pnpm`

## Local setup

### 1) Install

```bash
pnpm install
```

### 2) Run (development)

```bash
pnpm dev
```

### 3) Build

```bash
pnpm build
```

## Environment variables

Copy `.env.example` to `.env.local`.

```bash
cp .env.example .env.local
```

Populate Supabase values (no real secrets should be committed):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (**server-only**)

Optional:

- `NEXT_PUBLIC_SUPABASE_PROJECT_IMAGES_BUCKET` (defaults to `project-images`)

## Development commands

- Install: `pnpm install`
- Dev: `pnpm dev`
- Build: `pnpm build`

## Deployment target: Vercel

This project is prepared for Vercel deployment.

See:
- `docs/DEPLOYMENT.md`
- `docs/SUPABASE_SETUP.md`
- `docs/ENVIRONMENT_VARIABLES.md`


# Deployment Guide (Vercel)

This document explains how to deploy **Haus** (Next.js App Router) to **Vercel** and how to finish the required **Supabase Auth** configuration.

## 1) Push to GitHub

1. Create/push a branch in your GitHub repo.
2. Ensure the branch contains your latest `main` code.

## 2) Import into Vercel

1. Go to **Vercel → Add New… → Project**.
2. Select **Import Git Repository**.
3. Choose your GitHub repo and branch.

### Framework preset
- Framework: **Next.js**

## 3) Install command

Vercel should install dependencies with:

```bash
pnpm install
```

(Ensure `pnpm` is the package manager used by the project.)

## 4) Build command

```bash
pnpm build
```

## 5) Output directory

- Leave as **default / empty** (Vercel detects Next.js output automatically).

## 6) Add environment variables in Vercel

In **Vercel → Project Settings → Environment Variables**, add the following:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- (Optional) `NEXT_PUBLIC_SUPABASE_PROJECT_IMAGES_BUCKET` (defaults to `project-images`)

> Important: `SUPABASE_SERVICE_ROLE_KEY` is **server-side only**. Do not prefix it with `NEXT_PUBLIC_`.

## 7) Deploy

Click **Deploy**.

## 8) After deploy: configure Supabase Auth redirect URLs

In **Supabase → Authentication → URL Configuration** (or the equivalent section), add your **production** Vercel URL.

Example:

- Site URL:
  - `https://your-project.vercel.app`
- Redirect URLs:
  - `https://your-project.vercel.app/**`

Also add any additional domains you use for the app (custom domains, staging domains, etc.).


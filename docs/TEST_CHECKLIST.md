# Pre-deployment Test Checklist

This checklist helps verify that Supabase auth, role visibility, task workflow, and deployment build integrity work as expected.

## Auth

- [ ] Manager login
- [ ] Designer login
- [ ] Client login

## Manager

- [ ] Create project
- [ ] Create task
- [ ] Assign task to a designer
- [ ] Upload/send deliverable to client (via the intended workflow)
- [ ] Update project status/stage

## Designer

- [ ] Designer sees assigned tasks
- [ ] Designer uploads completion screenshot (deliverable proof)
- [ ] Designer cannot access manager-only pages / actions

## Client

- [ ] Client sees only own dashboard
- [ ] Client sees only own projects
- [ ] Client cannot open another client project URL
- [ ] Client sees only client-visible tasks/files
- [ ] Client can approve deliverable
- [ ] Client can request revision with required comment
- [ ] Approval updates task status to `approved`
- [ ] Revision updates task status to `in_progress`
- [ ] Feedback record is created

## Build

- [ ] Run install: `pnpm install`
- [ ] Run lint (if available): `pnpm lint`
- [ ] Run typecheck (if available): `pnpm typecheck`
- [ ] Run build: `pnpm build`


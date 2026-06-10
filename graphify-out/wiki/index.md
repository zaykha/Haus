# Haus Wiki

This wiki index is a lightweight entry point built from the existing graph artifacts and current repo structure.

## Read First

- [Graph Report](../GRAPH_REPORT.md)

## Architecture Map

- App routes
  - [app/layout.tsx](/Users/thihanaing/Haus/app/layout.tsx)
  - [app/(app)/layout.tsx](/Users/thihanaing/Haus/app/(app)/layout.tsx)
- Shared state
  - [components/app-state.tsx](/Users/thihanaing/Haus/components/app-state.tsx)
- Permissions and domain model
  - [lib/permissions.ts](/Users/thihanaing/Haus/lib/permissions.ts)
  - [lib/types.ts](/Users/thihanaing/Haus/lib/types.ts)
- Supabase helpers
  - [lib/supabase/client.ts](/Users/thihanaing/Haus/lib/supabase/client.ts)
  - [lib/supabase/admin.ts](/Users/thihanaing/Haus/lib/supabase/admin.ts)

## Key Screens

- Dashboard
  - [components/dashboard-screen.tsx](/Users/thihanaing/Haus/components/dashboard-screen.tsx)
- Projects
  - [components/projects-screen.tsx](/Users/thihanaing/Haus/components/projects-screen.tsx)
  - [components/project-detail-screen.tsx](/Users/thihanaing/Haus/components/project-detail-screen.tsx)
  - [components/project-create-screen.tsx](/Users/thihanaing/Haus/components/project-create-screen.tsx)
- Tasks
  - [components/tasks-screen.tsx](/Users/thihanaing/Haus/components/tasks-screen.tsx)
- Clients
  - [components/clients-screen.tsx](/Users/thihanaing/Haus/components/clients-screen.tsx)
- Team
  - [components/team-screen.tsx](/Users/thihanaing/Haus/components/team-screen.tsx)

## Key APIs

- Workspace auth
  - [app/api/workspace/_auth.ts](/Users/thihanaing/Haus/app/api/workspace/_auth.ts)
- Project CRUD
  - [app/api/workspace/projects/route.ts](/Users/thihanaing/Haus/app/api/workspace/projects/route.ts)
  - [app/api/workspace/projects/[id]/route.ts](/Users/thihanaing/Haus/app/api/workspace/projects/[id]/route.ts)
  - [app/api/workspace/projects/[id]/workflow/route.ts](/Users/thihanaing/Haus/app/api/workspace/projects/[id]/workflow/route.ts)
- Task CRUD and designer/manager updates
  - [app/api/workspace/projects/[id]/tasks/route.ts](/Users/thihanaing/Haus/app/api/workspace/projects/[id]/tasks/route.ts)
  - [app/api/workspace/projects/[id]/tasks/[taskId]/route.ts](/Users/thihanaing/Haus/app/api/workspace/projects/[id]/tasks/[taskId]/route.ts)
- Image upload
  - [app/api/projects/upload-image/route.ts](/Users/thihanaing/Haus/app/api/projects/upload-image/route.ts)

## Migrations

- Invitation system
  - [supabase/migrations/20260608_invitation_system.sql](/Users/thihanaing/Haus/supabase/migrations/20260608_invitation_system.sql)
- Project/task domain
  - [supabase/migrations/20260610_project_domain_tables.sql](/Users/thihanaing/Haus/supabase/migrations/20260610_project_domain_tables.sql)
- Task completion screenshots
  - [supabase/migrations/20260610_task_completion_screenshots.sql](/Users/thihanaing/Haus/supabase/migrations/20260610_task_completion_screenshots.sql)
- Task client visibility
  - [supabase/migrations/20260610_task_client_visibility.sql](/Users/thihanaing/Haus/supabase/migrations/20260610_task_client_visibility.sql)

## Current Behavioral Themes

- Manager-first workspace flows
- Designer-scoped project/task visibility
- Client-curated deliverables instead of exposing all internal tasks
- Frontend image optimization before Supabase upload

# Haus Readiness Test Checklist

Use this checklist to decide whether the app is ready for production-like usage. Run the flows with real Supabase data, not mock assumptions.

## 1. Environment And Data

- Confirm Supabase env vars are set and the app boots without console/runtime errors.[done]
- Confirm the latest schema changes are applied.[done]
- Confirm required buckets exist and are accessible:[done]
  - `organization-profile-images`
  - `user-profile-images`
  - `project-references`
  - `task-deliverables`
- Confirm at least these roles exist in test accounts:[done]
  - `communication_manager` or `creative_manager`
  - `designer`
  - `client`
- Confirm at least one client organization exists with:[done]
  - no liaison
  - one liaison
  - multiple liaisons

## 2. Auth And Session

- Login as manager and confirm loading does not flicker back to login before routing.[done]
- Refresh on an authenticated page and confirm session restores correctly.[done]
- Logout and confirm protected pages are no longer accessible.[done]
- Accept an invitation and confirm the created profile fields are saved correctly.[done]
  - manager
  - designers
  - liasons 

## 3. Manager Project Flows

- Create a project manually with:[done]
  - client organization selected
  - no liaison selected
- Create a project manually with:[done]
  - client organization selected
  - liaison selected from the dropdown
- Update a project and confirm:[done]
  - organization persists
  - contact person persists
  - contact number persists
  - reference files persist
  - workflow stage updates correctly
- Delete a project and confirm it disappears from:[done]
  - projects list
  - dashboard
  - client org detail page

## 4. Bulk Upload

- Open bulk upload popup.[done]
- Click upload and import a valid `.csv`.[done]
- Click upload and import a valid `.xlsx`.[done]
- Drag a valid file over the browser while the popup is open and confirm:[done]
  - full-screen blurred drop layer appears
  - dropping the file loads it into the popup
  - overlay disappears after drop
- Confirm a missing company name:[done]
  - auto-creates a client organization
  - sets it as `external`
  - sets it as `active`
  - generates a project prefix
- Confirm a row without `Project ID` auto-generates a project code from the organization prefix.[done]
- Confirm a row with explicit `Project ID` preserves that value.[done]
- Confirm imported projects save:[done]
  - `project_code`
  - `requested_date`
  - `client_organization_id`
  - `contact_person`
  - `contact_number`
  - `project_type`
  - `priority_level`
  - `first_draft_date`
  - `final_deliverable_date`
  - `project_objective`
  - `project_brief`
  - `creative_advice`
  - `description`
  - `reference_attachment_url`
- Confirm invalid rows fail with readable row-level messages.[to double check]

## 5. Client Organization Flows

- Open clients page and confirm it shows organizations, not flat client users.[done]
- Open an organization detail page and confirm:[done]
  - liaison list loads
  - project list loads
  - stats match the projects in that organization
- Create a new organization.[done]
- Update an organization.[done]
- Invite a liaison into an organization.[done]
- Confirm accepted liaison appears under the correct organization.[done]

## 6. Client Visibility

- Login as a client liaison.[done]
- Confirm client can only see projects belonging to their `clientOrganizationId`.[done]
- Confirm client cannot see projects from another organization.[done]
- Confirm client home routes to the organization-oriented home flow.[done]
- Confirm project detail loads correctly for client-visible projects.[done]
- Confirm client can see:[done]
  - organization name
  - project summary
  - client-visible tasks only
  - feedback areas intended for clients

## 7. Designer Visibility

- Login as a designer.[done]
- Confirm dashboard shows only assigned or related projects/tasks.[done]
- Confirm tasks page only shows tasks assigned to that designer.[done]
- Confirm designer cannot see unrelated projects or tasks.[done]
- Confirm designer can update allowed task statuses only.[done]
- Confirm designer cannot edit manager-only project workflow.[done]

## 8. Task Lifecycle

- Manager creates a task from project detail.[done]
- Manager creates a task from tasks page.[done]
- Manager creates a task from dashboard quick action.[done]
- Confirm create task popup shows loading correctly above the popup.[done]
- Designer updates task to in progress.[done]
- Designer completes a task and uploads deliverables.[done]
- Confirm deliverables persist and are visible afterward.[done]
- Manager opens task detail and can see deliverables.[done]
- Manager submits task to client review.[done]
- Confirm deliverables remain visible after submission.[done]
- Manager requests revision with a comment.[to check]
- Confirm task status changes correctly for revision flow.
- Confirm recent activity logs the real action performed.

## 9. Reference And Deliverable Files

- Upload multiple project reference files.
- Confirm images show thumbnails where expected.
- Confirm non-image files show usable labels.
- Open/download uploaded reference files.
- Upload task deliverable files and screenshots.
- Open image preview full-screen from task detail.
- Confirm file URLs remain accessible after status changes.

## 10. Invitations

- Invite designer.
- Invite manager-role team member.
- Invite client liaison into an organization.
- Confirm client invite requires an organization.
- Confirm non-client invite does not require an organization.
- Revoke an invite and confirm list updates.
- Accept an invite and confirm profile fields and organization linkage are correct.

## 11. Search, Filter, And Pagination

- On projects, tasks, clients, and team pages:
  - typing alone should not search until search button is pressed
  - filter popup opens and closes correctly
  - clicking outside custom selects closes the dropdown
- Confirm pagination works on:
  - projects
  - tasks
  - clients
  - team
  - dashboard cards where applicable
- Confirm mobile hides pagination where intended and uses load-more/scroll behavior where intended.

## 12. Mobile And Tablet

- Test iPhone viewport on:
  - dashboard
  - projects
  - project detail
  - tasks
  - clients
  - team
- Confirm vertical scrolling works on every page.
- Confirm bottom nav spacing is correct on iOS.
- Confirm sidebar stays fixed correctly on larger viewports.
- Confirm modals do not overflow horizontally.
- Confirm date pickers and dropdowns are visible above popups.

## 13. Error And Regression Checks

- Confirm there are no React hook-order warnings.
- Confirm there are no maximum update depth errors.
- Confirm there are no duplicate key warnings in task/project lists.
- Confirm there are no missing-column Supabase errors in the browser console.
- Confirm project detail and task detail routes do not 404 unexpectedly.

## 14. Final Technical Checks

- Run:

```bash
pnpm install
pnpm run check
```

- Run a local production build check:

```bash
pnpm run check:build
```

- Smoke test these routes after build:
  - `/`
  - `/dashboard`
  - `/projects`
  - `/projects/new`
  - `/projects/[id]`
  - `/tasks`
  - `/clients`
  - `/team`

## 15. Release Gate

Consider the app not ready if any of these are true:

- manager cannot create or edit projects reliably
- bulk upload imports malformed or incomplete project rows
- client sees projects outside their organization
- designer sees tasks/projects not assigned to them
- deliverables disappear after review-state transitions
- invitations do not correctly attach client liaisons to organizations
- mobile pages cannot scroll correctly
- `pnpm run check` or `pnpm run check:build` fails

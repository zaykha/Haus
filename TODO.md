# Haus TODO

## Admin / Manager CRUD Rollout

Only `communication_manager` and `creative_manager` should be allowed to perform the actions below.

### Chunk 1: Permission Foundation
- [x] Add explicit permission helpers for admin/manager-only CRUD actions.
- [x] Audit all create / edit / delete entry points and hide them for non-managers.
- [x] Guard state mutations and server routes so UI-only hiding is not the only protection.

### Chunk 2: Project CRUD
- [ ] Create project.
- [ ] Read/list project.
- [ ] Update project details:
  - [ ] Name
  - [ ] Description
  - [ ] Category
  - [ ] Due date
  - [ ] Staff assignments
  - [ ] Linked client
- [ ] Update project workflow:
  - [ ] Stage
  - [ ] Status
- [ ] Delete project with confirmation.

### Chunk 3: Tasks CRUD Inside Each Project
- [ ] Create task inside a project.
- [ ] Read/list tasks inside a project.
- [ ] Update task:
  - [ ] Title
  - [ ] Status
  - [ ] Assignee
- [ ] Delete task.
- [ ] Support assigning tasks to staff members only.

### Chunk 4: Client CRUD + Project Linking
- [ ] Create client record.
- [ ] Read/list clients.
- [ ] Update client details.
- [ ] Delete client with dependency rules defined.
- [ ] Link client to project.
- [ ] Reassign project to another client.
- [ ] Decide behavior when deleting a client who is linked to projects.

### Chunk 5: Team CRUD + Roles
- [ ] Create team member record / invitation path.
- [ ] Read/list team members.
- [ ] Update team member profile details.
- [ ] Update team member role.
- [ ] Remove team member from workspace.
- [ ] Define restrictions for changing or removing the last manager.

### Chunk 6: Data Model Cleanup
- [ ] Expand types and state model where current fields are too thin for CRUD flows.
- [ ] Add stable IDs and metadata where needed for edit/delete flows.
- [ ] Normalize task and project relationships if nested structure becomes too limiting.

### Chunk 7: Screen-by-Screen UI Pass
- [ ] `/projects`
  - [ ] Add edit project flow.
  - [ ] Add delete project flow.
  - [ ] Add status/stage editing UI.
- [ ] `/projects/[id]` or project detail screen
  - [ ] Add task CRUD UI.
  - [ ] Add staff assignment UI.
- [ ] `/tasks`
  - [ ] Add manager CRUD controls where appropriate.
- [ ] `/clients`
  - [ ] Add client CRUD controls and linking flows.
- [ ] `/team`
  - [ ] Add member CRUD and role management controls.

### Chunk 8: Validation + Safeguards
- [ ] Prevent assigning client users to staff-only fields.
- [ ] Prevent deleting entities still required by active relationships unless reassigned first.
- [ ] Add confirmation flows for destructive actions.
- [ ] Add empty, success, and error states for CRUD operations.

## Recommended Build Order

1. Permission foundation
2. Project CRUD
3. Task CRUD inside project detail
4. Client CRUD and project linking
5. Team CRUD and role management
6. Validation and cleanup pass

## Current Gap Summary

Current app state already supports:
- [x] Create project
- [x] Update project workflow
- [x] Update task status
- [x] Invitation create / revoke / accept

Current app state does not yet support:
- [ ] Update project details
- [ ] Delete project
- [ ] Create task
- [ ] Update task details beyond status
- [ ] Delete task
- [ ] CRUD client records
- [ ] CRUD team records / role updates

# TODO

- [ ] API: Add client-to-server endpoint under `app/api/workspace/projects/[id]/workflow/...` to update workflow status on client approve/request revision.
- [ ] Client: Wire a new handler in `components/project-detail-screen.tsx` and call it from the client feedback popup submit before closing.
- [ ] Ensure activity logging is consistent (insert into `project_activity`).
- [ ] Test: approve/revision updates workflow immediately and modal can be reopened.


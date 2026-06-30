# Pre-Production Test Checklist

This checklist is the minimum manual QA pass before shipping. Prioritize submit forms, validation behavior, project creation, task creation side effects, permissions, and release safety.

## Release blockers

- [ ] No submit form can silently fail.
- [ ] No required field can be skipped because of a default or preselected value.
- [ ] No project/task creation path can throw a database constraint error.
- [ ] No role can see or mutate data outside its allowed scope.
- [ ] Build succeeds in a production-like environment.

## Form validation baseline

Run these checks for every submit form that has required inputs.

- [ ] Submit with all required fields empty.
- [ ] Confirm native browser validation does not appear.
- [ ] Confirm the app shows the custom submit error popup.
- [ ] Confirm every missing required field turns label red.
- [ ] Confirm every missing required field turns border red.
- [ ] Confirm text inputs, textareas, dropdowns, and date pickers all use the same invalid treatment.
- [ ] Confirm only missing required fields are marked invalid.
- [ ] Confirm optional fields are never marked invalid when empty.
- [ ] Confirm fixing one field removes only that field's invalid state.
- [ ] Confirm invalid state is still visible after scroll, section collapse, or focus change.
- [ ] Confirm submit succeeds once all required inputs are valid.
- [ ] Confirm pressing submit multiple times does not create duplicates.

## Dropdown and calendar behavior

- [ ] Required dropdowns start empty.
- [ ] Required dropdowns do not preselect any option.
- [ ] Required dropdown labels stay unhoisted before selection.
- [ ] Required dropdowns show no placeholder text that conflicts with the stacked label.
- [ ] Selecting a dropdown option hoists the label correctly.
- [ ] Clearing and re-submitting restores the invalid red state.
- [ ] Required date fields start empty unless product rules explicitly require a default.
- [ ] Calendar fields show the stacked label without placeholder text.
- [ ] Picking a date hoists the label correctly.
- [ ] Keyboard and mouse interactions both work for dropdowns and calendars.

## Create project form

### Required-field validation

- [ ] Submit the create project form completely empty and verify all required fields fail with custom red labels and borders.
- [ ] Verify `Project Request Name` is required.
- [ ] Verify `Project Type` is required and starts unselected.
- [ ] Verify `Custom Project Type` is required only when `Project Type = Custom`.
- [ ] Verify `Priority Level` is required and starts unselected.
- [ ] Verify `First Draft Date` is required.
- [ ] Verify `Final Deliverable Date` is required.
- [ ] Verify `Company Name` is required.
- [ ] Verify `Status` is required and starts unselected for the non-client path unless intentionally forced by role rules.
- [ ] Verify `Department Name` is required when applicable.
- [ ] Verify `Primary Contact` is required.
- [ ] Verify `Contact Number` is required.

### Optional-field behavior

- [ ] Verify `Project Brief` can be empty and still submit.
- [ ] Verify `Reference` can be empty and still submit.
- [ ] Verify no optional field is highlighted red on empty submit.

### Field interaction

- [ ] Verify the company dropdown search filters results per keystroke.
- [ ] Verify the company dropdown can select the intended organization without accidental default selection.
- [ ] Verify contact options update correctly when company changes.
- [ ] Verify switching company does not leave a stale contact selected.
- [ ] Verify project type selection correctly shows and hides the custom project type field.
- [ ] Verify date order edge cases are handled if business rules require it.

### Submit outcomes

- [ ] Submit with `Auto create task` off and confirm the project is created with no auto-generated task.
- [ ] Submit with `Auto create task` on and confirm the project is created successfully.
- [ ] Confirm no `assignee_id` null constraint error occurs when auto-create is enabled.
- [ ] Confirm the auto-created task matches the intended create-project workflow rules.
- [ ] Confirm status/stage behavior is correct after project creation.
- [ ] Confirm redirect lands on the created project reliably.
- [ ] Confirm refresh after redirect shows persisted data.

## Bulk project upload

- [ ] Open bulk upload from the projects flow.
- [ ] Confirm the bulk modal includes the `Auto create task` toggle.
- [ ] Confirm the toggle defaults to the intended state.
- [ ] Upload a valid CSV file.
- [ ] Upload a valid XLSX file.
- [ ] Upload an empty file and verify the error message is clear.
- [ ] Upload a malformed file and verify the error message is clear.
- [ ] Verify drag-and-drop works.
- [ ] Verify removing and re-uploading a file works.
- [ ] Verify the parsed row count summary is correct.
- [ ] Import rows with `Auto create task` off and confirm projects are created without tasks.
- [ ] Import rows with `Auto create task` on and confirm tasks are created for `WIP`.
- [ ] Import rows with `Auto create task` on and confirm tasks are created for `Pending Review`.
- [ ] Confirm tasks are not auto-created for statuses that should not create one.
- [ ] Confirm imported projects route back to the projects list or expected destination.
- [ ] Confirm duplicate rows or duplicate project identifiers behave as intended.

## Task creation and workflow

- [ ] Manually create a task from the project detail flow.
- [ ] Assign a task to a designer.
- [ ] Leave a task unassigned if the workflow allows it.
- [ ] Verify status transitions work for open, in progress, pending review, approved, and revision states used in the app.
- [ ] Verify task counts and badges update after create/edit/status changes.
- [ ] Verify project stage derives correctly from task state.

## Role and permission coverage

### Manager

- [ ] Manager can create projects.
- [ ] Manager can bulk upload projects.
- [ ] Manager can create and assign tasks.
- [ ] Manager can access manager-only actions and pages.

### Designer

- [ ] Designer sees assigned tasks.
- [ ] Designer cannot access restricted manager-only create/edit actions.
- [ ] Designer can update allowed task states only.

### Client

- [ ] Client sees only allowed organizations, projects, tasks, and files.
- [ ] Client can create a project only where allowed.
- [ ] Client create-project defaults behave correctly for status, contact, and company scope.
- [ ] Client cannot access another client's project by URL.
- [ ] Client approval and revision flows still work after recent form changes.

## Navigation and layout

- [ ] Create project page sidebar stays visible while the form scrolls on desktop.
- [ ] Projects page sidebar behavior matches the intended pinned/sticky behavior.
- [ ] Long forms remain usable on common laptop heights.
- [ ] Mobile layout keeps fields, date pickers, and dropdowns usable without overlap.
- [ ] Tablet layout keeps form sections readable and actionable.

## Error handling

- [ ] API failure during submit shows a useful error instead of leaving the user stuck.
- [ ] Network interruption during submit does not create duplicate records.
- [ ] Supabase or backend constraint failures are surfaced cleanly.
- [ ] Submit buttons prevent accidental double submission while loading.
- [ ] Closing and reopening a modal/form resets transient error state correctly.

## Regression checks

- [ ] Existing edit forms still submit correctly after validation changes.
- [ ] Existing non-form pages are unaffected by the new field styling.
- [ ] Searchable dropdowns still work anywhere else they are reused.
- [ ] Shared custom date picker still works in all screens where it is used.
- [ ] Shared sidebar behavior is correct on all screens using `AppSidebar`.

## Build and deployment

- [ ] Install dependencies: `pnpm install`
- [ ] Run lint if configured: `pnpm lint`
- [ ] Run typecheck if configured: `pnpm typecheck`
- [ ] Run tests if configured: `pnpm test`
- [ ] Run production build: `pnpm build`
- [ ] Verify required environment variables are present for the target environment.
- [ ] Verify database migrations are applied in the target environment.
- [ ] Verify a smoke test in staging after deployment.

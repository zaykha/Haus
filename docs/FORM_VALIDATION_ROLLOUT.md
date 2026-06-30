# Form Validation Rollout

This document tracks the form-by-form validation pass for Haus.

## Target behavior

For required fields on submit:

- show a popup error when submit is pressed
- turn the missing field border red
- turn the floating label red
- keep the field highlighted until the missing value is fixed

## Scope

Only required-field validation is in scope for this pass.

Out of scope for the first pass:

- backend-only error normalization across every form
- non-required business-rule edge cases beyond the current form behavior
- search/filter forms

## Rollout order

1. Create project form
2. Remaining project/task creation forms
3. Auth and invitation forms
4. Client and organization management forms
5. Remaining submit forms

## Current status

- [x] Create project form
- [x] Dashboard inline task-create form
- [x] Tasks inline task-create form
- [x] Project detail inline task-create form
- [x] Designer task modal
- [x] Login screen
- [x] Accept invite screen
- [x] Invite workspace modal
- [x] Task detail edit and revise forms
- [x] Edit organization modal
- [ ] Remaining submit forms to audit

## Create project form rules

Mandatory sections:

- Deliverable
- Request Intake
- Contact

Optional sections:

- Brief
- Reference

Required fields currently enforced in the form:

- Project Request Name
- Project Type
- Custom Project Type, when Project Type is `Custom`
- Priority Level
- First Draft Date
- Final Deliverable Date
- Company Name
- Status
- Department Name
- Primary Contact
- Contact Number

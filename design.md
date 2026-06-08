# Haus Design System Guide

## 1. Brand Feel

Haus should feel like a modern creative studio dashboard.

Design keywords:

* Simple
* Modern
* Calm
* Premium
* Creative
* Clean
* Mobile-first
* Client-friendly

The UI should not feel like a heavy admin system. It should feel like a polished client portal for design agencies.

## 2. Font System

### Primary Font

Use **Geist Sans**.

Fallback:

```css
font-family: "Geist", "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Why:

* Modern
* Clean
* Good for dashboard UI
* Works well on mobile
* Professional but not boring

### Alternative Font

If Geist is not available, use **Inter**.

```css
font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Do not use decorative fonts for the MVP.

## 3. Color Palette

### Core Colors

```css
:root {
  --color-bg: #F7F4EF;
  --color-surface: #FFFFFF;
  --color-surface-soft: #FBFAF7;

  --color-text: #1F1F1F;
  --color-text-muted: #6F6A63;
  --color-text-light: #9A948C;

  --color-border: #E6E0D7;
  --color-border-strong: #D6CEC3;

  --color-primary: #2F5D50;
  --color-primary-hover: #264B41;
  --color-primary-soft: #E6F0EC;

  --color-accent: #C8A96A;
  --color-accent-soft: #F3EADB;

  --color-danger: #B42318;
  --color-danger-soft: #FDECEC;

  --color-warning: #B7791F;
  --color-warning-soft: #FFF4DB;

  --color-success: #2F7D4F;
  --color-success-soft: #E7F4EC;

  --color-info: #2563EB;
  --color-info-soft: #EAF0FF;
}
```

## 4. Color Usage

### Background

Use warm off-white as the main background:

```css
background: var(--color-bg);
```

### Cards

Use white cards:

```css
background: var(--color-surface);
border: 1px solid var(--color-border);
```

### Main Text

```css
color: var(--color-text);
```

### Secondary Text

```css
color: var(--color-text-muted);
```

### Primary Action

Use deep green:

```css
background: var(--color-primary);
color: white;
```

### Accent

Use muted gold only for small highlights, not large buttons.

Examples:

* “Premium”
* Small icon background
* Highlight line
* Approved badge accent

## 5. Status Colors

Use soft status pills.

```css
.status-active {
  background: var(--color-info-soft);
  color: var(--color-info);
}

.status-waiting {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}

.status-revision {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.status-approved {
  background: var(--color-success-soft);
  color: var(--color-success);
}

.status-completed {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
```

### Status Labels

Use these exact labels:

* Active
* Waiting Feedback
* Revision Needed
* Approved
* Completed

## 6. Typography Scale

Use a simple mobile-first type scale.

```css
--font-xs: 12px;
--font-sm: 14px;
--font-md: 16px;
--font-lg: 18px;
--font-xl: 22px;
--font-2xl: 28px;
```

### Usage

| Element          | Size | Weight |
| ---------------- | ---: | -----: |
| Tiny label       | 12px |    500 |
| Secondary text   | 14px |    400 |
| Body text        | 16px |    400 |
| Card title       | 18px |    600 |
| Page title       | 22px |    700 |
| Hero/login title | 28px |    700 |

### CSS Example

```css
.page-title {
  font-size: 22px;
  line-height: 1.25;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.card-title {
  font-size: 18px;
  line-height: 1.3;
  font-weight: 600;
}

.body-text {
  font-size: 16px;
  line-height: 1.6;
  font-weight: 400;
}

.label {
  font-size: 12px;
  line-height: 1.2;
  font-weight: 500;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
```

## 7. Spacing System

Use an 8px spacing system.

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
```

### Mobile Page Padding

```css
.page {
  padding: 16px;
  padding-bottom: 88px;
}
```

Bottom padding is important because the app uses bottom navigation.

## 8. Border Radius

Use soft but not childish rounded corners.

```css
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 16px;
--radius-xl: 24px;
--radius-full: 999px;
```

Usage:

| Element         | Radius |
| --------------- | -----: |
| Buttons         |   12px |
| Inputs          |   12px |
| Cards           |   16px |
| Modals / sheets |   24px |
| Pills           |  999px |

## 9. Shadow System

Keep shadows subtle.

```css
--shadow-sm: 0 1px 2px rgba(31, 31, 31, 0.06);
--shadow-md: 0 8px 24px rgba(31, 31, 31, 0.08);
--shadow-lg: 0 16px 40px rgba(31, 31, 31, 0.12);
```

Use shadows only for:

* Cards
* Bottom nav
* Floating action button
* Modal/drawer

Do not overuse heavy shadows.

## 10. Button Types

### Primary Button

Used for main actions:

* Create Project
* Save Changes
* Upload File
* Send Feedback
* Approve Design

```css
.btn-primary {
  height: 48px;
  padding: 0 18px;
  border-radius: 12px;
  border: none;
  background: var(--color-primary);
  color: #FFFFFF;
  font-size: 15px;
  font-weight: 600;
}
```

Hover/active:

```css
.btn-primary:hover {
  background: var(--color-primary-hover);
}
```

### Secondary Button

Used for less important actions:

* View Details
* Cancel
* Back
* Add Note

```css
.btn-secondary {
  height: 48px;
  padding: 0 18px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 15px;
  font-weight: 600;
}
```

### Ghost Button

Used for light actions:

* Edit
* Change
* View all
* Role switch

```css
.btn-ghost {
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 14px;
  font-weight: 500;
}
```

### Danger Button

Used for destructive actions:

* Delete Project
* Remove User
* Revoke Invite

```css
.btn-danger {
  height: 48px;
  padding: 0 18px;
  border-radius: 12px;
  border: none;
  background: var(--color-danger);
  color: #FFFFFF;
  font-size: 15px;
  font-weight: 600;
}
```

### Soft Button

Used for quick status actions:

* Mark as Waiting Feedback
* Mark as Approved
* Mark as Revision Needed

```css
.btn-soft {
  height: 40px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-soft);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 500;
}
```

## 11. Button Rules

Use full-width buttons on mobile for main actions.

```css
.mobile-full-button {
  width: 100%;
}
```

Minimum tap target:

```css
min-height: 44px;
```

Primary button should appear only once per main screen section.

Avoid placing many filled buttons together.

## 12. Input Fields

```css
.input {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 15px;
}
```

Focus state:

```css
.input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(47, 93, 80, 0.12);
}
```

Textarea:

```css
.textarea {
  min-height: 120px;
  padding: 14px;
  resize: vertical;
}
```

## 13. Cards

Use cards as the main layout unit.

```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 16px;
  box-shadow: var(--shadow-sm);
}
```

Project cards should include:

* Project name
* Client name
* Status pill
* Current stage
* Deadline
* Assigned designer
* Feedback state

## 14. Status Pills

```css
.pill {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
```

Pills should be soft, not filled with strong colors.

## 15. Bottom Navigation

Use fixed bottom navigation for mobile.

```css
.bottom-nav {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: 12px;
  height: 64px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(16px);
}
```

Nav item:

```css
.nav-item {
  font-size: 11px;
  color: var(--color-text-muted);
}

.nav-item-active {
  color: var(--color-primary);
  font-weight: 600;
}
```

## 16. Tabs

Use horizontal mobile tabs.

```css
.mobile-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.mobile-tab {
  flex: 0 0 auto;
  height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: 14px;
  font-weight: 500;
}

.mobile-tab-active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #FFFFFF;
}
```

## 17. Layout Rules

### Mobile Container

```css
.app-shell {
  min-height: 100vh;
  background: var(--color-bg);
}

.mobile-container {
  width: 100%;
  max-width: 430px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--color-bg);
}
```

### Page Header

```css
.page-header {
  position: sticky;
  top: 0;
  z-index: 20;
  padding: 16px;
  background: rgba(247, 244, 239, 0.92);
  backdrop-filter: blur(16px);
}
```

## 18. Icons

Use simple line icons.

Recommended icon style:

* Stroke icons
* 20px to 24px
* Rounded stroke
* Minimal detail

Good icon library:

* Lucide React

Use icons for:

* Home
* Projects
* Feedback
* Team
* Profile
* Upload
* Calendar
* User
* Check
* Alert
* File

## 19. Project Stage Timeline

Use a vertical timeline on mobile.

Each stage should show:

* Dot
* Stage name
* Completed/current/upcoming state

States:

```css
.timeline-dot-completed {
  background: var(--color-primary);
}

.timeline-dot-current {
  background: var(--color-accent);
}

.timeline-dot-upcoming {
  background: var(--color-border-strong);
}
```

## 20. File Cards

File cards should feel visual but simple.

Each file card includes:

* Thumbnail placeholder
* File name
* Version
* Uploaded by
* Upload date
* Visibility pill

Thumbnail placeholder:

```css
.file-thumbnail {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  background: var(--color-accent-soft);
}
```

## 21. Feedback Cards

Feedback cards should clearly show role and status.

Client feedback should be visually easy to find.

```css
.feedback-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 16px;
}
```

For important client feedback:

```css
.feedback-card-important {
  border-color: var(--color-warning);
  background: var(--color-warning-soft);
}
```

## 22. Forms

Use one-column forms only.

Form spacing:

```css
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
```

Field group:

```css
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
```

Label:

```css
.field-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted);
}
```

## 23. Empty States

Use simple empty states.

Example:

```txt
No feedback yet.
Client feedback will appear here once submitted.
```

Empty state style:

```css
.empty-state {
  padding: 32px 16px;
  text-align: center;
  color: var(--color-text-muted);
}
```

## 24. Recommended Page Style

Each page should follow this structure:

```txt
Sticky Header
Main Content
Cards / Tabs / Forms
Bottom Navigation
```

Do not use desktop admin tables in the MVP.

## 25. Final Visual Direction

Haus should look like:

* A design studio client portal
* A premium mobile SaaS dashboard
* Simple enough for clients
* Powerful enough for managers
* Calm and professional
* Not playful
* Not corporate-heavy
* Not colorful like a social app
 
 ## Floating Label Input Style

For all text inputs, selects, date inputs, and textareas, use a floating label style similar to the one implemented in Eain Chan Myay.

The label should appear inside the input by default. When the input is focused or has a value, the label should float upward and sit on the top border line.

### Default State

* Label appears inside the input field.
* Label is vertically centered.
* Border is light and subtle.
* Background is white or warm off-white.

### Focus / Filled State

* Label moves upward.
* Label sits on the top border area.
* Label background should match the input background so the border line does not cut through the text.
* Border changes to primary color.
* Input gets a soft focus shadow.

### Input Wrapper Structure

Use this kind of structure:

```tsx
<div className="floating-field">
  <input id="projectName" placeholder=" " />
  <label htmlFor="projectName">Project Name</label>
</div>
```

Important:

* Use `placeholder=" "` so the CSS `:placeholder-shown` logic works.
* Do not use normal visible placeholder text.
* The label itself acts as the placeholder.

### Floating Input CSS

```css
.floating-field {
  position: relative;
  width: 100%;
}

.floating-field input,
.floating-field textarea,
.floating-field select {
  width: 100%;
  min-height: 52px;
  padding: 18px 14px 8px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 15px;
  font-family: inherit;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.floating-field textarea {
  min-height: 120px;
  padding-top: 22px;
  resize: vertical;
}

.floating-field label {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  padding: 0 5px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 15px;
  line-height: 1;
  pointer-events: none;
  transition: top 0.18s ease, transform 0.18s ease, font-size 0.18s ease, color 0.18s ease;
}

.floating-field textarea + label {
  top: 26px;
}

.floating-field input:focus,
.floating-field textarea:focus,
.floating-field select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(47, 93, 80, 0.12);
}

.floating-field input:focus + label,
.floating-field input:not(:placeholder-shown) + label,
.floating-field textarea:focus + label,
.floating-field textarea:not(:placeholder-shown) + label,
.floating-field select:focus + label,
.floating-field select:valid + label {
  top: 0;
  transform: translateY(-50%);
  font-size: 12px;
  color: var(--color-primary);
}
```

### Error State

```css
.floating-field.error input,
.floating-field.error textarea,
.floating-field.error select {
  border-color: var(--color-danger);
  box-shadow: 0 0 0 3px rgba(180, 35, 24, 0.1);
}

.floating-field.error label {
  color: var(--color-danger);
}

.field-error-message {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-danger);
}
```

### Disabled State

```css
.floating-field.disabled input,
.floating-field.disabled textarea,
.floating-field.disabled select {
  background: var(--color-surface-soft);
  color: var(--color-text-light);
  cursor: not-allowed;
}

.floating-field.disabled label {
  color: var(--color-text-light);
}
```

### Usage Rule

Use floating label inputs for:

* Login email input
* Create project form
* Invite user form
* Feedback form
* Profile form
* Status update notes
* Client details
* Project brief fields

Do not mix normal labels and floating labels in the same form. Use the floating label style consistently across Haus.

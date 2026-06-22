# Graph Report - Haus  (2026-06-22)

## Corpus Check
- 126 files · ~140,105 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2291 nodes · 3088 edges · 87 communities (75 shown, 12 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d9d30270`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]

## God Nodes (most connected - your core abstractions)
1. `useAppState()` - 41 edges
2. `requireWorkspaceUser()` - 28 edges
3. `ProjectDetailScreen()` - 27 edges
4. `formatRole()` - 26 edges
5. `Haus Design System Guide` - 26 edges
6. `isManagerRole()` - 22 edges
7. `getSupabaseAdminClient()` - 20 edges
8. `getUserClientOrganizationIds()` - 18 edges
9. `compilerOptions` - 16 edges
10. `formatLabel()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `formatTaskStatus()` --calls--> `getTaskStatusLabel()`  [EXTRACTED]
  components/team-screen.tsx → lib/display.ts
- `POST()` --calls--> `getSupabaseAdminClient()`  [EXTRACTED]
  app/api/tasks/upload-deliverable/route.ts → lib/supabase/admin.ts
- `POST()` --calls--> `getSupabaseAdminClient()`  [EXTRACTED]
  app/api/projects/upload-reference/route.ts → lib/supabase/admin.ts
- `requireWorkspaceUser()` --calls--> `getSupabaseAdminClient()`  [EXTRACTED]
  app/api/workspace/_auth.ts → lib/supabase/admin.ts
- `PATCH()` --calls--> `canEditTask()`  [EXTRACTED]
  app/api/workspace/projects/[id]/tasks/[taskId]/route.ts → lib/permissions.ts

## Communities (87 total, 12 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (205): ActionButton, ActionPanel, ActivityAvatar, ActivityItem, ActivityItemCard, ActivityLine, ActivityList, ActivityMeta (+197 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (165): ActionIcon, ArrowButton, ArrowCell, AssigneeCell, AssigneeRow, Avatar, BellBadge, BellButton (+157 more)

### Community 2 - "Community 2"
Cohesion: 0.01
Nodes (129): ActionButton, actionButtonCss, ActionIcon, ActionLink, ActionList, ActivityList, ActivityRow, ActivityRowCard (+121 more)

### Community 3 - "Community 3"
Cohesion: 0.01
Nodes (120): ActionCell, Avatar, cardSurface, Content, ControlsPanel, controlSurface, CountCell, DangerButton (+112 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (102): ActionIcon, ActivityList, ActivityRow, ArrowWrap, BellBadge, BellButton, cardSurface, ClientCell (+94 more)

### Community 5 - "Community 5"
Cohesion: 0.02
Nodes (110): ArrowWrap, Avatar, AvatarStack, Brand, ButtonIcon, cardSurface, Content, controlSurface (+102 more)

### Community 6 - "Community 6"
Cohesion: 0.02
Nodes (113): ActivityBody, ActivityIcon, ActivityList, ActivityRowCard, ActivityTime, ActivityTitle, BackLink, ButtonIcon (+105 more)

### Community 7 - "Community 7"
Cohesion: 0.02
Nodes (84): ActionIcon, cardSurface, ClientCell, ClientCopy, ClientMark, ClientMeta, ClientName, CompactMetaCard (+76 more)

### Community 8 - "Community 8"
Cohesion: 0.02
Nodes (74): ActionButton, ActionRow, AssetCard, AssetFileCard, AssetGrid, AssetList, AssetNameButton, AssetPreview (+66 more)

### Community 9 - "Community 9"
Cohesion: 0.03
Nodes (61): cardSurface, DesignerTaskModalTask, FeedbackBody, FeedbackItem, FeedbackList, FeedbackMeta, FeedbackPanel, FeedbackRow (+53 more)

### Community 10 - "Community 10"
Cohesion: 0.03
Nodes (49): Actions, ContactPlaceholder, controlCss, EmptySelectState, Field, FieldMeta, FloatingField, FloatingLabel (+41 more)

### Community 11 - "Community 11"
Cohesion: 0.2
Nodes (15): POST(), getClientOrganizationName(), POST(), deriveInvitationStatus(), generateSecureInvitationToken(), hashInvitationToken(), InvitationPreview, canInviteUsers() (+7 more)

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (37): getProjectStatusClass(), ClientOrganization, Comment, Department, Feedback, FeedbackAction, FileVersion, FileVisibility (+29 more)

### Community 13 - "Community 13"
Cohesion: 0.05
Nodes (32): BulkActions, BulkDropCard, BulkDropOverlay, BulkError, BulkImportMeta, BulkTitle, BulkTriggerButton, BulkUploadGrid (+24 more)

### Community 14 - "Community 14"
Cohesion: 0.06
Nodes (30): Actions, controlCss, FieldLabel, FloatingField, FloatingSelectField, Form, Header, HeaderActions (+22 more)

### Community 15 - "Community 15"
Cohesion: 0.07
Nodes (29): dependencies, next, react, react-dom, styled-components, @supabase/supabase-js, xlsx, devDependencies (+21 more)

### Community 16 - "Community 16"
Cohesion: 0.08
Nodes (24): buildCalendarDays(), CalendarHeader, CalendarIcon, CustomDatePicker(), CustomDatePickerProps, DayButton, DaysGrid, endOfMonth() (+16 more)

### Community 17 - "Community 17"
Cohesion: 0.05
Nodes (28): geist, metadata, metadataBase, AppSidebar(), Brand, navItems, Sidebar, SidebarAvatar (+20 more)

### Community 18 - "Community 18"
Cohesion: 0.09
Nodes (17): apiRequest(), AppStateContext, AppStateContextValue, areStringArraysEqual(), areUsersEqual(), fetchAuthUserProfile(), fetchWorkspaceState(), getAccessToken() (+9 more)

### Community 19 - "Community 19"
Cohesion: 0.05
Nodes (81): allowedPriorityLevels, buildOrganizationPrefixSeed(), buildUniqueOrganizationPrefix(), BulkProjectRow, POST(), POST(), AcceptInviteScreen(), RemoteInvitationPreview (+73 more)

### Community 20 - "Community 20"
Cohesion: 0.07
Nodes (24): Backdrop, Body, CloseButton, Description, EmptyState, FilterModal(), FilterOption, FilterSection (+16 more)

### Community 22 - "Community 22"
Cohesion: 0.06
Nodes (32): ActionArea, ActionCopy, ActionText, ActionTitle, Avatar, AvatarButton, BackButton, BackIcon (+24 more)

### Community 23 - "Community 23"
Cohesion: 0.09
Nodes (22): 13. Cards, 14. Status Pills, 16. Tabs, 18. Icons, 19. Project Stage Timeline, 1. Brand Feel, 20. File Cards, 24. Recommended Page Style (+14 more)

### Community 24 - "Community 24"
Cohesion: 0.08
Nodes (25): ActionStub, AvatarBlock, cardSurface, Content, DashboardScreenSkeleton(), HeaderBlock, Line, ListCard (+17 more)

### Community 25 - "Community 25"
Cohesion: 0.1
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 26 - "Community 26"
Cohesion: 0.11
Nodes (18): 10. Invitations, 11. Search, Filter, And Pagination, 12. Mobile And Tablet, 13. Error And Regression Checks, 14. Final Technical Checks, 15. Release Gate, 1. Environment And Data, 2. Auth And Session (+10 more)

### Community 27 - "Community 27"
Cohesion: 0.26
Nodes (7): appConfig, isSupabaseConfigured, allowedExtensions, allowedMimeTypes, getFileExtension(), isAllowedFile(), POST()

### Community 28 - "Community 28"
Cohesion: 0.17
Nodes (24): POST(), updateProjectRequestStatusIfAllowed(), createDefaultState(), getTaskCompletionLabel(), getTaskCompletionPath(), isTaskCompletionImage(), parseTaskCompletionAssets(), parseTaskCompletionState() (+16 more)

### Community 29 - "Community 29"
Cohesion: 0.13
Nodes (17): 1) Install, 2) Run (development), 3) Build, code:bash (pnpm install), code:bash (pnpm dev), code:bash (pnpm build), code:bash (cp .env.example .env.local), Deployment target: Vercel (+9 more)

### Community 31 - "Community 31"
Cohesion: 0.18
Nodes (11): AvatarGrid, AvatarImage, AvatarOption, AvatarPicker(), AvatarPickerProps, FieldHeader, FieldHelper, FieldLabel (+3 more)

### Community 32 - "Community 32"
Cohesion: 0.13
Nodes (13): Actions, Card, ConfirmActionModal(), ConfirmActionModalProps, controlCss, Copy, Description, Header (+5 more)

### Community 33 - "Community 33"
Cohesion: 0.36
Nodes (8): getProjectStagePercent(), getProjectStageStep(), getStageColor(), ProjectStageProgress(), ProjectStageProgressProps, Segment, Segments, STAGE_COLORS

### Community 34 - "Community 34"
Cohesion: 0.14
Nodes (13): Admin / Manager CRUD Rollout, Chunk 1: Permission Foundation, Chunk 2: Project CRUD, Chunk 3: Tasks CRUD Inside Each Project, Chunk 4: Client CRUD + Project Linking, Chunk 5: Team CRUD + Roles, Chunk 6: Data Model Cleanup, Chunk 7: Screen-by-Screen UI Pass (+5 more)

### Community 35 - "Community 35"
Cohesion: 0.15
Nodes (12): 1) Push to GitHub, 2) Import into Vercel, 3) Install command, 4) Build command, 5) Output directory, 6) Add environment variables in Vercel, 7) Deploy, 8) After deploy: configure Supabase Auth redirect URLs (+4 more)

### Community 36 - "Community 36"
Cohesion: 0.17
Nodes (12): 25. Final Visual Direction, code:tsx (<div className="floating-field">), code:css (.floating-field {), code:css (.floating-field.error input,), code:css (.floating-field.disabled input,), Default State, Disabled State, Error State (+4 more)

### Community 37 - "Community 37"
Cohesion: 0.17
Nodes (12): 4. Color Usage, Accent, Background, Cards, code:css (background: var(--color-bg);), code:css (background: var(--color-surface);), code:css (color: var(--color-text);), code:css (color: var(--color-text-muted);) (+4 more)

### Community 38 - "Community 38"
Cohesion: 0.17
Nodes (12): 10. Button Types, code:css (.btn-primary {), code:css (.btn-primary:hover {), code:css (.btn-secondary {), code:css (.btn-ghost {), code:css (.btn-danger {), code:css (.btn-soft {), Danger Button (+4 more)

### Community 39 - "Community 39"
Cohesion: 0.29
Nodes (6): buildClientOrganizationRows(), buildLiaisonRows(), ClientOrganizationRow, getClientOrganizationMark(), getClientOrganizationStatusLabel(), LiaisonRow

### Community 40 - "Community 40"
Cohesion: 0.67
Nodes (3): getAssetPath(), isPlainExternalLink(), isTaskCompletionLink()

### Community 41 - "Community 41"
Cohesion: 0.22
Nodes (8): Auth / profile system (high-level), Client approve, Client request revision, Main workflow: Client approve vs. request revision, RLS / permission notes, Roles (App-level), Storage buckets (uploads / screenshots), Supabase Setup (Haus)

### Community 42 - "Community 42"
Cohesion: 0.48
Nodes (5): normalizeCsvHeader(), parseCsvDocument(), buildRecordsFromGrid(), ParsedTabularDocument, parseTabularDocument()

### Community 43 - "Community 43"
Cohesion: 0.29
Nodes (6): Email invitations, Known Issues (MVP Notes), Payments, RLS / production hardening, Supabase schema/type sync, UI polish

### Community 44 - "Community 44"
Cohesion: 0.29
Nodes (6): Auth, Build, Client, Designer, Manager, Pre-deployment Test Checklist

### Community 45 - "Community 45"
Cohesion: 0.7
Nodes (4): blobToDataUrl(), fileToDataUrl(), loadImage(), optimizeImageToWebp()

### Community 46 - "Community 46"
Cohesion: 0.4
Nodes (5): 6. Typography Scale, code:css (--font-xs: 12px;), code:css (.page-title {), CSS Example, Usage

### Community 47 - "Community 47"
Cohesion: 0.4
Nodes (5): 17. Layout Rules, code:css (.app-shell {), code:css (.page-header {), Mobile Container, Page Header

### Community 48 - "Community 48"
Cohesion: 0.4
Nodes (5): 2. Font System, Alternative Font, code:css (font-family: "Geist", "Inter", system-ui, -apple-system, Bli), code:css (font-family: "Inter", system-ui, -apple-system, BlinkMacSyst), Primary Font

### Community 49 - "Community 49"
Cohesion: 0.5
Nodes (4): getClientProjectProgress(), getClientProjectTone(), isCompletedProject(), isPendingReviewProject()

### Community 50 - "Community 50"
Cohesion: 0.5
Nodes (4): countWords(), getProjectInitial(), getTodayIsoDate(), ProjectForm()

### Community 51 - "Community 51"
Cohesion: 0.22
Nodes (8): code:sql (begin;), code:sql (delete from storage.objects), code:sql (begin;), Database Cleanup, Full Cleanup, Important Schema Note, Storage Cleanup, Task Data Cleanup

### Community 52 - "Community 52"
Cohesion: 0.5
Nodes (3): Environment Variables, Security rules, Summary

### Community 53 - "Community 53"
Cohesion: 0.5
Nodes (4): 12. Input Fields, code:css (.input {), code:css (.input:focus {), code:css (.textarea {)

### Community 54 - "Community 54"
Cohesion: 0.5
Nodes (4): 22. Forms, code:css (.form {), code:css (.field {), code:css (.field-label {)

### Community 55 - "Community 55"
Cohesion: 0.5
Nodes (4): 7. Spacing System, code:css (--space-1: 4px;), code:css (.page {), Mobile Page Padding

### Community 58 - "Community 58"
Cohesion: 0.67
Nodes (3): 11. Button Rules, code:css (.mobile-full-button {), code:css (min-height: 44px;)

### Community 59 - "Community 59"
Cohesion: 0.67
Nodes (3): 15. Bottom Navigation, code:css (.bottom-nav {), code:css (.nav-item {)

### Community 60 - "Community 60"
Cohesion: 0.67
Nodes (3): 21. Feedback Cards, code:css (.feedback-card {), code:css (.feedback-card-important {)

### Community 61 - "Community 61"
Cohesion: 0.67
Nodes (3): 23. Empty States, code:txt (No feedback yet.), code:css (.empty-state {)

### Community 62 - "Community 62"
Cohesion: 0.67
Nodes (3): 3. Color Palette, code:css (:root {), Core Colors

### Community 63 - "Community 63"
Cohesion: 0.36
Nodes (7): canManageProjects(), getVisibleTasksForUser(), getAttentionTasksForProject(), taskNeedsAttention(), Project, Task, User

### Community 77 - "Community 77"
Cohesion: 0.53
Nodes (5): allowedExtensions, allowedMimeTypes, getFileExtension(), isAllowedFile(), POST()

### Community 78 - "Community 78"
Cohesion: 0.33
Nodes (5): avatarBase, AvatarFallback, AvatarImage, UserAvatar(), UserAvatarProps

### Community 79 - "Community 79"
Cohesion: 0.4
Nodes (5): DesignerTaskModal(), formatDueDate(), getCompletionMessage(), getCurrentTaskCompletionLabel(), getVersionLabel()

## Knowledge Gaps
- **1620 isolated node(s):** `Task`, `TaskDetailModalProps`, `modalOverlayStyle`, `modalContentStyle`, `Project` (+1615 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useAppState()` connect `Community 19` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 13`, `Community 14`, `Community 17`, `Community 18`, `Community 22`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `AppSidebar()` connect `Community 17` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 13`, `Community 19`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `formatRole()` connect `Community 19` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 12`, `Community 13`, `Community 14`, `Community 17`, `Community 22`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **What connects `Task`, `TaskDetailModalProps`, `modalOverlayStyle` to the rest of the system?**
  _1620 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
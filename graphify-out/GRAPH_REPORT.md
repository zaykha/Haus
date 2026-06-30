# Graph Report - Haus  (2026-06-30)

## Corpus Check
- 156 files · ~177,921 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2815 nodes · 3918 edges · 98 communities (85 shown, 13 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6bc40198`
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
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
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
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 103|Community 103]]

## God Nodes (most connected - your core abstractions)
1. `useAppState()` - 47 edges
2. `requireWorkspaceUser()` - 43 edges
3. `formatRole()` - 32 edges
4. `ProjectDetailScreen()` - 30 edges
5. `Haus Design System Guide` - 26 edges
6. `useActiveClientOrganization()` - 25 edges
7. `getSupabaseAdminClient()` - 23 edges
8. `isManagerRole()` - 22 edges
9. `getUserClientOrganizationIds()` - 19 edges
10. `AppSidebar()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `formatTaskStatus()` --calls--> `getTaskStatusLabel()`  [EXTRACTED]
  components/team-screen.tsx → lib/display.ts
- `TaskDetailModal()` --calls--> `useAppState()`  [EXTRACTED]
  TaskDetailModal.tsx → components/app-state.tsx
- `EditProjectModal()` --calls--> `useAppState()`  [EXTRACTED]
  EditProjectModal.tsx → components/app-state.tsx
- `ProjectDetailScreen()` --calls--> `useAppState()`  [EXTRACTED]
  ProjectDetailScreen.tsx → components/app-state.tsx
- `ProjectDetailScreen()` --calls--> `canManageWorkspace()`  [EXTRACTED]
  ProjectDetailScreen.tsx → lib/permissions.ts

## Communities (98 total, 13 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (209): ActionButton, ActionPanel, ActivityAvatar, ActivityItem, ActivityItemCard, ActivityLine, ActivityList, ActivityMeta (+201 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (185): ActionIcon, ArrowButton, ArrowCell, AssigneeCell, AssigneeRow, Avatar, BellBadge, BellButton (+177 more)

### Community 2 - "Community 2"
Cohesion: 0.01
Nodes (147): ActionButton, actionButtonCss, ActionIcon, ActionLink, ActionList, ActivityList, ActivityRow, ActivityRowCard (+139 more)

### Community 3 - "Community 3"
Cohesion: 0.01
Nodes (124): ActionCell, Avatar, cardSurface, Content, ControlsPanel, controlSurface, CountCell, DangerButton (+116 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (108): ActionIcon, ActivityList, ActivityRow, ArrowWrap, BellBadge, BellButton, cardSurface, ClientCell (+100 more)

### Community 5 - "Community 5"
Cohesion: 0.01
Nodes (137): ArrowWrap, Avatar, AvatarStack, Brand, ButtonIcon, cardSurface, Content, controlSurface (+129 more)

### Community 6 - "Community 6"
Cohesion: 0.01
Nodes (168): ActivityBody, ActivityIcon, ActivityList, ActivityRowCard, ActivityTime, ActivityTitle, BackLink, BrandActionRow (+160 more)

### Community 7 - "Community 7"
Cohesion: 0.02
Nodes (93): ActionIcon, cardSurface, ClientCell, ClientCopy, ClientMark, ClientMeta, ClientName, CompactMetaCard (+85 more)

### Community 8 - "Community 8"
Cohesion: 0.02
Nodes (74): ActionButton, ActionRow, AssetCard, AssetFileCard, AssetGrid, AssetList, AssetNameButton, AssetPreview (+66 more)

### Community 9 - "Community 9"
Cohesion: 0.03
Nodes (61): cardSurface, DesignerTaskModalTask, FeedbackBody, FeedbackItem, FeedbackList, FeedbackMeta, FeedbackPanel, FeedbackRow (+53 more)

### Community 10 - "Community 10"
Cohesion: 0.03
Nodes (54): Actions, ContactPlaceholder, controlCss, EmptySelectState, Field, FieldMeta, FloatingField, FloatingLabel (+46 more)

### Community 11 - "Community 11"
Cohesion: 0.1
Nodes (30): POST(), getClientOrganizationName(), POST(), deriveInvitationStatus(), generateSecureInvitationToken(), hashInvitationToken(), InvitationPreview, canInviteClientsForOrganization() (+22 more)

### Community 12 - "Community 12"
Cohesion: 0.05
Nodes (49): getClientProjectStatusLabel(), getProjectStagePercent(), getProjectStageStep(), getStageColor(), ProjectStageProgress(), ProjectStageProgressProps, Segment, Segments (+41 more)

### Community 13 - "Community 13"
Cohesion: 0.05
Nodes (38): BulkActions, BulkDropCard, BulkDropOverlay, BulkError, BulkImportMeta, BulkTitle, BulkToggleCardButton, BulkToggleCopy (+30 more)

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
Cohesion: 0.07
Nodes (18): Brand, navItems, Sidebar, SidebarAvatar, SidebarButton, SidebarIcon, sidebarItemCss, SidebarLabel (+10 more)

### Community 18 - "Community 18"
Cohesion: 0.1
Nodes (13): apiRequest(), AppStateContext, AppStateContextValue, areStringArraysEqual(), areUsersEqual(), fetchAuthUserProfile(), fetchWorkspaceState(), getAccessToken() (+5 more)

### Community 19 - "Community 19"
Cohesion: 0.16
Nodes (22): Project, ProjectDetailScreen(), ProjectDetailScreenProps, Task, canAssignTask(), canChangeWorkflow(), canCreateTask(), canCreateTeamMember() (+14 more)

### Community 20 - "Community 20"
Cohesion: 0.07
Nodes (24): Backdrop, Body, CloseButton, Description, EmptyState, FilterModal(), FilterOption, FilterSection (+16 more)

### Community 21 - "Community 21"
Cohesion: 0.23
Nodes (22): ChatScreen(), AppSidebar(), useAppState(), ClientOrganizationDetailScreen(), formatDate(), ClientsScreen(), DashboardScreen(), InviteWorkspaceModal() (+14 more)

### Community 22 - "Community 22"
Cohesion: 0.05
Nodes (34): ActionArea, ActionCopy, ActionText, ActionTitle, Avatar, AvatarButton, BackButton, BackIcon (+26 more)

### Community 23 - "Community 23"
Cohesion: 0.09
Nodes (22): 13. Cards, 14. Status Pills, 16. Tabs, 18. Icons, 19. Project Stage Timeline, 1. Brand Feel, 20. File Cards, 24. Recommended Page Style (+14 more)

### Community 24 - "Community 24"
Cohesion: 0.06
Nodes (31): ActionStub, AvatarBlock, cardSurface, CompactStatCard, Content, DashboardScreenSkeleton(), HeaderBlock, HeaderBrandRow (+23 more)

### Community 25 - "Community 25"
Cohesion: 0.1
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 26 - "Community 26"
Cohesion: 0.11
Nodes (18): 10. Invitations, 11. Search, Filter, And Pagination, 12. Mobile And Tablet, 13. Error And Regression Checks, 14. Final Technical Checks, 15. Release Gate, 1. Environment And Data, 2. Auth And Session (+10 more)

### Community 27 - "Community 27"
Cohesion: 0.02
Nodes (93): AttachmentPreviewBar, AttachmentPreviewMeta, AttachmentPreviewThumb, AttachmentRemoveButton, AvatarCol, Badge, Bubble, BubbleCol (+85 more)

### Community 29 - "Community 29"
Cohesion: 0.13
Nodes (17): 1) Install, 2) Run (development), 3) Build, code:bash (pnpm install), code:bash (pnpm dev), code:bash (pnpm build), code:bash (cp .env.example .env.local), Deployment target: Vercel (+9 more)

### Community 30 - "Community 30"
Cohesion: 0.15
Nodes (11): formatDate(), getFeedbackTone(), getProjectInitial(), getProjectStatusTone(), getUserInitial(), getWorkflowTimelineIndex(), ProjectDetailScreen(), getProjectStatusClass() (+3 more)

### Community 31 - "Community 31"
Cohesion: 0.13
Nodes (13): AcceptInviteScreen(), RemoteInvitationPreview, AvatarGrid, AvatarImage, AvatarOption, AvatarPicker(), AvatarPickerProps, FieldHeader (+5 more)

### Community 32 - "Community 32"
Cohesion: 0.13
Nodes (13): Actions, Card, ConfirmActionModal(), ConfirmActionModalProps, controlCss, Copy, Description, Header (+5 more)

### Community 33 - "Community 33"
Cohesion: 0.12
Nodes (22): allowedPriorityLevels, buildOrganizationPrefixSeed(), buildUniqueOrganizationPrefix(), BulkProjectRow, isProjectCodeConflict(), normalizeTaskCreationError(), POST(), POST() (+14 more)

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
Cohesion: 0.22
Nodes (9): ClientTitleLogo(), ClientTitleLogoProps, buildClientOrganizationRows(), buildLiaisonRows(), ClientOrganizationRow, getClientOrganizationMark(), getClientOrganizationStatusLabel(), LiaisonRow (+1 more)

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
Cohesion: 0.1
Nodes (22): Auth, Build, Build and deployment, Bulk project upload, Client, Create project form, Designer, Dropdown and calendar behavior (+14 more)

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
Cohesion: 0.15
Nodes (5): useChatUnreadTotal(), RequireAuth(), BottomNav(), PageHeader(), User

### Community 61 - "Community 61"
Cohesion: 0.67
Nodes (3): 23. Empty States, code:txt (No feedback yet.), code:css (.empty-state {)

### Community 62 - "Community 62"
Cohesion: 0.05
Nodes (38): BackButton, BackIcon, DeleteButton, EntityPill, ErrorText, Eyebrow, fetchTrashItems(), Grid (+30 more)

### Community 63 - "Community 63"
Cohesion: 0.25
Nodes (13): isIgnorableProjectActivityError(), POST(), canManageProjects(), getVisibleTasksForUser(), getAttentionCountForProject(), getAttentionTaskCount(), getAttentionTasksForProject(), getProjectAttentionCount() (+5 more)

### Community 72 - "Community 72"
Cohesion: 0.18
Nodes (15): getRoleTone(), TeamScreen(), DELETE(), INTERNAL_ROLES, PATCH(), appConfig, isSupabaseConfigured, canDeleteClient() (+7 more)

### Community 77 - "Community 77"
Cohesion: 0.67
Nodes (3): 21. Feedback Cards, code:css (.feedback-card {), code:css (.feedback-card-important {)

### Community 78 - "Community 78"
Cohesion: 0.08
Nodes (19): CardList, EmptyResult, ModeButton, ModePicker, OrgAvatar, PickerTitle, RecipientAvatarWrap, RecipientCard (+11 more)

### Community 79 - "Community 79"
Cohesion: 0.13
Nodes (21): BrandColorPicker(), BrandColorPickerProps, brandSwatches, ColorPreview, FieldHeader, FieldHelper, FieldLabel, HexInput (+13 more)

### Community 80 - "Community 80"
Cohesion: 0.22
Nodes (13): canStartDirectChat(), canStartOrgChat(), findExistingDirectConversation(), getUserOrgIds(), INTERNAL_ROLES, MANAGER_ROLES, POST(), ProfileRow (+5 more)

### Community 81 - "Community 81"
Cohesion: 0.25
Nodes (8): DesignerTaskModal(), formatDueDate(), getCompletionMessage(), getAssetPath(), isPlainExternalLink(), getCurrentTaskCompletionLabel(), getVersionLabel(), isTaskCompletionLink()

### Community 84 - "Community 84"
Cohesion: 0.5
Nodes (3): Chat Image Attachments SQL, code:sql (alter table public.chat_messages), code:sql (insert into storage.buckets (id, name, public))

### Community 89 - "Community 89"
Cohesion: 0.1
Nodes (17): BackButton, BackIcon, Eyebrow, Grid, Header, MutedNote, Pill, PillRow (+9 more)

### Community 90 - "Community 90"
Cohesion: 0.1
Nodes (24): EditProjectModal(), EditProjectModalProps, modalContentStyle, modalOverlayStyle, Project, modalContentStyle, modalOverlayStyle, Task (+16 more)

### Community 91 - "Community 91"
Cohesion: 0.22
Nodes (5): geist, metadata, metadataBase, AppStateProvider(), Shell()

### Community 92 - "Community 92"
Cohesion: 0.67
Nodes (3): 3. Color Palette, code:css (:root {), Core Colors

### Community 94 - "Community 94"
Cohesion: 0.15
Nodes (13): ActorRecord, ChildProjectRecord, ChildTaskRecord, DeletedOrganizationRow, DeletedProfileRow, DeletedProjectRow, DeletedTaskRow, formatCount() (+5 more)

### Community 95 - "Community 95"
Cohesion: 0.13
Nodes (31): POST(), updateProjectRequestStatusIfAllowed(), canEditTask(), taskHasClientReviewableDeliverable(), taskIsUnderReviewWithoutSubmittedDeliverable(), taskNeedsAttention(), bumpSubmittedVersion(), createDefaultState() (+23 more)

### Community 103 - "Community 103"
Cohesion: 0.29
Nodes (6): Create project form rules, Current status, Form Validation Rollout, Rollout order, Scope, Target behavior

## Knowledge Gaps
- **1996 isolated node(s):** `Task`, `TaskDetailModalProps`, `modalOverlayStyle`, `modalContentStyle`, `Project` (+1991 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useAppState()` connect `Community 21` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 13`, `Community 14`, `Community 17`, `Community 18`, `Community 19`, `Community 22`, `Community 27`, `Community 30`, `Community 31`, `Community 60`, `Community 62`, `Community 72`, `Community 82`, `Community 89`, `Community 90`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `formatRole()` connect `Community 21` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 72`, `Community 12`, `Community 13`, `Community 14`, `Community 17`, `Community 22`, `Community 89`, `Community 27`, `Community 62`, `Community 31`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `useActiveClientOrganization()` connect `Community 21` to `Community 0`, `Community 1`, `Community 2`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 13`, `Community 17`, `Community 22`, `Community 27`, `Community 60`, `Community 30`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `Task`, `TaskDetailModalProps`, `modalOverlayStyle` to the rest of the system?**
  _1996 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
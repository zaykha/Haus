"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import styled, { css } from "styled-components";
import { useAppState } from "@/components/app-state";
import { AppSidebar } from "@/components/app-sidebar";
import { FilterModal } from "@/components/filter-modal";
import { ListScreenSkeleton } from "@/components/page-skeletons";
import { ProjectStageProgress } from "@/components/project-stage-progress";
import { UserAvatar } from "@/components/user-avatar";
import { getClientBrandStyle } from "@/lib/client-branding";
import { canCreateProject as canCreateProjectPermission, canCreateProjectForOrganization, canViewProject, getUserClientOrganizationIds, getVisibleTasksForUser } from "@/lib/permissions";
import { getAttentionTasksForProject } from "@/lib/task-attention";
import { formatProjectStage, formatRole } from "@/lib/display";
import { Project, ProjectWorkflowStage } from "@/lib/types";

type StageFilterKey = "all" | ProjectWorkflowStage;
type SortKey = "due_date" | "name" | "created_at_desc" | "created_at_asc";
const MOBILE_BATCH_SIZE = 20;
const TABLE_BATCH_SIZE = 20;

const desktopNav = [
  { label: "Home", href: "/dashboard", icon: <IconHome /> },
  { label: "Projects", href: "/projects", icon: <IconFolder /> },
  { label: "Tasks", href: "/tasks", icon: <IconCheckCircle /> },
  { label: "Clients", icon: <IconUser /> },
  { label: "Team", href: "/team", icon: <IconUsers /> },
  { label: "Calendar", icon: <IconCalendar /> },
  { label: "Reports", icon: <IconChart /> },
  { label: "Files", icon: <IconFile /> },
] as const;

const stageFilterOptions: { key: StageFilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "Waiting List", label: "Waiting List" },
  { key: "WIP", label: "WIP" },
  { key: "Pending Review", label: "Pending Review" },
  { key: "On Hold", label: "On Hold" },
  { key: "Complete", label: "Complete" },
];

function formatDueDate(value: string) {
  if (!value) {
    return "TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  if (!value) {
    return "TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function getClientOrganizationName(
  project: Project,
  organizationNames: Map<string, string>,
  userNames: Map<string, string>,
) {
  if (project.clientOrganizationId) {
    const organizationName = organizationNames.get(project.clientOrganizationId);
    if (organizationName) {
      return organizationName;
    }
  }

  return project.contactPerson || "Unassigned client";
}

function getPrimaryContactLabel(project: Project, usersById: Map<string, { name: string; email: string }>) {
  if (project.contactPerson || project.contactNumber) {
    return [project.contactPerson, project.contactNumber].filter(Boolean).join(" · ");
  }

  const contact = project.primaryClientContactId ? usersById.get(project.primaryClientContactId) : null;
  if (!contact) {
    return "No primary contact";
  }

  return `${contact.name} · ${contact.email}`;
}

function getProjectMark(project: Project) {
  return project.name.trim().charAt(0).toUpperCase() || "P";
}

function isSameMonth(value: string, reference: Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth();
}

function isProjectCompletedThisMonth(project: Project, reference: Date) {
  const latestCompletionActivity = [...project.activities]
    .filter(
      (activity) =>
        activity.action === "workflow_updated" &&
        activity.message.toLowerCase().includes("updated project status to complete"),
    )
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0] ?? null;

  if (latestCompletionActivity) {
    return isSameMonth(latestCompletionActivity.createdAt, reference);
  }

  return Boolean(project.createdAt) && isSameMonth(project.createdAt ?? "", reference);
}

export function ProjectsScreen() {
  const { ready, state, user } = useAppState();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [currentPage, setCurrentPage] = useState(1);
  const [mobileVisibleCount, setMobileVisibleCount] = useState(MOBILE_BATCH_SIZE);
  const [desktopTableVisibleCount, setDesktopTableVisibleCount] = useState(TABLE_BATCH_SIZE);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilterKey>("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [organizationFilter, setOrganizationFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("due_date");
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [desktopView, setDesktopView] = useState<"cards" | "table">("table");
  const mobileLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const desktopTableWrapRef = useRef<HTMLElement | null>(null);
  const desktopTableLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const quickFilter = searchParams.get("quick") ?? "";
  const appliedFilterCount =
    (quickFilter ? 1 : 0) +
    (stageFilter !== "all" ? 1 : 0) +
    (priorityFilter !== "all" ? 1 : 0) +
    (organizationFilter !== "all" ? 1 : 0);
  const appliedSortCount = sort !== "due_date" ? 1 : 0;

  // Keep hooks unconditionally called: ESLint rules-of-hooks
  const visibleProjects = state.projects.filter((project) => (user ? canViewProject(user, project) : false));
  const canManage = user ? canCreateProjectPermission(user.role) : false;
  const canCreateAnyProject = Boolean(
    user &&
      (canManage ||
        state.clientOrganizations.some((organization) => canCreateProjectForOrganization(user, organization.id))),
  );
  const organizationNames = useMemo(
    () => new Map(state.clientOrganizations.map((organization) => [organization.id, organization.name])),
    [state.clientOrganizations],
  );
  const userNames = useMemo(
    () => new Map(state.users.map((member) => [member.id, member.name])),
    [state.users],
  );
  const usersById = useMemo(
    () => new Map(state.users.map((member) => [member.id, { name: member.name, email: member.email }])),
    [state.users],
  );
  const organizationFilterOptions = useMemo(
    () => [
      { value: "all", label: "All" },
      ...state.clientOrganizations
        .map((organization) => ({
          value: organization.id,
          label: organization.name,
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    ],
    [state.clientOrganizations],
  );
  const priorityFilterOptions = useMemo(
    () => [
      { value: "all", label: "All" },
      ...Array.from(
        new Set(
          visibleProjects
            .map((project) => project.priorityLevel?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      )
        .sort((left, right) => left.localeCompare(right))
        .map((value) => ({ value, label: value })),
    ],
    [visibleProjects],
  );
  const roleLabel = user ? formatRole(user.role).toUpperCase() : "";
  const canToggleDesktopView = user ? user.role === "client" || canManage : false;
  const currentClientOrganization = useMemo(
    () =>
      user?.role === "client"
        ? state.clientOrganizations.find((organization) =>
            getUserClientOrganizationIds(user).includes(organization.id),
          ) ?? null
        : null,
    [state.clientOrganizations, user],
  );
  const clientBrandStyle = useMemo(
    () => getClientBrandStyle(currentClientOrganization),
    [currentClientOrganization],
  );

  const filteredProjects = useMemo(() => {
    const loweredSearch = search.trim().toLowerCase();
    const now = new Date();
    const nextProjects = visibleProjects.filter((project) => {
      const matchesStage = stageFilter === "all" ? true : project.stage === stageFilter;
      const matchesPriority =
        priorityFilter === "all" ? true : (project.priorityLevel?.trim() ?? "") === priorityFilter;
      const matchesOrganization =
        organizationFilter === "all" ? true : project.clientOrganizationId === organizationFilter;
      const matchesQuickFilter =
        quickFilter === "active"
          ? project.status !== "done"
          : quickFilter === "awaiting_feedback"
            ? project.status === "review"
            : quickFilter === "completed_this_month"
              ? project.status === "done" && isProjectCompletedThisMonth(project, now)
              : true;
      const clientName = getClientOrganizationName(project, organizationNames, userNames).toLowerCase();
      const primaryContact = getPrimaryContactLabel(project, usersById).toLowerCase();
      const matchesSearch =
        !loweredSearch ||
        project.name.toLowerCase().includes(loweredSearch) ||
        project.description.toLowerCase().includes(loweredSearch) ||
        project.category.toLowerCase().includes(loweredSearch) ||
        clientName.includes(loweredSearch) ||
        primaryContact.includes(loweredSearch);

      return matchesStage && matchesPriority && matchesOrganization && matchesQuickFilter && matchesSearch;
    });

    return [...nextProjects].sort((left, right) => {
      if (sort === "created_at_desc") {
        return new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime();
      }

      if (sort === "created_at_asc") {
        return new Date(left.createdAt ?? 0).getTime() - new Date(right.createdAt ?? 0).getTime();
      }

      if (sort === "name") {
        return left.name.localeCompare(right.name);
      }

      return new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime();
    });
  }, [
    organizationFilter,
    organizationNames,
    priorityFilter,
    quickFilter,
    search,
    sort,
    stageFilter,
    userNames,
    usersById,
    visibleProjects,
  ]);

  const pageSize = 4;
  const totalProjects = filteredProjects.length;
  const totalPages = Math.max(1, Math.ceil(totalProjects / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const paginatedProjects = filteredProjects.slice(
    (activePage - 1) * pageSize,
    activePage * pageSize,
  );
  const tableProjects = filteredProjects.slice(0, desktopTableVisibleCount);
  const mobileProjects = filteredProjects.slice(0, mobileVisibleCount);
  const rangeStart = totalProjects ? (activePage - 1) * pageSize + 1 : 0;
  const rangeEnd = totalProjects ? Math.min(activePage * pageSize, totalProjects) : 0;

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchDraft);
    setCurrentPage(1);
  };

  useEffect(() => {
    if (!user) return;
    setMobileVisibleCount(MOBILE_BATCH_SIZE);
    setDesktopTableVisibleCount(TABLE_BATCH_SIZE);
  }, [user, search, stageFilter, priorityFilter, organizationFilter, sort, visibleProjects.length, desktopView]);

  useEffect(() => {
    if (!user) return;

    const node = mobileLoadMoreRef.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          return;
        }

        setMobileVisibleCount((current) =>
          Math.min(current + MOBILE_BATCH_SIZE, filteredProjects.length),
        );
      },
      { rootMargin: "180px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [user, filteredProjects.length]);

  useEffect(() => {
    if (!user || desktopView !== "table") return;

    const root = desktopTableWrapRef.current;
    const node = desktopTableLoadMoreRef.current;
    if (!root || !node) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          return;
        }

        setDesktopTableVisibleCount((current) =>
          Math.min(current + TABLE_BATCH_SIZE, filteredProjects.length),
        );
      },
      { root, rootMargin: "180px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [desktopView, filteredProjects.length, user]);

  if (!ready) {
    return <ListScreenSkeleton title="Projects" />;
  }

  return (
    <PageShell style={user?.role === "client" ? clientBrandStyle : undefined}>
      {user ? <AppSidebar user={user} activeLabel="Projects" /> : null}

      <Content>
        <DesktopHeader>
          <DesktopHeaderTop>
            <DesktopHeaderCopy>
              <Eyebrow>{roleLabel}</Eyebrow>
              <Title>Select a project</Title>
              <Subtitle>
                Choose a project workspace to manage deliverables, staff, clients, and tasks.
              </Subtitle>
            </DesktopHeaderCopy>
            <HeaderAvatarLink href="/profile" aria-label="Open profile">
              {user ? <UserAvatar user={user} /> : null}
            </HeaderAvatarLink>
          </DesktopHeaderTop>
        </DesktopHeader>

        <MobileHeader>
          <MobileHeaderCopy>
            <Eyebrow>{roleLabel}</Eyebrow>
            <Title>Select a project</Title>
          </MobileHeaderCopy>
          <HeaderAvatarLink href="/profile" aria-label="Open profile">
            {user ? <UserAvatar user={user} /> : null}
          </HeaderAvatarLink>
        </MobileHeader>

        <Toolbar>
          <FilterModal
            open={showFilters}
            title="Filter projects"
            description="Adjust project filtering."
            sections={[
              {
                id: "stageFilter",
                label: "Stage",
                options: stageFilterOptions.map((option) => ({
                  value: option.key,
                  label: option.label,
                })),
              },
              {
                id: "priorityFilter",
                label: "Priority",
                options: priorityFilterOptions,
              },
              {
                id: "organizationFilter",
                label: "Client organization",
                options: organizationFilterOptions,
                searchable: true,
                searchPlaceholder: "Search organizations...",
              },
            ]}
            values={{ stageFilter, priorityFilter, organizationFilter }}
            onApply={(nextValues) => {
              setStageFilter(nextValues.stageFilter as StageFilterKey);
              setPriorityFilter(nextValues.priorityFilter);
              setOrganizationFilter(nextValues.organizationFilter);
              setCurrentPage(1);
            }}
            onReset={() => {
              setStageFilter("all");
              setPriorityFilter("all");
              setOrganizationFilter("all");
              setCurrentPage(1);
              router.replace(pathname);
            }}
            onClose={() => setShowFilters(false)}
          />
          <FilterModal
            open={showSort}
            title="Sort projects"
            description="Adjust project sorting."
            sections={[
              {
                id: "sort",
                label: "Sort by",
                options: [
                  { value: "due_date", label: "Due date" },
                  { value: "created_at_desc", label: "Newest to Oldest" },
                  { value: "created_at_asc", label: "Oldest to Newest" },
                  { value: "name", label: "Name" },
                ],
              },
            ]}
            values={{ sort }}
            onApply={(nextValues) => {
              setSort(nextValues.sort as SortKey);
              setCurrentPage(1);
            }}
            onReset={() => {
              setSort("due_date");
              setCurrentPage(1);
            }}
            onClose={() => setShowSort(false)}
            applyLabel="Apply sort"
            resetLabel="Default sort"
          />
          <SearchControls onSubmit={handleSearchSubmit}>
            <SearchWrap>
              <SearchInput
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search projects, clients, or keywords..."
              />
            </SearchWrap>
            <FilterMenuWrap>
              <FilterButton
                type="button"
                aria-label="Open filters"
                aria-expanded={showFilters}
                onClick={() => setShowFilters(true)}
              >
                {appliedFilterCount ? <FilterBadge>{appliedFilterCount}</FilterBadge> : null}
                <ButtonIcon>
                  <IconFilter />
                </ButtonIcon>
              </FilterButton>
              <FilterButton
                type="button"
                aria-label="Open sorting"
                aria-expanded={showSort}
                onClick={() => setShowSort(true)}
              >
                {appliedSortCount ? <FilterBadge>{appliedSortCount}</FilterBadge> : null}
                <ButtonIcon>
                  <IconSort />
                </ButtonIcon>
              </FilterButton>
            </FilterMenuWrap>
            <SearchButton type="submit" aria-label="Search projects">
              <ButtonIcon>
                <IconSearch />
              </ButtonIcon>
            </SearchButton>
          </SearchControls>

          {canToggleDesktopView ? (
            <ProjectsDesktopViewToggleGroup aria-label="Project view">
              <ProjectsDesktopViewButton
                type="button"
                $active={desktopView === "cards"}
                onClick={() => setDesktopView("cards")}
              >
                Cards
              </ProjectsDesktopViewButton>
              <ProjectsDesktopViewButton
                type="button"
                $active={desktopView === "table"}
                onClick={() => setDesktopView("table")}
              >
                Table
              </ProjectsDesktopViewButton>
            </ProjectsDesktopViewToggleGroup>
          ) : null}

          {canCreateAnyProject ? (
            <CreateButton href="/projects/new">
              <ButtonIcon>
                <IconPlus />
              </ButtonIcon>
              <span>Create Project</span>
            </CreateButton>
          ) : null}
        </Toolbar>

        {desktopView === "cards" || !canToggleDesktopView ? (
          <DesktopList>
            {paginatedProjects.length ? (
              paginatedProjects.map((project) => {
                const clientOrganizationName = getClientOrganizationName(project, organizationNames, userNames);
                const primaryContactLabel = project.contactPerson?.trim() || "No primary contact";
                const contactNumberLabel = project.contactNumber?.trim() || "No contact number";
                const attentionCount = user ? getAttentionTasksForProject(user, project).length : 0;

                return (
                  <ProjectRow key={project.id} href={`/projects/${project.id}`} $attention={attentionCount > 0}>
                    <ProjectTopleft>
                      <ProjectIdBadge>{project.projectCode ?? project.id}</ProjectIdBadge>
                      <OrganizationPill>{clientOrganizationName}</OrganizationPill>
                    </ProjectTopleft>
                    
                    {attentionCount > 0 ? (
                      <ProjectAttentionBadge>{attentionCount > 99 ? "99+" : attentionCount}</ProjectAttentionBadge>
                    ) : null}
                    <ProjectMark>{getProjectMark(project)}</ProjectMark> 
                    <ProjectSummary>
                      <SummaryTitle>{project.name}</SummaryTitle>
                      <SummaryPills>
                        <SummaryPill>{primaryContactLabel}</SummaryPill>
                        <SummaryPill>{contactNumberLabel}</SummaryPill>
                      </SummaryPills>
                    </ProjectSummary>

                    <MetaColumn $grow>
                      <MetaLabel>Stage</MetaLabel>
                      <MetaStrong>{formatProjectStage(project.stage)}</MetaStrong>
                      <ProjectStageProgress stage={project.stage} size="sm" />
                    </MetaColumn>

                    <MetaColumn>
                      <MetaLabel>Due date</MetaLabel>
                      <MetaStrong>{formatDueDate(project.dueDate)}</MetaStrong>
                    </MetaColumn>

                    <MetaColumn>
                      <MetaLabel>Staff</MetaLabel>
                      <AvatarStack>
                        {project.staffIds.slice(0, 3).map((staffId) => (
                          <Avatar key={staffId}>
                            {(userNames.get(staffId) ?? "?").slice(0, 1)}
                          </Avatar>
                        ))}
                        {project.staffIds.length > 3 ? (
                          <Avatar $muted>+{project.staffIds.length - 3}</Avatar>
                        ) : null}
                      </AvatarStack>
                    </MetaColumn>

                    <MetaColumn $narrow>
                      <MetaLabel>Open tasks</MetaLabel>
                      <MetaStrong>
                        {user
                          ? getVisibleTasksForUser(user, project).filter((task) => task.status !== "approved").length
                          : 0}
                      </MetaStrong>
                    </MetaColumn>
                  </ProjectRow>
                );
              })
            ) : (
              <EmptyCard>
                <EmptyTitle>No projects found</EmptyTitle>
                <EmptyCopy>Try another search term or create a new project workspace.</EmptyCopy>
              </EmptyCard>
            )}
          </DesktopList>
        ) : (
          <DesktopTableWrap ref={desktopTableWrapRef}>
            {tableProjects.length ? (
              <>
                <DesktopTable>
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Organization</th>
                      <th>Stage</th>
                      <th>Due date</th>
                      <th>Primary contact</th>
                      <th>Contact number</th>
                      <th>Open tasks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableProjects.map((project) => {
                      const clientOrganizationName = getClientOrganizationName(project, organizationNames, userNames);
                      const primaryContactLabel = project.contactPerson?.trim() || "No primary contact";
                      const contactNumberLabel = project.contactNumber?.trim() || "No contact number";
                      const attentionCount = user ? getAttentionTasksForProject(user, project).length : 0;

                      return (
                        <DesktopTableRow
                          key={project.id}
                          $attention={attentionCount > 0}
                          onClick={() => {
                            void router.push(`/projects/${project.id}`);
                          }}
                        >
                          <td>
                            <TableProjectCell>
                              <ProjectIdBadge>{project.projectCode ?? project.id}</ProjectIdBadge>
                              <strong>{project.name}</strong>
                            </TableProjectCell>
                          </td>
                          <td>
                            <OrganizationPill>{clientOrganizationName}</OrganizationPill>
                          </td>
                          <td>
                            <TableStageCell>
                              <span>{formatProjectStage(project.stage)}</span>
                              <ProjectStageProgress stage={project.stage} size="sm" showStageLabel={false} />
                            </TableStageCell>
                          </td>
                          <td>{formatDueDate(project.dueDate)}</td>
                          <td>{primaryContactLabel}</td>
                          <td>{contactNumberLabel}</td>
                          <td>{user ? getVisibleTasksForUser(user, project).filter((task) => task.status !== "approved").length : 0}</td>
                        </DesktopTableRow>
                      );
                    })}
                  </tbody>
                </DesktopTable>
                {desktopTableVisibleCount < filteredProjects.length ? (
                  <DesktopTableLoadMoreSentinel ref={desktopTableLoadMoreRef} />
                ) : null}
              </>
            ) : (
              <EmptyCard>
                <EmptyTitle>No projects found</EmptyTitle>
                <EmptyCopy>Try another search term or create a new project workspace.</EmptyCopy>
              </EmptyCard>
            )}
          </DesktopTableWrap>
        )}

        <MobileList>
          {mobileProjects.length ? (
            mobileProjects.map((project) => {
              const attentionCount = user ? getAttentionTasksForProject(user, project).length : 0;

              return (
                <MobileProjectCard key={project.id} href={`/projects/${project.id}`} $attention={attentionCount > 0}>
                  <ProjectIdBadge>{project.projectCode ?? project.id}</ProjectIdBadge>
                  {attentionCount > 0 ? (
                    <ProjectAttentionBadge>{attentionCount > 99 ? "99+" : attentionCount}</ProjectAttentionBadge>
                  ) : null}
                  <MobileProjectMark>{getProjectMark(project)}</MobileProjectMark>
                  <MobileCopy>
                    <MobileTitleRow>
                      <MobileTitle>{project.name}</MobileTitle>
                      <MobileStagePill>{formatProjectStage(project.stage)}</MobileStagePill>
                    </MobileTitleRow>
                    <MobileInfoRow>
                      <MobileClientName>{getClientOrganizationName(project, organizationNames, userNames)}</MobileClientName>
                      <MobileMetaText>Due {formatShortDate(project.dueDate)}</MobileMetaText>
                    </MobileInfoRow>
                    <MobilePillRow>
                      <SummaryPill>{project.contactPerson?.trim() || "No primary contact"}</SummaryPill>
                      <SummaryPill>{project.contactNumber?.trim() || "No contact number"}</SummaryPill>
                    </MobilePillRow>
                    <ProjectStageProgress stage={project.stage} size="sm" />
                  </MobileCopy>
                </MobileProjectCard>
              );
            })
          ) : (
            <EmptyCard>
              <EmptyTitle>No projects found</EmptyTitle>
              <EmptyCopy>Try another search term or create a new project workspace.</EmptyCopy>
            </EmptyCard>
          )}
        </MobileList>

        {mobileVisibleCount < filteredProjects.length ? <LoadMoreSentinel ref={mobileLoadMoreRef} /> : null}

        {filteredProjects.length && (desktopView !== "table" || !canToggleDesktopView) ? (
          <PaginationBar>
            <CountText>
              Showing {rangeStart} to {rangeEnd} of {totalProjects} projects
            </CountText>
            <PaginationControls>
              <PaginationButton
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={activePage === 1}
              >
                Last
              </PaginationButton>
              <PaginationCurrent>{activePage}</PaginationCurrent>
              <PaginationButton
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={activePage === totalPages}
              >
                Next
              </PaginationButton>
            </PaginationControls>
          </PaginationBar>
        ) : null}
      </Content>
    </PageShell>
  );
}

const tablet = "@media (min-width: 768px) and (max-width: 1099px)";
const tabletUp = "@media (min-width: 768px)";
const desktop = "@media (min-width: 1100px)";

const cardSurface = css`
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.95);
  box-shadow: var(--shadow-sm);
`;

const controlSurface = css`
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: var(--shadow-sm);
`;

const PageShell = styled.main`
  display: block;
  min-height: 100vh;
  padding: 18px 16px 24px;

  ${tablet} {
    padding: 22px 28px calc(env(safe-area-inset-bottom) + 24px);
  }

  ${desktop} {
    display: flex;
    align-items: flex-start;
    padding: 8px;
    background: rgba(255, 255, 255, 0.58);
  }
`;

const Content = styled.section`
  display: flex;
  flex-direction: column;
  gap: 14px;

  ${desktop} {
    flex: 1;
    min-width: 0;
    padding: 28px 34px 26px;
    border-radius: 0 26px 26px 0;
    background:
      radial-gradient(circle at top center, rgba(255, 255, 255, 0.76), transparent 18%),
      linear-gradient(
        180deg,
        var(--client-brand-soft-panel, rgba(252, 249, 244, 0.92)),
        rgba(247, 243, 237, 0.84)
      );
  }
`;

const headerCss = css`
  h1 {
    margin: 4px 0 8px;
    line-height: 1;
    letter-spacing: -0.04em;
  }
`;

const DesktopHeader = styled.header`
  display: none;

  ${desktop} {
    ${headerCss}
    display: flex;
    padding: 2px 8px 0;
  }
`;

const DesktopHeaderTop = styled.div`
  width: 100%;

  ${desktop} {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
  }
`;

const DesktopHeaderCopy = styled.div`
  min-width: 0;
`;

const MobileHeader = styled.header`
  ${headerCss}
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;

  ${desktop} {
    display: none;
  }
`;

const MobileHeaderCopy = styled.div`
  flex: 1;
  min-width: 0;
`;

const Eyebrow = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.2;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const Title = styled.h1`
  margin: 0;
  line-height: 1.05;
  letter-spacing: -0.03em;
`;

const Subtitle = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.55;
  width: 100%;

  ${desktop} {
    max-width: 720px;
    font-size: 0.92rem;
  }
`;

const HeaderAvatarLink = styled(Link)`
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: #ded6c8;
  color: #fff;
  font-weight: 700;
  text-decoration: none;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease,
    border-color 0.18s ease;

  ${desktop} {
    &:hover {
      transform: translateY(-2px);
      background: #e7ded0;
      border-color: rgba(220, 208, 194, 0.95);
      box-shadow: 0 14px 28px rgba(31, 31, 31, 0.08);
    }
  }
`;

const Toolbar = styled.section`
  display: grid;
  gap: 12px;

  ${desktop} {
    display: flex;
    align-items: center;
    gap: 18px;
  }
`;

const ProjectsDesktopViewToggleGroup = styled.div`
  display: none;

  ${desktop} {
  ${controlSurface}
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 3px;
    border-radius: 999px;
    flex: 0 0 auto;
  }
`;

const ProjectsDesktopViewButton = styled.button<{ $active?: boolean }>`
  min-height: 26px;
  padding: 0 9px;
  border: 0;
  border-radius: 999px;
  background: ${({ $active }) => ($active ? "var(--client-brand-primary, #214f39)" : "transparent")};
  color: ${({ $active }) => ($active ? "var(--client-brand-on-primary, #fff)" : "var(--color-text-muted)")};
  font-size: 0.7rem;
  font-weight: 600;
`;

const SearchControls = styled.form`
  display: flex;
  align-items: stretch;
  gap: 10px;

  ${desktop} {
    flex: 1;
  }
`;

const SearchWrap = styled.div`
  flex: 1;

  ${desktop} {
    min-width: 0;
  }
`;

const SearchIcon = styled.span`
  position: absolute;
  left: 18px;
  top: 50%;
  width: 18px;
  height: 18px;
  transform: translateY(-50%);
  color: var(--color-text-light);

  svg {
    width: 100%;
    height: 100%;
  }
`;

const SearchInput = styled.input`
  ${controlSurface}
  width: 100%;
  min-height: 40px;
  padding: 0 18px;
  border-radius: 10px;
  color: var(--color-text);
  font-size: 0.94rem;

  ${desktop} {
    min-height: 40px;
    border-radius: 10px;
  }
`;

const FilterMenuWrap = styled.div`
  display: flex;
  gap: 10px;
`;

const FilterButton = styled.button`
  ${controlSurface}
  position: relative;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
`;

const FilterBadge = styled.span`
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #d94b45;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 800;
  line-height: 1;
  box-shadow: 0 8px 18px rgba(217, 75, 69, 0.28);
`;

const SearchButton = styled(FilterButton)`
  background: var(--client-brand-primary, var(--color-primary));
  color: var(--client-brand-on-primary, #fff);
`;

const FilterPopup = styled.div`
  ${cardSurface}
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 10;
  width: min(280px, calc(100vw - 48px));
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 18px;
`;

const FilterPopupTitle = styled.strong`
  font-size: 0.9rem;
  color: var(--color-text);
`;

const FilterSelect = styled.select`
  ${controlSurface}
  width: 100%;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 10px;
`;

const CreateButton = styled(Link)`
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  background: var(--client-brand-primary, var(--color-primary));
  color: var(--client-brand-on-primary, #fff);
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 14px 26px rgba(31, 68, 57, 0.16);
  text-decoration: none;

  ${desktop} {
    min-height: 40px;
    flex: 0 0 230px;
  }
`;

const ButtonIcon = styled.span`
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 100%;
    height: 100%;
  }
`;

const FilterBar = styled.section`
  display: grid;
  gap: 12px;

  ${desktop} {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 18px;
  }
`;

const FilterScroll = styled.div`
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const FilterChip = styled.button<{ $active: boolean }>`
  flex: 0 0 auto;
  min-height: 36px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid ${({ $active }) => ($active ? "rgba(24, 62, 51, 0.16)" : "var(--color-border)")};
  background: ${({ $active }) => ($active ? "#203f35" : "rgba(255, 255, 255, 0.92)")};
  color: ${({ $active }) => ($active ? "#fff" : "var(--color-text)")};
  font-size: 0.84rem;
  font-weight: 600;
`;

const SortWrap = styled.label`
  display: none;

  ${desktop} {
    ${controlSurface}
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
    padding: 0 16px;
    border-radius: 999px;
    color: var(--color-text-muted);
  }
`;

const SortSelect = styled.select`
  min-height: auto;
  width: auto;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: inherit;
  font-size: 14px;
`;

const DesktopList = styled.section`
  display: none;

  ${desktop} {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 18px;
  }
`;

const DesktopTableWrap = styled.section`
  display: none;

  ${desktop} {
    ${cardSurface}
    display: block;
    margin-top: 18px;
    border-radius: 24px;
    overflow: auto;
    max-height: 650px;
  }
`;

const DesktopTableLoadMoreSentinel = styled.div`
  height: 1px;
`;

const DesktopTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;

  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 16px 18px;
    border-bottom: 1px solid rgba(230, 224, 215, 0.95);
    background: rgba(255, 255, 255, 0.98);
    color: var(--color-text-light);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-align: left;
    white-space: nowrap;
  }

  tbody td {
    padding: 14px 16px;
    border-top: 1px solid rgba(240, 235, 228, 0.9);
    vertical-align: middle;
    font-size: 0.82rem;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  tbody tr:first-child td {
    border-top: 0;
  }
`;

const DesktopTableRow = styled.tr<{ $attention?: boolean }>`
  background: ${({ $attention }) => ($attention ? "rgba(255, 244, 244, 0.92)" : "transparent")};
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;

  &:hover {
    background: ${({ $attention }) => ($attention ? "rgba(255, 232, 232, 0.98)" : "rgba(252, 241, 226, 0.98)")};
    box-shadow: inset 0 0 0 1px rgba(220, 208, 194, 0.75);
  }
`;

const TableProjectCell = styled.div`
  display: grid;
  gap: 4px;
  min-width: 0;

  strong {
    font-size: 0.88rem;
    color: var(--color-text);
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const TableStageCell = styled.div`
  display: grid;
  gap: 6px;
  min-width: 0;

  span {
    font-size: 0.76rem;
    font-weight: 500;
    color: var(--color-text);
    white-space: nowrap;
  }
`;

const ProjectRow = styled(Link)<{ $attention?: boolean }>`
  ${cardSurface}
  position: relative;
  display: flex;
  align-items: center;
  gap: 20px;
  height: 125px;
  padding: 40px 20px 22px;
  border-radius: 24px;
  text-decoration: none;
  border-color: ${({ $attention }) => ($attention ? "rgba(217, 75, 75, 0.72)" : "rgba(230, 224, 215, 0.95)")};
  box-shadow: ${({ $attention }) =>
    $attention ? "0 0 0 1px rgba(217, 75, 75, 0.16), var(--shadow-sm)" : "var(--shadow-sm)"};
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease,
    border-color 0.18s ease;

  ${desktop} {
    &:hover {
      transform: translateY(-2px);
      background: rgba(255, 248, 239, 0.94);
      border-color: ${({ $attention }) =>
        $attention ? "rgba(217, 75, 75, 0.82)" : "rgba(220, 208, 194, 0.95)"};
      box-shadow: ${({ $attention }) =>
        $attention
          ? "0 0 0 1px rgba(217, 75, 75, 0.18), 0 18px 32px rgba(31, 31, 31, 0.08)"
          : "0 18px 32px rgba(31, 31, 31, 0.08)"};
    }
  }
`;
const ProjectTopleft = styled.div`
  position: absolute;
  top: 5px;
  left: 18px;
`;

const ProjectIdBadge = styled.span`
  color: var(--color-text-light);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const ProjectAttentionBadge = styled.span`
  position: absolute;
  top: 10px;
  right: 14px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #d94b4b;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.68rem;
  font-weight: 800;
  line-height: 1;
`;

const markSurface = css`
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #ede5d8, #f8f4ee);
  color: #8c7040;
  font-weight: 600;
`;

const ProjectMark = styled.div`
  ${markSurface}
  width: 76px;
  height: 76px;
  flex: 0 0 76px;
  border-radius: 18px;
  font-size: 1.6rem;
`;

const ProjectSummary = styled.div`
  min-width: 220px;
  flex: 1.4;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SummaryTitle = styled.strong`
  font-size: 0.98rem;
`;

const SummaryPills = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const SummaryPill = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(244, 241, 237, 0.96);
  color: #7b6f62;
  font-size: 0.78rem;
  font-weight: 600;
  white-space: nowrap;
`;

const OrganizationPill = styled.div`
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(244, 241, 237, 0.96);
  color: #7b6f62;
  font-size: 0.68rem;
  font-weight: 600;
  white-space: nowrap;
`;

const MetaColumn = styled.div<{ $grow?: boolean; $narrow?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: ${({ $grow, $narrow }) => ($grow ? "170px" : $narrow ? "96px" : "150px")};
  flex: ${({ $grow, $narrow }) => ($grow ? "1" : $narrow ? "0 0 96px" : "0 0 150px")};
`;

const MetaLabel = styled.span`
  color: var(--color-text-light);
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const MetaStrong = styled.strong`
  font-size: 0.92rem;
`;

const AvatarStack = styled.div`
  display: flex;
  align-items: center;
`;

const Avatar = styled.span<{ $muted?: boolean }>`
  width: 34px;
  height: 34px;
  margin-left: -8px;
  border: 2px solid #fff;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: ${({ $muted }) => ($muted ? "#f5efe5" : "#d9cfbf")};
  color: ${({ $muted }) => ($muted ? "var(--color-text-muted)" : "#fff")};
  font-size: 0.76rem;
  font-weight: 600;

  &:first-child {
    margin-left: 0;
  }
`;

const ArrowWrap = styled.span`
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  color: var(--color-text-muted);

  svg {
    width: 18px;
    height: 18px;
  }
`;

const EmptyCard = styled.article`
  ${cardSurface}
  display: grid;
  gap: 10px;
  padding: 18px;
  border-radius: 24px;

  ${desktop} {
    min-height: 110px;
    align-content: center;
  }
`;

const EmptyTitle = styled.strong`
  font-size: 1rem;
  line-height: 1.3;
  font-weight: 600;
`;

const EmptyCopy = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.55;
`;

const CountText = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.84rem;
`;

const PaginationBar = styled.section`
  ${cardSurface}
  display: grid;
  gap: 14px;
  padding: 10px 16px;
  border-radius: 24px;
  margin-top: 14px;
  display: none;

  ${desktop} {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    padding: 10px 22px;
  }
`;

const PaginationControls = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: flex-end;
`;

const PaginationButton = styled.button`
  min-height: 40px;
  padding: 0 18px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text-muted);
  font-size: 0.84rem;
  font-weight: 700;

  &:disabled {
    opacity: 0.5;
  }
`;

const PaginationCurrent = styled.span`
  min-width: 48px;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #214f39;
  color: #fff;
  font-size: 0.92rem;
  font-weight: 700;
`;

const MobileList = styled.section`
  display: grid;
  gap: 10px;

  ${desktop} {
    display: none;
  }
`;

const MobileProjectCard = styled(Link)<{ $attention?: boolean }>`
  ${cardSurface}
  position: relative;
  display: grid;
  grid-template-columns: 50px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 26px 12px 10px;
  border-radius: 18px;
  text-decoration: none;
  border-color: ${({ $attention }) => ($attention ? "rgba(217, 75, 75, 0.72)" : "rgba(230, 224, 215, 0.95)")};
  box-shadow: ${({ $attention }) =>
    $attention ? "0 0 0 1px rgba(217, 75, 75, 0.16), var(--shadow-sm)" : "var(--shadow-sm)"};
`;

const MobileProjectMark = styled.div`
  ${markSurface}
  width: 50px;
  height: 50px;
  border-radius: 14px;
  font-size: 1rem;
`;

const MobileCopy = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-self: stretch;
  min-height: 50px;
  grid-template-rows: repeat(3, minmax(0, 1fr));
`;

const MobileTitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
`;

const MobileTitle = styled.strong`
  min-width: 0;
  font-size: 0.78rem;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const MobileInfoRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
`;

const MobileClientName = styled.span`
  min-width: 0;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const MobilePillRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const MobileMetaText = styled.span`
  flex: 0 0 auto;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.2;
`;

const MobileStagePill = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--color-info-soft);
  color: var(--color-info);
  font-size: 0.68rem;
  font-weight: 700;
  white-space: nowrap;
`;

const LoadMoreSentinel = styled.div`
  height: 1px;

  ${desktop} {
    display: none;
  }
`;

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6.5 9.5V20h11V9.5" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5h6l2-2H20a1 1 0 0 1 1 1v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function IconCheckCircle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.8 12 2.1 2.2 4.6-4.8" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="3" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M4.5 18a5.5 5.5 0 0 1 9 0" />
      <path d="M14.5 18a4.5 4.5 0 0 1 5-3.7" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="6" width="16" height="14" rx="2.5" />
      <path d="M8 4v4M16 4v4M4 10h16" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 19V9" />
      <path d="M12 19V5" />
      <path d="M19 19v-7" />
      <path d="M4 19h16" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3.5h6l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 7 20V5a1.5 1.5 0 0 1 1-1.5Z" />
      <path d="M14 3.5V8h4" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

function IconFilter() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 7h16" />
      <path d="M7 12h10" />
      <path d="M10 17h4" />
    </svg>
  );
}

function IconSort() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6v12" />
      <path d="m5 9 3-3 3 3" />
      <path d="M16 18V6" />
      <path d="m13 15 3 3 3-3" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import styled, { css } from "styled-components";
import { useAppState } from "@/components/app-state";
import { AppSidebar } from "@/components/app-sidebar";
import { ClientTitleLogo } from "@/components/client-title-logo";
import { FilterModal } from "@/components/filter-modal";
import { HeaderProfileAvatarLink } from "@/components/header-profile-avatar-link";
import { ListScreenSkeleton } from "@/components/page-skeletons";
import { ProjectStageProgress } from "@/components/project-stage-progress";
import { useActiveClientOrganization } from "@/components/use-active-client-organization";
import { getClientBrandStyle } from "@/lib/client-branding";
import { canCreateProject as canCreateProjectPermission, canCreateProjectForOrganization, canViewProject, getVisibleTasksForUser } from "@/lib/permissions";
import {
  getAttentionCountForProject,
  getProjectManagerAttentionKind,
  projectHasUnacknowledgedClientRequest,
} from "@/lib/task-attention";
import { formatProjectStage, formatRole } from "@/lib/display";
import { Project, ProjectWorkflowStage } from "@/lib/types";

type StageFilterKey = "all" | ProjectWorkflowStage;
type SortField =
  | "project"
  | "organization"
  | "first_draft_date"
  | "final_deliverable_date"
  | "stage"
  | "project_type"
  | "priority_level"
  | "open_tasks"
  | "requested_date";
type SortDirection = "asc" | "desc";
type SortValue = `${SortField}|${SortDirection}`;
const MOBILE_BATCH_SIZE = 20;
const TABLE_BATCH_SIZE = 20;
const DEFAULT_SORT: SortValue = "final_deliverable_date|asc";

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

const PROJECT_EXPORT_HEADERS = [
  "Project ID",
  "Requested Date",
  "Status",
  "Company Name",
  "Department Name",
  "Project Request Name",
  "Contact Person",
  "Contact Number",
  "Project Type",
  "Priority Level",
  "First Draft Date",
  "Final Deliverable Date",
  "Project Objective",
  "Project Brief",
  "Creative Advice",
  "Description",
  "Reference",
] as const;

type ProjectExportRow = Record<(typeof PROJECT_EXPORT_HEADERS)[number], string>;

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

function escapeCsvValue(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function buildProjectExportRows(
  projects: Project[],
  organizationNames: Map<string, string>,
  userNames: Map<string, string>,
): ProjectExportRow[] {
  return projects.map((project) => ({
    "Project ID": project.projectCode?.trim() ?? "",
    "Requested Date": project.requestedDate?.trim() ?? "",
    Status: project.stage?.trim() ?? "",
    "Company Name": getClientOrganizationName(project, organizationNames, userNames),
    "Department Name": project.departmentName?.trim() ?? "",
    "Project Request Name": project.projectRequestName?.trim() || project.name,
    "Contact Person": project.contactPerson?.trim() ?? "",
    "Contact Number": project.contactNumber?.trim() ?? "",
    "Project Type": project.projectType?.trim() ?? "",
    "Priority Level": project.priorityLevel?.trim() ?? "",
    "First Draft Date": project.firstDraftDate?.trim() ?? "",
    "Final Deliverable Date": project.finalDeliverableDate?.trim() ?? "",
    "Project Objective": project.projectObjective?.trim() ?? "",
    "Project Brief": project.projectBrief?.trim() ?? "",
    "Creative Advice": project.creativeAdvice?.trim() ?? "",
    Description: project.description?.trim() ?? "",
    Reference: project.referenceAttachmentUrl?.trim() ?? "",
  }));
}

function downloadBlobFile(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function getProjectStageTone(stage: ProjectWorkflowStage) {
  switch (stage) {
    case "Complete":
      return {
        bg: "rgba(214, 241, 205, 0.98)",
        fg: "#48773d",
      };
    case "Pending Review":
      return {
        bg: "rgba(255, 239, 200, 0.98)",
        fg: "#9a6d0a",
      };
    case "On Hold":
      return {
        bg: "rgba(255, 228, 198, 0.98)",
        fg: "#ad5f18",
      };
    case "Waiting List":
      return {
        bg: "rgba(237, 224, 246, 0.98)",
        fg: "#76548f",
      };
    case "WIP":
    default:
      return {
        bg: "rgba(208, 241, 244, 0.98)",
        fg: "#1d6f79",
      };
  }
}

function getPriorityTone(priority: string | null | undefined) {
  const normalized = priority?.trim().toLowerCase();

  switch (normalized) {
    case "high":
      return {
        bg: "rgba(255, 223, 223, 0.98)",
        fg: "#b33f32",
      };
    case "low":
      return {
        bg: "rgba(220, 244, 210, 0.98)",
        fg: "#4f8c3d",
      };
    case "medium":
      return {
        bg: "rgba(208, 232, 255, 0.98)",
        fg: "#2c71b8",
      };
    default:
      return {
        bg: "rgba(244, 241, 237, 0.98)",
        fg: "#7b6f62",
      };
  }
}

function parseSortValue(sort: SortValue) {
  const [field, direction] = sort.split("|") as [SortField, SortDirection];
  return { field, direction };
}

function buildSortValue(field: SortField, direction: SortDirection): SortValue {
  return `${field}|${direction}`;
}

function compareText(left: string, right: string, direction: SortDirection) {
  const result = left.localeCompare(right, undefined, { sensitivity: "base" });
  return direction === "asc" ? result : -result;
}

function compareNullableDate(left: string | null | undefined, right: string | null | undefined, direction: SortDirection) {
  const leftTime = left ? new Date(left).getTime() : Number.NaN;
  const rightTime = right ? new Date(right).getTime() : Number.NaN;
  const leftValid = Number.isFinite(leftTime);
  const rightValid = Number.isFinite(rightTime);

  if (!leftValid && !rightValid) {
    return 0;
  }

  if (!leftValid) {
    return 1;
  }

  if (!rightValid) {
    return -1;
  }

  return direction === "asc" ? leftTime - rightTime : rightTime - leftTime;
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
  const [sort, setSort] = useState<SortValue>(DEFAULT_SORT);
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [desktopView, setDesktopView] = useState<"cards" | "table">("table");
  const [exportingFormat, setExportingFormat] = useState<"csv" | "xlsx" | null>(null);
  const mobileLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const desktopTableWrapRef = useRef<HTMLElement | null>(null);
  const desktopTableLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const quickFilter = searchParams.get("quick") ?? "";
  const appliedFilterCount =
    (quickFilter ? 1 : 0) +
    (stageFilter !== "all" ? 1 : 0) +
    (priorityFilter !== "all" ? 1 : 0) +
    (organizationFilter !== "all" ? 1 : 0);
  const appliedSortCount = sort !== DEFAULT_SORT ? 1 : 0;
  const { activeClientOrganization, activeClientOrganizationId, scopedHref } = useActiveClientOrganization(
    user,
    state.clientOrganizations,
  );

  // Keep hooks unconditionally called: ESLint rules-of-hooks
  const visibleProjects = state.projects.filter(
    (project) =>
      (user ? canViewProject(user, project) : false) &&
      (user?.role !== "client" || !activeClientOrganizationId || project.clientOrganizationId === activeClientOrganizationId),
  );
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
  const organizationsById = useMemo(
    () => new Map(state.clientOrganizations.map((organization) => [organization.id, organization])),
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
  const isClient = user?.role === "client";
  const currentClientOrganization = activeClientOrganization;
  const clientBrandStyle = useMemo(
    () => getClientBrandStyle(currentClientOrganization),
    [currentClientOrganization],
  );
  const isWorkspaceHydrating =
    ready &&
    Boolean(user) &&
    state.users.length === 0 &&
    state.clientOrganizations.length === 0 &&
    state.projects.length === 0 &&
    state.invitations.length === 0;

  const filteredProjects = useMemo(() => {
    const loweredSearch = search.trim().toLowerCase();
    const now = new Date();
    const { field: sortField, direction: sortDirection } = parseSortValue(sort);
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
      const leftIsNew =
        user && user.role !== "client"
          ? projectHasUnacknowledgedClientRequest(user, state.users, left)
          : false;
      const rightIsNew =
        user && user.role !== "client"
          ? projectHasUnacknowledgedClientRequest(user, state.users, right)
          : false;

      if (leftIsNew !== rightIsNew) {
        return leftIsNew ? -1 : 1;
      }

      if (sortField === "project") {
        return compareText(left.name, right.name, sortDirection);
      }

      if (sortField === "organization") {
        return compareText(
          getClientOrganizationName(left, organizationNames, userNames),
          getClientOrganizationName(right, organizationNames, userNames),
          sortDirection,
        );
      }

      if (sortField === "first_draft_date") {
        return compareNullableDate(left.firstDraftDate, right.firstDraftDate, sortDirection);
      }

      if (sortField === "final_deliverable_date") {
        return compareNullableDate(
          left.finalDeliverableDate ?? left.dueDate,
          right.finalDeliverableDate ?? right.dueDate,
          sortDirection,
        );
      }

      if (sortField === "requested_date") {
        return compareNullableDate(left.requestedDate, right.requestedDate, sortDirection);
      }

      if (sortField === "stage") {
        return compareText(formatProjectStage(left.stage), formatProjectStage(right.stage), sortDirection);
      }

      if (sortField === "project_type") {
        return compareText(left.projectType?.trim() || "", right.projectType?.trim() || "", sortDirection);
      }

      if (sortField === "priority_level") {
        return compareText(left.priorityLevel?.trim() || "", right.priorityLevel?.trim() || "", sortDirection);
      }

      const leftOpenTasks = user ? getVisibleTasksForUser(user, left).filter((task) => task.status !== "approved").length : 0;
      const rightOpenTasks = user ? getVisibleTasksForUser(user, right).filter((task) => task.status !== "approved").length : 0;
      return sortDirection === "asc" ? leftOpenTasks - rightOpenTasks : rightOpenTasks - leftOpenTasks;
    });
  }, [
    organizationFilter,
    organizationNames,
    priorityFilter,
    quickFilter,
    search,
    sort,
    stageFilter,
    state.users,
    user,
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
  const projectExportRows = useMemo(
    () => buildProjectExportRows(filteredProjects, organizationNames, userNames),
    [filteredProjects, organizationNames, userNames],
  );

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchDraft);
    setCurrentPage(1);
  };

  const toggleColumnSort = (field: SortField) => {
    setSort((current) => {
      const parsed = parseSortValue(current);
      if (parsed.field === field) {
        return buildSortValue(field, parsed.direction === "asc" ? "desc" : "asc");
      }

      return buildSortValue(field, "asc");
    });
    setCurrentPage(1);
  };

  const getSortDirection = (field: SortField) => {
    const parsed = parseSortValue(sort);
    return parsed.field === field ? parsed.direction : null;
  };

  const handleProjectTableExport = async (format: "csv" | "xlsx") => {
    if (exportingFormat) {
      return;
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    const fileName = `projects-table-${dateStamp}.${format}`;
    setExportingFormat(format);

    try {
      if (format === "csv") {
        const csvLines = [
          PROJECT_EXPORT_HEADERS.join(","),
          ...projectExportRows.map((row) =>
            PROJECT_EXPORT_HEADERS.map((header) => escapeCsvValue(row[header] ?? "")).join(","),
          ),
        ];
        downloadBlobFile(new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" }), fileName);
        return;
      }

      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.json_to_sheet(projectExportRows, {
        header: [...PROJECT_EXPORT_HEADERS],
      });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Projects");
      const workbookArray = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
      downloadBlobFile(
        new Blob([workbookArray], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        fileName,
      );
    } finally {
      setExportingFormat(null);
    }
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

  if (!ready || isWorkspaceHydrating) {
    return <ListScreenSkeleton title="Projects" />;
  }

  return (
    <PageShell style={user?.role === "client" ? clientBrandStyle : undefined}>
      {user ? (
        <SidebarRail>
          <AppSidebar user={user} activeLabel="Projects" />
        </SidebarRail>
      ) : null}

      <Content>
        <DesktopHeader>
          <DesktopHeaderTop>
            <DesktopHeaderCopy>
              <Eyebrow>{roleLabel}</Eyebrow>
              <TitleRow>
                {isClient ? <HeaderClientLogo organization={currentClientOrganization} /> : null}
                <Title>Select a project</Title>
              </TitleRow>
              <Subtitle>
                Choose a project workspace to manage deliverables, staff, clients, and tasks.
              </Subtitle>
            </DesktopHeaderCopy>
            {user ? <HeaderProfileAvatarLink user={user} /> : null}
          </DesktopHeaderTop>
        </DesktopHeader>

        <MobileHeader>
          <MobileHeaderCopy>
            <Eyebrow>{roleLabel}</Eyebrow>
            <TitleRow>
              {isClient ? <HeaderClientLogo organization={currentClientOrganization} /> : null}
              <Title>Select a project</Title>
            </TitleRow>
          </MobileHeaderCopy>
          {user ? <HeaderProfileAvatarLink user={user} /> : null}
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
                  { value: "final_deliverable_date|asc", label: "Final deliverable: earliest first" },
                  { value: "final_deliverable_date|desc", label: "Final deliverable: latest first" },
                  { value: "requested_date|asc", label: "Requested date: earliest first" },
                  { value: "requested_date|desc", label: "Requested date: latest first" },
                  { value: "project|asc", label: "Project: A to Z" },
                  { value: "project|desc", label: "Project: Z to A" },
                ],
              },
            ]}
            values={{ sort }}
            onApply={(nextValues) => {
              setSort(nextValues.sort as SortValue);
              setCurrentPage(1);
            }}
            onReset={() => {
              setSort(DEFAULT_SORT);
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
            <CreateButton href={scopedHref("/projects/new")}>
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
                const attentionCount = user ? getAttentionCountForProject(user, state.users, project) : 0;
                const attentionKind =
                  user && user.role !== "client"
                    ? getProjectManagerAttentionKind(user, state.users, project)
                    : null;
                const isNewProject = attentionKind === "new_request";
                const clientOrganization = project.clientOrganizationId
                  ? organizationsById.get(project.clientOrganizationId) ?? null
                  : null;

                return (
                  <ProjectRow
                    key={project.id}
                    href={scopedHref(`/projects/${project.id}`)}
                    $attention={attentionCount > 0}
                    $new={isNewProject}
                  >
                    <ProjectTopleft>
                      <ProjectIdBadge>{project.projectCode ?? project.id}</ProjectIdBadge>
                      <OrganizationPill>{clientOrganizationName}</OrganizationPill>
                      {attentionKind === "new_request" ? <NewProjectPill>New</NewProjectPill> : null}
                      {attentionKind === "feedback" ? <FeedbackNotifiedPill>Feedback</FeedbackNotifiedPill> : null}
                    </ProjectTopleft>
                    
                    {attentionCount > 0 ? (
                      <ProjectAttentionBadge>{attentionCount > 99 ? "99+" : attentionCount}</ProjectAttentionBadge>
                    ) : null}
                    <ProjectMark organization={clientOrganization} />
                    <ProjectSummary>
                      <SummaryTitle>{project.name}</SummaryTitle>
                      <SummaryPills>
                        <SummaryPill>{primaryContactLabel}</SummaryPill>
                        {!isClient ? <SummaryPill>{project.contactNumber?.trim() || "No contact number"}</SummaryPill> : null}
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
          <>
            <DesktopTableWrap ref={desktopTableWrapRef}>
              {tableProjects.length ? (
                <>
                  <DesktopTable>
                    <thead>
                      <tr>
                        <th>
                          <SortableHeaderButton type="button" onClick={() => toggleColumnSort("project")}>
                            <span>Project</span>
                            <SortGlyph $direction={getSortDirection("project")}>↕</SortGlyph>
                          </SortableHeaderButton>
                        </th>
                        <th>
                          <SortableHeaderButton type="button" onClick={() => toggleColumnSort("organization")}>
                            <span>Organization</span>
                            <SortGlyph $direction={getSortDirection("organization")}>↕</SortGlyph>
                          </SortableHeaderButton>
                        </th>
                        <th>
                          <SortableHeaderButton type="button" onClick={() => toggleColumnSort("first_draft_date")}>
                            <span>First draft date</span>
                            <SortGlyph $direction={getSortDirection("first_draft_date")}>↕</SortGlyph>
                          </SortableHeaderButton>
                        </th>
                        <th>
                          <SortableHeaderButton type="button" onClick={() => toggleColumnSort("final_deliverable_date")}>
                            <span>Final deliverable</span>
                            <SortGlyph $direction={getSortDirection("final_deliverable_date")}>↕</SortGlyph>
                          </SortableHeaderButton>
                        </th>
                        <th>
                          <SortableHeaderButton type="button" onClick={() => toggleColumnSort("stage")}>
                            <span>Stage</span>
                            <SortGlyph $direction={getSortDirection("stage")}>↕</SortGlyph>
                          </SortableHeaderButton>
                        </th>
                        <th>
                          <SortableHeaderButton type="button" onClick={() => toggleColumnSort("project_type")}>
                            <span>Project type</span>
                            <SortGlyph $direction={getSortDirection("project_type")}>↕</SortGlyph>
                          </SortableHeaderButton>
                        </th>
                        <th>
                          <SortableHeaderButton type="button" onClick={() => toggleColumnSort("priority_level")}>
                            <span>Priority level</span>
                            <SortGlyph $direction={getSortDirection("priority_level")}>↕</SortGlyph>
                          </SortableHeaderButton>
                        </th>
                        <th>Primary contact</th>
                        {!isClient ? <th>Contact number</th> : null}
                        <th>
                          <SortableHeaderButton type="button" onClick={() => toggleColumnSort("open_tasks")}>
                            <span>Open tasks</span>
                            <SortGlyph $direction={getSortDirection("open_tasks")}>↕</SortGlyph>
                          </SortableHeaderButton>
                        </th>
                        <th>
                          <SortableHeaderButton type="button" onClick={() => toggleColumnSort("requested_date")}>
                            <span>Requested date</span>
                            <SortGlyph $direction={getSortDirection("requested_date")}>↕</SortGlyph>
                          </SortableHeaderButton>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableProjects.map((project) => {
                        const clientOrganizationName = getClientOrganizationName(project, organizationNames, userNames);
                        const primaryContactLabel = project.contactPerson?.trim() || "No primary contact";
                        const attentionCount = user ? getAttentionCountForProject(user, state.users, project) : 0;
                        const attentionKind =
                          user && user.role !== "client"
                            ? getProjectManagerAttentionKind(user, state.users, project)
                            : null;
                        const isNewProject = attentionKind === "new_request";
                        const clientOrganization = project.clientOrganizationId
                          ? organizationsById.get(project.clientOrganizationId) ?? null
                          : null;
                        const stageTone = getProjectStageTone(project.stage as ProjectWorkflowStage);
                        const priorityTone = getPriorityTone(project.priorityLevel);

                        return (
                          <DesktopTableRow
                            key={project.id}
                            $attention={attentionCount > 0}
                            $new={isNewProject}
                            $clientBranded={isClient}
                            onClick={() => {
                              void router.push(scopedHref(`/projects/${project.id}`));
                            }}
                          >
                            <StickyProjectCell $attention={attentionCount > 0} $new={isNewProject} $clientBranded={isClient}>
                              <TableProjectCell>
                                <ProjectIdBadge>{project.projectCode ?? project.id}</ProjectIdBadge>
                                <TableProjectTitleRow>
                                  <strong>{project.name}</strong>
                                  {attentionKind === "new_request" ? <NewProjectPill>New</NewProjectPill> : null}
                                  {attentionKind === "feedback" ? <FeedbackNotifiedPill>Feedback</FeedbackNotifiedPill> : null}
                                </TableProjectTitleRow>
                              </TableProjectCell>
                            </StickyProjectCell>
                            <StickyOrganizationCell $attention={attentionCount > 0} $new={isNewProject} $clientBranded={isClient}>
                              <TableOrganizationCell>
                                <TableOrganizationLogo organization={clientOrganization} />
                                <TableOrganizationName>{clientOrganizationName}</TableOrganizationName>
                              </TableOrganizationCell>
                            </StickyOrganizationCell>
                            <td>{formatDueDate(project.firstDraftDate ?? "")}</td>
                            <td>{formatDueDate(project.finalDeliverableDate ?? project.dueDate)}</td>
                            <td>
                              <StagePill $bg={stageTone.bg} $fg={stageTone.fg}>
                                {formatProjectStage(project.stage)}
                              </StagePill>
                            </td>
                            <td>{project.projectType?.trim() || "Not set"}</td>
                            <td>
                              <PriorityPill $bg={priorityTone.bg} $fg={priorityTone.fg}>
                                {project.priorityLevel?.trim() || "Not set"}
                              </PriorityPill>
                            </td>
                            <td>{primaryContactLabel}</td>
                            {!isClient ? <td>{project.contactNumber?.trim() || "No contact number"}</td> : null}
                            <td>{user ? getVisibleTasksForUser(user, project).filter((task) => task.status !== "approved").length : 0}</td>
                            <td>{formatDueDate(project.requestedDate ?? "")}</td>
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
            {canManage && tableProjects.length ? (
              <TableExportRow>
                <span>Download this project table:</span>
                <TableExportLink
                  type="button"
                  onClick={() => void handleProjectTableExport("csv")}
                  disabled={exportingFormat !== null}
                >
                  {exportingFormat === "csv" ? "Preparing CSV..." : "CSV"}
                </TableExportLink>
                <span>/</span>
                <TableExportLink
                  type="button"
                  onClick={() => void handleProjectTableExport("xlsx")}
                  disabled={exportingFormat !== null}
                >
                  {exportingFormat === "xlsx" ? "Preparing XLSX..." : "XLSX"}
                </TableExportLink>
              </TableExportRow>
            ) : null}
          </>
        )}

        <MobileList>
          {mobileProjects.length ? (
            mobileProjects.map((project) => {
              const attentionCount = user ? getAttentionCountForProject(user, state.users, project) : 0;
              const attentionKind =
                user && user.role !== "client"
                  ? getProjectManagerAttentionKind(user, state.users, project)
                  : null;
              const isNewProject = attentionKind === "new_request";
              const clientOrganizationName = getClientOrganizationName(project, organizationNames, userNames);
              const clientOrganization = project.clientOrganizationId
                ? organizationsById.get(project.clientOrganizationId) ?? null
                : null;

              return (
                <MobileProjectCard
                  key={project.id}
                  href={scopedHref(`/projects/${project.id}`)}
                  $attention={attentionCount > 0}
                  $new={isNewProject}
                >
                  <ProjectIdBadge>{project.projectCode ?? project.id}</ProjectIdBadge>
                  {attentionCount > 0 ? (
                    <ProjectAttentionBadge>{attentionCount > 99 ? "99+" : attentionCount}</ProjectAttentionBadge>
                  ) : null}
                  <MobileProjectCompanyHeader>{clientOrganizationName}</MobileProjectCompanyHeader>
                  {attentionKind === "new_request" ? <NewProjectPill>New</NewProjectPill> : null}
                  {attentionKind === "feedback" ? <FeedbackNotifiedPill>Feedback</FeedbackNotifiedPill> : null}
                  <MobileProjectStageBadge>{formatProjectStage(project.stage)}</MobileProjectStageBadge>
                  <MobileProjectLead>
                    <MobileProjectMark organization={clientOrganization} />
                    <MobileCopy>
                      <MobileTitleRow>
                        <MobileTitle>{project.name}</MobileTitle>
                        <MobileMetaText>Due {formatShortDate(project.dueDate)}</MobileMetaText>
                      </MobileTitleRow>
                      <MobilePillRow>
                        <SummaryPill>{project.contactPerson?.trim() || "No primary contact"}</SummaryPill>
                        {!isClient ? <SummaryPill>{project.contactNumber?.trim() || "No contact number"}</SummaryPill> : null}
                      </MobilePillRow>
                      <ProjectStageProgress stage={project.stage} size="sm" showStageLabel={false} />
                    </MobileCopy>
                  </MobileProjectLead>
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
  background: var(--client-screen-soft, rgba(255, 255, 255, 0.58));

  ${tablet} {
    padding: 22px 28px calc(env(safe-area-inset-bottom) + 24px);
  }

  ${desktop} {
    display: flex;
    align-items: flex-start;
    padding: 8px;
    background: var(--client-screen-soft, rgba(255, 255, 255, 0.58));
  }
`;

const SidebarRail = styled.div`
  ${desktop} {
    position: sticky;
    top: 8px;
    height: calc(100vh - 16px);
    flex: 0 0 auto;
    align-self: flex-start;
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
      radial-gradient(circle at top center, rgba(255, 255, 255, 0.68), transparent 18%),
      var(--client-screen-soft-panel, linear-gradient(180deg, rgba(252, 249, 244, 0.92), rgba(247, 243, 237, 0.84)));
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

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
`;

const HeaderClientLogo = styled(ClientTitleLogo)`
  width: 44px;
  height: 44px;
  border-radius: 14px;
  object-fit: cover;
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.92);
  flex: 0 0 auto;
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

const TableExportRow = styled.div`
  display: none;

  ${desktop} {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    padding: 0 6px;
    color: rgba(104, 94, 80, 0.86);
    font-size: 0.7rem;
    line-height: 1.2;
  }
`;

const TableExportLink = styled.button`
  border: 0;
  padding: 0;
  background: transparent;
  color: #8a402f;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 0.14em;

  &:disabled {
    cursor: default;
    opacity: 0.62;
  }
`;

const DesktopTable = styled.table`
  width: max-content;
  min-width: 1480px;
  border-collapse: collapse;
  table-layout: auto;

  thead th {
    position: sticky;
    top: 0;
    z-index: 2;
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

  thead th:first-child {
    left: 0;
    z-index: 4;
    min-width: 220px;
  }

  thead th:nth-child(2) {
    left: 220px;
    z-index: 4;
    min-width: 170px;
  }
`;

const SortableHeaderButton = styled.button`
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  cursor: pointer;
`;

const SortGlyph = styled.span<{ $direction: SortDirection | null }>`
  color: ${({ $direction }) => ($direction ? "#2f5d50" : "var(--color-text-light)")};
  font-size: 0.7rem;
  line-height: 1;
  transform: ${({ $direction }) => ($direction === "desc" ? "rotate(180deg)" : "none")};
`;

const DesktopTableRow = styled.tr<{ $attention?: boolean; $clientBranded?: boolean; $new?: boolean }>`
  background: ${({ $attention, $new }) =>
    $new ? "rgba(255, 244, 226, 0.96)" : $attention ? "rgba(255, 244, 244, 0.92)" : "transparent"};
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;

  &:hover {
    background: ${({ $attention, $clientBranded, $new }) =>
      $new
        ? "rgba(255, 236, 204, 0.98)"
        : $attention
          ? "rgba(255, 232, 232, 0.98)"
          : $clientBranded
            ? "var(--client-screen-soft-flat, rgba(245, 247, 244, 0.98))"
            : "rgba(252, 241, 226, 0.98)"};
    box-shadow: inset 0 0 0 1px
      ${({ $new }) => ($new ? "rgba(214, 154, 56, 0.45)" : "rgba(220, 208, 194, 0.75)")};
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

const TableProjectTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const StickyProjectCell = styled.td<{ $attention?: boolean; $clientBranded?: boolean; $new?: boolean }>`
  position: sticky;
  left: 0;
  z-index: 1;
  min-width: 220px;
  background: ${({ $attention, $new }) => ($new ? "#fff4df" : $attention ? "#fff4f4" : "#ffffff")};

  ${DesktopTableRow}:hover & {
    background: ${({ $attention, $clientBranded, $new }) =>
      $new
        ? "#ffeccc"
        : $clientBranded
          ? "var(--client-screen-soft-flat, rgba(245, 247, 244, 0.98))"
          : $attention
            ? "#ffe8e8"
            : $clientBranded
              ? "var(--client-screen-soft-solid, #f3f7f4)"
              : "#fcf1e2"};
  }
`;

const StickyOrganizationCell = styled.td<{ $attention?: boolean; $clientBranded?: boolean; $new?: boolean }>`
  position: sticky;
  left: 220px;
  z-index: 1;
  min-width: 170px;
  background: ${({ $attention, $new }) => ($new ? "#fff4df" : $attention ? "#fff4f4" : "#ffffff")};

  ${DesktopTableRow}:hover & {
    background: ${({ $attention, $clientBranded, $new }) =>
      $new
        ? "#ffeccc"
        : $clientBranded
          ? "var(--client-screen-soft-solid, #f3f7f4)"
          : $attention
            ? "#ffe8e8"
            : $clientBranded
              ? "var(--client-screen-soft-solid, #f3f7f4)"
              : "#fcf1e2"};
  }
`;

const StagePill = styled.span<{ $bg: string; $fg: string }>`
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg};
  font-size: 0.76rem;
  font-weight: 700;
  white-space: nowrap;
`;

const PriorityPill = styled(StagePill)`
  font-size: 0.74rem;
`;

const ProjectRow = styled(Link)<{ $attention?: boolean; $new?: boolean }>`
  ${cardSurface}
  position: relative;
  display: flex;
  align-items: center;
  gap: 20px;
  height: 125px;
  padding: 40px 20px 22px;
  border-radius: 24px;
  text-decoration: none;
  border-color: ${({ $attention, $new }) =>
    $new ? "rgba(214, 154, 56, 0.72)" : $attention ? "rgba(217, 75, 75, 0.72)" : "rgba(230, 224, 215, 0.95)"};
  background: ${({ $new }) => ($new ? "rgba(255, 249, 239, 0.96)" : undefined)};
  box-shadow: ${({ $attention, $new }) =>
    $new
      ? "0 0 0 1px rgba(214, 154, 56, 0.16), var(--shadow-sm)"
      : $attention
        ? "0 0 0 1px rgba(217, 75, 75, 0.16), var(--shadow-sm)"
        : "var(--shadow-sm)"};
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease,
    border-color 0.18s ease;

  ${desktop} {
    &:hover {
      transform: translateY(-2px);
      background: ${({ $new }) => ($new ? "rgba(255, 244, 220, 0.98)" : "rgba(255, 248, 239, 0.94)")};
      border-color: ${({ $attention, $new }) =>
        $new ? "rgba(214, 154, 56, 0.82)" : $attention ? "rgba(217, 75, 75, 0.82)" : "rgba(220, 208, 194, 0.95)"};
      box-shadow: ${({ $attention, $new }) =>
        $new
          ? "0 0 0 1px rgba(214, 154, 56, 0.18), 0 18px 32px rgba(31, 31, 31, 0.08)"
          : $attention
            ? "0 0 0 1px rgba(217, 75, 75, 0.18), 0 18px 32px rgba(31, 31, 31, 0.08)"
            : "0 18px 32px rgba(31, 31, 31, 0.08)"};
    }
  }
`;
const ProjectTopleft = styled.div`
  position: absolute;
  top: 5px;
  left: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const ProjectIdBadge = styled.span`
  color: var(--color-text-light);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const NewProjectPill = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: #fff0d1;
  color: #a86b12;
  font-size: 0.7rem;
  font-weight: 700;
  white-space: nowrap;
`;

const FeedbackNotifiedPill = styled(NewProjectPill)`
  background: #fff1da;
  color: #b97912;
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

const ProjectMark = styled(ClientTitleLogo)`
  ${markSurface}
  width: 76px;
  height: 76px;
  flex: 0 0 76px;
  border-radius: 18px;
  font-size: 1.6rem;
  object-fit: cover;
  overflow: hidden;
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

const TableOrganizationCell = styled.div`
  display: inline-grid;
  justify-items: start;
  gap: 6px;
`;

const TableOrganizationLogo = styled(ClientTitleLogo)`
  ${markSurface}
  width: 34px;
  height: 34px;
  border-radius: 10px;
  object-fit: cover;
  overflow: hidden;
  font-size: 0.8rem;
`;

const TableOrganizationName = styled.span`
  display: block;
  max-width: 118px;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  line-height: 1.25;
  white-space: normal;
  word-break: break-word;
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

const MobileProjectCard = styled(Link)<{ $attention?: boolean; $new?: boolean }>`
  ${cardSurface}
  position: relative;
  display: grid;
  gap: 10px;
  padding: 28px 12px 12px;
  border-radius: 18px;
  text-decoration: none;
  border-color: ${({ $attention, $new }) =>
    $new ? "rgba(214, 154, 56, 0.72)" : $attention ? "rgba(217, 75, 75, 0.72)" : "rgba(230, 224, 215, 0.95)"};
  background: ${({ $new }) => ($new ? "rgba(255, 249, 239, 0.96)" : undefined)};
  box-shadow: ${({ $attention, $new }) =>
    $new
      ? "0 0 0 1px rgba(214, 154, 56, 0.16), var(--shadow-sm)"
      : $attention
        ? "0 0 0 1px rgba(217, 75, 75, 0.16), var(--shadow-sm)"
        : "var(--shadow-sm)"};
`;

const MobileProjectCompanyHeader = styled.span`
  position: absolute;
  top: 10px;
  left: 12px;
  right: 110px;
  color: grey;
  text-transform: uppercase;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const MobileProjectStageBadge = styled.span`
  position: absolute;
  top: 8px;
  right: 10px;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  font-size: 0.64rem;
  font-weight: 700;
  z-index: 1;
  background: var(--color-info-soft);
  color: var(--color-info);
`;

const MobileProjectLead = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 8px;
`;

const MobileProjectMark = styled(ClientTitleLogo)`
  ${markSurface}
  width: 44px;
  height: 44px;
  border-radius: 12px;
  font-size: 0.92rem;
  object-fit: cover;
  overflow: hidden;
`;

const MobileCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: 5px;
  align-content: start;
  flex: 1;
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
  flex: 1;
  font-size: 0.82rem;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const MobileInfoRow = styled.div`
  display: none;
`;

const MobileClientName = styled.span`
  min-width: 0;
  flex: 1;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const MobilePillRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  ${SummaryPill} {
    min-height: 24px;
    padding: 0 9px;
    font-size: 0.68rem;
    max-width: 100%;
  }
`;

const MobileMetaText = styled.span`
  flex: 0 0 auto;
  color: var(--color-text-muted);
  font-size: 0.68rem;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
`;

const MobileStagePill = styled.span`
  display: none;
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

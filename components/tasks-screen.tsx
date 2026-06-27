"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import styled, { css } from "styled-components";
import { useAppState } from "@/components/app-state";
import { AppSidebar } from "@/components/app-sidebar";
import { ClientTitleLogo } from "@/components/client-title-logo";
import { CustomDatePicker } from "@/components/custom-date-picker";
import { DesignerTaskModal } from "@/components/designer-task-modal";
import { FilterModal } from "@/components/filter-modal";
import { ListScreenSkeleton } from "@/components/page-skeletons";
import { useActiveClientOrganization } from "@/components/use-active-client-organization";
import { UserAvatar } from "@/components/user-avatar";
import { getClientBrandStyle } from "@/lib/client-branding";
import { canCreateTask, canViewProject, getVisibleTasksForUser } from "@/lib/permissions";
import { taskNeedsAttention } from "@/lib/task-attention";
import { formatLabel, formatRole, getTaskStatusLabel } from "@/lib/display";
import { Project, TaskManagerReviewStatus, TaskPriority, TaskStatus } from "@/lib/types";

type FilterKey =
  | "all"
  | "todo"
  | "in_progress"
  | "review"
  | "approved"
  | "completed";

type DerivedPriority = "high" | "medium" | "low";
type DerivedTaskStatus =
  | "todo"
  | "in_progress"
  | "review"
  | "approved"
  | "completed";
type SortKey = "priority" | "due_date" | "created_at_desc" | "created_at_asc";

type TaskRow = {
  id: string;
  title: string;
  assigneeId: string;
  assigneeName: string;
  assigneePhone: string;
  projectId: string;
  projectName: string;
  clientOrganizationName: string;
  projectMark: string;
  dueDate: string;
  createdAt: string;
  status: DerivedTaskStatus;
  priority: DerivedPriority;
  completionScreenshotUrl?: string | null;
  rawStatus: TaskStatus;
  managerReviewStatus?: TaskManagerReviewStatus;
  needsAttention: boolean;
  feedbackEntries?: {
    id: string;
    source: "internal" | "client";
    author: string;
    body: string;
    createdAt: string;
    rating?: number | null;
  }[];
};

const tablet = "@media (min-width: 768px) and (max-width: 1099px)";
const tabletUp = "@media (min-width: 768px)";
const desktop = "@media (min-width: 1100px)";
const MOBILE_BATCH_SIZE = 20;
const TABLE_BATCH_SIZE = 20;

const sideNavItems = [
  { label: "Home", href: "/dashboard", icon: <IconHome /> },
  { label: "Projects", href: "/projects", icon: <IconFolder /> },
  { label: "Tasks", href: "/tasks", icon: <IconCheckCircle /> },
  { label: "Clients", icon: <IconUser /> },
  { label: "Team", href: "/team", icon: <IconUsers /> },
  { label: "Calendar", icon: <IconCalendar /> },
  { label: "Reports", icon: <IconChart /> },
  { label: "Files", icon: <IconFile /> },
] as const;

const filterOptions: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Internal Submit" },
  { key: "review", label: "Submit to Client" },
  { key: "approved", label: "Complete" },
] as const;

function formatDueDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function getProjectMark(project: Project) {
  const words = project.name.split(" ");
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function deriveTaskStatus(taskStatus: TaskStatus, project: Project): DerivedTaskStatus {
  if (taskStatus === "approved") {
    return "approved";
  }

  if (taskStatus === "review") {
    return "review";
  }

  if (taskStatus === "done") {
    return "completed";
  }

  if (taskStatus === "in_progress") {
    return "in_progress";
  }

  return "todo";
}

function derivePriority(dueDate: string, taskStatus: TaskStatus): DerivedPriority {
  if (taskStatus === "done") {
    return "low";
  }

  const today = startOfDay(new Date());
  const due = startOfDay(new Date(dueDate));
  const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));

  if (diffDays <= 2) {
    return "high";
  }

  if (diffDays <= 5) {
    return "medium";
  }

  return "low";
}

function getStatusTone(status: DerivedTaskStatus) {
  switch (status) {
    case "in_progress":
      return { bg: "#e6efff", fg: "#4770d8", label: "In Progress" };
    case "review":
      return { bg: "#fff1da", fg: "#ca8a22", label: "Submit to Client" };
    case "approved":
      return { bg: "#e5f4e8", fg: "#5ca16d", label: "Complete" };
    case "completed":
      return { bg: "#efe7ff", fg: "#7f61d7", label: "Internal Submit" };
    default:
      return { bg: "#f4f1ed", fg: "#8d857b", label: "To Do" };
  }
}

function getPriorityTone(priority: DerivedPriority) {
  switch (priority) {
    case "high":
      return { bg: "#ffe7e5", fg: "#e06457", label: "High" };
    case "medium":
      return { bg: "#fff1da", fg: "#ca8a22", label: "Medium" };
    default:
      return { bg: "#e5f4e8", fg: "#5ca16d", label: "Low" };
  }
}

function formatCompanyName(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isDateToday(value: string, reference: Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

export function TasksScreen() {
  const { ready, state, user, createTask, updateTaskStatus } = useAppState();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [priorityFilter, setPriorityFilter] = useState<DerivedPriority | "all">("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("due_date");
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [createTaskError, setCreateTaskError] = useState("");
  const [activeDesignerTaskId, setActiveDesignerTaskId] = useState<string | null>(null);
  const [desktopView, setDesktopView] = useState<"cards" | "table">("table");
  const [taskSelect, setTaskSelect] = useState<"organization" | "project" | "assignee" | "status" | null>(null);
  const [newTaskOrganizationId, setNewTaskOrganizationId] = useState("");
  const [newTaskProjectId, setNewTaskProjectId] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState("");
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>("todo");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>("medium");
  const [visibleCount, setVisibleCount] = useState(MOBILE_BATCH_SIZE);
  const [desktopTableVisibleCount, setDesktopTableVisibleCount] = useState(TABLE_BATCH_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const desktopTableWrapRef = useRef<HTMLElement | null>(null);
  const desktopTableLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const quickFilter = searchParams.get("quick") ?? "";
  const appliedFilterCount =
    (quickFilter ? 1 : 0) +
    (filter !== "all" ? 1 : 0) +
    (priorityFilter !== "all" ? 1 : 0) +
    (projectFilter !== "all" ? 1 : 0);
  const appliedSortCount = sort !== "due_date" ? 1 : 0;
  const { activeClientOrganization, activeClientOrganizationId } = useActiveClientOrganization(
    user,
    state.clientOrganizations,
  );

  const visibleProjects = useMemo(
    () =>
      user
        ? state.projects.filter(
            (project) =>
              canViewProject(user, project) &&
              (user.role !== "client" ||
                !activeClientOrganizationId ||
                project.clientOrganizationId === activeClientOrganizationId),
          )
        : [],
    [activeClientOrganizationId, state.projects, user],
  );

  const availableProjects = visibleProjects;

  const availableStaff = useMemo(
    () => state.users.filter((candidate) => candidate.role !== "client"),
    [state.users],
  );

  const userNames = useMemo(
    () => new Map(state.users.map((member) => [member.id, member.name])),
    [state.users],
  );
  const userDetails = useMemo(
    () => new Map(state.users.map((member) => [member.id, { name: member.name, phone: member.phone ?? "" }])),
    [state.users],
  );
  const organizationNames = useMemo(
    () => new Map(state.clientOrganizations.map((organization) => [organization.id, organization.name])),
    [state.clientOrganizations],
  );
  const availableTaskOrganizations = useMemo(() => {
    const entries = new Map<string, { id: string; name: string; logoUrl?: string }>();

    state.clientOrganizations.forEach((organization) => {
      entries.set(organization.id, {
        id: organization.id,
        name: organization.name,
        logoUrl: organization.logoUrl?.trim() || undefined,
      });
    });

    if (availableProjects.some((project) => !project.clientOrganizationId)) {
      entries.set("__unassigned__", {
        id: "__unassigned__",
        name: "Unassigned client",
      });
    }

    return Array.from(entries.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [availableProjects, state.clientOrganizations]);
  const filteredTaskProjects = useMemo(
    () =>
      availableProjects.filter((project) =>
        newTaskOrganizationId === "__unassigned__"
          ? !project.clientOrganizationId
          : project.clientOrganizationId === newTaskOrganizationId,
      ),
    [availableProjects, newTaskOrganizationId],
  );
  const selectedProject =
    filteredTaskProjects.find((project) => project.id === newTaskProjectId) ?? null;
  const selectedTaskOrganization =
    availableTaskOrganizations.find((organization) => organization.id === newTaskOrganizationId) ?? null;
  const hasProjectsForSelectedOrganization =
    newTaskOrganizationId.length > 0 && filteredTaskProjects.length > 0;
  const hasAvailableTaskProjects = availableProjects.length > 0;
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

  const roleLabel = user ? formatRole(user.role).toUpperCase() : "";
  const canManage = user ? canCreateTask(user.role) : false;
  const isDesigner = user?.role === "designer";
  const isClient = user?.role === "client";
  const projectFilterOptions = useMemo(
    () => [
      { value: "all", label: "All" },
      ...visibleProjects
        .map((project) => ({
          value: project.id,
          label: project.name,
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    ],
    [visibleProjects],
  );


  const allTasks = useMemo<TaskRow[]>(() => {
    if (!user) {
      return [];
    }

    return visibleProjects.flatMap((project) =>
      getVisibleTasksForUser(user, project)
        .filter((task) => !isDesigner || task.assigneeId === user.id)
        .map((task) => ({
          id: task.id,
          title: task.title,
          assigneeId: task.assigneeId,
          assigneeName: userNames.get(task.assigneeId) ?? "Unassigned",
          assigneePhone: userDetails.get(task.assigneeId)?.phone ?? "",
          projectId: project.id,
          projectName: project.name,
          clientOrganizationName: formatCompanyName(
            (project.clientOrganizationId
              ? organizationNames.get(project.clientOrganizationId)
              : null) ?? project.contactPerson ?? "Unassigned client",
          ),
          projectMark: getProjectMark(project),
          dueDate: task.dueDate ?? project.dueDate,
          createdAt: task.createdAt ?? "",
          status: deriveTaskStatus(task.status, project),
          priority: task.priority ??
            derivePriority(task.dueDate ?? project.dueDate, task.status),
          completionScreenshotUrl: task.completionScreenshotUrl ?? null,
          rawStatus: task.status,
          managerReviewStatus: task.managerReviewStatus,
          needsAttention: taskNeedsAttention(user, project, task),
          feedbackEntries: [
            ...project.feedback
              .filter((item) => item.taskId === task.id)
              .map((item) => ({
              id: item.id,
              source:
                state.users.find((candidate) => candidate.id === item.authorId)?.role === "client"
                  ? ("client" as const)
                  : ("internal" as const),
              author:
                state.users.find((candidate) => candidate.id === item.authorId)?.name ??
                (state.users.find((candidate) => candidate.id === item.authorId)?.role === "client"
                  ? "Client"
                  : "Team member"),
              body: item.body,
              createdAt: item.createdAt,
              rating: item.rating,
            })),
            ...project.comments
              .filter((comment) => comment.internalOnly && comment.taskId === task.id)
              .map((comment) => ({
                id: comment.id,
                source: "internal" as const,
                author: userNames.get(comment.authorId) ?? "Team member",
                body: comment.body,
                createdAt: comment.createdAt,
              })),
          ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
        })),
    );
  }, [isDesigner, organizationNames, state.users, user, userDetails, userNames, visibleProjects]);


  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    const next = allTasks.filter((task) => {
      const matchesFilter = filter === "all" ? true : task.status === filter;
      const matchesPriority = priorityFilter === "all" ? true : task.priority === priorityFilter;
      const matchesProject = projectFilter === "all" ? true : task.projectId === projectFilter;
      const matchesQuickFilter = quickFilter === "due_today" ? isDateToday(task.dueDate, now) : true;
      const matchesSearch =
        !q ||
        task.title.toLowerCase().includes(q) ||
        task.projectName.toLowerCase().includes(q) ||
        task.assigneeName.toLowerCase().includes(q);

      return matchesFilter && matchesPriority && matchesProject && matchesQuickFilter && matchesSearch;
    });

    return [...next].sort((a, b) => {
      if (sort === "created_at_desc") {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }

      if (sort === "created_at_asc") {
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      }

      if (sort === "due_date") {
        const dueDiff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (dueDiff !== 0) {
          return dueDiff;
        }

        return a.title.localeCompare(b.title);
      }

      const weight = { high: 0, medium: 1, low: 2 };
      const priorityDiff = weight[a.priority] - weight[b.priority];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      const dueDiff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      if (dueDiff !== 0) {
        return dueDiff;
      }

      return a.title.localeCompare(b.title);
    });
  }, [allTasks, filter, priorityFilter, projectFilter, quickFilter, search, sort]);

  const visibleTasks = filteredTasks.slice(0, visibleCount);
  const desktopTableTasks = filteredTasks.slice(0, desktopTableVisibleCount);
  const hasMoreTasks = visibleCount < filteredTasks.length;
  const hasMoreDesktopTableTasks = desktopTableVisibleCount < filteredTasks.length;
  const activeDesignerTask = activeDesignerTaskId
    ? allTasks.find((task) => task.id === activeDesignerTaskId) ?? null
    : null;

  useEffect(() => {
    setVisibleCount(MOBILE_BATCH_SIZE);
    setDesktopTableVisibleCount(TABLE_BATCH_SIZE);
  }, [desktopView, filter, priorityFilter, projectFilter, search, sort]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMoreTasks) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((current) => Math.min(current + MOBILE_BATCH_SIZE, filteredTasks.length));
        }
      },
      { rootMargin: "220px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [filteredTasks.length, hasMoreTasks]);

  useEffect(() => {
    if (desktopView !== "table") {
      return;
    }

    const root = desktopTableWrapRef.current;
    const node = desktopTableLoadMoreRef.current;
    if (!root || !node || !hasMoreDesktopTableTasks) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setDesktopTableVisibleCount((current) => Math.min(current + TABLE_BATCH_SIZE, filteredTasks.length));
        }
      },
      { root, rootMargin: "220px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [desktopView, filteredTasks.length, hasMoreDesktopTableTasks]);

  if (!ready || isWorkspaceHydrating) {
    return <ListScreenSkeleton title="Tasks" showStats={false} />;
  }

  if (!user) {
    return null;
  }

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchDraft);
  };

  const openDesignerTaskModal = (task: TaskRow) => {
    setActiveDesignerTaskId(task.id);
  };

  const closeDesignerTaskModal = () => {
    setActiveDesignerTaskId(null);
  };

  const openCreateTaskModal = () => {
    setNewTaskOrganizationId("");
    setNewTaskProjectId("");
    setNewTaskTitle("");
    setNewTaskAssigneeId("");
    setNewTaskStatus("todo");
    setNewTaskDueDate("");
    setNewTaskPriority("medium");
    setTaskSelect(null);
    setCreateTaskError("");
    setShowCreateTaskModal(true);
  };

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProject) {
      return;
    }

    setIsCreatingTask(true);
    setCreateTaskError("");

    try {
      await createTask(selectedProject.id, {
        title: newTaskTitle,
        assigneeId: newTaskAssigneeId,
        status: newTaskStatus,
        dueDate: newTaskDueDate,
        priority: newTaskPriority,
      });
      setShowCreateTaskModal(false);
    } catch (nextError) {
      setCreateTaskError(nextError instanceof Error ? nextError.message : "Unable to create task.");
    } finally {
      setIsCreatingTask(false);
    }
  };

  return (
    <Shell style={isClient ? clientBrandStyle : undefined}>
      {isCreatingTask ? (
        <PopupLoadingOverlay role="status" aria-live="polite">
          <div className="auth-loading-card">
            <div className="auth-loading-spinner" aria-hidden="true" />
            <p>Creating task...</p>
          </div>
        </PopupLoadingOverlay>
      ) : null}
      <DesignerTaskModal
        open={Boolean(activeDesignerTask && isDesigner)}
        task={
          activeDesignerTask
            ? {
                id: activeDesignerTask.id,
                title: activeDesignerTask.title,
                projectId: activeDesignerTask.projectId,
                projectName: activeDesignerTask.projectName,
                dueDate: activeDesignerTask.dueDate,
                status: activeDesignerTask.rawStatus,
                completionScreenshotUrl: activeDesignerTask.completionScreenshotUrl ?? null,
                managerReviewStatus: activeDesignerTask.managerReviewStatus,
                feedbackEntries: activeDesignerTask.feedbackEntries ?? [],
              }
            : null
        }
        onClose={closeDesignerTaskModal}
        onSubmit={async (payload) => {
          await updateTaskStatus(payload.projectId, payload.taskId, {
            status: payload.status,
            completionScreenshotUrl: payload.completionScreenshotUrl ?? null,
          });
        }}
      />

      {showCreateTaskModal && canManage ? (
        <ModalBackdrop onClick={() => setShowCreateTaskModal(false)}>
          <ModalCard onClick={(event) => event.stopPropagation()}>
            <ModalHeader>
              <div>
                <ModalTitle>Create task</ModalTitle>
                <ModalDescription>Add a task from the general tasks page.</ModalDescription>
              </div>
              <ModalClose type="button" onClick={() => setShowCreateTaskModal(false)} aria-label="Close">
                <IconClose />
              </ModalClose>
            </ModalHeader>
            <InlineForm onSubmit={handleCreateTask}>
              <TaskModalGrid>
                <TaskModalField>
                  <TaskFloatingSelect $filled={Boolean(newTaskOrganizationId)} $open={taskSelect === "organization"}>
                    <TaskSelectTrigger
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={taskSelect === "organization"}
                      onClick={() => setTaskSelect((current) => (current === "organization" ? null : "organization"))}
                    >
                      <TaskSelectValueRow>
                        {selectedTaskOrganization ? (
                          <TaskOrganizationLogo
                            organization={{
                              name: selectedTaskOrganization.name,
                              logoUrl: selectedTaskOrganization.logoUrl,
                            }}
                          />
                        ) : null}
                        <TaskSelectValue>{selectedTaskOrganization?.name ?? "Select organization"}</TaskSelectValue>
                      </TaskSelectValueRow>
                      <TaskSelectChevron $open={taskSelect === "organization"}>
                        <IconChevronDown />
                      </TaskSelectChevron>
                    </TaskSelectTrigger>
                    <TaskFloatingLabel>Organization</TaskFloatingLabel>
                    {taskSelect === "organization" ? (
                      <TaskSelectMenu role="listbox" aria-label="Organization">
                        {availableTaskOrganizations.map((organization) => (
                          <TaskSelectOption
                            key={organization.id}
                            type="button"
                            role="option"
                            aria-selected={newTaskOrganizationId === organization.id}
                            $active={newTaskOrganizationId === organization.id}
                            onClick={() => {
                              setNewTaskOrganizationId(organization.id);
                              setNewTaskProjectId("");
                              setNewTaskAssigneeId("");
                              setNewTaskTitle("");
                              setNewTaskDueDate("");
                              setTaskSelect(null);
                            }}
                          >
                            <TaskOrganizationOptionRow>
                              <TaskOrganizationLogo organization={{ name: organization.name, logoUrl: organization.logoUrl }} />
                              <span>{organization.name}</span>
                            </TaskOrganizationOptionRow>
                          </TaskSelectOption>
                        ))}
                      </TaskSelectMenu>
                    ) : null}
                  </TaskFloatingSelect>
                </TaskModalField>

                {newTaskOrganizationId ? (
                  hasProjectsForSelectedOrganization ? (
                    <TaskModalField>
                      <TaskFloatingSelect $filled={Boolean(selectedProject)} $open={taskSelect === "project"}>
                        <TaskSelectTrigger
                          type="button"
                          aria-haspopup="listbox"
                          aria-expanded={taskSelect === "project"}
                          onClick={() => setTaskSelect((current) => (current === "project" ? null : "project"))}
                        >
                          <TaskSelectValue>{selectedProject?.name ?? "Select project"}</TaskSelectValue>
                          <TaskSelectChevron $open={taskSelect === "project"}>
                            <IconChevronDown />
                          </TaskSelectChevron>
                        </TaskSelectTrigger>
                        <TaskFloatingLabel>Project</TaskFloatingLabel>
                        {taskSelect === "project" ? (
                          <TaskSelectMenu role="listbox" aria-label="Project">
                            {filteredTaskProjects.map((project) => (
                              <TaskSelectOption
                                key={project.id}
                                type="button"
                                role="option"
                                aria-selected={newTaskProjectId === project.id}
                                $active={newTaskProjectId === project.id}
                                onClick={() => {
                                  setNewTaskProjectId(project.id);
                                  setNewTaskDueDate(project.dueDate);
                                  setTaskSelect(null);
                                }}
                              >
                                {project.name}
                              </TaskSelectOption>
                            ))}
                          </TaskSelectMenu>
                        ) : null}
                      </TaskFloatingSelect>
                    </TaskModalField>
                  ) : (
                    <TaskModalField $wide>
                      <TaskEmptyState>
                        <strong>No projects in this organization yet</strong>
                        <p>Create a project first before assigning tasks to this organization.</p>
                        <TaskEmptyActionRow>
                          {newTaskOrganizationId !== "__unassigned__" ? (
                            <TaskCreateProjectLink href={`/projects/new?clientOrganizationId=${newTaskOrganizationId}`}>
                              Create project
                            </TaskCreateProjectLink>
                          ) : null}
                        </TaskEmptyActionRow>
                      </TaskEmptyState>
                    </TaskModalField>
                  )
                ) : null}

                {selectedProject ? (
                  <>
                    <TaskModalField $wide>
                      <TaskFloatingField className={newTaskTitle ? "auth-field is-filled" : "auth-field"}>
                        <TaskTextInput
                          value={newTaskTitle}
                          onChange={(event) => setNewTaskTitle(event.target.value)}
                          placeholder=" "
                          required
                        />
                        <span>Task title</span>
                      </TaskFloatingField>
                    </TaskModalField>

                    <TaskModalField>
                      <TaskFloatingSelect $filled={Boolean(newTaskAssigneeId)} $open={taskSelect === "assignee"}>
                        <TaskSelectTrigger
                          type="button"
                          aria-haspopup="listbox"
                          aria-expanded={taskSelect === "assignee"}
                          onClick={() => setTaskSelect((current) => (current === "assignee" ? null : "assignee"))}
                        >
                          <TaskSelectValue>
                            {availableStaff.find((member) => member.id === newTaskAssigneeId)?.name ?? "Select staff"}
                          </TaskSelectValue>
                          <TaskSelectChevron $open={taskSelect === "assignee"}>
                            <IconChevronDown />
                          </TaskSelectChevron>
                        </TaskSelectTrigger>
                        <TaskFloatingLabel>Assignee</TaskFloatingLabel>
                        {taskSelect === "assignee" ? (
                          <TaskSelectMenu role="listbox" aria-label="Assignee">
                            {availableStaff.map((member) => (
                              <TaskSelectOption
                                key={member.id}
                                type="button"
                                role="option"
                                aria-selected={newTaskAssigneeId === member.id}
                                $active={newTaskAssigneeId === member.id}
                                onClick={() => {
                                  setNewTaskAssigneeId(member.id);
                                  setTaskSelect(null);
                                }}
                              >
                                {member.name}
                              </TaskSelectOption>
                            ))}
                          </TaskSelectMenu>
                        ) : null}
                      </TaskFloatingSelect>
                    </TaskModalField>

                    <TaskModalField>
                      <TaskFloatingSelect $filled $open={taskSelect === "status"}>
                        <TaskSelectTrigger
                          type="button"
                          aria-haspopup="listbox"
                          aria-expanded={taskSelect === "status"}
                          onClick={() => setTaskSelect((current) => (current === "status" ? null : "status"))}
                        >
                          <TaskSelectValue>{getTaskStatusLabel(newTaskStatus)}</TaskSelectValue>
                          <TaskSelectChevron $open={taskSelect === "status"}>
                            <IconChevronDown />
                          </TaskSelectChevron>
                        </TaskSelectTrigger>
                        <TaskFloatingLabel>Status</TaskFloatingLabel>
                        {taskSelect === "status" ? (
                          <TaskSelectMenu role="listbox" aria-label="Status">
                            {(["todo", "in_progress", "done"] as TaskStatus[]).map((option) => (
                              <TaskSelectOption
                                key={option}
                                type="button"
                                role="option"
                                aria-selected={newTaskStatus === option}
                                $active={newTaskStatus === option}
                                onClick={() => {
                                  setNewTaskStatus(option);
                                  setTaskSelect(null);
                                }}
                              >
                                {getTaskStatusLabel(option)}
                              </TaskSelectOption>
                            ))}
                          </TaskSelectMenu>
                        ) : null}
                      </TaskFloatingSelect>
                    </TaskModalField>

                    <TaskModalField>
                      <CustomDatePicker
                        label="Due date"
                        value={newTaskDueDate}
                        onChange={setNewTaskDueDate}
                      />
                    </TaskModalField>
                  </>
                ) : null}
              </TaskModalGrid>
              {selectedProject ? (
                <PriorityField>
                  <MetaLabel>Priority</MetaLabel>
                  <PriorityChips>
                    {(["high", "medium", "low"] as TaskPriority[]).map((priority) => (
                      <PriorityChip
                        key={priority}
                        type="button"
                        $tone={priority}
                        $active={newTaskPriority === priority}
                        onClick={() => setNewTaskPriority(priority)}
                      >
                        {formatLabel(priority)}
                      </PriorityChip>
                    ))}
                  </PriorityChips>
                </PriorityField>
              ) : null}
              {createTaskError ? <InlineError>{createTaskError}</InlineError> : null}
              <button className="primary-button" type="submit" disabled={isCreatingTask || !selectedProject}>
                {isCreatingTask ? "Creating..." : "Add task"}
              </button>
            </InlineForm>
          </ModalCard>
        </ModalBackdrop>
      ) : null}

      <AppSidebar user={user} activeLabel="Tasks" />

      <Content>
        <Header>
          <div>
            <Eyebrow>{roleLabel}</Eyebrow>
            <TitleRow>
              {isClient ? <HeaderClientLogo organization={currentClientOrganization} /> : null}
              <Title>Tasks</Title>
            </TitleRow>
            <Subtitle>
              {isDesigner
                ? "See the tasks assigned across the projects you are working on."
                : "Manage deliverables, assign staff, and track project work across all active projects."}
            </Subtitle>
          </div>
          <HeaderAvatarLink href="/profile" aria-label="Open profile">
            <UserAvatar user={user} />
          </HeaderAvatarLink>
        </Header>

        <Toolbar>
          <FilterModal
            open={showFilters}
            title="Filter tasks"
            description="Adjust task filtering."
            sections={[
              {
                id: "filter",
                label: "Status",
                options: filterOptions.map((option) => ({
                  value: option.key,
                  label: option.label,
                })),
              },
              {
                id: "priorityFilter",
                label: "Priority",
                options: [
                  { value: "all", label: "All" },
                  { value: "high", label: "High" },
                  { value: "medium", label: "Medium" },
                  { value: "low", label: "Low" },
                ],
              },
              {
                id: "projectFilter",
                label: "Project",
                options: projectFilterOptions,
                searchable: true,
                searchPlaceholder: "Search projects...",
              },
            ]}
            values={{ filter, priorityFilter, projectFilter }}
            onApply={(nextValues) => {
              setFilter(nextValues.filter as FilterKey);
              setPriorityFilter(nextValues.priorityFilter as DerivedPriority | "all");
              setProjectFilter(nextValues.projectFilter);
            }}
            onReset={() => {
              setFilter("all");
              setPriorityFilter("all");
              setProjectFilter("all");
              router.replace(pathname);
            }}
            onClose={() => setShowFilters(false)}
          />
          <FilterModal
            open={showSort}
            title="Sort tasks"
            description="Adjust task sorting."
            sections={[
              {
                id: "sort",
                label: "Sort by",
                options: [
                  { value: "priority", label: "Priority" },
                  { value: "due_date", label: "Due Date: Soonest First" },
                  { value: "created_at_desc", label: "Newest to Oldest" },
                  { value: "created_at_asc", label: "Oldest to Newest" },
                ],
              },
            ]}
            values={{ sort }}
            onApply={(nextValues) => {
              setSort(nextValues.sort as SortKey);
            }}
            onReset={() => {
              setSort("due_date");
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
                placeholder="Search tasks, projects, or staff..."
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
                <ActionIcon>
                  <IconFilter />
                </ActionIcon>
              </FilterButton>
              <FilterButton
                type="button"
                aria-label="Open sorting"
                aria-expanded={showSort}
                onClick={() => setShowSort(true)}
              >
                {appliedSortCount ? <FilterBadge>{appliedSortCount}</FilterBadge> : null}
                <ActionIcon>
                  <IconSort />
                </ActionIcon>
              </FilterButton>
            </FilterMenuWrap>
            <SearchButton type="submit" aria-label="Search tasks">
              <ActionIcon>
                <IconSearch />
              </ActionIcon>
            </SearchButton>
          </SearchControls>

          {canManage && hasAvailableTaskProjects ? (
            <CreateButton type="button" onClick={openCreateTaskModal}>
              <ActionIcon>
                <IconPlus />
              </ActionIcon>
              <span>Task</span>
            </CreateButton>
          ) : null}

          <DesktopViewToggleGroup aria-label="Task view">
            <DesktopViewToggleButton
              type="button"
              $active={desktopView === "cards"}
              onClick={() => setDesktopView("cards")}
            >
              Cards
            </DesktopViewToggleButton>
            <DesktopViewToggleButton
              type="button"
              $active={desktopView === "table"}
              onClick={() => setDesktopView("table")}
            >
              Table
            </DesktopViewToggleButton>
          </DesktopViewToggleGroup>
        </Toolbar>

        <DesktopPanel ref={desktopTableWrapRef} $visible={desktopView === "table"}>
          {filteredTasks.length ? (
            <>
              <TaskTableHeader>
                <span>Task</span>
                <span>Project</span>
                <span>Company</span>
                <span>Assignee</span>
                <span>Due date</span>
                <span>Status</span>
                <span>Priority</span>
              </TaskTableHeader>
              <TaskTable>
                {desktopTableTasks.map((task) => {
                  const statusTone = getStatusTone(task.status);
                  const priorityTone = getPriorityTone(task.priority);
                  const isTaskClickable = isDesigner && task.assigneeId === user.id;
                  const taskHref =
                    isClient ? `/projects/${task.projectId}` : `/projects/${task.projectId}/tasks/${task.id}`;
                  const rowContent = (
                    <TaskDesktopRowGrid>
                      <TaskDesktopPrimary>
                        <TaskDesktopMark>{task.projectMark}</TaskDesktopMark>
                        <TaskDesktopPrimaryCopy>
                          <strong>{task.title}</strong>
                        </TaskDesktopPrimaryCopy>
                      </TaskDesktopPrimary>
                      <TaskDesktopText>{task.projectName}</TaskDesktopText>
                      <TaskDesktopText>{task.clientOrganizationName}</TaskDesktopText>
                      <TaskDesktopText>
                        {task.assigneeName}
                        {task.assigneePhone ? ` · ${task.assigneePhone}` : ""}
                      </TaskDesktopText>
                      <TaskDesktopText>{formatDueDate(task.dueDate)}</TaskDesktopText>
                      <TaskDesktopPill style={{ background: statusTone.bg, color: statusTone.fg }}>
                        {statusTone.label}
                      </TaskDesktopPill>
                      <TaskDesktopPill style={{ background: priorityTone.bg, color: priorityTone.fg }}>
                        {priorityTone.label}
                      </TaskDesktopPill>
                    </TaskDesktopRowGrid>
                  );

                  return isTaskClickable ? (
                    <DesktopTaskButtonRow
                      key={task.id}
                      $attention={task.needsAttention}
                      type="button"
                      onClick={() => openDesignerTaskModal(task)}
                    >
                      {rowContent}
                    </DesktopTaskButtonRow>
                  ) : (
                    <DesktopTaskLinkRow
                      key={task.id}
                      $attention={task.needsAttention}
                      href={taskHref}
                    >
                      {rowContent}
                    </DesktopTaskLinkRow>
                  );
                })}
                {hasMoreDesktopTableTasks ? <LoadMoreSentinel ref={desktopTableLoadMoreRef} aria-hidden="true" /> : null}
              </TaskTable>
            </>
          ) : (
            <EmptyState>
              <strong>No tasks found</strong>
              <p>Try another search term or adjust the selected status filter.</p>
            </EmptyState>
          )}
        </DesktopPanel>

        <TaskList $hideOnDesktop={desktopView === "table"}>
          {filteredTasks.length ? (
            visibleTasks.map((task) => {
              const statusTone = getStatusTone(task.status);
              const priorityTone = getPriorityTone(task.priority);
              const isTaskClickable = isDesigner && task.assigneeId === user.id;
              const taskHref =
                isClient ? `/projects/${task.projectId}` : `/projects/${task.projectId}/tasks/${task.id}`;
              const taskCardContent = (
                <>
                  <TaskAttentionBadge $visible={task.needsAttention}>
                    {task.needsAttention ? "Action" : ""}
                  </TaskAttentionBadge>
                  <TaskCompanyHeader>{task.clientOrganizationName}</TaskCompanyHeader>
                  <TaskStatusPillMobile style={{ background: statusTone.bg, color: statusTone.fg }}>
                    {statusTone.label}
                  </TaskStatusPillMobile>
                  <TaskCardLead>
                    <TaskCardMark>{task.projectMark}</TaskCardMark>
                    <TaskCardSummary>
                      <TaskCardEyebrow>{task.projectName}</TaskCardEyebrow>
                      <TaskTitleRow>
                        <TaskTitle>{task.title}</TaskTitle>
                        <TaskPriorityPillMobile style={{ background: priorityTone.bg, color: priorityTone.fg }}>
                          {priorityTone.label}
                        </TaskPriorityPillMobile>
                        <TaskTitleMetaInline>
                          <TaskDueText>{formatDueDate(task.dueDate)}</TaskDueText>
                        </TaskTitleMetaInline>
                      </TaskTitleRow>
                      <TaskContactPills>
                        <TaskAssigneePill>{task.assigneeName}</TaskAssigneePill>
                        {task.assigneePhone ? <TaskAssigneePill>{task.assigneePhone}</TaskAssigneePill> : null}
                      </TaskContactPills>
                    </TaskCardSummary>
                  </TaskCardLead>
                  <TaskMetaGroup>
                    <TaskMetaBlock $desktopOnly $desktopOrder={1}>
                      <TaskMetaLabel>Assignee</TaskMetaLabel>
                      <TaskMetaValue>
                        {task.assigneeName}
                        {task.assigneePhone ? ` · ${task.assigneePhone}` : ""}
                      </TaskMetaValue>
                    </TaskMetaBlock>
                    <TaskMetaBlock $desktopOrder={4}>
                      <TaskMetaLabel>Due date</TaskMetaLabel>
                      <TaskDueText>{formatDueDate(task.dueDate)}</TaskDueText>
                    </TaskMetaBlock>
                    <TaskMetaBlock $desktopOrder={2}>
                      <TaskMetaLabel>Status</TaskMetaLabel>
                      <Pill style={{ background: statusTone.bg, color: statusTone.fg }}>
                        {statusTone.label}
                      </Pill>
                    </TaskMetaBlock>
                    <TaskMetaBlock $desktopOrder={3}>
                      <TaskMetaLabel>Priority</TaskMetaLabel>
                      <TaskPriorityPillDesktop style={{ background: priorityTone.bg, color: priorityTone.fg }}>
                        {priorityTone.label}
                      </TaskPriorityPillDesktop>
                    </TaskMetaBlock>
                  </TaskMetaGroup>
                </>
              );

              return isTaskClickable ? (
                <TaskCardButton
                  key={task.id}
                  $attention={task.needsAttention}
                  type="button"
                  onClick={() => openDesignerTaskModal(task)}
                >
                  {taskCardContent}
                </TaskCardButton>
              ) : (
                <TaskCardLink
                  key={task.id}
                  $attention={task.needsAttention}
                  href={taskHref}
                >
                  {taskCardContent}
                </TaskCardLink>
              );
            })
          ) : (
            <EmptyState>
              <strong>No tasks found</strong>
              <p>Try another search term or adjust the selected status filter.</p>
            </EmptyState>
          )}
          {hasMoreTasks ? <LoadMoreSentinel ref={loadMoreRef} aria-hidden="true" /> : null}
        </TaskList>
      </Content>
    </Shell>
  );
}

const cardSurface = css`
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.95);
  box-shadow: var(--shadow-sm);
`;

const Shell = styled.main`
  display: block;
  min-height: 100vh;
  padding: 16px 14px calc(env(safe-area-inset-bottom) + 16px);

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

const Sidebar = styled.aside`
  display: none;

  ${desktop} {
    width: 260px;
    flex: 0 0 260px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 22px 18px;
    border-right: 1px solid rgba(230, 224, 215, 0.95);
    border-radius: 26px 0 0 26px;
    background: rgba(255, 255, 255, 0.62);
  }
`;

const Brand = styled.div`
  padding: 10px 8px 24px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 2.6rem;
  line-height: 1;
  font-weight: 600;
  text-transform: lowercase;
`;

const SideNav = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 28px;
`;

const sideItemCss = css<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 56px;
  padding: 0 16px;
  border: 0;
  border-radius: 18px;
  background: ${({ $active }) => ($active ? "#f5efe5" : "transparent")};
  box-shadow: ${({ $active }) =>
    $active ? "inset 0 0 0 1px rgba(230, 224, 215, 0.9)" : "none"};
  color: ${({ $active }) => ($active ? "var(--color-text)" : "var(--color-text-muted)")};
  text-decoration: none;
  font-size: 0.96rem;
`;

const SideLink = styled(Link)<{ $active?: boolean }>`
  ${sideItemCss}
`;

const SideIcon = styled.span`
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0.72;

  svg {
    width: 100%;
    height: 100%;
  }
`;

const SideProfile = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 8px 8px;
`;

const ProfileAvatar = styled.div`
  width: 42px;
  height: 42px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #ded6c8;
  color: #fff;
  font-weight: 600;
`;

const ProfileName = styled.strong`
  display: block;
`;

const ProfileRole = styled.p`
  margin: 2px 0 0;
  color: var(--color-text-muted);
  font-size: 0.85rem;
`;

const Content = styled.section`
  display: flex;
  flex-direction: column;
  gap: 14px;

  ${desktop} {
    flex: 1;
    min-width: 0;
    padding: 24px 28px;
    border-radius: 0 26px 26px 0;
    background:
      radial-gradient(circle at top center, rgba(255, 255, 255, 0.76), transparent 18%),
      linear-gradient(
        180deg,
        var(--client-screen-soft-panel, rgba(252, 249, 244, 0.92)),
        rgba(247, 243, 237, 0.84)
      );
  }
`;

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
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
  margin: 4px 0 6px;
  font-size: clamp(1.45rem, 3vw, 2rem);
  line-height: 1;
  letter-spacing: -0.04em;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
`;

const HeaderClientLogo = styled(ClientTitleLogo)`
  width: 42px;
  height: 42px;
  border-radius: 14px;
  object-fit: cover;
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.92);
  flex: 0 0 auto;
`;

const Subtitle = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.45;

  display: none;

  ${desktop} {
    display: block;
    font-size: 0.86rem;
  }
`;

const HeaderAvatarLink = styled(Link)`
  position: relative;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 999px;
  background: #ded6c8;
  color: #fff;
  font-weight: 700;
  text-decoration: none;
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
  width: 100%;
  min-height: 40px;
  padding: 0 18px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: var(--shadow-sm);
  color: var(--color-text);
  font-size: 0.94rem;
`;

const FilterMenuWrap = styled.div`
  display: flex;
  gap: 10px;
`;

const FilterButton = styled.button`
  position: relative;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: var(--shadow-sm);
  color: var(--color-text);
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
  background: var(--client-brand-primary, #1f4339);
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
  width: 100%;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.96);
  color: var(--color-text);
`;

const CreateButton = styled.button`
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  background: var(--client-brand-primary, #1f4339);
  color: var(--client-brand-on-primary, #fff);
  font-size: 0.9rem;
  font-weight: 700;
  box-shadow: 0 14px 26px rgba(31, 68, 57, 0.16);

  ${desktop} {
    flex: 0 0 220px;
  }
`;

const DesktopViewToggleGroup = styled.div`
  display: none;

  ${desktop} {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 3px;
    border: 1px solid rgba(230, 224, 215, 0.95);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.92);
    box-shadow: var(--shadow-sm);
    flex: 0 0 auto;
  }
`;

const DesktopViewToggleButton = styled.button<{ $active?: boolean }>`
  min-height: 26px;
  padding: 0 9px;
  border: 0;
  border-radius: 999px;
  background: ${({ $active }) => ($active ? "var(--client-brand-primary, #214f39)" : "transparent")};
  color: ${({ $active }) => ($active ? "var(--client-brand-on-primary, #fff)" : "var(--color-text-muted)")};
  font-size: 0.7rem;
  font-weight: 600;
`;

const DesktopPanel = styled.section<{ $visible?: boolean }>`
  display: none;

  ${desktop} {
    ${cardSurface}
    display: ${({ $visible }) => ($visible ? "block" : "none")};
    border-radius: 22px;
    overflow: auto;
    max-height: 650px;
  }
`;

const TaskTableHeader = styled.div`
  display: grid;
  grid-template-columns: minmax(220px, 1.6fr) minmax(140px, 1.1fr) minmax(180px, 1.2fr) minmax(180px, 1.2fr) minmax(110px, 0.8fr) minmax(110px, 0.8fr) minmax(100px, 0.7fr);
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  color: var(--color-text-light);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  position: sticky;
  top: 0;
  z-index: 1;
  background: rgba(255, 255, 255, 0.98);
`;

const TaskTable = styled.div`
  display: flex;
  flex-direction: column;
`;

const taskRowSurfaceCss = css<{ $attention?: boolean }>`
  display: block;
  border-top: 1px solid rgba(230, 224, 215, 0.8);
  border-left: 3px solid ${({ $attention }) => ($attention ? "#d94b4b" : "transparent")};
  text-decoration: none;
  transition:
    background 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease,
    color 180ms ease;
  background: ${({ $attention }) => ($attention ? "rgba(217, 75, 75, 0.04)" : "transparent")};

  ${desktop} {
    &:hover {
      transform: translateY(-2px);
      background: ${({ $attention }) =>
        $attention ? "rgba(255, 232, 232, 0.98)" : "rgba(252, 241, 226, 0.98)"};
      border-color: ${({ $attention }) => ($attention ? "#d94b4b" : "rgba(220, 208, 194, 0.95)")};
      box-shadow:
        inset 0 0 0 1px rgba(220, 208, 194, 0.75),
        0 14px 28px rgba(31, 31, 31, 0.08);
      color: #1f4339;
    }
  }
`;

const DesktopTaskLinkRow = styled(Link)<{ $attention?: boolean }>`
  ${taskRowSurfaceCss}
  cursor: pointer;
`;

const DesktopTaskButtonRow = styled.button<{ $attention?: boolean }>`
  ${taskRowSurfaceCss}
  width: 100%;
  padding: 0;
  border-left: 0;
  border-right: 0;
  border-bottom: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
`;

const TaskDesktopRowGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(220px, 1.6fr) minmax(140px, 1.1fr) minmax(180px, 1.2fr) minmax(180px, 1.2fr) minmax(110px, 0.8fr) minmax(110px, 0.8fr) minmax(100px, 0.7fr);
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
`;

const TaskDesktopPrimary = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
`;

const TaskDesktopMark = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 12px;
  flex: 0 0 36px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #ede5d8, #f8f4ee);
  color: #8c7040;
  font-size: 0.82rem;
  font-weight: 700;
`;

const TaskDesktopPrimaryCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: 3px;

  strong {
    font-size: 0.86rem;
    font-weight: 700;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const TaskDesktopText = styled.span`
  min-width: 0;
  color: var(--color-text);
  font-size: 0.8rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const TaskDesktopPill = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: start;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
`;

const TaskList = styled.section<{ $hideOnDesktop?: boolean }>`
  display: grid;
  gap: 12px;

  margin-top: 6px;

  ${desktop} {
    display: ${({ $hideOnDesktop }) => ($hideOnDesktop ? "none" : "grid")};
    gap: 14px;
    margin-top: 4px;
  }
`;

const taskCardSurfaceCss = css<{ $attention?: boolean }>`
  ${cardSurface}
  position: relative;
  display: grid;
  gap: 10px;
  border-color: ${({ $attention }) => ($attention ? "rgba(217, 75, 75, 0.98)" : "rgba(230, 224, 215, 0.95)")};
  border-radius: 18px;
  text-decoration: none;
  transition:
    background 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease,
    color 180ms ease;
  box-shadow: ${({ $attention }) =>
    $attention ? "0 0 0 1px rgba(217, 75, 75, 0.18), var(--shadow-sm)" : "var(--shadow-sm)"};
  background: ${({ $attention }) => ($attention ? "rgba(244, 233, 233, 0.75)" : "rgba(255, 255, 255, 0.95)")};
  padding: 14px 12px 12px;

  ${desktop} {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: start;
    gap: 18px;
    border-radius: 20px;
    padding: 22px 18px 18px;

    &:hover {
      transform: translateY(-2px);
      background: ${({ $attention }) =>
        $attention ? "rgba(255, 244, 244, 0.96)" : "rgba(255, 248, 239, 0.92)"};
      border-color: ${({ $attention }) =>
        $attention ? "rgba(217, 75, 75, 0.98)" : "rgba(220, 208, 194, 0.95)"};
      box-shadow: ${({ $attention }) =>
        $attention
          ? "0 0 0 1px rgba(217, 75, 75, 0.2), 0 18px 32px rgba(31, 31, 31, 0.08)"
          : "0 18px 32px rgba(31, 31, 31, 0.08)"};
      color: #1f4339;
    }
  }
`;

const TaskCardLink = styled(Link)<{ $attention?: boolean }>`
  ${taskCardSurfaceCss}
  cursor: pointer;
`;

const TaskCardButton = styled.button<{ $attention?: boolean }>`
  ${taskCardSurfaceCss}
  width: 100%;
  border: 0;
  cursor: pointer;
  text-align: left;
`;

const TaskCardLead = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  padding-top: 8px;

  ${desktop} {
    gap: 16px;
    flex: 1.1;
    padding-top: 10px;
  }
`;

const TaskAttentionBadge = styled.span<{ $visible?: boolean }>`
  position: absolute;
  top: -8px;
  right: 10px;
  min-width: 16px;
  height: 16px;
  padding: 0 5px;
  border-radius: 999px;
  background: #d94b4b;
  color: #fff;
  display: ${({ $visible }) => ($visible ? "inline-flex" : "none")};
  align-items: center;
  justify-content: center;
  font-size: 0.6rem;
  font-weight: 800;
  line-height: 1;

  ${desktop} {
    top: -6px;
    right: 12px;
    min-width: 18px;
    height: 18px;
    padding: 0 6px;
    font-size: 0.68rem;
  }
`;

const TaskCompanyHeader = styled.span`
  position: absolute;
  top: 10px;
  left: 12px;
  right: 120px;
  color: grey;
  text-transform: uppercase;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  ${desktop} {
    top: 12px;
    left: 18px;
    right: 56px;
    font-size: 0.7rem;
  }
`;

const TaskStatusPillMobile = styled.span`
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

  ${desktop} {
    display: none;
  }
`;

const TaskCardMark = styled.div`
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #ede5d8, #f8f4ee);
  color: #8c7040;
  font-size: 0.88rem;
  font-weight: 700;

  ${desktop} {
    width: 58px;
    height: 58px;
    border-radius: 16px;
    font-size: 1.08rem;
  }
`;

const TaskCardSummary = styled.div`
  display: grid;
  gap: 5px;
  min-width: 0;

  ${desktop} {
    gap: 8px;
  }
`;

const TaskContactPills = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  ${desktop} {
    display: none;
  }
`;

const TaskAssigneePill = styled.div`
  display: inline-flex;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  padding: 5px 9px;
  border-radius: 999px;
  background: rgba(244, 241, 237, 0.96);
  color: var(--color-text-muted);
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1.2;

  white-space: nowrap;

  ${desktop} {
    display: none;
  }
`;

const TaskCardEyebrow = styled.span`
  color: var(--color-text-light);
  font-size: 0.58rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  text-transform: none;

  ${desktop} {
    font-size: 0.62rem;
  }
`;

const TaskTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
  min-width: 0;

  ${desktop} {
    display: block;
  }
`;

const TaskTitleMetaInline = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
  flex: 0 0 auto;

  ${desktop} {
    display: none;
  }
`;

const TaskMetaGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
  justify-content: flex-start;
  display: none;

  ${desktop} {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 18px;
    flex: 0 1 auto;
    align-self: center;
    align-items: flex-start;
    justify-content: flex-end;
  }
`;

const TaskMetaBlock = styled.div<{ $desktopOnly?: boolean; $desktopOrder?: number }>`
  display: grid;
  gap: 4px;
  justify-items: flex-end;
  text-align: right;
  ${({ $desktopOnly }) =>
    $desktopOnly
      ? css`
          display: none;
        `
      : ""}

  ${desktop} {
    display: grid;
    gap: 6px;
    justify-items: start;
    text-align: left;
    order: ${({ $desktopOrder = 0 }) => $desktopOrder};
    ${({ $desktopOnly }) =>
      $desktopOnly
        ? css`
            display: grid;
          `
        : ""}
  }

  &:nth-child(2),
  &:nth-child(3) {
    @media (max-width: 767px) {
      display: none;
    }
  }
`;

const TaskMetaLabel = styled.span`
  display: none;

  ${desktop} {
    display: inline;
    color: var(--color-text-light);
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
`;

const TaskDueText = styled.strong`
  font-size: 0.66rem;
  color: var(--color-text);
  line-height: 1.15;

  ${desktop} {
    font-size: 0.88rem;
    line-height: normal;
  }
`;

const TaskMetaValue = styled.strong`
  font-size: 0.78rem;
  color: var(--color-text);
  line-height: 1.35;

  ${desktop} {
    font-size: 0.84rem;
  }
`;

const TaskPriorityFlag = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;

  svg {
    width: 13px;
    height: 13px;
  }

  ${desktop} {
    width: auto;
    height: auto;
    border-radius: 0;

    svg {
      width: 16px;
      height: 16px;
    }
  }
`;

const TaskPriorityFlagMobile = styled(TaskPriorityFlag)`
  ${desktop} {
    display: none;
  }
`;

const TaskPriorityPillMobile = styled.span`
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  font-size: 0.64rem;
  font-weight: 700;

  ${desktop} {
    display: none;
  }
`;

const TaskTitle = styled.strong`
  font-size: 0.92rem;
  line-height: 1.22;
  min-width: 0;
  flex: 1;

  ${desktop} {
    font-size: 1.08rem;
    flex: unset;
  }
`;

const TaskMeta = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.82rem;
  line-height: 1.45;
`;

const LoadMoreSentinel = styled.div`
  height: 1px;
`;

const ProjectMark = styled.div`
  width: 46px;
  height: 46px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #ede5d8, #f8f4ee);
  color: #8c7040;
  font-size: 1rem;
  font-weight: 700;
`;

const Avatar = styled.span`
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #d9cfbf;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
`;

const Pill = styled.span`
   display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  width: fit-content;
  max-width: 100%;
  padding: 5px 9px;
  border-radius: 999px;
  background: rgba(244, 241, 237, 0.96);
  color: var(--color-text-muted);
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1.2;

  span {
    white-space: nowrap;
  }
`;

const TaskPriorityPillDesktop = styled(Pill)`
  display: none;

  ${desktop} {
    display: inline-flex;
  }
`;

const MiniIcon = styled.span`
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-light);

  svg {
    width: 100%;
    height: 100%;
  }
`;

const ActionIcon = styled.span`
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 100%;
    height: 100%;
  }
`;

const EmptyState = styled.div`
  ${cardSurface}
  display: grid;
  gap: 6px;
  padding: 18px;
  border-radius: 20px;
  color: var(--color-text-muted);

  strong {
    color: var(--color-text);
    font-size: 0.92rem;
  }

  p {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.45;
  }
`;

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 95;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(28, 29, 28, 0.36);
  backdrop-filter: blur(8px);

  @media (max-width: 767px) {
    align-items: flex-start;
  }
`;

const PopupLoadingOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 140;
  display: grid;
  place-items: center;
`;

const ModalCard = styled.section`
  ${cardSurface}
  width: min(100%, 620px);
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px;
  border-radius: 26px;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
`;

const ModalTitle = styled.h2`
  margin: 0;
  font-size: 1.08rem;
`;

const ModalDescription = styled.p`
  margin: 6px 0 0;
  color: var(--color-text-muted);
  font-size: 0.88rem;
  line-height: 1.5;

  @media (max-width: 767px) {
    display: none;
  }
`;

const ModalClose = styled.button`
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--color-text);
  flex: 0 0 40px;

  svg {
    width: 18px;
    height: 18px;
    stroke: currentColor;
  }
`;

const InlineForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const TaskModalGrid = styled.div`
  display: grid;
  gap: 10px;

  ${desktop} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const TaskModalField = styled.div<{ $wide?: boolean }>`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;

  ${({ $wide }) =>
    $wide
      ? css`
          ${desktop} {
            grid-column: 1 / -1;
          }
        `
      : ""}
`;

const TaskFloatingField = styled.label`
  min-width: 0;
  width: 100%;
`;

const TaskTextInput = styled.input`
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 50px;
  padding: 0 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  box-shadow: var(--shadow-sm);
  font-size: 16px;

  &[type="date"] {
    appearance: none;
    -webkit-appearance: none;
    min-width: 0;
    max-width: 100%;
    text-align: left;
  }

  &[type="date"]::-webkit-date-and-time-value {
    text-align: left;
    min-width: 0;
  }

  &[type="date"]::-webkit-calendar-picker-indicator {
    margin-left: 4px;
  }
`;

const TaskFloatingSelect = styled.div<{ $filled?: boolean; $open?: boolean }>`
  position: relative;
  display: block;
  width: 100%;
  z-index: ${({ $open }) => ($open ? 8 : 2)};
`;

const TaskSelectTrigger = styled.button`
  width: 100%;
  min-height: 50px;
  padding: 16px 14px 10px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  box-shadow: var(--shadow-sm);
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  font-size: 16px;
  text-align: left;
`;

const TaskFloatingLabel = styled.span`
  position: absolute;
  left: 16px;
  top: 1px;
  transform: translateY(-50%);
  padding: 0 6px;
  background: rgba(255, 255, 255, 0.96);
  color: #29463e;
  font-size: 13px;
  font-weight: 500;
  z-index: 3;
  pointer-events: none;
`;

const TaskSelectValue = styled.span`
  color: var(--color-text);
  font-size: 16px;
  line-height: 1.2;
`;

const TaskSelectValueRow = styled.span`
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 10px;
`;

const TaskOrganizationLogo = styled(ClientTitleLogo)`
  width: 24px;
  height: 24px;
  border-radius: 8px;
  object-fit: cover;
  overflow: hidden;
  flex: 0 0 24px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #ede5d8, #f8f4ee);
  color: #8c7040;
  font-size: 0.7rem;
  font-weight: 700;
`;

const TaskSelectChevron = styled.span<{ $open?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  transform: rotate(${({ $open }) => ($open ? "180deg" : "0deg")});
  transition: transform 140ms ease;

  svg {
    width: 16px;
    height: 16px;
  }
`;

const TaskSelectMenu = styled.div`
  ${cardSurface}
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 8px);
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: 18px;
  max-height: 240px;
  overflow-y: auto;
`;

const TaskSelectOption = styled.button<{ $active?: boolean }>`
  width: 100%;
  min-height: 44px;
  padding: 0 14px;
  border: 0;
  border-radius: 12px;
  background: ${({ $active }) => ($active ? "rgba(31, 67, 57, 0.1)" : "transparent")};
  color: ${({ $active }) => ($active ? "#1f4339" : "var(--color-text)")};
  font-size: 0.94rem;
  font-weight: ${({ $active }) => ($active ? 600 : 500)};
  text-align: left;
`;

const TaskOrganizationOptionRow = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 10px;
`;

const TaskEmptyState = styled.div`
  ${cardSurface}
  display: grid;
  gap: 8px;
  padding: 14px 16px;
  border-radius: 18px;

  strong {
    font-size: 0.92rem;
  }

  p {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.82rem;
    line-height: 1.45;
  }
`;

const TaskEmptyActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;

const TaskCreateProjectLink = styled(Link)`
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--client-brand-primary, var(--color-primary));
  color: var(--client-brand-on-primary, #fff);
  font-size: 0.82rem;
  font-weight: 600;
  text-decoration: none;
`;

const PriorityField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const MetaLabel = styled.span`
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.2;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const PriorityChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const PriorityChip = styled.button<{ $active?: boolean; $tone: TaskPriority }>`
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid
    ${({ $active }) => ($active ? "transparent" : "rgba(230, 224, 215, 0.95)")};
  background: ${({ $active, $tone }) =>
    $active
      ? $tone === "high"
        ? "#ffe7e5"
        : $tone === "medium"
          ? "#fff1da"
          : "#e5f4e8"
      : "rgba(255, 255, 255, 0.9)"};
  color: ${({ $tone }) =>
    $tone === "high" ? "#e06457" : $tone === "medium" ? "#ca8a22" : "#5ca16d"};
  font-size: 0.8rem;
  font-weight: 700;
`;

const UploadField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const UploadHint = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.82rem;
  line-height: 1.45;
`;

const UploadButton = styled.button`
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 16px;
  border: 1px dashed rgba(33, 79, 57, 0.28);
  border-radius: 16px;
  background: rgba(244, 248, 246, 0.92);
  color: #214f39;
  font-weight: 600;
  cursor: pointer;

  input {
    display: none;
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const ScreenshotPreviewWrap = styled.div`
  ${cardSurface}
  padding: 10px;
  border-radius: 18px;
`;

const ScreenshotPreview = styled.img`
  width: 100%;
  max-height: 220px;
  display: block;
  object-fit: cover;
  border-radius: 14px;
`;

const InlineError = styled.p`
  margin: 0;
  color: var(--color-danger);
  font-size: 0.84rem;
  line-height: 1.45;
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

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  );
}

function IconFilter() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
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

function IconFlag() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21V5" />
      <path d="M5 5h10l-2 4 2 4H5" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V5" />
      <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
      <path d="M4.5 18.5h15" />
    </svg>
  );
}

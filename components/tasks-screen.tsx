"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import styled, { css } from "styled-components";
import { useAppState } from "@/components/app-state";
import { AppSidebar } from "@/components/app-sidebar";
import { CustomDatePicker } from "@/components/custom-date-picker";
import { DesignerTaskModal } from "@/components/designer-task-modal";
import { FilterModal } from "@/components/filter-modal";
import { canCreateTask, canViewProject, getVisibleTasksForUser } from "@/lib/permissions";
import { formatLabel, formatRole } from "@/lib/display";
import { Project, TaskManagerReviewStatus, TaskPriority, TaskStatus } from "@/lib/types";

type FilterKey =
  | "all"
  | "todo"
  | "in_progress"
  | "review"
  | "approved"
  | "completed";

type SortKey = "due_date" | "priority" | "name";
type DerivedPriority = "high" | "medium" | "low";
type DerivedTaskStatus =
  | "todo"
  | "in_progress"
  | "review"
  | "approved"
  | "completed";

type TaskRow = {
  id: string;
  title: string;
  assigneeId: string;
  assigneeName: string;
  projectId: string;
  projectName: string;
  projectMark: string;
  dueDate: string;
  status: DerivedTaskStatus;
  priority: DerivedPriority;
  completionScreenshotUrl?: string | null;
  rawStatus: TaskStatus;
  managerReviewStatus?: TaskManagerReviewStatus;
};

const tablet = "@media (min-width: 768px) and (max-width: 1099px)";
const tabletUp = "@media (min-width: 768px)";
const desktop = "@media (min-width: 1100px)";

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
  { key: "review", label: "Review" },
  { key: "approved", label: "Approved" },
  { key: "completed", label: "Completed" },
] as const;

function formatDueDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
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
      return { bg: "#fff1da", fg: "#ca8a22", label: "Review" };
    case "approved":
      return { bg: "#e5f4e8", fg: "#5ca16d", label: "Approved" };
    case "completed":
      return { bg: "#efe7ff", fg: "#7f61d7", label: "Completed" };
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

export function TasksScreen() {
  const { state, user, createTask, updateTaskStatus } = useAppState();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("due_date");
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [activeDesignerTaskId, setActiveDesignerTaskId] = useState<string | null>(null);
  const [taskSelect, setTaskSelect] = useState<"project" | "assignee" | "status" | null>(null);
  const [newTaskProjectId, setNewTaskProjectId] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState("");
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>("todo");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>("medium");

  const visibleProjects = useMemo(
    () => (user ? state.projects.filter((project) => canViewProject(user, project)) : []),
    [state.projects, user],
  );

  const availableProjects = visibleProjects;

  const availableStaff = useMemo(
    () => state.users.filter((candidate) => candidate.role !== "client"),
    [state.users],
  );

  const selectedProject =
    availableProjects.find((project) => project.id === newTaskProjectId) ?? availableProjects[0] ?? null;

  const userNames = useMemo(
    () => new Map(state.users.map((member) => [member.id, member.name])),
    [state.users],
  );

  const roleLabel = user ? formatRole(user.role).toUpperCase() : "";
  const canManage = user ? canCreateTask(user.role) : false;
  const isDesigner = user?.role === "designer";


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
          projectId: project.id,
          projectName: project.name,
          projectMark: getProjectMark(project),
          dueDate: task.dueDate ?? project.dueDate,
          status: deriveTaskStatus(task.status, project),
          priority: task.priority ??
            derivePriority(task.dueDate ?? project.dueDate, task.status),
          completionScreenshotUrl: task.completionScreenshotUrl ?? null,
          rawStatus: task.status,
          managerReviewStatus: task.managerReviewStatus,
        })),
    );
  }, [isDesigner, user, userNames, visibleProjects]);


  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const next = allTasks.filter((task) => {
      const matchesFilter = filter === "all" ? true : task.status === filter;
      const matchesSearch =
        !q ||
        task.title.toLowerCase().includes(q) ||
        task.projectName.toLowerCase().includes(q) ||
        task.assigneeName.toLowerCase().includes(q);

      return matchesFilter && matchesSearch;
    });

    return [...next].sort((a, b) => {
      if (sort === "name") {
        return a.title.localeCompare(b.title);
      }

      if (sort === "priority") {
        const weight = { high: 0, medium: 1, low: 2 };
        return weight[a.priority] - weight[b.priority];
      }

      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }, [allTasks, filter, search, sort]);


  const today = startOfDay(new Date());
  const openCount = allTasks.filter((task) => task.status !== "approved").length;
  const dueTodayCount = allTasks.filter(
    (task) => task.status !== "approved" && startOfDay(new Date(task.dueDate)) === today,
  ).length;
  const overdueCount = allTasks.filter(
    (task) => task.status !== "approved" && startOfDay(new Date(task.dueDate)) < today,
  ).length;
  const completedCount = allTasks.filter(
    (task) => task.status === "completed" || task.status === "approved",
  ).length;

  const focusTasks = filteredTasks.filter((task) => task.status !== "approved").slice(0, 3);
  const upcomingTasks = [...filteredTasks].filter((task) => task.status !== "approved").slice(0, 3);
  const pageSize = 3;
  const totalTasks = filteredTasks.length;
  const totalPages = Math.max(1, Math.ceil(totalTasks / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const paginatedTasks = filteredTasks.slice((activePage - 1) * pageSize, activePage * pageSize);
  const rangeStart = totalTasks ? (activePage - 1) * pageSize + 1 : 0;
  const rangeEnd = totalTasks ? Math.min(activePage * pageSize, totalTasks) : 0;
  const activeDesignerTask = activeDesignerTaskId
    ? allTasks.find((task) => task.id === activeDesignerTaskId) ?? null
    : null;

  if (!user) {
    return null;
  }

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchDraft);
    setCurrentPage(1);
  };

  const openDesignerTaskModal = (task: TaskRow) => {
    setActiveDesignerTaskId(task.id);
  };

  const closeDesignerTaskModal = () => {
    setActiveDesignerTaskId(null);
  };

  const openCreateTaskModal = () => {
    const firstProject = availableProjects[0] ?? null;
    setNewTaskProjectId(firstProject?.id ?? "");
    setNewTaskTitle("");
    setNewTaskAssigneeId("");
    setNewTaskStatus("todo");
    setNewTaskDueDate(firstProject?.dueDate ?? "");
    setNewTaskPriority("medium");
    setTaskSelect(null);
    setShowCreateTaskModal(true);
  };

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProject) {
      return;
    }

    setIsCreatingTask(true);

    try {
      await createTask(selectedProject.id, {
        title: newTaskTitle,
        assigneeId: newTaskAssigneeId,
        status: newTaskStatus,
        dueDate: newTaskDueDate,
        priority: newTaskPriority,
      });
      setShowCreateTaskModal(false);
    } finally {
      setIsCreatingTask(false);
    }
  };

  return (
    <Shell>
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
                        {availableProjects.map((project) => (
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
                      <TaskSelectValue>{formatLabel(newTaskStatus)}</TaskSelectValue>
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
                            {formatLabel(option)}
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
              </TaskModalGrid>
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
              <button className="primary-button" type="submit" disabled={isCreatingTask}>
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
            <Title>Tasks</Title>
            <Subtitle>
              {isDesigner
                ? "See the tasks assigned across the projects you are working on."
                : "Manage deliverables, assign staff, and track project work across all active projects."}
            </Subtitle>
          </div>
          <HeaderAvatarLink href="/profile" aria-label="Open profile">
            {user.name.slice(0, 1)}
          </HeaderAvatarLink>
        </Header>

        <Toolbar>
          <FilterModal
            open={showFilters}
            title="Filter tasks"
            description="Adjust task filtering and sorting."
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
                id: "sort",
                label: "Sort by",
                options: [
                  { value: "due_date", label: "Due date" },
                  { value: "priority", label: "Priority" },
                  { value: "name", label: "Name" },
                ],
              },
            ]}
            values={{ filter, sort }}
            onApply={(nextValues) => {
              setFilter(nextValues.filter as FilterKey);
              setSort(nextValues.sort as SortKey);
              setCurrentPage(1);
            }}
            onClose={() => setShowFilters(false)}
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
                <ActionIcon>
                  <IconFilter />
                </ActionIcon>
              </FilterButton>
            </FilterMenuWrap>
            <SearchButton type="submit" aria-label="Search tasks">
              <ActionIcon>
                <IconSearch />
              </ActionIcon>
            </SearchButton>
          </SearchControls>

          {canManage ? (
            <CreateButton type="button" onClick={openCreateTaskModal}>
              <ActionIcon>
                <IconPlus />
              </ActionIcon>
              <span>Task</span>
            </CreateButton>
          ) : null}
        </Toolbar>

        {isDesigner ? null : (
          <StatsGrid>
            <StatCard>
              <StatLeft>
                <StatIcon $tone="soft-green">
                  <IconFolder />
                </StatIcon>
              </StatLeft>
              <StatCopy>
                <StatLabel>
                  <MobileLabel>Open</MobileLabel>
                  <DesktopLabel>Open Tasks</DesktopLabel>
                </StatLabel>
                <StatValue>{openCount}</StatValue>
                <StatNote $tone="positive">+6 from last week</StatNote>
              </StatCopy>
            </StatCard>

            <StatCard>
              <StatLeft>
                <StatIcon $tone="soft-gold">
                  <IconCalendar />
                </StatIcon>
              </StatLeft>
              <StatCopy>
                <StatLabel>
                  <MobileLabel>Due Today</MobileLabel>
                  <DesktopLabel>Due Today</DesktopLabel>
                </StatLabel>
                <StatValue>{dueTodayCount}</StatValue>
                <StatNote $tone="positive">+2 from yesterday</StatNote>
              </StatCopy>
            </StatCard>

            <StatCard>
              <StatLeft>
                <StatIcon $tone="soft-red">
                  <IconAlert />
                </StatIcon>
              </StatLeft>
              <StatCopy>
                <StatLabel>
                  <MobileLabel>Overdue</MobileLabel>
                  <DesktopLabel>Overdue</DesktopLabel>
                </StatLabel>
                <StatValue>{overdueCount}</StatValue>
                <StatNote $tone="warning">-1 from yesterday</StatNote>
              </StatCopy>
            </StatCard>

            <DesktopOnlyCard>
              <StatLeft>
                <StatIcon $tone="soft-green">
                  <IconCheckCircle />
                </StatIcon>
              </StatLeft>
              <StatCopy>
                <StatLabel>Completed This Week</StatLabel>
                <StatValue>{completedCount}</StatValue>
                <StatNote $tone="positive">+20% from last week</StatNote>
              </StatCopy>
            </DesktopOnlyCard>
          </StatsGrid>
        )}

        <DesktopPanel>
          <TaskTableHeader>
            <span />
            <span>Task</span>
            <span>Project</span>
            <span>Assignee</span>
            <span>Status</span>
            <span>Priority</span>
            <span>Due Date</span>
            <span />
          </TaskTableHeader>

          <TaskTable>
            {paginatedTasks.length ? (
              paginatedTasks.map((task) => {
                const statusTone = getStatusTone(task.status);
                const priorityTone = getPriorityTone(task.priority);
                const isTaskClickable = isDesigner && task.assigneeId === user.id;

                const rowContent = (
                  <DesktopTaskRowContent>
                    <CheckCell>
                      <CheckboxStub />
                    </CheckCell>
                    <TaskCell>
                      <TaskTitle>{task.title}</TaskTitle>
                      <TaskMeta>{task.projectName}</TaskMeta>
                    </TaskCell>
                    <ProjectCell>
                      <ProjectMark>{task.projectMark}</ProjectMark>
                      <TaskMeta>{task.projectName}</TaskMeta>
                    </ProjectCell>
                    <AssigneeCell>
                      <Avatar>{task.assigneeName.slice(0, 1)}</Avatar>
                      <TaskMeta>{task.assigneeName}</TaskMeta>
                    </AssigneeCell>
                    <PillCell>
                      <Pill style={{ background: statusTone.bg, color: statusTone.fg }}>
                        {statusTone.label}
                      </Pill>
                    </PillCell>
                    <PillCell>
                      <Pill style={{ background: priorityTone.bg, color: priorityTone.fg }}>
                        {priorityTone.label}
                      </Pill>
                    </PillCell>
                    <DueCell>{formatDueDate(task.dueDate)}</DueCell>
                    <ArrowCell>
                      <ArrowButton>
                        <IconArrowRight />
                      </ArrowButton>
                    </ArrowCell>
                  </DesktopTaskRowContent>
                );

                return isTaskClickable ? (
                  <DesktopTaskButtonRow
                    key={task.id}
                    type="button"
                    onClick={() => openDesignerTaskModal(task)}
                  >
                    {rowContent}
                  </DesktopTaskButtonRow>
                ) : (
                  <DesktopTaskLinkRow key={task.id} href={`/projects/${task.projectId}`}>
                    {rowContent}
                  </DesktopTaskLinkRow>
                );
              })
            ) : (
              <EmptyState>
                <strong>No tasks found</strong>
                <p>Try another search term or adjust the selected status filter.</p>
              </EmptyState>
            )}
          </TaskTable>

          {filteredTasks.length ? (
            <InlinePaginationBar>
              <CountText>
                Showing {rangeStart} to {rangeEnd} of {totalTasks} tasks
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
            </InlinePaginationBar>
          ) : null}
        </DesktopPanel>

        <MobileTaskList>
          {filteredTasks.length ? (
            paginatedTasks.map((task) => {
              const statusTone = getStatusTone(task.status);
              const priorityTone = getPriorityTone(task.priority);
              const isTaskClickable = isDesigner && task.assigneeId === user.id;
              const taskCardContent = (
                <MobileTaskCardContent>
                  <MobileTaskTop>
                    <CheckboxStub />
                    <MobileTopCopy>
                      <TaskTitle>{task.title}</TaskTitle>
                      <TaskMeta>{task.projectName}</TaskMeta>
                    </MobileTopCopy>
                    <Pill style={{ background: statusTone.bg, color: statusTone.fg }}>
                      {statusTone.label}
                    </Pill>
                  </MobileTaskTop>

                  <MobileTaskBottom>
                    <AssigneeRow>
                      <Avatar>{task.assigneeName.slice(0, 1)}</Avatar>
                      <TaskMeta>{task.assigneeName}</TaskMeta>
                    </AssigneeRow>
                    <DateRow>
                      <MiniIcon>
                        <IconCalendar />
                      </MiniIcon>
                      <TaskMeta>{formatDueDate(task.dueDate)}</TaskMeta>
                    </DateRow>
                    <Pill style={{ background: priorityTone.bg, color: priorityTone.fg }}>
                      {priorityTone.label}
                    </Pill>
                  </MobileTaskBottom>
                </MobileTaskCardContent>
              );

              return isTaskClickable ? (
                <MobileTaskButtonCard
                  key={task.id}
                  type="button"
                  onClick={() => openDesignerTaskModal(task)}
                >
                  {taskCardContent}
                </MobileTaskButtonCard>
              ) : (
                <MobileTaskLinkCard key={task.id} href={`/projects/${task.projectId}`}>
                  {taskCardContent}
                </MobileTaskLinkCard>
              );
            })
          ) : (
            <EmptyState>
              <strong>No tasks found</strong>
              <p>Try another search term or adjust the selected status filter.</p>
            </EmptyState>
          )}
        </MobileTaskList>

        {filteredTasks.length ? (
          <MobileOnlyPagination>
          <PaginationBar>
            <CountText>
              Showing {rangeStart} to {rangeEnd} of {totalTasks} tasks
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
          </MobileOnlyPagination>
        ) : null}

        {isDesigner ? null : (
          <DesktopBottomGrid>
            <Panel>
              <PanelHeader>
                <PanelTitle>{"Today's Focus"}</PanelTitle>
              </PanelHeader>
              <FocusList>
                {focusTasks.length ? (
                  focusTasks.map((task) => {
                    const priorityTone = getPriorityTone(task.priority);
                    return (
                      <FocusRow key={task.id}>
                        <FocusBullet />
                        <FocusCopy>
                          <TaskTitle>{task.title}</TaskTitle>
                          <TaskMeta>{task.projectName}</TaskMeta>
                        </FocusCopy>
                        <Pill style={{ background: priorityTone.bg, color: priorityTone.fg }}>
                          {priorityTone.label}
                        </Pill>
                      </FocusRow>
                    );
                  })
                ) : (
                  <EmptyState>
                    <strong>No focus tasks</strong>
                    <p>There are no open tasks in the current filter.</p>
                  </EmptyState>
                )}
              </FocusList>
              <PanelFooterLink href="/tasks">
                <span>View my tasks</span>
                <IconArrowRight />
              </PanelFooterLink>
            </Panel>

            <Panel>
              <PanelHeader>
                <PanelTitle>Upcoming Deadlines</PanelTitle>
              </PanelHeader>
              <FocusList>
                {upcomingTasks.length ? (
                  upcomingTasks.map((task) => {
                    const priorityTone = getPriorityTone(task.priority);
                    return (
                      <DeadlineRow key={task.id}>
                        <DeadlineDate>{formatShortDate(task.dueDate)}</DeadlineDate>
                        <FocusCopy>
                          <TaskTitle>{task.title}</TaskTitle>
                          <TaskMeta>{task.projectName}</TaskMeta>
                        </FocusCopy>
                        <Pill style={{ background: priorityTone.bg, color: priorityTone.fg }}>
                          {priorityTone.label}
                        </Pill>
                      </DeadlineRow>
                    );
                  })
                ) : (
                  <EmptyState>
                    <strong>No deadlines found</strong>
                    <p>Upcoming deadlines will appear here as tasks are created.</p>
                  </EmptyState>
                )}
              </FocusList>
              <PanelFooterLink href="/projects">
                <span>View calendar</span>
                <IconArrowRight />
              </PanelFooterLink>
            </Panel>
          </DesktopBottomGrid>
        )}
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
    align-items: stretch;
    padding: 8px;
    background: rgba(255, 255, 255, 0.58);
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
      linear-gradient(180deg, rgba(252, 249, 244, 0.92), rgba(247, 243, 237, 0.84));
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
  position: relative;
`;

const FilterButton = styled.button`
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

const SearchButton = styled(FilterButton)`
  background: #1f4339;
  color: #fff;
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
  background: #1f4339;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 700;
  box-shadow: 0 14px 26px rgba(31, 68, 57, 0.16);

  ${desktop} {
    flex: 0 0 220px;
  }
`;

const StatsGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;

  ${desktop} {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }
`;

const StatCard = styled.article`
  ${cardSurface}
  min-height: 100px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 5px;
  border-radius: 18px;

  ${desktop} {
    min-height: 100px;
    grid-template-columns: 52px minmax(0, 1fr);
    padding: 5px 20px;
    border-radius: 20px;
  }
`;

const DesktopOnlyCard = styled(StatCard)`
  display: none;

  ${desktop} {
    display: grid;
  }
`;

const StatLeft = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StatIcon = styled.div<{ $tone: "soft-green" | "soft-gold" | "soft-red" }>`
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: ${({ $tone }) =>
    $tone === "soft-green" ? "#dff1dd" : $tone === "soft-gold" ? "#fff0d5" : "#ffe6e4"};
  color: ${({ $tone }) =>
    $tone === "soft-green" ? "#5ca16d" : $tone === "soft-gold" ? "#ca8a22" : "#e06457"};

  svg {
    width: 18px;
    height: 18px;
  }

  ${desktop} {
    width: 44px;
    height: 44px;
  }
`;

const StatCopy = styled.div`
  display: grid;
  gap: 4px;
`;

const StatLabel = styled.span`
  color: var(--color-text-muted);
  font-size: 0.74rem;
  font-weight: 600;

  ${desktop} {
    font-size: 0.84rem;
  }
`;

const MobileLabel = styled.span`
  ${desktop} {
    display: none;
  }
`;

const DesktopLabel = styled.span`
  display: none;

  ${desktop} {
    display: inline;
  }
`;

const StatValue = styled.strong`
  font-size: 1.65rem;
  line-height: 1;

  ${desktop} {
    font-size: 2rem;
  }
`;

const StatNote = styled.span<{ $tone: "positive" | "warning" }>`
  color: ${({ $tone }) => ($tone === "positive" ? "#5ca16d" : "#e06457")};
  display: none;
  font-weight: 600;

  ${desktop} {
    display: inline;
    font-size: 0.76rem;
  }
`;

const FilterBar = styled.section`
  display: grid;
  gap: 12px;

  ${desktop} {
    display: flex;
    align-items: center;
    justify-content: space-between;
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

const DesktopControls = styled.div`
  display: none;

  ${desktop} {
    display: flex;
    align-items: center;
    gap: 12px;
  }
`;

const GhostButton = styled.button`
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--color-text);
  font-size: 0.88rem;
  font-weight: 600;
`;

const SortWrap = styled.label`
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--color-text);
  font-size: 0.88rem;
  font-weight: 600;
`;

const SortSelect = styled.select`
  width: auto;
  min-height: auto;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: inherit;
  font-size: inherit;
  font-weight: inherit;
`;

const DesktopPanel = styled.section`
  ${cardSurface}
  display: none;
  border-radius: 22px;
  overflow: hidden;

  ${desktop} {
    display: block;
  }
`;

const TaskTableHeader = styled.div`
  display: grid;
  grid-template-columns: 40px 1.6fr 1.4fr 1.2fr 1fr 1fr 1fr 60px;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  color: var(--color-text-light);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const TaskTable = styled.div`
  display: flex;
  flex-direction: column;
`;

const taskRowSurfaceCss = css`
  display: block;
  border-top: 1px solid rgba(230, 224, 215, 0.8);
  text-decoration: none;
  transition: background 140ms ease;

  &:hover {
    background: rgba(244, 241, 237, 0.5);
  }
`;

const DesktopTaskLinkRow = styled(Link)`
  ${taskRowSurfaceCss}
  cursor: pointer;
`;

const DesktopTaskButtonRow = styled.button`
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

const DesktopTaskRowContent = styled.div`
  display: grid;
  grid-template-columns: 40px 1.6fr 1.4fr 1.2fr 1fr 1fr 1fr 60px;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
`;

const CheckCell = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const CheckboxStub = styled.span`
  width: 18px;
  height: 18px;
  border: 2px solid #d6cec3;
  border-radius: 5px;
`;

const TaskCell = styled.div`
  display: grid;
  gap: 4px;
`;

const ProjectCell = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const AssigneeCell = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const PillCell = styled.div`
  display: flex;
`;

const DueCell = styled.div`
  color: var(--color-text);
  font-size: 0.9rem;
  font-weight: 500;
`;

const ArrowCell = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const ArrowButton = styled.span`
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text-muted);

  svg {
    width: 18px;
    height: 18px;
  }
`;

const MobileTaskList = styled.div`
  display: grid;
  gap: 12px;

  ${desktop} {
    display: none;
  }
`;

const PaginationBar = styled.section`
  ${cardSurface}
  display: none;
  gap: 14px;
  padding: 10px;
  border-radius: 24px;

  ${desktop} {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    padding: 10px 22px;
  }
`;

const MobileOnlyPagination = styled.div`
  ${desktop} {
    display: none;
  }
`;

const InlinePaginationBar = styled.div`
  display: none;

  ${desktop} {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    padding: 10px 22px;
    border-top: 1px solid rgba(230, 224, 215, 0.8);
  }
`;

const CountText = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.84rem;
`;

const PaginationControls = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: flex-end;
`;

const PaginationButton = styled.button`
  min-height: 30px;
  padding: 0 18px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text-muted);
  font-size: 0.84rem;
  font-weight: 700;

  &:disabled {
    opacity: 0.5;
  }
`;

const PaginationCurrent = styled.span`
  min-width: 30px;
  min-height: 30px;
  padding: 0 14px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #214f39;
  color: #fff;
  font-size: 0.92rem;
  font-weight: 700;
`;

const mobileTaskCardCss = css`
  ${cardSurface}
  display: block;
  border-radius: 20px;
  text-decoration: none;
  transition: background 140ms ease;

  &:hover {
    background: rgba(244, 241, 237, 0.5);
  }
`;

const MobileTaskLinkCard = styled(Link)`
  ${mobileTaskCardCss}
  cursor: pointer;
`;

const MobileTaskButtonCard = styled.button`
  ${mobileTaskCardCss}
  width: 100%;
  padding: 0;
  border: 0;
  background: rgba(255, 255, 255, 0.95);
  cursor: pointer;
  text-align: left;
`;

const MobileTaskCardContent = styled.div`
  display: grid;
  gap: 14px;
  padding: 16px;
`;

const MobileTaskTop = styled.div`
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
`;

const MobileTopCopy = styled.div`
  display: grid;
  gap: 4px;
`;

const MobileTaskBottom = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

const AssigneeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const DateRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const DesktopBottomGrid = styled.section`
  display: none;

  ${desktop} {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
`;

const Panel = styled.section`
  ${cardSurface}
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px 16px;
  border-radius: 22px;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const PanelTitle = styled.h2`
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.2;
`;

const FocusList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const FocusRow = styled.div`
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
`;

const DeadlineRow = styled.div`
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
`;

const FocusBullet = styled.span`
  width: 18px;
  height: 18px;
  border: 2px solid #ded6c8;
  border-radius: 999px;
`;

const FocusCopy = styled.div`
  display: grid;
  gap: 4px;
`;

const DeadlineDate = styled.span`
  color: #da6a43;
  font-size: 0.84rem;
  font-weight: 700;
`;

const PanelFooterLink = styled(Link)`
  margin-top: 6px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-end;
  color: var(--color-text);
  font-size: 0.88rem;
  font-weight: 600;
  text-decoration: none;

  svg {
    width: 16px;
    height: 16px;
  }
`;

const TaskTitle = styled.strong`
  font-size: 0.92rem;
  line-height: 1.3;
`;

const TaskMeta = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.82rem;
  line-height: 1.45;
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
  align-items: center;
  width: fit-content;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 700;
  white-space: nowrap;
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
`;

const InlineForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const TaskModalGrid = styled.div`
  display: grid;
  gap: 12px;

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
  min-height: 58px;
  padding: 0 16px;
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
  min-height: 58px;
  padding: 18px 16px 12px;
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

function IconArrowRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

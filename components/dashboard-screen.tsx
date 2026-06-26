"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import styled, { css } from "styled-components";
import { useAppState } from "@/components/app-state";
import { AppSidebar } from "@/components/app-sidebar";
import { ClientOrganizationDetailScreen } from "@/components/client-organization-detail-screen";
import { CustomDatePicker } from "@/components/custom-date-picker";
import { DashboardScreenSkeleton } from "@/components/page-skeletons";
import { ProjectStageProgress } from "@/components/project-stage-progress";
import { UserAvatar } from "@/components/user-avatar";
import {
  canManageWorkspace,
  canViewProject,
  getUserClientOrganizationIds,
  getVisibleTasksForUser,
} from "@/lib/permissions";
import { formatLabel, formatProjectStage, formatRole, getProjectStatusLabel, getTaskStatusLabel } from "@/lib/display";
import { FeedbackAction, Project, ProjectStatus, TaskPriority, TaskStatus } from "@/lib/types";

type EnrichedTask = {
  id: string;
  title: string;
  status: string;
  projectId: string;
  projectName: string;
  dueDate: string;
};

type FeedbackRow = {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string;
  body: string;
  action: FeedbackAction;
  createdAt: string;
};

type ActivityRow = {
  id: string;
  actor: string;
  detail: string;
  projectName: string;
  createdAt: string;
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

const PRIORITY_PROJECTS_PAGE_SIZE = 2;
const TASKS_PAGE_SIZE = 4;

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
) {
  if (project.clientOrganizationId) {
    const organizationName = organizationNames.get(project.clientOrganizationId);
    if (organizationName) {
      return organizationName;
    }
  }

  return project.contactPerson || "Unassigned client";
}

function getProjectMark(project: Project) {
  const words = project.name.split(" ");
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

function isOnHoldProject(project: Pick<Project, "status" | "stage">) {
  return project.status === "On Hold" || project.stage === "On Hold";
}

function getStatusTone(status: ProjectStatus) {
  switch (status) {
    case "active":
      return { bg: "var(--color-info-soft)", fg: "var(--color-info)" };
    case "review":
      return { bg: "var(--color-warning-soft)", fg: "var(--color-warning)" };
    case "revision":
      return { bg: "var(--color-danger-soft)", fg: "var(--color-danger)" };
    case "done":
      return { bg: "var(--color-primary-soft)", fg: "var(--color-primary)" };
    default:
      return { bg: "var(--color-surface-soft)", fg: "var(--color-text-muted)" };
  }
}

function getFeedbackTone(action: FeedbackAction) {
  switch (action) {
    case "approve":
      return { label: "Positive", bg: "var(--color-success-soft)", fg: "var(--color-success)" };
    case "request_revision":
      return { label: "Revision", bg: "var(--color-danger-soft)", fg: "var(--color-danger)" };
    default:
      return { label: "Feedback", bg: "var(--color-warning-soft)", fg: "var(--color-warning)" };
  }
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

export function DashboardScreen() {
  const { ready, state, user, createTask } = useAppState();
  const [priorityPage, setPriorityPage] = useState(1);
  const [tasksPage, setTasksPage] = useState(1);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [taskSelect, setTaskSelect] = useState<"organization" | "project" | "assignee" | "status" | null>(null);
  const [newTaskOrganizationId, setNewTaskOrganizationId] = useState("");
  const [newTaskProjectId, setNewTaskProjectId] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState("");
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>("todo");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>("medium");

  const safeUser = user;
  const organizationNames = useMemo(
    () => new Map(state.clientOrganizations.map((organization) => [organization.id, organization.name])),
    [state.clientOrganizations],
  );
  const userNames = useMemo(
    () => new Map(state.users.map((member) => [member.id, member.name])),
    [state.users],
  );

  const visibleProjects = useMemo(
    () =>
      state.projects?.filter((project) => (safeUser ? canViewProject(safeUser, project) : false)) ??
      [],
    [safeUser, state.projects],
  );

  const firstName = safeUser ? safeUser.name.split(" ")[0] ?? safeUser.name : "";
  const roleLabel = safeUser ? formatRole(safeUser.role).toUpperCase() : "";
  const canManage = safeUser ? canManageWorkspace(safeUser.role) : false;
  const isDesigner = safeUser ? safeUser.role === "designer" : false;
  const isClient = safeUser ? safeUser.role === "client" : false;
  const now = new Date();

  const projectRows = useMemo(() => {
    const nextVisibleProjects = visibleProjects;

    return nextVisibleProjects
      .slice()
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .map((project) => ({
        ...project,
        clientName: getClientOrganizationName(project, organizationNames),
      }));
  }, [organizationNames, visibleProjects]);

  const availableProjects = visibleProjects;
  const availableStaff = state.users.filter((candidate) => candidate.role !== "client");
  const availableTaskOrganizations = useMemo(() => {
    const entries = new Map<string, { id: string; name: string }>();

    availableProjects.forEach((project) => {
      if (project.clientOrganizationId) {
        entries.set(project.clientOrganizationId, {
          id: project.clientOrganizationId,
          name: organizationNames.get(project.clientOrganizationId) ?? project.contactPerson ?? "Unnamed organization",
        });
        return;
      }

      entries.set("__unassigned__", {
        id: "__unassigned__",
        name: "Unassigned client",
      });
    });

    return Array.from(entries.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [availableProjects, organizationNames]);
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

  const openTasks = useMemo<EnrichedTask[]>(
    () => {
      if (!user) return [];

      return projectRows.flatMap((project) =>
        getVisibleTasksForUser(user, project)
          .filter(
            (task) =>
              task.status !== "approved" && (!isDesigner || task.assigneeId === user.id),
          )
          .map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            projectId: project.id,
            projectName: project.name,
            dueDate: task.dueDate ?? project.dueDate,
          })),
      );
    },
    [isDesigner, projectRows, user],
  );


  const feedbackRows = useMemo<FeedbackRow[]>(
    () =>
      projectRows
        .flatMap((project) =>
          project.feedback.map((feedback) => ({
            id: feedback.id,
            projectId: project.id,
            projectName: project.name,
            clientName: getClientOrganizationName(project, organizationNames),
            body: feedback.body,
            action: feedback.action,
            createdAt: feedback.createdAt,
          })),
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [organizationNames, projectRows],
  );

  const activityRows = useMemo<ActivityRow[]>(
    () =>
      projectRows
        .flatMap((project) =>
          project.activities.map((activity) => ({
            id: activity.id,
            actor: activity.actorId ? (userNames.get(activity.actorId) ?? "Team member") : "System",
            detail: activity.message,
            projectName: project.name,
            createdAt: activity.createdAt,
          })),
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [projectRows, userNames],
  );

  const activeProjectsCount = projectRows.filter((project) => project.status !== "done").length;
  const dueTodayTasksCount = openTasks.filter((task) => isDateToday(task.dueDate, now)).length;
  const feedbackCount = projectRows.filter((project) => project.status === "review").length;
  const completedCount = projectRows.filter((project) => project.status === "done" && isProjectCompletedThisMonth(project, now)).length;
  const managerReviewProjects = useMemo(() => {
    if (!safeUser || isDesigner || isClient) {
      return projectRows;
    }

    const getStagePriority = (status: ProjectStatus) => {
      switch (status) {
        case "review":
          return 0;
        case "revision":
          return 1;
        case "active":
          return 2;
        default:
          return 3;
      }
    };

    return [...projectRows]
      .map((project) => ({
        ...project,
        attentionCount: getVisibleTasksForUser(safeUser, project).filter(
          (task) => task.status === "done" && task.managerReviewStatus === "internal",
        ).length,
      }))
      .filter(
        (project) =>
          !isOnHoldProject(project) &&
          (project.status === "review" || project.status === "revision" || project.status === "active"),
      )
      .sort((left, right) => {
        const leftStagePriority = getStagePriority(left.status);
        const rightStagePriority = getStagePriority(right.status);

        if (leftStagePriority !== rightStagePriority) {
          return leftStagePriority - rightStagePriority;
        }

        const leftDue = new Date(left.dueDate).getTime();
        const rightDue = new Date(right.dueDate).getTime();

        if (leftDue !== rightDue) {
          return leftDue - rightDue;
        }

        return right.attentionCount - left.attentionCount;
      });
  }, [isClient, isDesigner, projectRows, safeUser]);

  const priorityProjectPageCount = Math.max(1, Math.ceil(managerReviewProjects.length / PRIORITY_PROJECTS_PAGE_SIZE));
  const tasksPageCount = Math.max(1, Math.ceil(openTasks.length / TASKS_PAGE_SIZE));
  const currentPriorityPage = Math.min(priorityPage, priorityProjectPageCount);
  const currentTasksPage = Math.min(tasksPage, tasksPageCount);
  const priorityProjects = managerReviewProjects.slice(
    (currentPriorityPage - 1) * PRIORITY_PROJECTS_PAGE_SIZE,
    currentPriorityPage * PRIORITY_PROJECTS_PAGE_SIZE,
  );
  const mobileProjects = (isClient
    ? projectRows.filter((project) => project.status !== "done" && !isOnHoldProject(project))
    : priorityProjects
  ).slice(0, 3);
  const dashboardTasks = openTasks.slice(
    (currentTasksPage - 1) * TASKS_PAGE_SIZE,
    currentTasksPage * TASKS_PAGE_SIZE,
  );
  const recentFeedback = feedbackRows.slice(0, 3);
  const recentActivity = activityRows.slice(0, 4);

  const completedProjects = projectRows.filter((project) => project.status === "done").length;
  const inProgressProjects = projectRows.filter(
    (project) => project.status === "active" || project.status === "revision",
  ).length;
  const reviewProjects = projectRows.filter((project) => project.status === "review").length;
  const holdProjects = Math.max(
    0,
    projectRows.length - completedProjects - inProgressProjects - reviewProjects,
  );

  const totalProjects = Math.max(projectRows.length, 1);
  const completedPct = Math.round((completedProjects / totalProjects) * 100);
  const inProgressPct = Math.round((inProgressProjects / totalProjects) * 100);
  const reviewPct = Math.round((reviewProjects / totalProjects) * 100);
  const holdPct = Math.max(0, 100 - completedPct - inProgressPct - reviewPct);

  const donut = `conic-gradient(
    #5ca16d 0 ${completedPct}%,
    #1f4339 ${completedPct}% ${completedPct + inProgressPct}%,
    #d69b47 ${completedPct + inProgressPct}% ${completedPct + inProgressPct + reviewPct}%,
    #d3ccc1 ${completedPct + inProgressPct + reviewPct}% 100%
  )`;

  const openCreateTaskModal = () => {
    setNewTaskOrganizationId("");
    setNewTaskProjectId("");
    setNewTaskTitle("");
    setNewTaskAssigneeId("");
    setNewTaskStatus("todo");
    setNewTaskDueDate("");
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

  const clientHomeOrganizationId =
    safeUser?.role === "client" ? getUserClientOrganizationIds(safeUser)[0] : null;

  if (!ready) {
    return <DashboardScreenSkeleton />;
  }

  if (safeUser?.role === "client" && clientHomeOrganizationId) {
    return (
      <ClientOrganizationDetailScreen
        organizationId={clientHomeOrganizationId}
        homeMode
      />
    );
  }

  return (
    <Shell>
      {isCreatingTask ? (
        <div className="auth-loading-overlay" role="status" aria-live="polite">
          <div className="auth-loading-card">
            <div className="auth-loading-spinner" aria-hidden="true" />
            <p>Creating task...</p>
          </div>
        </div>
      ) : null}

      {showCreateTaskModal && canManage ? (
        <ModalBackdrop onClick={() => setShowCreateTaskModal(false)}>
          <ModalCard onClick={(event) => event.stopPropagation()}>
            <ModalHeader>
              <div>
                <ModalTitle>Create task</ModalTitle>
                <ModalDescription>Add a task from the dashboard shortcut.</ModalDescription>
              </div>
              <ModalClose type="button" onClick={() => setShowCreateTaskModal(false)} aria-label="Close">
                <IconClose />
              </ModalClose>
            </ModalHeader>
            <InlineForm onSubmit={handleCreateTask}>
              <TaskModalGrid>
                <TaskModalField>
                  <TaskFloatingSelect
                    $filled={Boolean(newTaskOrganizationId)}
                    $open={taskSelect === "organization"}
                  >
                    <TaskSelectTrigger
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={taskSelect === "organization"}
                      onClick={() => setTaskSelect((current) => (current === "organization" ? null : "organization"))}
                    >
                      <TaskSelectValue>
                        {availableTaskOrganizations.find((organization) => organization.id === newTaskOrganizationId)?.name ??
                          "Select organization"}
                      </TaskSelectValue>
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
                              setNewTaskDueDate("");
                              setTaskSelect(null);
                            }}
                          >
                            {organization.name}
                          </TaskSelectOption>
                        ))}
                      </TaskSelectMenu>
                    ) : null}
                  </TaskFloatingSelect>
                </TaskModalField>

                {newTaskOrganizationId ? (
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
                  <TaskMetaLabel>Priority</TaskMetaLabel>
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
              <button className="primary-button" type="submit" disabled={isCreatingTask || !selectedProject}>
                {isCreatingTask ? "Creating..." : "Add task"}
              </button>
            </InlineForm>
          </ModalCard>
        </ModalBackdrop>
      ) : null}

      {safeUser ? (
        <DesktopSidebarSlot>
          <AppSidebar user={safeUser} activeLabel="Home" />
        </DesktopSidebarSlot>
      ) : null}

      <Content>
        <Header>
          <div>
            <Eyebrow>{roleLabel}</Eyebrow>
            <Title>Welcome back, {firstName}</Title>
            <Subtitle>
              {isDesigner
                ? "See the projects and tasks currently assigned to you."
                : "Track projects, team activity, feedback, and upcoming deadlines."}
            </Subtitle>
          </div>
          <MobileProfileLink href="/profile" aria-label="Open profile">
            <HeaderAvatar>{safeUser ? <UserAvatar user={safeUser} /> : null}</HeaderAvatar>
          </MobileProfileLink>
          <HeaderUser href="/profile" aria-label="Open profile">
            <HeaderAvatar>{safeUser ? <UserAvatar user={safeUser} /> : null}</HeaderAvatar>
            <div>
              <HeaderUserName>{safeUser?.name ?? ""}</HeaderUserName>
            </div>
          </HeaderUser>
        </Header>

        {isDesigner ? null : (
          <StatsGrid>

            <StatCardLink href="/projects?quick=active">
              <StatCopy>
                <StatLabel>
                  <MobileLabel>Active</MobileLabel>
                  <DesktopLabel>Active Projects</DesktopLabel>
                </StatLabel>
                <StatValue>{activeProjectsCount}</StatValue>
                <StatNote $tone="positive">
                  {activeProjectsCount ? `${activeProjectsCount} currently in progress` : "No active projects yet"}
                </StatNote>
              </StatCopy>
              <StatIcon $tone="dark">
                <IconFolder />
              </StatIcon>
            </StatCardLink>

            <StatCardLink href="/tasks?quick=due_today">
              <StatCopy>
                <StatLabel>
                  <MobileLabel>Due Today</MobileLabel>
                  <DesktopLabel>Tasks Due Today</DesktopLabel>
                </StatLabel>
                <StatValue>{dueTodayTasksCount}</StatValue>
                <StatNote $tone="warning">
                  {dueTodayTasksCount ? `${dueTodayTasksCount} due today` : "Nothing due today"}
                </StatNote>
              </StatCopy>
              <StatIcon $tone="soft-green">
                <IconCheckCircle />
              </StatIcon>
            </StatCardLink>

            <StatCardLink href="/projects?quick=awaiting_feedback">
              <StatCopy>
                <StatLabel>
                  <MobileLabel>Feedback</MobileLabel>
                  <DesktopLabel>Awaiting Feedback</DesktopLabel>
                </StatLabel>
                <StatValue>{feedbackCount}</StatValue>
                <StatNote $tone="warning">
                  {feedbackCount ? `${feedbackCount} waiting for review` : "No feedback waiting"}
                </StatNote>
              </StatCopy>
              <StatIcon $tone="soft-gold">
                <IconComment />
              </StatIcon>
            </StatCardLink>

            <StatCardLink href="/projects?quick=completed_this_month">
              <StatCopy>
                <StatLabel>
                  <MobileLabel>Completed</MobileLabel>
                  <DesktopLabel>Completed This Month</DesktopLabel>
                </StatLabel>
                <StatValue>{completedCount}</StatValue>
                <StatNote $tone="positive">
                  {completedCount ? `${completedCount} completed this month` : "No completed work yet"}
                </StatNote>
              </StatCopy>
              <StatIcon $tone="dark">
                <IconFlag />
              </StatIcon>
            </StatCardLink>
          </StatsGrid>
        )}

        <MobileDashboardStack>
          <Panel>
            <PanelHeader>
              <PanelTitle>{isDesigner ? "Projects" : isClient ? "Active Projects" : "Priority Projects"}</PanelTitle>
              <PanelLink href="/projects">View all</PanelLink>
            </PanelHeader>
            <ProjectList>
              {mobileProjects.length ? (
                mobileProjects.map((project) => {
                  return (
                    <MobileProjectRow key={project.id} href={`/projects/${project.id}`}>
                      <ProjectMark>{getProjectMark(project)}</ProjectMark>
                      <ProjectBody>
                        <MobileProjectHeader>
                          <div>
                            <ProjectTitle>{project.name}</ProjectTitle>
                            <TaskSub>{project.clientName}</TaskSub>
                          </div>
                          <MobileDueText>{formatShortDate(project.dueDate)}</MobileDueText>
                        </MobileProjectHeader>
                        <MobileProjectFooter>
                          <MobileMetaText>{formatProjectStage(project.stage)}</MobileMetaText>
                          <ProjectStageProgress stage={project.stage} size="sm" />
                        </MobileProjectFooter>
                      </ProjectBody>
                    </MobileProjectRow>
                  );
                })
              ) : (
                <EmptyBlock>
                  <strong>
                    {isDesigner
                      ? "No assigned projects yet"
                      : isClient
                        ? "No active projects yet"
                        : "No projects awaiting review"}
                  </strong>
                  <p>
                    {isDesigner
                      ? "Projects assigned to you will appear here."
                      : isClient
                        ? "Projects shared with your organization will appear here."
                        : "Projects with tasks submitted for internal review will appear here."}
                  </p>
                </EmptyBlock>
              )}
            </ProjectList>
          </Panel>

          <Panel>
            <PanelHeader>
              <PanelTitle>Tasks</PanelTitle>
              <PanelLink href="/tasks">View all</PanelLink>
            </PanelHeader>
            <TaskList>
              {openTasks.slice(0, 3).length ? (
                openTasks.slice(0, 3).map((task) => (
                  <TaskRow key={task.id} href={`/projects/${task.projectId}`}>
                    <TaskCircle
                      $urgent={task.status === "todo"}
                      $done={task.status === "done" || task.status === "review" || task.status === "approved"}
                    >
                      {task.status === "done" || task.status === "review" || task.status === "approved" ? (
                        <IconCheckTiny />
                      ) : null}
                    </TaskCircle>
                    <TaskCopy>
                      <TaskTitle>{task.title}</TaskTitle>
                      <TaskSub>{task.projectName}</TaskSub>
                    </TaskCopy>
                    <TaskDate>{formatShortDate(task.dueDate)}</TaskDate>
                  </TaskRow>
                ))
              ) : (
                <EmptyBlock>
                  <strong>No tasks due</strong>
                  <p>Open tasks will appear here once project work is assigned.</p>
                </EmptyBlock>
              )}
            </TaskList>
          </Panel>

          {!isDesigner ? (
            <Panel>
              <PanelHeader>
                <PanelTitle>Recent Feedback</PanelTitle>
                <PanelLink href="/projects">View all</PanelLink>
              </PanelHeader>
              <FeedbackList>
                {recentFeedback.length ? (
                  recentFeedback.slice(0, 1).map((feedback) => {
                    const tone = getFeedbackTone(feedback.action);
                    return (
                      <FeedbackRowCard key={feedback.id}>
                        <FeedbackAvatar>{feedback.clientName.slice(0, 2).toUpperCase()}</FeedbackAvatar>
                        <FeedbackCopy>
                          <FeedbackBody>{feedback.body}</FeedbackBody>
                          <FeedbackProject>{feedback.projectName}</FeedbackProject>
                        </FeedbackCopy>
                        <StatusPill style={{ background: tone.bg, color: tone.fg }}>{tone.label}</StatusPill>
                      </FeedbackRowCard>
                    );
                  })
                ) : (
                  <EmptyBlock>
                    <strong>No feedback yet</strong>
                    <p>Client comments will appear here once reviews start coming in.</p>
                  </EmptyBlock>
                )}
              </FeedbackList>
            </Panel>
          ) : null}

          {!isDesigner ? (
            <Panel>
              <PanelHeader>
                <PanelTitle>Project Progress Overview</PanelTitle>
                <PanelTag>This Month</PanelTag>
              </PanelHeader>
              <DonutWrap>
                <DonutChart style={{ background: donut }}>
                  <DonutCenter>
                    <strong>{projectRows.length}</strong>
                    <span>Active Projects</span>
                  </DonutCenter>
                </DonutChart>
                <LegendList>
                  <LegendItem>
                    <LegendDot $color="#5ca16d" />
                    <span>Completed</span>
                    <strong>{completedPct}%</strong>
                  </LegendItem>
                  <LegendItem>
                    <LegendDot $color="#1f4339" />
                    <span>In Progress</span>
                    <strong>{inProgressPct}%</strong>
                  </LegendItem>
                  <LegendItem>
                    <LegendDot $color="#d69b47" />
                    <span>In Review</span>
                    <strong>{reviewPct}%</strong>
                  </LegendItem>
                  <LegendItem>
                    <LegendDot $color="#d3ccc1" />
                    <span>On Hold</span>
                    <strong>{holdPct}%</strong>
                  </LegendItem>
                </LegendList>
              </DonutWrap>
            </Panel>
          ) : null}

          {!isDesigner ? (
            <Panel>
              <PanelHeader>
                <PanelTitle>Team Activity</PanelTitle>
                <PanelLink href="/team">View all</PanelLink>
              </PanelHeader>
              <ActivityList>
                {recentActivity.length ? (
                  recentActivity.slice(0, 3).map((item) => (
                    <ActivityRowCard key={item.id}>
                      <FeedbackAvatar>{item.actor.slice(0, 1).toUpperCase()}</FeedbackAvatar>
                      <FeedbackCopy>
                        <FeedbackBody>
                          {item.actor} {item.detail}
                        </FeedbackBody>
                        <FeedbackProject>{item.projectName}</FeedbackProject>
                      </FeedbackCopy>
                      <ActivityTime>{timeAgo(item.createdAt)}</ActivityTime>
                    </ActivityRowCard>
                  ))
                ) : (
                  <EmptyBlock>
                    <strong>No recent activity</strong>
                    <p>File uploads, comments, and feedback updates will appear here.</p>
                  </EmptyBlock>
                )}
              </ActivityList>
            </Panel>
          ) : null}

          {canManage && !isClient ? (
            <Panel>
              <PanelHeader>
                <PanelTitle>Quick Actions</PanelTitle>
              </PanelHeader>

              <ActionList>
                <ActionLink href="/projects/new">
                  <ActionIcon>
                    <IconPlus />
                  </ActionIcon>
                  <span>Create Project</span>
                </ActionLink>
                <ActionButton type="button" onClick={openCreateTaskModal}>
                  <ActionIcon>
                    <IconCheckCircle />
                  </ActionIcon>
                  <span>Add Task</span>
                </ActionButton>
                <ActionLink href="/clients">
                  <ActionIcon>
                    <IconFolder />
                  </ActionIcon>
                  <span>Add Organization</span>
                </ActionLink>
                <ActionLink href="/clients/liaisons">
                  <ActionIcon>
                    <IconUsers />
                  </ActionIcon>
                  <span>Invite Client</span>
                </ActionLink>
                <ActionLink href="/team">
                  <ActionIcon>
                    <IconUsers />
                  </ActionIcon>
                  <span>Invite Team</span>
                </ActionLink>
              </ActionList>
            </Panel>
          ) : null}
        </MobileDashboardStack>

        <DesktopDashboard>
          <TopGrid>
            <Panel>
              <PanelHeader>
                <PanelTitle>{isDesigner ? "Projects" : "Priority Projects"}</PanelTitle>
                {isDesigner ? null : <PanelLink href="/projects">View all</PanelLink>}
              </PanelHeader>

              <ProjectList>
                {priorityProjects.length ? (
                  priorityProjects.map((project) => {
                    const tone = getStatusTone(project.status);
                    return (
                      <ProjectRow key={project.id} href={`/projects/${project.id}`}>
                        <ProjectMark>{getProjectMark(project)}</ProjectMark>
                        <ProjectBody>
                          <ProjectTop>
                            <ProjectTitle>{project.name}</ProjectTitle>
                            <MetaGroup>
                              <MetaLabel>Due date</MetaLabel>
                              <MetaValue>{formatDueDate(project.dueDate)}</MetaValue>
                            </MetaGroup>
                            <MetaGroup>
                              <MetaLabel>Stage</MetaLabel>
                              <MetaValue>{formatProjectStage(project.stage)}</MetaValue>
                            </MetaGroup>
                            <MetaGroup>
                              <MetaLabel>Progress</MetaLabel>
                              <ProjectStageProgress stage={project.stage} size="sm" showStageLabel={false} />
                            </MetaGroup>
                          </ProjectTop>

                          <ProjectStatusRow>
                            <StatusPill style={{ background: tone.bg, color: tone.fg }}>
                              {getProjectStatusLabel(project.status)}
                            </StatusPill>
                          </ProjectStatusRow>
                        </ProjectBody>
                      </ProjectRow>
                    );
                  })
                ) : (
                  <EmptyBlock>
                    <strong>{isDesigner ? "No assigned projects yet" : "No projects awaiting review"}</strong>
                    <p>
                      {isDesigner
                        ? "Projects assigned to you will appear here."
                        : "Projects with tasks submitted for internal review will appear here."}
                    </p>
                  </EmptyBlock>
                )}
              </ProjectList>
              {managerReviewProjects.length > PRIORITY_PROJECTS_PAGE_SIZE ? (
                <PanelPagination>
                  <PageButton
                    type="button"
                    onClick={() => setPriorityPage((current) => Math.max(1, current - 1))}
                    disabled={currentPriorityPage === 1}
                  >
                    Prev
                  </PageButton>
                  <PageMeta>
                    {currentPriorityPage} / {priorityProjectPageCount}
                  </PageMeta>
                  <PageButton
                    type="button"
                    onClick={() =>
                      setPriorityPage((current) => Math.min(priorityProjectPageCount, current + 1))
                    }
                    disabled={currentPriorityPage === priorityProjectPageCount}
                  >
                    Next
                  </PageButton>
                </PanelPagination>
              ) : null}
            </Panel>

            <Panel>
              <PanelHeader>
                <PanelTitle>Tasks</PanelTitle>
                <PanelLink href="/tasks">View all</PanelLink>
              </PanelHeader>

              <TaskList>
                {dashboardTasks.length ? (
                  dashboardTasks.map((task) => (
                    <TaskRow key={task.id} href={`/projects/${task.projectId}`}>
                      <TaskCircle
                        $urgent={task.status === "todo"}
                        $done={task.status === "done" || task.status === "review" || task.status === "approved"}
                      >
                        {task.status === "done" || task.status === "review" || task.status === "approved" ? (
                          <IconCheckTiny />
                        ) : null}
                      </TaskCircle>
                      <TaskCopy>
                        <TaskTitle>{task.title}</TaskTitle>
                        <TaskSub>{task.projectName}</TaskSub>
                      </TaskCopy>
                      <TaskDate>{formatShortDate(task.dueDate)}</TaskDate>
                    </TaskRow>
                  ))
                ) : (
                  <EmptyBlock>
                    <strong>No tasks due</strong>
                    <p>Open tasks will appear here once project work is assigned.</p>
                  </EmptyBlock>
                )}
              </TaskList>
              {openTasks.length > TASKS_PAGE_SIZE ? (
                <PanelPagination>
                  <PageButton
                    type="button"
                    onClick={() => setTasksPage((current) => Math.max(1, current - 1))}
                    disabled={currentTasksPage === 1}
                  >
                    Prev
                  </PageButton>
                  <PageMeta>
                    {currentTasksPage} / {tasksPageCount}
                  </PageMeta>
                  <PageButton
                    type="button"
                    onClick={() => setTasksPage((current) => Math.min(tasksPageCount, current + 1))}
                    disabled={currentTasksPage === tasksPageCount}
                  >
                    Next
                  </PageButton>
                </PanelPagination>
              ) : null}
            </Panel>
          </TopGrid>

          {isDesigner || isClient ? null : (
            <>
              <MobileOnlyPanel>

                <PanelHeader>
                  <PanelTitle>Recent Feedback</PanelTitle>
                  <PanelLink href="/projects">View all</PanelLink>
                </PanelHeader>
                <FeedbackList>
                  {recentFeedback.length ? (
                    recentFeedback.slice(0, 1).map((feedback) => {
                      const tone = getFeedbackTone(feedback.action);
                      return (
                        <FeedbackRowCard key={feedback.id}>
                          <FeedbackAvatar>{feedback.clientName.slice(0, 2).toUpperCase()}</FeedbackAvatar>
                          <FeedbackCopy>
                            <FeedbackBody>{feedback.body}</FeedbackBody>
                            <FeedbackProject>{feedback.projectName}</FeedbackProject>
                          </FeedbackCopy>
                          <StatusPill style={{ background: tone.bg, color: tone.fg }}>{tone.label}</StatusPill>
                        </FeedbackRowCard>
                      );
                    })
                  ) : (
                    <EmptyBlock>
                      <strong>No feedback yet</strong>
                      <p>Client comments will appear here once reviews start coming in.</p>
                    </EmptyBlock>
                  )}
                </FeedbackList>
              </MobileOnlyPanel>

              <BottomGrid>
                <Panel>
                  <PanelHeader>
                    <PanelTitle>Project Progress Overview</PanelTitle>
                    <PanelTag>This Month</PanelTag>
                  </PanelHeader>
                  <DonutWrap>
                    <DonutChart style={{ background: donut }}>
                      <DonutCenter>
                        <strong>{projectRows.length}</strong>
                        <span>Active Projects</span>
                      </DonutCenter>
                    </DonutChart>
                    <LegendList>
                      <LegendItem>
                        <LegendDot $color="#5ca16d" />
                        <span>Completed</span>
                        <strong>{completedPct}%</strong>
                      </LegendItem>
                      <LegendItem>
                        <LegendDot $color="#1f4339" />
                        <span>In Progress</span>
                        <strong>{inProgressPct}%</strong>
                      </LegendItem>
                      <LegendItem>
                        <LegendDot $color="#d69b47" />
                        <span>In Review</span>
                        <strong>{reviewPct}%</strong>
                      </LegendItem>
                      <LegendItem>
                        <LegendDot $color="#d3ccc1" />
                        <span>On Hold</span>
                        <strong>{holdPct}%</strong>
                      </LegendItem>
                    </LegendList>
                  </DonutWrap>
                </Panel>

                <DesktopOnlyPanel>
                  <PanelHeader>
                    <PanelTitle>Recent Client Feedback</PanelTitle>
                    <PanelLink href="/projects">View all</PanelLink>
                  </PanelHeader>
                  <FeedbackList>
                    {recentFeedback.length ? (
                      recentFeedback.map((feedback) => {
                        const tone = getFeedbackTone(feedback.action);
                        return (
                          <FeedbackRowCard key={feedback.id}>
                            <FeedbackAvatar>{feedback.clientName.slice(0, 2).toUpperCase()}</FeedbackAvatar>
                            <FeedbackCopy>
                              <FeedbackBody>{feedback.body}</FeedbackBody>
                              <FeedbackProject>{feedback.projectName}</FeedbackProject>
                            </FeedbackCopy>
                            <StatusPill style={{ background: tone.bg, color: tone.fg }}>{tone.label}</StatusPill>
                          </FeedbackRowCard>
                        );
                      })
                    ) : (
                      <EmptyBlock>
                        <strong>No feedback yet</strong>
                        <p>Client feedback will appear here once comments start coming in.</p>
                      </EmptyBlock>
                    )}
                  </FeedbackList>
                </DesktopOnlyPanel>

                <Panel>
                  <PanelHeader>
                    <PanelTitle>Team Activity</PanelTitle>
                    <PanelLink href="/team">View all</PanelLink>
                  </PanelHeader>
                  <ActivityList>
                    {recentActivity.length ? (
                      recentActivity.map((item) => (
                        <ActivityRowCard key={item.id}>
                          <FeedbackAvatar>{item.actor.slice(0, 1).toUpperCase()}</FeedbackAvatar>
                          <FeedbackCopy>
                            <FeedbackBody>
                              {item.actor} {item.detail}
                            </FeedbackBody>
                            <FeedbackProject>{item.projectName}</FeedbackProject>
                          </FeedbackCopy>
                          <ActivityTime>{timeAgo(item.createdAt)}</ActivityTime>
                        </ActivityRowCard>
                      ))
                    ) : (
                      <EmptyBlock>
                        <strong>No recent activity</strong>
                        <p>File uploads, comments, and feedback updates will appear here.</p>
                      </EmptyBlock>
                    )}
                  </ActivityList>
                </Panel>

                {canManage ? (
                  <Panel>
                    <PanelHeader>
                      <PanelTitle>Quick Actions</PanelTitle>
                    </PanelHeader>
                    <ActionList>
                      <ActionLink href="/projects/new">
                        <ActionIcon>
                          <IconPlus />
                        </ActionIcon>
                        <span>Create Project</span>
                      </ActionLink>
                      <ActionButton as="button" type="button" onClick={openCreateTaskModal}>
                        <ActionIcon>
                          <IconCheckCircle />
                        </ActionIcon>
                        <span>Add Task</span>
                      </ActionButton>
                      <ActionLink href="/clients">
                        <ActionIcon>
                          <IconFolder />
                        </ActionIcon>
                        <span>Add Organization</span>
                      </ActionLink>
                      <ActionLink href="/clients/liaisons">
                        <ActionIcon>
                          <IconUsers />
                        </ActionIcon>
                        <span>Invite Client</span>
                      </ActionLink>
                      <ActionLink href="/team">
                        <ActionIcon>
                          <IconUsers />
                        </ActionIcon>
                        <span>Invite Team</span>
                      </ActionLink>
                    </ActionList>
                  </Panel>
                ) : null}
              </BottomGrid>
            </>
          )}
        </DesktopDashboard>
      </Content>
    </Shell>
  );
}

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const hours = Math.max(1, Math.floor(diff / (1000 * 60 * 60)));
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
    padding: 22px 16px;
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
  min-height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  background: ${({ $active }) => ($active ? "#f5efe5" : "transparent")};
  box-shadow: ${({ $active }) =>
    $active ? "inset 0 0 0 1px rgba(230, 224, 215, 0.9)" : "none"};
  color: ${({ $active }) => ($active ? "var(--color-text)" : "var(--color-text-muted)")};
  text-decoration: none;
  font-size: 0.96rem;
`;

const SideLink = styled(Link) <{ $active?: boolean }>`
  ${sideItemCss}
`;

const SideButton = styled.button<{ $active?: boolean }>`
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

  ${tablet} {
    max-width: 860px;
    margin: 0 auto;
    gap: 16px;
  }

  ${desktop} {
    flex: 1;
    min-width: 0;
    max-width: none;
    margin: 0;
    padding: 24px 28px 24px;
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

  @media (max-width: 420px) {
    gap: 10px;
  }
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
    font-size: 0.84rem;
  }
`;

const MobileProfileLink = styled(Link)`
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;

  ${desktop} {
    display: none;
  }
`;

const HeaderUser = styled(Link)`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
  text-decoration: none;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease,
    border-color 0.18s ease;

  display: none;

  ${desktop} {
    display: flex;

    &:hover {
      transform: translateY(-2px);
      background: rgba(255, 250, 243, 0.96);
      border-color: rgba(220, 208, 194, 0.95);
      box-shadow: 0 14px 28px rgba(31, 31, 31, 0.08);
    }
  }
`;

const HeaderAvatar = styled.div`
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #ded6c8;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 700;
`;

const HeaderUserName = styled.strong`
  display: block;
  font-size: 0.82rem;
  line-height: 1.2;

  @media (max-width: 420px) {
    font-size: 0.78rem;
  }
`;


const StatsGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;

  ${tabletUp} {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  ${desktop} {
    gap: 16px;
  }
`;

const StatCard = styled.article`
  ${cardSurface}
  min-height: 74px;
  display: grid;
  gap: 6px;
  padding: 10px 8px 8px;
  border-radius: 16px;

  ${tabletUp} {
    grid-template-columns: minmax(0, 1fr) 44px;
    align-items: start;
    min-height: 96px;
    padding: 12px 14px;
    border-radius: 20px;
  }

  ${desktop} {
    grid-template-columns: minmax(0, 1fr) 52px;
    min-height: 100px;
    padding: 10px 20px;
  }
`;

const StatCardLink = styled(StatCard).attrs({ as: Link })`
  color: inherit;
  text-decoration: none;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease;

  &:hover {
    transform: translateY(-2px);
    border-color: rgba(214, 206, 193, 0.95);
    box-shadow: 0 16px 30px rgba(31, 31, 31, 0.08);
    background: rgba(252, 249, 244, 0.98);
  }
`;

const StatCopy = styled.div`
  display: grid;
  gap: 3px;
  grid-template-columns: 1fr;
  align-items: start;

  ${desktop} {
    grid-template-columns: 1fr;
  }
`;

const StatLabel = styled.span`
  grid-column: 1 / -1;
  color: var(--color-text);
  font-size: 0.6rem;
  font-weight: 600;
  line-height: 1.15;

  ${desktop} {
    font-size: 0.8rem;
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
  font-size: 1.02rem;
  line-height: 1;

  ${desktop} {
    font-size: 1.9rem;
  }
`;

const StatNote = styled.span<{ $tone: "positive" | "warning" }>`
  color: ${({ $tone }) => ($tone === "positive" ? "#5ca16d" : "#da6a43")};
  display: none;
  font-weight: 600;

  ${desktop} {
    display: inline;
    font-size: 0.74rem;
  }
`;

const StatIcon = styled.div<{ $tone: "dark" | "soft-green" | "soft-gold" }>`
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: ${({ $tone }) =>
    $tone === "dark"
      ? "#1f4339"
      : $tone === "soft-green"
        ? "#d6efc9"
        : "#ffe8bd"};
  color: ${({ $tone }) =>
    $tone === "dark" ? "#fff" : $tone === "soft-green" ? "#55894f" : "#c07e1b"};
  justify-self: end;
  align-self: start;

  svg {
    width: 12px;
    height: 12px;
  }

  ${tabletUp} {
    width: 44px;
    height: 44px;
    border-radius: 16px;

    svg {
      width: 18px;
      height: 18px;
    }
  }

  ${desktop} {
    width: 52px;
    height: 52px;

    svg {
      width: 20px;
      height: 20px;
    }
  }
`;

const MobileDashboardStack = styled.section`
  display: grid;
  gap: 12px;

  ${tablet} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: 16px;

    > section:first-child {
      grid-column: 1 / -1;
    }
  }

  ${desktop} {
    display: none;
  }
`;

const DesktopDashboard = styled.section`
  display: none;

  ${desktop} {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
`;

const TopGrid = styled.section`
  display: grid;
  gap: 14px;

  ${desktop} {
    grid-template-columns: minmax(0, 1.9fr) minmax(320px, 1fr);
    gap: 16px;
  }
`;

const BottomGrid = styled.section`
  display: grid;
  gap: 14px;

  ${desktop} {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }
`;

const Panel = styled.section`
  ${cardSurface}
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 20px;

  ${desktop} {
    padding: 14px 16px 16px;
    border-radius: 20px;
  }
`;

const MobileOnlyPanel = styled(Panel)`
  ${desktop} {
    display: none;
  }
`;

const DesktopOnlyPanel = styled(Panel)`
  display: none;

  ${desktop} {
    display: flex;
    flex-direction: column;
  }
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const PanelTitle = styled.h2`
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.2;

  ${desktop} {
    font-size: 0.95rem;
  }
`;

const PanelLink = styled(Link)`
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 600;
`;

const PanelTag = styled.span`
  color: var(--color-text-muted);
  font-size: 0.74rem;
  font-weight: 600;
`;

const interactiveHoverCss = css`
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;

  ${desktop} {
    &:hover {
      transform: translateY(-2px);
      background: rgba(255, 248, 239, 0.92);
      border-color: rgba(220, 208, 194, 0.95);
      color: #1f4339;
      box-shadow: 0 14px 28px rgba(31, 31, 31, 0.08);
    }
  }
`;

const ProjectList = styled.div`
  display: grid;
  gap: 6px;
`;

const ProjectRow = styled(Link)`
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  text-decoration: none;
  padding: 8px 0;
  border-top: 1px solid rgba(230, 224, 215, 0.65);
  border-radius: 14px;

  ${interactiveHoverCss}

  &:first-child {
    padding-top: 0;
    border-top: 0;
  }

  ${desktop} {
    grid-template-columns: 58px minmax(0, 1fr);
    gap: 12px;
    padding: 10px 0;
  }
`;

const MobileProjectRow = styled(Link)`
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  text-decoration: none;
  padding: 10px 0;
  border-top: 1px solid rgba(230, 224, 215, 0.65);
  border-radius: 14px;

  ${interactiveHoverCss}

  &:first-child {
    padding-top: 0;
    border-top: 0;
  }
`;

const ProjectMark = styled.div`
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #ede5d8, #f8f4ee);
  color: #8c7040;
  font-size: 0.95rem;
  font-weight: 600;

  ${desktop} {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    font-size: 1.05rem;
  }
`;

const ProjectBody = styled.div`
  display: grid;
  gap: 4px;
`;

const MobileProjectHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
`;

const MobileProjectFooter = styled.div`
  display: grid;
  gap: 4px;
`;

const MobileMetaText = styled.span`
  color: var(--color-text-muted);
  font-size: 0.7rem;
  font-weight: 600;
`;

const MobileDueText = styled.span`
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1.1;
  white-space: nowrap;
`;

const ProjectTop = styled.div`
  display: grid;
  gap: 8px;

  ${desktop} {
    grid-template-columns: minmax(0, 1.8fr) repeat(3, minmax(88px, auto));
    align-items: end;
    gap: 12px;
  }
`;

const ProjectTitle = styled.strong`
  display: block;
  font-size: 0.78rem;
  line-height: 1.2;

  ${desktop} {
    font-size: 0.86rem;
  }
`;

const MetaGroup = styled.div`
  display: grid;
  gap: 4px;
  align-content: start;
`;

const MetaLabel = styled.span`
  color: var(--color-text-light);
  font-size: 0.64rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const MetaValue = styled.strong`
  font-size: 0.72rem;
  line-height: 1.2;
`;

const ProjectStatusRow = styled.div`
  display: flex;
  justify-content: flex-start;
`;

const StatusPill = styled.span`
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
`;

const TaskList = styled.div`
  display: grid;
  gap: 10px;
`;

const TaskRow = styled(Link)`
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  text-decoration: none;
  padding: 2px 0;
  border-radius: 12px;

  ${interactiveHoverCss}
`;

const TaskCircle = styled.span<{ $urgent: boolean; $done?: boolean }>`
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border-radius: 999px;
  border: 2px solid
    ${({ $done, $urgent }) => ($done ? "#2c6b43" : $urgent ? "#df7a6b" : "#ded6c8")};
  background: ${({ $done }) => ($done ? "#2c6b43" : "transparent")};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
`;

const TaskCopy = styled.div`
  display: grid;
  gap: 2px;
`;

const TaskTitle = styled.strong`
  font-size: 0.84rem;
  line-height: 1.2;
`;

const TaskSub = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.72rem;
`;

const TaskDate = styled.span`
  color: #da6a43;
  font-size: 0.72rem;
  font-weight: 700;
`;

const PanelPagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 2px;
`;

const PageButton = styled.button`
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  font-size: 0.74rem;
  font-weight: 700;

  &:disabled {
    opacity: 0.45;
  }
`;

const PageMeta = styled.span`
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 600;
`;

const DonutWrap = styled.div`
  display: grid;
  justify-items: center;
  gap: 18px;
`;

const DonutChart = styled.div`
  width: 150px;
  height: 150px;
  border-radius: 999px;
  display: grid;
  place-items: center;
`;

const DonutCenter = styled.div`
  width: 141px;
  height: 141px;
  border-radius: 999px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #fff;
  text-align: center;

  strong {
    display: block;
    font-size: 2rem;
    line-height: 1;
  }

  span {
    color: var(--color-text-muted);
    font-size: 0.78rem;
    font-weight: 600;
  }
`;

const LegendList = styled.div`
  width: 100%;
  display: grid;
  gap: 10px;
`;

const LegendItem = styled.div`
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  color: var(--color-text-muted);
  font-size: 0.84rem;

  strong {
    color: var(--color-text);
  }
`;

const LegendDot = styled.span<{ $color: string }>`
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: ${({ $color }) => $color};
`;

const FeedbackList = styled.div`
  display: grid;
  gap: 10px;
`;

const FeedbackRowCard = styled.article`
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  gap: 10px;
  margin-top: 20px;
  align-items: center;
`;

const FeedbackAvatar = styled.div`
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: #f5efe5;
  color: var(--color-text-muted);
  font-weight: 700;
`;

const FeedbackCopy = styled.div`
  display: grid;
  gap: 2px;
`;

const FeedbackBody = styled.p`
  margin: 0;
  color: var(--color-text);
  font-size: 0.82rem;
  line-height: 1.4;
`;

const FeedbackProject = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.74rem;
`;

const ActivityList = styled.div`
  display: grid;
  gap: 12px;
  margin-top: 20px;
`;

const ActivityRowCard = styled.article`
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
`;

const ActivityTime = styled.span`
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 600;
`;

const ActionList = styled.div`
  display: grid;
  gap: 8px;
  margin-top: 20px;
  ${tablet} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const DesktopSidebarSlot = styled.div`
  display: none;

  ${desktop} {
    display: block;
    flex: 0 0 auto;
  }
`;

const actionButtonCss = css`
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 12px;
  border-radius: 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: #fff;
  color: var(--color-text);
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: none;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;

  &:first-child {
    background: #1f4339;
    color: #fff;
    border-color: transparent;
  }

  ${desktop} {
    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 14px 28px rgba(31, 31, 31, 0.08);
      background: #fff7ef;
      border-color: rgba(220, 208, 194, 0.95);
      color: #1f4339;
    }

    &:first-child:hover {
      background: #285347;
      border-color: transparent;
    }
  }
`;

const ActionLink = styled(Link)`
  ${actionButtonCss}
`;

const ActionButton = styled.button`
  ${actionButtonCss}
  cursor: pointer;
`;

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 95;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 20px;
  background: rgba(28, 29, 28, 0.36);
  backdrop-filter: blur(8px);

  ${desktop} {
    align-items: center;
  }
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

const TaskMetaLabel = styled.span`
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

const EmptyBlock = styled.div`
  color: var(--color-text-muted);

  strong {
    display: block;
    color: var(--color-text);
    font-size: 0.86rem;
  }

  p {
    margin: 6px 0 0;
    font-size: 0.76rem;
    line-height: 1.5;
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

function IconCheckTiny() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m7.8 12.3 2.4 2.4 5.9-6.1" />
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

function IconComment() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 7.5A2.5 2.5 0 0 1 8.5 5h7A2.5 2.5 0 0 1 18 7.5v5A2.5 2.5 0 0 1 15.5 15H11l-4 3v-3H8.5A2.5 2.5 0 0 1 6 12.5z" />
    </svg>
  );
}

function IconFlag() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 20V5" />
      <path d="M6 6c2-1.5 4-1.5 6 0s4 1.5 6 0v7c-2 1.5-4 1.5-6 0s-4-1.5-6 0" />
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

function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V6" />
      <path d="m8 10 4-4 4 4" />
      <path d="M5 18.5h14" />
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

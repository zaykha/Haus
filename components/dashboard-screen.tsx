"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import styled, { css } from "styled-components";
import { useAppState } from "@/components/app-state";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthLoadingAnimation } from "@/components/auth-loading-animation";
import { ClientOrganizationDetailScreen } from "@/components/client-organization-detail-screen";
import { ClientTitleLogo } from "@/components/client-title-logo";
import { CustomDatePicker } from "@/components/custom-date-picker";
import { GanttChart } from "@/components/gantt-chart";
import { HeaderProfileAvatarLink } from "@/components/header-profile-avatar-link";
import { DashboardScreenSkeleton } from "@/components/page-skeletons";
import { ProjectStageProgress } from "@/components/project-stage-progress";
import { useActiveClientOrganization } from "@/components/use-active-client-organization";
import { UserAvatar } from "@/components/user-avatar";
import {
  canManageWorkspace,
  canViewProject,
  getVisibleTasksForUser,
} from "@/lib/permissions";
import { compareProjectsByWorkflowPriority, getProjectWorkflowRank, isProjectCompleted, isProjectOnHold } from "@/lib/project-ranking";
import { formatLabel, formatRole, getTaskStatusLabel } from "@/lib/display";
import { FeedbackAction, Project, TaskPriority, TaskStatus } from "@/lib/types";

type EnrichedTask = {
  id: string;
  title: string;
  status: string;
  projectId: string;
  projectName: string;
  dueDate: string;
  feedbackEntries?: {
    id: string;
    source: "internal" | "client";
    author: string;
    body: string;
    createdAt: string;
    rating?: number | null;
  }[];
};

type FeedbackRow = {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string;
  organization?: { name: string; logoUrl?: string } | null;
  body: string;
  action: FeedbackAction;
  createdAt: string;
};

type ActivityRow = {
  id: string;
  actorId?: string | null;
  actor: string;
  detail: string;
  projectName: string;
  createdAt: string;
};

const tablet = "@media (min-width: 768px) and (max-width: 1099px)";
const tabletUp = "@media (min-width: 768px)";
const desktop = "@media (min-width: 1100px)";

const TASKS_PAGE_SIZE = 4;
const MOBILE_PROJECT_CAP = 4;

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

function getProjectOrganization(
  project: Pick<Project, "clientOrganizationId" | "contactPerson">,
  clientOrganizations: Array<{ id: string; name: string; logoUrl?: string }>,
) {
  if (project.clientOrganizationId) {
    return clientOrganizations.find((organization) => organization.id === project.clientOrganizationId) ?? null;
  }

  return project.contactPerson ? { name: project.contactPerson, logoUrl: undefined } : null;
}

function isOnHoldProject(project: Pick<Project, "status" | "stage">) {
  return isProjectOnHold(project);
}

function isCompletedProjectForDashboard(project: Pick<Project, "status" | "stage">) {
  return isProjectCompleted(project);
}

function isReviewProject(project: Pick<Project, "status" | "stage">) {
  return (
    project.status === "review" ||
    project.status === "Pending Review" ||
    project.stage === "Pending Review"
  );
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
  const { ready, workspaceReady, state, user, createTask } = useAppState();
  const [tasksPage, setTasksPage] = useState(1);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [createTaskError, setCreateTaskError] = useState("");
  const [showCreateTaskErrorPopup, setShowCreateTaskErrorPopup] = useState(false);
  const [createTaskSubmitAttempted, setCreateTaskSubmitAttempted] = useState(false);
  const [taskSelect, setTaskSelect] = useState<"organization" | "project" | "assignee" | "status" | null>(null);
  const [newTaskOrganizationId, setNewTaskOrganizationId] = useState("");
  const [newTaskProjectId, setNewTaskProjectId] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState("");
  const [newTaskOpenForAll, setNewTaskOpenForAll] = useState(true);
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>("todo");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>("medium");
  const [showRecentFeedbackModal, setShowRecentFeedbackModal] = useState(false);
  const [showTeamActivityModal, setShowTeamActivityModal] = useState(false);

  const safeUser = user;
  const { activeClientOrganizationId, scopedHref } = useActiveClientOrganization(safeUser, state.clientOrganizations);
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
  const hasAvailableTaskProjects = availableProjects.length > 0;
  const availableStaff = state.users.filter((candidate) => candidate.role !== "client");
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

  const openTasks = useMemo<EnrichedTask[]>(
    () => {
      if (!user) return [];

      return projectRows.flatMap((project) =>
        getVisibleTasksForUser(user, project)
          .filter(
            (task) =>
              task.status !== "approved" && (!isDesigner || task.assigneeId === user.id || task.assigneeId === null),
          )
          .map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            projectId: project.id,
            projectName: project.name,
            dueDate: task.dueDate ?? project.dueDate,
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
                  rating: null,
                })),
            ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
          })),
      );
    },
    [isDesigner, projectRows, state.users, user, userNames],
  );
  const designerFeedbackRows = useMemo(
    () =>
      openTasks
        .flatMap((task) =>
          (task.feedbackEntries ?? []).map((entry) => ({
            ...entry,
            taskId: task.id,
            taskTitle: task.title,
            projectId: task.projectId,
            projectName: task.projectName,
          })),
        )
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [openTasks],
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
            organization: getProjectOrganization(project, state.clientOrganizations),
            body: feedback.body,
            action: feedback.action,
            createdAt: feedback.createdAt,
          })),
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [organizationNames, projectRows, state.clientOrganizations],
  );

  const activityRows = useMemo<ActivityRow[]>(
    () =>
      projectRows
        .flatMap((project) =>
          project.activities.map((activity) => ({
            id: activity.id,
            actorId: activity.actorId,
            actor: activity.actorId ? (userNames.get(activity.actorId) ?? "Team member") : "System",
            detail: activity.message,
            projectName: project.name,
            createdAt: activity.createdAt,
          })),
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [projectRows, userNames],
  );

  const activeProjectsCount = projectRows.filter((project) => !isCompletedProjectForDashboard(project)).length;
  const dueTodayTasksCount = openTasks.filter((task) => isDateToday(task.dueDate, now)).length;
  const feedbackCount = projectRows.filter((project) => project.status === "review").length;
  const completedCount = projectRows.filter(
    (project) => isCompletedProjectForDashboard(project) && isProjectCompletedThisMonth(project, now),
  ).length;
  const tasksPageCount = Math.max(1, Math.ceil(openTasks.length / TASKS_PAGE_SIZE));
  const currentTasksPage = Math.min(tasksPage, tasksPageCount);
  const compactGanttProjects = useMemo(
    () =>
      projectRows
        .filter((project) => !isCompletedProjectForDashboard(project))
        .slice()
        .sort(compareProjectsByWorkflowPriority),
    [projectRows],
  );
  const mobilePriorityProjects = useMemo(
    () => [...projectRows].sort(compareProjectsByWorkflowPriority).slice(0, MOBILE_PROJECT_CAP),
    [projectRows],
  );
  const dashboardTasks = openTasks.slice(
    (currentTasksPage - 1) * TASKS_PAGE_SIZE,
    currentTasksPage * TASKS_PAGE_SIZE,
  );
  const recentFeedback = feedbackRows.slice(0, 3);
  const recentActivity = activityRows.slice(0, 4);

  const completedProjects = projectRows.filter((project) => isCompletedProjectForDashboard(project)).length;
  const reviewProjects = projectRows.filter((project) => isReviewProject(project)).length;
  const holdProjects = projectRows.filter((project) => isOnHoldProject(project)).length;
  const inProgressProjects = projectRows.filter(
    (project) =>
      !isCompletedProjectForDashboard(project) && !isReviewProject(project) && !isOnHoldProject(project),
  ).length;

  const totalProjects = Math.max(projectRows.length, 1);
  const completedPct = Math.round((completedProjects / totalProjects) * 100);
  const inProgressPct = Math.round((inProgressProjects / totalProjects) * 100);
  const reviewPct = Math.round((reviewProjects / totalProjects) * 100);
  const holdPct = Math.round((holdProjects / totalProjects) * 100);

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
    setNewTaskOpenForAll(true);
    setNewTaskStatus("todo");
    setNewTaskDueDate("");
    setNewTaskPriority("medium");
    setTaskSelect(null);
    setCreateTaskError("");
    setShowCreateTaskErrorPopup(false);
    setCreateTaskSubmitAttempted(false);
    setShowCreateTaskModal(true);
  };

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateTaskSubmitAttempted(true);

    const missingOrganization = !newTaskOrganizationId;
    const missingProject = !selectedProject;
    const missingTitle = !newTaskTitle.trim();
    const missingAssignee = !newTaskOpenForAll && !newTaskAssigneeId;
    const missingDueDate = !newTaskDueDate;

    if (missingOrganization || missingProject || missingTitle || missingAssignee || missingDueDate) {
      setCreateTaskError("Fill in every required field.");
      setShowCreateTaskErrorPopup(true);
      return;
    }

    setIsCreatingTask(true);
    setCreateTaskError("");
    setShowCreateTaskErrorPopup(false);

    try {
      await createTask(selectedProject.id, {
        title: newTaskTitle.trim(),
        assigneeId: newTaskOpenForAll ? null : newTaskAssigneeId,
        status: newTaskStatus,
        dueDate: newTaskDueDate,
        priority: newTaskPriority,
      });
      setShowCreateTaskModal(false);
    } catch (nextError) {
      setCreateTaskError(nextError instanceof Error ? nextError.message : "Unable to create task.");
      setShowCreateTaskErrorPopup(true);
    } finally {
      setIsCreatingTask(false);
    }
  };

  const clientHomeOrganizationId = safeUser?.role === "client" ? activeClientOrganizationId : null;

  if (!ready || (safeUser ? !workspaceReady : false)) {
    return <DashboardScreenSkeleton variant={safeUser?.role === "client" ? "client" : "manager"} />;
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
      {showCreateTaskErrorPopup && createTaskError ? (
        <div className="auth-popup-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="dashboard-task-form-error-title">
          <div className="auth-popup-card">
            <h2 id="dashboard-task-form-error-title">Task form error</h2>
            <p>{createTaskError}</p>
            <button className="primary-button mobile-full-button" type="button" onClick={() => setShowCreateTaskErrorPopup(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
      {isCreatingTask ? (
        <div className="auth-loading-overlay" role="status" aria-live="polite">
          <div className="auth-loading-card">
            <AuthLoadingAnimation />
            <p>Creating task...</p>
          </div>
        </div>
      ) : null}

      {showRecentFeedbackModal ? (
        <ModalBackdrop onClick={() => setShowRecentFeedbackModal(false)}>
          <ScrollableModalCard onClick={(event) => event.stopPropagation()}>
            <ModalHeader>
              <div>
                <ModalTitle>Recent Client Feedback</ModalTitle>
                <ModalDescription>Browse the full list of feedback across visible projects.</ModalDescription>
              </div>
              <ModalClose type="button" onClick={() => setShowRecentFeedbackModal(false)} aria-label="Close">
                <IconClose />
              </ModalClose>
            </ModalHeader>
            <ScrollableModalBody>
              <FeedbackList>
                {feedbackRows.length ? (
                  feedbackRows.map((feedback) => {
                    const tone = getFeedbackTone(feedback.action);
                    return (
                      <FeedbackRowCard key={feedback.id}>
                        <FeedbackLogo organization={feedback.organization ?? null} />
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
            </ScrollableModalBody>
          </ScrollableModalCard>
        </ModalBackdrop>
      ) : null}

      {showTeamActivityModal ? (
        <ModalBackdrop onClick={() => setShowTeamActivityModal(false)}>
          <ScrollableModalCard onClick={(event) => event.stopPropagation()}>
            <ModalHeader>
              <div>
                <ModalTitle>Team Activity</ModalTitle>
                <ModalDescription>Browse the full list of recent team activity.</ModalDescription>
              </div>
              <ModalClose type="button" onClick={() => setShowTeamActivityModal(false)} aria-label="Close">
                <IconClose />
              </ModalClose>
            </ModalHeader>
            <ScrollableModalBody>
              <ActivityList>
                {activityRows.length ? (
                  activityRows.map((item) => (
                    <ActivityRowCard key={item.id}>
                      {item.actorId ? (
                        <ActivityUserAvatar
                          user={state.users.find((candidate) => candidate.id === item.actorId) ?? { name: item.actor, avatarPath: null }}
                        />
                      ) : (
                        <SystemAvatar>S</SystemAvatar>
                      )}
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
            </ScrollableModalBody>
          </ScrollableModalCard>
        </ModalBackdrop>
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
            <InlineForm onSubmit={handleCreateTask} noValidate>
              <TaskModalGrid>
                <TaskModalField>
                  <TaskFloatingSelect
                    $filled={Boolean(newTaskOrganizationId)}
                    $open={taskSelect === "organization"}
                    $invalid={createTaskSubmitAttempted && !newTaskOrganizationId}
                  >
                    <TaskSelectTrigger
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={taskSelect === "organization"}
                      $invalid={createTaskSubmitAttempted && !newTaskOrganizationId}
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
                        <TaskSelectValue>
                          {selectedTaskOrganization?.name ?? "Select organization"}
                        </TaskSelectValue>
                      </TaskSelectValueRow>
                      <TaskSelectChevron $open={taskSelect === "organization"}>
                        <IconChevronDown />
                      </TaskSelectChevron>
                    </TaskSelectTrigger>
                    <TaskFloatingLabel $invalid={createTaskSubmitAttempted && !newTaskOrganizationId}>Organization</TaskFloatingLabel>
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
                              setNewTaskOpenForAll(true);
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
                      <TaskFloatingSelect
                        $filled={Boolean(selectedProject)}
                        $open={taskSelect === "project"}
                        $invalid={createTaskSubmitAttempted && !selectedProject}
                      >
                        <TaskSelectTrigger
                          type="button"
                          aria-haspopup="listbox"
                          aria-expanded={taskSelect === "project"}
                          $invalid={createTaskSubmitAttempted && !selectedProject}
                          onClick={() => setTaskSelect((current) => (current === "project" ? null : "project"))}
                        >
                          <TaskSelectValue>{selectedProject?.name ?? "Select project"}</TaskSelectValue>
                          <TaskSelectChevron $open={taskSelect === "project"}>
                            <IconChevronDown />
                          </TaskSelectChevron>
                        </TaskSelectTrigger>
                        <TaskFloatingLabel $invalid={createTaskSubmitAttempted && !selectedProject}>Project</TaskFloatingLabel>
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
                            <TaskCreateProjectLink href={scopedHref(`/projects/new?clientOrganizationId=${newTaskOrganizationId}`)}>
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
                      <TaskFloatingField
                        className={newTaskTitle ? "auth-field is-filled" : "auth-field"}
                        $invalid={createTaskSubmitAttempted && !newTaskTitle.trim()}
                      >
                        <TaskTextInput
                          value={newTaskTitle}
                          onChange={(event) => setNewTaskTitle(event.target.value)}
                          placeholder=" "
                          required
                          $invalid={createTaskSubmitAttempted && !newTaskTitle.trim()}
                        />
                        <span>Task title</span>
                      </TaskFloatingField>
                    </TaskModalField>

                    <TaskModalField $wide>
                      <TaskToggleButton
                        type="button"
                        aria-pressed={newTaskOpenForAll}
                        onClick={() => {
                          setNewTaskOpenForAll((current) => !current);
                          setNewTaskAssigneeId("");
                          setTaskSelect((current) => (current === "assignee" ? null : current));
                        }}
                      >
                        <TaskToggleCopy>
                          <strong>Open for all</strong>
                          <span>All designers can see this task until a manager assigns it.</span>
                        </TaskToggleCopy>
                        <TaskToggleTrack $active={newTaskOpenForAll}>
                          <TaskToggleThumb $active={newTaskOpenForAll} />
                        </TaskToggleTrack>
                      </TaskToggleButton>
                    </TaskModalField>

                    {newTaskOpenForAll ? null : (
                      <TaskModalField>
                        <TaskFloatingSelect
                          $filled={Boolean(newTaskAssigneeId)}
                          $open={taskSelect === "assignee"}
                          $invalid={createTaskSubmitAttempted && !newTaskAssigneeId}
                        >
                          <TaskSelectTrigger
                            type="button"
                            aria-haspopup="listbox"
                            aria-expanded={taskSelect === "assignee"}
                            $invalid={createTaskSubmitAttempted && !newTaskAssigneeId}
                            onClick={() => setTaskSelect((current) => (current === "assignee" ? null : "assignee"))}
                          >
                            <TaskSelectValue>
                              {availableStaff.find((member) => member.id === newTaskAssigneeId)?.name ?? "Select staff"}
                            </TaskSelectValue>
                            <TaskSelectChevron $open={taskSelect === "assignee"}>
                              <IconChevronDown />
                            </TaskSelectChevron>
                          </TaskSelectTrigger>
                          <TaskFloatingLabel $invalid={createTaskSubmitAttempted && !newTaskAssigneeId}>Assignee</TaskFloatingLabel>
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
                    )}

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
                        invalid={createTaskSubmitAttempted && !newTaskDueDate}
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
              {createTaskError ? <InlineError>{createTaskError}</InlineError> : null}
              <button
                className="primary-button"
                type="submit"
                disabled={isCreatingTask}
              >
                {isCreatingTask ? "Creating..." : "Add task"}
              </button>
            </InlineForm>
          </ModalCard>
        </ModalBackdrop>
      ) : null}

      {safeUser ? (
        <DesktopSidebarSlot>
          <AppSidebar user={safeUser} activeLabel="Home" pinToViewport />
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
          {safeUser ? <HeaderProfileAvatarLink user={safeUser} /> : null}
        </Header>

        {isDesigner ? null : (
          <StatsGrid>

            <StatCardLink href={scopedHref("/projects?quick=active")}>
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

            <StatCardLink href={scopedHref("/projects?quick=awaiting_feedback")}>
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

            <StatCardLink href={scopedHref("/projects?quick=completed_this_month")}>
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
              <PanelTitle>{isClient ? "Active Projects" : isDesigner ? "Assigned Projects" : "Priority Projects"}</PanelTitle>
              {projectRows.length > MOBILE_PROJECT_CAP ? <PanelLink href={scopedHref("/projects")}>View all</PanelLink> : null}
            </PanelHeader>
            <PanelContentArea $minHeight={190} $desktopMinHeight={208}>
              {mobilePriorityProjects.length ? (
                <DashboardProjectList>
                  {mobilePriorityProjects.map((project) => (
                    <DashboardProjectRow key={project.id} href={scopedHref(`/projects/${project.id}`)}>
                      <DashboardProjectIcon
                        organization={getProjectOrganization(project, state.clientOrganizations)}
                      />
                      <DashboardProjectCopy>
                        <DashboardProjectTitle>{project.projectRequestName || project.name}</DashboardProjectTitle>
                        <DashboardProjectMeta>{project.clientName}</DashboardProjectMeta>
                        <DashboardProjectMeta>
                          Due {formatShortDate(project.finalDeliverableDate ?? project.dueDate)}
                        </DashboardProjectMeta>
                      </DashboardProjectCopy>
                      <DashboardProjectPill $rank={getProjectWorkflowRank(project)}>
                        {project.stage}
                      </DashboardProjectPill>
                    </DashboardProjectRow>
                  ))}
                </DashboardProjectList>
              ) : (
                <EmptyBlock $mobileMinHeight={190}>
                  <EmptyImage src="/no-data.webp" alt="" aria-hidden="true" />
                  <strong>No projects yet</strong>
                  <p>Projects will appear here once work is created.</p>
                </EmptyBlock>
              )}
            </PanelContentArea>
          </Panel>

          <Panel>
            <PanelHeader>
              <PanelTitle>Tasks</PanelTitle>
              {openTasks.length > 3 ? <PanelLink href="/tasks">View all</PanelLink> : null}
            </PanelHeader>
            <PanelContentArea $minHeight={168} $desktopMinHeight={200}>
              <TaskList>
                {openTasks.slice(0, 3).length ? (
                  openTasks.slice(0, 3).map((task) => (
                    <TaskRow key={task.id} href={scopedHref(`/projects/${task.projectId}`)}>
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
                  <EmptyBlock $mobileMinHeight={168}>
                    <EmptyImage src="/no-data.webp" alt="" aria-hidden="true" />
                    <strong>No tasks due</strong>
                    <p>Open tasks will appear here once project work is assigned.</p>
                  </EmptyBlock>
                )}
              </TaskList>
            </PanelContentArea>
          </Panel>

          {isDesigner ? (
            <Panel>
              <PanelHeader>
                <PanelTitle>Feedback</PanelTitle>
                {designerFeedbackRows.length > 3 ? <PanelLink href="/tasks">View all</PanelLink> : null}
              </PanelHeader>
              <PanelContentArea $minHeight={206} $desktopMinHeight={206}>
                <FeedbackList>
                  {designerFeedbackRows.length ? (
                    designerFeedbackRows.slice(0, 3).map((feedback) => (
                      <FeedbackRowCard key={feedback.id}>
                        <FeedbackAvatar>{feedback.author.slice(0, 2).toUpperCase()}</FeedbackAvatar>
                        <FeedbackCopy>
                          <FeedbackBody>{feedback.body}</FeedbackBody>
                          <FeedbackProject>{feedback.taskTitle} · {feedback.projectName}</FeedbackProject>
                        </FeedbackCopy>
                        <StatusPill
                          style={{
                            background: feedback.source === "client" ? "var(--color-warning-soft)" : "var(--color-info-soft)",
                            color: feedback.source === "client" ? "var(--color-warning)" : "var(--color-info)",
                          }}
                        >
                          {feedback.source === "client" ? "Client" : "Internal"}
                        </StatusPill>
                      </FeedbackRowCard>
                    ))
                  ) : (
                    <EmptyBlock $mobileMinHeight={206}>
                      <EmptyImage src="/no-data.webp" alt="" aria-hidden="true" />
                      <strong>No feedback yet</strong>
                      <p>Manager and client feedback on your tasks will appear here.</p>
                    </EmptyBlock>
                  )}
                </FeedbackList>
              </PanelContentArea>
            </Panel>
          ) : null}

          {!isDesigner ? (
            <Panel>
              <PanelHeader>
                <PanelTitle>Recent Feedback</PanelTitle>
                {recentFeedback.length > 1 ? (
                  <PanelActionButton type="button" onClick={() => setShowRecentFeedbackModal(true)}>
                    View all
                  </PanelActionButton>
                ) : null}
              </PanelHeader>
              <PanelContentArea $minHeight={150} $desktopMinHeight={184}>
                <FeedbackList>
                  {recentFeedback.length ? (
                    recentFeedback.slice(0, 1).map((feedback) => {
                      const tone = getFeedbackTone(feedback.action);
                      return (
                        <FeedbackRowCard key={feedback.id}>
                          <FeedbackLogo organization={feedback.organization ?? null} />
                          <FeedbackCopy>
                            <FeedbackBody>{feedback.body}</FeedbackBody>
                            <FeedbackProject>{feedback.projectName}</FeedbackProject>
                          </FeedbackCopy>
                          <StatusPill style={{ background: tone.bg, color: tone.fg }}>{tone.label}</StatusPill>
                        </FeedbackRowCard>
                      );
                    })
                  ) : (
                    <EmptyBlock $mobileMinHeight={150} $desktopMinHeight={236}>
                      <EmptyImage src="/no-data.webp" alt="" aria-hidden="true" />
                      <strong>No feedback yet</strong>
                      <p>Client comments will appear here once reviews start coming in.</p>
                    </EmptyBlock>
                  )}
                </FeedbackList>
              </PanelContentArea>
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
                {recentActivity.length > 3 ? (
                  <PanelActionButton type="button" onClick={() => setShowTeamActivityModal(true)}>
                    View all
                  </PanelActionButton>
                ) : null}
              </PanelHeader>
              <PanelContentArea $minHeight={192} $desktopMinHeight={236}>
                <ActivityList>
                  {recentActivity.length ? (
                    recentActivity.slice(0, 3).map((item) => (
                      <ActivityRowCard key={item.id}>
                        {item.actorId ? (
                          <ActivityUserAvatar
                            user={state.users.find((candidate) => candidate.id === item.actorId) ?? { name: item.actor, avatarPath: null }}
                          />
                        ) : (
                          <SystemAvatar>S</SystemAvatar>
                        )}
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
                    <EmptyBlock $mobileMinHeight={192} $desktopMinHeight={236}>
                      <EmptyImage src="/no-data.webp" alt="" aria-hidden="true" />
                      <strong>No recent activity</strong>
                      <p>File uploads, comments, and feedback updates will appear here.</p>
                    </EmptyBlock>
                  )}
                </ActivityList>
              </PanelContentArea>
            </Panel>
          ) : null}

          {canManage && !isClient ? (
            <Panel>
              <PanelHeader>
                <PanelTitle>Quick Actions</PanelTitle>
              </PanelHeader>

              <ActionList>
                <ActionLink href={scopedHref("/projects/new")}>
                  <ActionIcon>
                    <IconPlus />
                  </ActionIcon>
                  <span>Create Project</span>
                </ActionLink>
                {hasAvailableTaskProjects ? (
                  <ActionButton type="button" onClick={openCreateTaskModal}>
                    <ActionIcon>
                      <IconCheckCircle />
                    </ActionIcon>
                    <span>Add Task</span>
                  </ActionButton>
                ) : null}
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
              <PanelContentArea $minHeight={214} $desktopMinHeight={214}>
                <GanttChart
                  projects={compactGanttProjects}
                  clientOrganizations={state.clientOrganizations}
                  compact
                  rangeMode="overview"
                  hrefBuilder={(project) => scopedHref(`/projects/${project.id}`)}
                  title={isDesigner ? "Project Timeline" : "Gantt Overview"}
                  viewAllHref={scopedHref("/gantt")}
                  maxVisibleRows={4}
                />
              </PanelContentArea>
            </Panel>

            <Panel>
              <PanelHeader>
                <PanelTitle>Tasks</PanelTitle>
                {openTasks.length > TASKS_PAGE_SIZE ? <PanelLink href="/tasks">View all</PanelLink> : null}
              </PanelHeader>

              <TaskList>
                {dashboardTasks.length ? (
                  dashboardTasks.map((task) => (
                    <TaskRow key={task.id} href={scopedHref(`/projects/${task.projectId}`)}>
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
                  <EmptyBlock $mobileMinHeight={200}>
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

            {isDesigner ? (
              <Panel>
                <PanelHeader>
                  <PanelTitle>Feedback</PanelTitle>
                  {designerFeedbackRows.length > 3 ? <PanelLink href="/tasks">View all</PanelLink> : null}
                </PanelHeader>
                <PanelContentArea $minHeight={206} $desktopMinHeight={206}>
                  <FeedbackList>
                    {designerFeedbackRows.length ? (
                      designerFeedbackRows.slice(0, 3).map((feedback) => (
                        <FeedbackRowCard key={feedback.id}>
                          <FeedbackAvatar>{feedback.author.slice(0, 2).toUpperCase()}</FeedbackAvatar>
                          <FeedbackCopy>
                            <FeedbackBody>{feedback.body}</FeedbackBody>
                            <FeedbackProject>{feedback.taskTitle} · {feedback.projectName}</FeedbackProject>
                          </FeedbackCopy>
                          <StatusPill
                            style={{
                              background: feedback.source === "client" ? "var(--color-warning-soft)" : "var(--color-info-soft)",
                              color: feedback.source === "client" ? "var(--color-warning)" : "var(--color-info)",
                            }}
                          >
                            {feedback.source === "client" ? "Client" : "Internal"}
                          </StatusPill>
                        </FeedbackRowCard>
                      ))
                    ) : (
                      <EmptyBlock $mobileMinHeight={206}>
                        <EmptyImage src="/no-data.webp" alt="" aria-hidden="true" />
                        <strong>No feedback yet</strong>
                        <p>Manager and client feedback on your tasks will appear here.</p>
                      </EmptyBlock>
                    )}
                  </FeedbackList>
                </PanelContentArea>
              </Panel>
            ) : null}
          </TopGrid>

          {isDesigner || isClient ? null : (
            <>
              <MobileOnlyPanel>

                <PanelHeader>
                  <PanelTitle>Recent Feedback</PanelTitle>
                  {recentFeedback.length > 1 ? <PanelLink href={scopedHref("/projects")}>View all</PanelLink> : null}
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
                    <EmptyBlock $mobileMinHeight={160}>
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
                    {recentFeedback.length > 3 ? (
                      <PanelActionButton type="button" onClick={() => setShowRecentFeedbackModal(true)}>
                        View all
                      </PanelActionButton>
                    ) : null}
                  </PanelHeader>
                  <PanelContentArea $minHeight={212} $desktopMinHeight={212}>
                    <FeedbackList>
                      {recentFeedback.length ? (
                        recentFeedback.map((feedback) => {
                          const tone = getFeedbackTone(feedback.action);
                          return (
                            <FeedbackRowCard key={feedback.id}>
                              <FeedbackLogo organization={feedback.organization ?? null} />
                              <FeedbackCopy>
                                <FeedbackBody>{feedback.body}</FeedbackBody>
                                <FeedbackProject>{feedback.projectName}</FeedbackProject>
                              </FeedbackCopy>
                              <StatusPill style={{ background: tone.bg, color: tone.fg }}>{tone.label}</StatusPill>
                            </FeedbackRowCard>
                          );
                        })
                      ) : (
                        <EmptyBlock $mobileMinHeight={212}>
                          <EmptyImage src="/no-data.webp" alt="" aria-hidden="true" />
                          <strong>No feedback yet</strong>
                          <p>Client feedback will appear here once comments start coming in.</p>
                        </EmptyBlock>
                      )}
                    </FeedbackList>
                  </PanelContentArea>
                </DesktopOnlyPanel>

                <Panel>
                  <PanelHeader>
                    <PanelTitle>Team Activity</PanelTitle>
                    {recentActivity.length > 4 ? (
                      <PanelActionButton type="button" onClick={() => setShowTeamActivityModal(true)}>
                        View all
                      </PanelActionButton>
                    ) : null}
                  </PanelHeader>
                  <PanelContentArea $minHeight={236} $desktopMinHeight={236}>
                    <ActivityList>
                      {recentActivity.length ? (
                        recentActivity.map((item) => (
                          <ActivityRowCard key={item.id}>
                            {item.actorId ? (
                              <ActivityUserAvatar
                                user={state.users.find((candidate) => candidate.id === item.actorId) ?? { name: item.actor, avatarPath: null }}
                              />
                            ) : (
                              <SystemAvatar>S</SystemAvatar>
                            )}
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
                        <EmptyBlock $mobileMinHeight={236}>
                          <EmptyImage src="/no-data.webp" alt="" aria-hidden="true" />
                          <strong>No recent activity</strong>
                          <p>File uploads, comments, and feedback updates will appear here.</p>
                        </EmptyBlock>
                      )}
                    </ActivityList>
                  </PanelContentArea>
                </Panel>

                {canManage ? (
                  <Panel>
                    <PanelHeader>
                      <PanelTitle>Quick Actions</PanelTitle>
                    </PanelHeader>
                    <ActionList>
                      <ActionLink href={scopedHref("/projects/new")}>
                        <ActionIcon>
                          <IconPlus />
                        </ActionIcon>
                        <span>Create Project</span>
                      </ActionLink>
                      {hasAvailableTaskProjects ? (
                        <ActionButton as="button" type="button" onClick={openCreateTaskModal}>
                          <ActionIcon>
                            <IconCheckCircle />
                          </ActionIcon>
                          <span>Add Task</span>
                        </ActionButton>
                      ) : null}
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
      radial-gradient(circle at top center, rgba(255, 255, 255, 0.68), transparent 18%),
      var(--client-screen-soft-panel, linear-gradient(180deg, rgba(252, 249, 244, 0.92), rgba(247, 243, 237, 0.84)));
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

const PanelContentArea = styled.div<{ $minHeight: number; $desktopMinHeight?: number }>`
  display: flex;
  flex-direction: column;

  ${desktop} {
    min-height: ${({ $desktopMinHeight, $minHeight }) => `${$desktopMinHeight ?? $minHeight}px`};
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

const DashboardProjectList = styled.div`
  display: grid;
  gap: 8px;
  max-height: 196px;
  overflow-y: auto;
  padding-right: 2px;
`;

const DashboardProjectRow = styled(Link)`
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 8px 0;
  color: inherit;
  text-decoration: none;
  border-radius: 12px;

  ${interactiveHoverCss}
`;

const DashboardProjectIcon = styled(ClientTitleLogo)`
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(228, 219, 208, 0.92);
  background: linear-gradient(145deg, #ede5d8, #f8f4ee);
  color: #8c7040;
  font-size: 0.76rem;
  font-weight: 700;
  object-fit: cover;
`;

const DashboardProjectCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: 2px;
`;

const DashboardProjectTitle = styled.strong`
  font-size: 0.82rem;
  line-height: 1.25;
`;

const DashboardProjectMeta = styled.span`
  color: var(--color-text-muted);
  font-size: 0.7rem;
  line-height: 1.35;
`;

const DashboardProjectPill = styled.span<{ $rank: number }>`
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: ${({ $rank }) =>
    $rank === 0
      ? "rgba(251, 239, 207, 0.96)"
      : $rank === 1
        ? "rgba(251, 231, 227, 0.98)"
        : $rank === 2
          ? "rgba(229, 244, 232, 0.98)"
          : $rank === 5
            ? "rgba(229, 244, 232, 0.98)"
          : $rank === 4
            ? "rgba(244, 241, 237, 0.98)"
            : "rgba(230, 239, 255, 0.98)"};
  color: ${({ $rank }) =>
    $rank === 0
      ? "#c58911"
      : $rank === 1
        ? "#d36c57"
        : $rank === 2
          ? "#1f4339"
          : $rank === 5
            ? "#5ca16d"
          : $rank === 4
            ? "#8d857b"
            : "#4770d8"};
  font-size: 0.65rem;
  font-weight: 700;
  white-space: nowrap;
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
  width: 134px;
  height: 134px;
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

const FeedbackLogo = styled(ClientTitleLogo)`
  width: 34px;
  height: 34px;
  border-radius: 10px;
  object-fit: cover;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: #f5efe5;
  color: var(--color-text-muted);
  font-size: 0.76rem;
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
  align-items: center;
`;

const ActivityTime = styled.span`
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 600;
  align-self: center;
`;

const ActivityUserAvatar = styled(UserAvatar)`
  width: 34px;
  height: 34px;
  border-radius: 10px;
  overflow: hidden;
  flex: 0 0 34px;
`;

const SystemAvatar = styled.div`
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: #f5efe5;
  color: var(--color-text-muted);
  font-size: 0.78rem;
  font-weight: 700;
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
    width: 260px;
    flex: 0 0 260px;
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

const ScrollableModalCard = styled(ModalCard)`
  width: min(100%, 720px);
  max-height: 80vh;
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

const ScrollableModalBody = styled.div`
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
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

const PanelActionButton = styled.button`
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
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

const TaskFloatingField = styled.label<{ $invalid?: boolean }>`
  min-width: 0;
  width: 100%;

  span {
    color: ${({ $invalid }) => ($invalid ? "#c04f42" : "inherit")};
  }
`;

const TaskTextInput = styled.input<{ $invalid?: boolean }>`
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
  box-shadow: ${({ $invalid }) => ($invalid ? "0 0 0 1px rgba(192, 79, 66, 0.12)" : "var(--shadow-sm)")};
  border-color: ${({ $invalid }) => ($invalid ? "#c04f42" : "rgba(230, 224, 215, 0.95)")};
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

const TaskFloatingSelect = styled.div<{ $filled?: boolean; $open?: boolean; $invalid?: boolean }>`
  position: relative;
  display: block;
  width: 100%;
  z-index: ${({ $open }) => ($open ? 8 : 2)};
`;

const TaskSelectTrigger = styled.button<{ $invalid?: boolean }>`
  width: 100%;
  min-height: 50px;
  padding: 16px 14px 10px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  box-shadow: ${({ $invalid }) => ($invalid ? "0 0 0 1px rgba(192, 79, 66, 0.12)" : "var(--shadow-sm)")};
  border-color: ${({ $invalid }) => ($invalid ? "#c04f42" : "rgba(230, 224, 215, 0.95)")};
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  font-size: 16px;
  text-align: left;
`;

const TaskFloatingLabel = styled.span<{ $invalid?: boolean }>`
  position: absolute;
  left: 16px;
  top: 1px;
  transform: translateY(-50%);
  padding: 0 6px;
  background: rgba(255, 255, 255, 0.96);
  color: ${({ $invalid }) => ($invalid ? "#c04f42" : "#29463e")};
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

const TaskToggleButton = styled.button`
  width: 100%;
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  text-align: left;
  cursor: pointer;
`;

const TaskToggleCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;

  strong {
    color: #2e2a27;
    font-size: 0.92rem;
  }

  span {
    color: var(--color-text-muted);
    font-size: 0.78rem;
    line-height: 1.4;
  }
`;

const TaskToggleTrack = styled.span<{ $active: boolean }>`
  width: 46px;
  height: 28px;
  border-radius: 999px;
  position: relative;
  flex: 0 0 auto;
  background: ${({ $active }) => ($active ? "#214f39" : "rgba(223, 214, 201, 0.95)")};
`;

const TaskToggleThumb = styled.span<{ $active: boolean }>`
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 8px 18px rgba(49, 35, 18, 0.16);
  transform: translateX(${({ $active }) => ($active ? "18px" : "0")});
  transition: transform 0.18s ease;
`;

const InlineError = styled.p`
  margin: 0;
  color: #c45649;
  font-size: 0.9rem;
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

const EmptyBlock = styled.div<{ $mobileMinHeight?: number; $desktopMinHeight?: number }>`
  flex: 1;
  min-height: ${({ $mobileMinHeight }) => ($mobileMinHeight ? `${$mobileMinHeight}px` : "inherit")};
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
  color: var(--color-text-muted);

  strong {
    display: block;
    color: var(--color-text);
    font-size: 0.86rem;
  }

  p {
    margin: 0;
    max-width: 28ch;
    font-size: 0.76rem;
    line-height: 1.5;
  }

  ${desktop} {
    min-height: ${({ $desktopMinHeight, $mobileMinHeight }) =>
      $desktopMinHeight ? `${$desktopMinHeight}px` : $mobileMinHeight ? `${$mobileMinHeight}px` : "inherit"};
  }
`;

const EmptyImage = styled.img`
  width: 70px;
  height: 70px;
  object-fit: contain;
  opacity: 0.92;

  ${desktop} {
    width: 82px;
    height: 82px;
  }
`;

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

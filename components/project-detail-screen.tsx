"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styled, { css } from "styled-components";
import { AppSidebar } from "@/components/app-sidebar";
import { useAppState } from "@/components/app-state";
import { ConfirmActionModal } from "@/components/confirm-action-modal";
import { DesignerTaskModal } from "@/components/designer-task-modal";
import { ProjectForm, ProjectFormValues } from "@/components/project-form";
import {
  canChangeWorkflow,
  canCreateTask,
  canDeleteProject,
  canDeleteTask,
  canEditProject,
  canEditTask,
  canUploadFiles,
  canViewProject,
  getVisibleTasksForUser,
} from "@/lib/permissions";
import {
  FeedbackAction,
  Project,
  ProjectStage,
  ProjectStatus,
  TaskPriority,
  TaskStatus,
  User,
} from "@/lib/types";
import {
  formatLabel,
  formatProjectStage,
  getProjectStatusLabel,
} from "@/lib/display";

const statuses: ProjectStatus[] = ["active", "review", "approved", "revision", "done"];
const stages: ProjectStage[] = ["intake", "concept", "design", "review", "delivery"];
const desktop = "@media (min-width: 1100px)";

type DerivedPriority = "high" | "medium" | "low";
type DerivedTaskStatus = "todo" | "in_progress" | "review" | "approved" | "completed";

type ActivityItem = {
  id: string;
  actor: string;
  detail: string;
  createdAt: string;
};

type FeedbackRow = {
  id: string;
  authorId: string;
  action: FeedbackAction;
  body: string;
  rating?: number | null;
  createdAt: string;
};

const timelineSteps = [
  { key: "intake", label: "Intake", stages: ["intake"] as ProjectStage[] },
  { key: "concept", label: "Concept", stages: ["concept"] as ProjectStage[] },
  { key: "design", label: "Design", stages: ["design"] as ProjectStage[] },
  { key: "review", label: "Review", stages: ["review"] as ProjectStage[] },
  { key: "delivery", label: "Delivery", stages: ["delivery"] as ProjectStage[] },
] as const;

const EMPTY_PROJECT: Project = {
  id: "",
  name: "",
  imageUrl: null,
  clientId: "",
  ownerId: "",
  description: "",
  category: "",
  stage: "intake",
  status: "active",
  dueDate: "",
  staffIds: [],
  tasks: [],
  files: [],
  comments: [],
  feedback: [],
  activities: [],
};

function formatDate(value: string) {
  if (!value) {
    return "TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
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
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
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

function getTaskStatusTone(status: DerivedTaskStatus) {
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

function getProjectStatusTone(status: ProjectStatus) {
  switch (status) {
    case "review":
      return { bg: "#fff1da", fg: "#ca8a22" };
    case "revision":
      return { bg: "#ffe7e5", fg: "#e06457" };
    case "approved":
      return { bg: "#e5f4e8", fg: "#5ca16d" };
    case "done":
      return { bg: "#e5f4e8", fg: "#2c6b43" };
    default:
      return { bg: "#e6efff", fg: "#4770d8" };
  }
}

function getFeedbackTone(action: FeedbackAction) {
  switch (action) {
    case "approve":
      return { bg: "#e5f4e8", fg: "#5ca16d", label: "Approved" };
    case "request_revision":
      return { bg: "#ffe7e5", fg: "#e06457", label: "Revision Requested" };
    default:
      return { bg: "#fff1da", fg: "#ca8a22", label: "Comment" };
  }
}

function getStatusAccent(status: ProjectStatus) {
  switch (status) {
    case "review":
      return "#ca8a22";
    case "revision":
      return "#e06457";
    case "approved":
      return "#5ca16d";
    case "done":
      return "#2c6b43";
    default:
      return "#4770d8";
  }
}

function getTimelineIndex(stage: ProjectStage) {
  return timelineSteps.findIndex((step) => step.stages.includes(stage));
}

function getStageBadgeLabel(stage: ProjectStage) {
  const matchedStep = timelineSteps.find((step) => step.stages.includes(stage));
  return matchedStep?.label ?? formatProjectStage(stage);
}

function getTimelineProgress(stage: ProjectStage) {
  const currentIndex = getTimelineIndex(stage);
  if (currentIndex <= 0) {
    return 0;
  }

  return (currentIndex / (timelineSteps.length - 1)) * 100;
}

function getUserInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "U";
}

function getProjectInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "P";
}

export function ProjectDetailScreen({ projectId }: { projectId: string }) {
  const router = useRouter();
  const {
    state,
    user,
    updateProject,
    deleteProject,
    updateProjectWorkflow,
    createTask,
    updateTask,
    updateTaskStatus,
    deleteTask,
    addFile,
    addComment,
    addFeedback,
  } = useAppState();
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [stage, setStage] = useState<ProjectStage>("intake");
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [showCreateTaskPanel, setShowCreateTaskPanel] = useState(false);
  const [showDeleteProjectModal, setShowDeleteProjectModal] = useState(false);
  const [showVersionPanel, setShowVersionPanel] = useState(false);
  const [showFeedbackPanel, setShowFeedbackPanel] = useState(false);
  const [showWorkspaceTools, setShowWorkspaceTools] = useState(false);
  const [isUpdatingProject, setIsUpdatingProject] = useState(false);
  const [workflowSelect, setWorkflowSelect] = useState<"status" | "stage" | null>(null);
  const [createTaskSelect, setCreateTaskSelect] = useState<"assignee" | "status" | null>(null);
  const [editTaskSelect, setEditTaskSelect] = useState<"assignee" | "status" | null>(null);
  const [projectDraft, setProjectDraft] = useState<ProjectFormValues>({
    name: "",
    description: "",
    category: "",
    dueDate: "",
    clientId: "",
  });
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState("");
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>("todo");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>("medium");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [activeDesignerTaskId, setActiveDesignerTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState("");
  const [editingTaskAssigneeId, setEditingTaskAssigneeId] = useState("");
  const [editingTaskStatus, setEditingTaskStatus] = useState<TaskStatus>("todo");
  const [editingTaskDueDate, setEditingTaskDueDate] = useState("");
  const [editingTaskPriority, setEditingTaskPriority] = useState<TaskPriority>("medium");
  const [editingTaskReviewAction, setEditingTaskReviewAction] = useState<"internal" | "submit" | "revise">(
    "internal",
  );
  const [editingTaskReviewComment, setEditingTaskReviewComment] = useState("");
  const [editingTaskError, setEditingTaskError] = useState("");
  const [isUpdatingTask, setIsUpdatingTask] = useState(false);
  const [versionTitle, setVersionTitle] = useState("");
  const [versionName, setVersionName] = useState("v1");
  const [versionNotes, setVersionNotes] = useState("");
  const [versionVisibility, setVersionVisibility] = useState<"client" | "internal">("client");
  const [feedbackAction, setFeedbackAction] = useState<FeedbackAction>("comment");
  const [feedbackBody, setFeedbackBody] = useState("");
  const [feedbackRating, setFeedbackRating] = useState(5);

  const projectRecord = useMemo(
    () => state.projects.find((candidate) => candidate.id === projectId) ?? null,
    [projectId, state.projects],
  );
  const canAccessProject = Boolean(user && projectRecord && canViewProject(user, projectRecord));
  const project = projectRecord ?? EMPTY_PROJECT;

  const userNames = useMemo(
    () => new Map(state.users.map((member) => [member.id, member.name])),
    [state.users],
  );
  const availableClients = state.users.filter((candidate) => candidate.role === "client");
  const availableStaff = state.users.filter((candidate) => candidate.role !== "client");
  const client = state.users.find((candidate) => candidate.id === project.clientId);
  const owner = state.users.find((candidate) => candidate.id === project.ownerId) ?? null;
  const canEditDetails = user ? canEditProject(user.role) : false;
  const canRemoveProject = user ? canDeleteProject(user.role) : false;
  const canManageTasks = user ? canCreateTask(user.role) : false;
  const canManageVersions = user ? canUploadFiles(user.role) : false;
  const canLeaveClientFeedback = user?.role === "client";
  const timelineIndex = getTimelineIndex(project.stage);
  const projectStatusTone = getProjectStatusTone(project.status);
  const visibleFiles =
    user?.role === "client"
      ? project.files.filter((file) => file.visibility === "client")
      : project.files;

  useEffect(() => {
    setStatus(project.status);
    setStage(project.stage);
    setNewTaskDueDate(project.dueDate);
    setProjectDraft({
      name: project.name,
      description: project.description,
      category: project.category,
      dueDate: project.dueDate,
      clientId: project.clientId,
    });
  }, [
    project.category,
    project.clientId,
    project.description,
    project.dueDate,
    project.name,
    project.stage,
    project.status,
  ]);

  const projectFormInitialValues = useMemo<ProjectFormValues>(
    () => ({
      name: project.name,
      description: project.description,
      category: project.category,
      dueDate: project.dueDate,
      clientId: project.clientId,
    }),
    [project.category, project.clientId, project.description, project.dueDate, project.name],
  );

  const assignedStaff = useMemo(() => {
    const unique = new Map<string, User>();

    project.staffIds.forEach((staffId) => {
      const member = state.users.find((candidate) => candidate.id === staffId);
      if (member) {
        unique.set(member.id, member);
      }
    });

    project.tasks.forEach((task) => {
      const member = state.users.find((candidate) => candidate.id === task.assigneeId);
      if (member) {
        unique.set(member.id, member);
      }
    });

    return [...unique.values()];
  }, [project.staffIds, project.tasks, state.users]);

  const visibleProjectTasks = useMemo(
    () => (user ? getVisibleTasksForUser(user, project) : []),
    [project, user],
  );
  const taskRows = useMemo(
    () =>
      visibleProjectTasks.map((task) => ({
        ...task,
        assignee: state.users.find((candidate) => candidate.id === task.assigneeId) ?? null,
        derivedStatus: deriveTaskStatus(task.status, project),
        dueDate: task.dueDate ?? project.dueDate,
        priority: task.priority ?? derivePriority(task.dueDate ?? project.dueDate, task.status),
      })),
    [project, state.users, visibleProjectTasks],
  );

  const latestVersion = visibleFiles[0] ?? null;
  const feedbackRows = [...project.feedback].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  ) as FeedbackRow[];
  const latestFeedback = feedbackRows[0] ?? null;

  const recentActivity = useMemo<ActivityItem[]>(() => {
    const items = [...project.activities]
      .map((item) => ({
        id: item.id,
        actor: item.actorId ? (userNames.get(item.actorId) ?? "Team member") : "System",
        detail: item.message,
        createdAt: item.createdAt,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return items.slice(0, 4);
  }, [project.activities, userNames]);

  const totalTasks = taskRows.length;
  const completedTasks = taskRows.filter(
    (task) => task.status === "done" || task.status === "review" || task.status === "approved",
  ).length;
  const openTasks = taskRows.filter((task) => task.status === "todo" || task.status === "in_progress").length;
  const overdueTasks = taskRows.filter(
    (task) =>
      (task.status === "todo" || task.status === "in_progress") &&
      startOfDay(new Date(task.dueDate)) < startOfDay(new Date()),
  ).length;
  const completionPercent = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const handleWorkflowSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsUpdatingProject(true);

    try {
      await updateProject(project.id, projectDraft);
      await updateProjectWorkflow(project.id, status, stage);
      setShowEditPanel(false);
    } finally {
      setIsUpdatingProject(false);
    }
  };

  const handleProjectDelete = async () => {
    await deleteProject(project.id);
    router.push("/projects");
  };

  const handleVersionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await addFile(project.id, {
      title: versionTitle.trim() || `${project.name} Update`,
      version: versionName.trim() || "v1",
      visibility: versionVisibility,
      notes: versionNotes.trim(),
    });
    setVersionTitle("");
    setVersionName("v1");
    setVersionNotes("");
    setVersionVisibility("client");
    setShowVersionPanel(false);
  };

  const handleFeedbackSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedBody = feedbackBody.trim();

    // Client -> server workflow transition to ensure status updates before we close the popup.
    // This avoids the issue where UI state doesn't reflect immediately and the modal can't be reopened.
    const transitionEndpoint = editingTask?.id
      ? `/api/workspace/projects/${project.id}/workflow/client-approval`
      : null;

    // Decide which server workflow decision to apply.
    if (feedbackAction !== "approve" && feedbackAction !== "request_revision") {
      setEditingTaskError("Please approve or request revision.");
      return;
    }

    const decision: "approve" | "request_revision" = feedbackAction;

    // Rules for client review flow:
    // - Approve requires rating (1-5)
    // - Request revision requires rating (1-5) and revision comment
    if (!Number.isInteger(feedbackRating) || feedbackRating < 1 || feedbackRating > 5) {
      setFeedbackRating(5);
      return;
    }

    // Must have the task being reviewed; server endpoint relies on it.
    if (!editingTask?.id) {
      return;
    }


    if (decision === "request_revision" && !trimmedBody) {
      setEditingTaskError("Please explain what needs to be revised.");
      return;
    }

    // Ensure client can only submit while the task is in review.
    if (!editingTask || user?.role !== "client" || editingTask.status !== "review") {
      return;
    }





    // Submit server workflow decision FIRST so workflow state updates immediately.
    // This endpoint is client-safe and will validate task/project consistency.
    try {
      if (transitionEndpoint && decision) {
        // App backend auth expects a workspace access token.
        // Existing state actions (useAppState) include it via `apiRequest` in app-state.tsx.
        // Here we mirror that by using the browser supabase session.
        const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
        const supabase = getSupabaseBrowserClient();
        if (!supabase) {
          throw new Error("Supabase client is not configured");
        }

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          throw new Error("Missing authorization token");
        }

        const response = await fetch(transitionEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            taskId: editingTask.id,
            decision,
            revisionComment:
              decision === "request_revision" ? trimmedBody : undefined,
          }),
        });


        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Unable to update workflow status.");
        }
      }
    } catch (error) {
      setEditingTaskError(error instanceof Error ? error.message : "Unable to update workflow.");
      return;
    }

    // Then store feedback (keeps existing feedback timeline).
    await addFeedback(project.id, {
      action: feedbackAction,
      body: trimmedBody,
      rating: feedbackRating,
    });

    // Close the modal immediately so the user cannot click again.
    setFeedbackAction("approve");
    setFeedbackBody("");
    setFeedbackRating(5);
    setShowFeedbackPanel(false);
    setEditingTaskId(null);


    // IMPORTANT: status change is driven by the manager workflow in this app.
    // Client review updates the task workflow through the client-approval endpoint.
    // Feedback is stored separately in `project_feedback` for history/timeline.
  };



  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await createTask(project.id, {
      title: newTaskTitle,
      assigneeId: newTaskAssigneeId,
      status: newTaskStatus,
      dueDate: newTaskDueDate,
      priority: newTaskPriority,
    });
    setNewTaskTitle("");
    setNewTaskAssigneeId("");
    setNewTaskStatus("todo");
    setNewTaskDueDate(project.dueDate);
    setNewTaskPriority("medium");
    setShowCreateTaskPanel(false);
  };

  const startEditingTask = (taskId: string) => {
    const task = project.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      return;
    }

    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
    setEditingTaskAssigneeId(task.assigneeId);
    setEditingTaskStatus(task.status);
    setEditingTaskDueDate(task.dueDate ?? project.dueDate);
    setEditingTaskPriority(task.priority ?? derivePriority(task.dueDate ?? project.dueDate, task.status));
    setEditingTaskReviewAction(task.clientVisible ? "submit" : "internal");
    setEditingTaskReviewComment("");
    setEditingTaskError("");

    // Important: client deliverable review should default to approve.
    // Otherwise the select may visually show Approve while state is still "comment".
    if (user?.role === "client" && task.status === "review") {
      setFeedbackAction("approve");
      setFeedbackBody("");
      setFeedbackRating(5);
    }
  };

  const handleTaskUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingTaskId) {
      return;
    }

    if (
      editingTask?.completionScreenshotUrl &&
      editingTaskReviewAction === "revise" &&
      !editingTaskReviewComment.trim()
    ) {
      setEditingTaskError("Add a revision comment before sending the task back.");
      return;
    }

    setIsUpdatingTask(true);
    setEditingTaskError("");

    try {
      const nextStatus =
        editingTask?.completionScreenshotUrl && editingTaskReviewAction === "revise"
          ? "in_progress"
          : editingTask?.completionScreenshotUrl && editingTaskReviewAction === "submit"
            ? editingTask.status === "review"
              ? "approved"
              : "review"
            : editingTask?.completionScreenshotUrl && editingTaskReviewAction === "internal"
              ? "done"
          : editingTaskStatus;

      const nextClientVisible =
        editingTask?.completionScreenshotUrl && editingTaskReviewAction === "submit"
          ? true
          : editingTask?.completionScreenshotUrl && editingTaskReviewAction === "internal"
            ? false
            : editingTask?.clientVisible ?? false;

      const nextManagerReviewStatus =
        editingTask?.completionScreenshotUrl && editingTaskReviewAction === "submit"
          ? "ready_for_client"
          : editingTask?.completionScreenshotUrl && editingTaskReviewAction === "revise"
            ? "revision_requested"
            : "internal";

      await updateTask(project.id, editingTaskId, {
        title: editingTaskTitle,
        assigneeId: editingTaskAssigneeId,
        status: nextStatus,
        dueDate: editingTaskDueDate,
        priority: editingTaskPriority,
        clientVisible: nextClientVisible,
        managerReviewStatus: nextManagerReviewStatus,
        activityNote:
          editingTask?.completionScreenshotUrl && editingTaskReviewAction === "revise"
            ? editingTaskReviewComment.trim()
            : undefined,
      });

      setEditingTaskId(null);
      setEditingTaskReviewAction("internal");
      setEditingTaskReviewComment("");
    } catch (error) {
      setEditingTaskError(error instanceof Error ? error.message : "Unable to update task.");
    } finally {
      setIsUpdatingTask(false);
    }
  };

  const editingTask = editingTaskId
    ? taskRows.find((task) => task.id === editingTaskId) ?? null
    : null;
  const activeDesignerTask = activeDesignerTaskId
    ? taskRows.find((task) => task.id === activeDesignerTaskId) ?? null
    : null;

  if (!user || !projectRecord || !canAccessProject) {
    return (
      <main className="page-stack">
        <section className="panel">
          <p>Project not found or not accessible from this role.</p>
          <Link href="/projects">Return to projects</Link>
        </section>
      </main>
    );
  }

  return (
    <>
      {isUpdatingProject || isUpdatingTask ? (
        <TaskUpdateLoadingOverlay role="status" aria-live="polite">
          <div className="auth-loading-card">
            <div className="auth-loading-spinner" aria-hidden="true" />
            <p>{isUpdatingTask ? "Updating task..." : "Updating project..."}</p>
          </div>
        </TaskUpdateLoadingOverlay>
      ) : null}

      <ConfirmActionModal
        open={showDeleteProjectModal}
        title="Delete project"
        description="This will remove the project and all of its tasks, files, comments, and feedback."
        confirmLabel="Delete project"
        tone="danger"
        onCancel={() => setShowDeleteProjectModal(false)}
        onConfirm={async () => {
          await handleProjectDelete();
          setShowDeleteProjectModal(false);
        }}
      />
      <DesignerTaskModal
        open={Boolean(activeDesignerTask && user.role === "designer")}
        task={
          activeDesignerTask
            ? {
                id: activeDesignerTask.id,
                title: activeDesignerTask.title,
                projectId: project.id,
                projectName: project.name,
                dueDate: activeDesignerTask.dueDate,
                status: activeDesignerTask.status,
                completionScreenshotUrl: activeDesignerTask.completionScreenshotUrl ?? null,
                managerReviewStatus: activeDesignerTask.managerReviewStatus,
              }
            : null
        }
        onClose={() => setActiveDesignerTaskId(null)}
        onSubmit={async (payload) => {
          await updateTaskStatus(payload.projectId, payload.taskId, {
            status: payload.status,
            completionScreenshotUrl: payload.completionScreenshotUrl ?? null,
          });
        }}
      />

      {showEditPanel ? (
        <ModalBackdrop onClick={() => setShowEditPanel(false)}>
          <ModalCard onClick={(event) => event.stopPropagation()}>
            <ModalHeader>
              <div>
                <ModalTitle>Update project</ModalTitle>
                <ModalDescription>Adjust the project details and workflow from one place.</ModalDescription>
              </div>
              <ModalClose type="button" onClick={() => setShowEditPanel(false)} aria-label="Close">
                <IconClose />
              </ModalClose>
            </ModalHeader>
            <ProjectForm
              initialValues={projectFormInitialValues}
              clients={availableClients}
              submitLabel="Save Project"
              onSubmit={async () => {}}
              hideActions
              onValuesChange={setProjectDraft}
            />
            {canChangeWorkflow(user.role) ? (
              <InlineForm onSubmit={handleWorkflowSubmit}>
                <InlineFormTitle>Workflow</InlineFormTitle>
                <TaskModalGrid>
                  <TaskModalField>
                    <TaskFloatingSelect $filled $open={workflowSelect === "status"}>
                      <TaskSelectTrigger
                        type="button"
                        aria-haspopup="listbox"
                        aria-expanded={workflowSelect === "status"}
                        onClick={() =>
                          setWorkflowSelect((current) => (current === "status" ? null : "status"))
                        }
                      >
                        <TaskSelectValue>{getProjectStatusLabel(status)}</TaskSelectValue>
                        <TaskSelectChevron $open={workflowSelect === "status"}>
                          <IconChevronDown />
                        </TaskSelectChevron>
                      </TaskSelectTrigger>
                      <TaskFloatingLabel>Status</TaskFloatingLabel>
                      {workflowSelect === "status" ? (
                        <TaskSelectMenu role="listbox" aria-label="Project status">
                          {statuses.map((option) => (
                            <TaskSelectOption
                              key={option}
                              type="button"
                              role="option"
                              aria-selected={status === option}
                              $active={status === option}
                              onClick={() => {
                                setStatus(option);
                                setWorkflowSelect(null);
                              }}
                            >
                              {getProjectStatusLabel(option)}
                            </TaskSelectOption>
                          ))}
                        </TaskSelectMenu>
                      ) : null}
                    </TaskFloatingSelect>
                  </TaskModalField>

                  <TaskModalField>
                    <TaskFloatingSelect $filled $open={workflowSelect === "stage"}>
                      <TaskSelectTrigger
                        type="button"
                        aria-haspopup="listbox"
                        aria-expanded={workflowSelect === "stage"}
                        onClick={() =>
                          setWorkflowSelect((current) => (current === "stage" ? null : "stage"))
                        }
                      >
                        <TaskSelectValue>{formatProjectStage(stage)}</TaskSelectValue>
                        <TaskSelectChevron $open={workflowSelect === "stage"}>
                          <IconChevronDown />
                        </TaskSelectChevron>
                      </TaskSelectTrigger>
                      <TaskFloatingLabel>Stage</TaskFloatingLabel>
                      {workflowSelect === "stage" ? (
                        <TaskSelectMenu role="listbox" aria-label="Project stage">
                          {stages.map((option) => (
                            <TaskSelectOption
                              key={option}
                              type="button"
                              role="option"
                              aria-selected={stage === option}
                              $active={stage === option}
                              onClick={() => {
                                setStage(option);
                                setWorkflowSelect(null);
                              }}
                            >
                              {formatProjectStage(option)}
                            </TaskSelectOption>
                          ))}
                        </TaskSelectMenu>
                      ) : null}
                    </TaskFloatingSelect>
                  </TaskModalField>
                </TaskModalGrid>
                <button className="primary-button" type="submit" disabled={isUpdatingProject}>
                  {isUpdatingProject ? "Updating..." : "Update workflow"}
                </button>
              </InlineForm>
            ) : null}
          </ModalCard>
        </ModalBackdrop>
      ) : null}

      {showCreateTaskPanel && canManageTasks ? (
        <ModalBackdrop onClick={() => setShowCreateTaskPanel(false)}>
          <ModalCard onClick={(event) => event.stopPropagation()}>
            <ModalHeader>
              <div>
                <ModalTitle>Create task</ModalTitle>
                <ModalDescription>Add a new task without leaving the detail view.</ModalDescription>
              </div>
              <ModalClose type="button" onClick={() => setShowCreateTaskPanel(false)} aria-label="Close">
                <IconClose />
              </ModalClose>
            </ModalHeader>
            <InlineForm onSubmit={handleCreateTask}>
              <TaskModalGrid>
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
                  <TaskFloatingSelect $filled={Boolean(newTaskAssigneeId)} $open={createTaskSelect === "assignee"}>
                    <TaskSelectTrigger
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={createTaskSelect === "assignee"}
                      onClick={() =>
                        setCreateTaskSelect((current) => (current === "assignee" ? null : "assignee"))
                      }
                    >
                      <TaskSelectValue>
                        {availableStaff.find((member) => member.id === newTaskAssigneeId)?.name ?? "Select staff"}
                      </TaskSelectValue>
                      <TaskSelectChevron $open={createTaskSelect === "assignee"}>
                        <IconChevronDown />
                      </TaskSelectChevron>
                    </TaskSelectTrigger>
                    <TaskFloatingLabel>Assignee</TaskFloatingLabel>
                    {createTaskSelect === "assignee" ? (
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
                              setCreateTaskSelect(null);
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
                  <TaskFloatingSelect $filled $open={createTaskSelect === "status"}>
                    <TaskSelectTrigger
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={createTaskSelect === "status"}
                      onClick={() =>
                        setCreateTaskSelect((current) => (current === "status" ? null : "status"))
                      }
                    >
                      <TaskSelectValue>{formatLabel(newTaskStatus)}</TaskSelectValue>
                      <TaskSelectChevron $open={createTaskSelect === "status"}>
                        <IconChevronDown />
                      </TaskSelectChevron>
                    </TaskSelectTrigger>
                    <TaskFloatingLabel>Status</TaskFloatingLabel>
                    {createTaskSelect === "status" ? (
                      <TaskSelectMenu role="listbox" aria-label="Status">
                        {(["todo", "in_progress", "done", "review", "approved"] as TaskStatus[]).map((option) => (
                          <TaskSelectOption
                            key={option}
                            type="button"
                            role="option"
                            aria-selected={newTaskStatus === option}
                            $active={newTaskStatus === option}
                            onClick={() => {
                              setNewTaskStatus(option);
                              setCreateTaskSelect(null);
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
                  <TaskFloatingField className={newTaskDueDate ? "auth-field is-filled" : "auth-field"}>
                    <TaskTextInput
                      type="date"
                      value={newTaskDueDate}
                      onChange={(event) => setNewTaskDueDate(event.target.value)}
                      placeholder=" "
                      required
                    />
                    <span>Due date</span>
                  </TaskFloatingField>
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
              <button className="primary-button" type="submit">
                Add task
              </button>
            </InlineForm>
          </ModalCard>
        </ModalBackdrop>
      ) : null}

      {showVersionPanel && canManageVersions ? (
        <ModalBackdrop onClick={() => setShowVersionPanel(false)}>
          <ModalCard onClick={(event) => event.stopPropagation()}>
            <ModalHeader>
              <div>
                <ModalTitle>Update latest version</ModalTitle>
                <ModalDescription>Publish the newest project deliverable for review.</ModalDescription>
              </div>
              <ModalClose type="button" onClick={() => setShowVersionPanel(false)} aria-label="Close">
                <IconClose />
              </ModalClose>
            </ModalHeader>
            <InlineForm onSubmit={handleVersionSubmit}>
              <label className="field">
                <span>Version title</span>
                <input
                  value={versionTitle}
                  onChange={(event) => setVersionTitle(event.target.value)}
                  placeholder="Homepage concept, logo revision, final deck..."
                  required
                />
              </label>
              <div className="field-row">
                <label className="field">
                  <span>Version name</span>
                  <input
                    value={versionName}
                    onChange={(event) => setVersionName(event.target.value)}
                    placeholder="v2"
                    required
                  />
                </label>
                <label className="field">
                  <span>Visibility</span>
                  <select
                    value={versionVisibility}
                    onChange={(event) => setVersionVisibility(event.target.value as "client" | "internal")}
                  >
                    <option value="client">Client visible</option>
                    <option value="internal">Internal only</option>
                  </select>
                </label>
              </div>
              <label className="field">
                <span>Notes</span>
                <textarea
                  value={versionNotes}
                  onChange={(event) => setVersionNotes(event.target.value)}
                  rows={4}
                  placeholder="What changed in this version?"
                />
              </label>
              <button className="primary-button" type="submit">
                Publish version
              </button>
            </InlineForm>
          </ModalCard>
        </ModalBackdrop>
      ) : null}

      {showFeedbackPanel && canLeaveClientFeedback ? (
        <ModalBackdrop onClick={() => setShowFeedbackPanel(false)}>
          <ModalCard onClick={(event) => event.stopPropagation()}>
              <ModalHeader>
              <div>
                <ModalTitle>Client feedback</ModalTitle>
                <ModalDescription>Rate the latest version and approve it or request changes.</ModalDescription>
              </div>
              <ModalClose type="button" onClick={() => setShowFeedbackPanel(false)} aria-label="Close">
                <IconClose />
              </ModalClose>
            </ModalHeader>
            <InlineForm onSubmit={handleFeedbackSubmit}>
              <label className="field">
                <span>Decision</span>
                <select
                  value={feedbackAction}
                  onChange={(event) => {
                    const nextAction = event.target.value as "approve" | "request_revision";
                    setFeedbackAction(nextAction);
                    setEditingTaskError("");

                    if (nextAction === "approve") {
                      setFeedbackBody("");
                    }
                  }}>
                  <option value="approve">Approve</option>
                  <option value="request_revision">Request revision</option>
                </select>
              </label>

              <PriorityField>
                <MetaLabel>Rating</MetaLabel>
                <RatingChips>
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <RatingChip
                      key={rating}
                      type="button"
                      $active={feedbackRating === rating}
                      onClick={() => setFeedbackRating(rating)}
                    >
                      {rating} Star{rating === 1 ? "" : "s"}
                    </RatingChip>
                  ))}
                </RatingChips>
              </PriorityField>

              {feedbackAction === "request_revision" ? (
                <label className="field">
                  <span>Revision comment</span>
                  <textarea
                    value={feedbackBody}
                    onChange={(event) => setFeedbackBody(event.target.value)}
                    rows={4}
                    placeholder="Please explain what needs to be revised."
                    required
                  />
                </label>
              ) : (
                <label className="field">
                  <span>Comment</span>
                  <textarea
                    value={feedbackBody}
                    onChange={(event) => setFeedbackBody(event.target.value)}
                    rows={4}
                    placeholder="Optional — add context for your decision."
                  />
                </label>
              )}

              <button className="primary-button" type="submit">
                Submit feedback
              </button>
            </InlineForm>
          </ModalCard>
        </ModalBackdrop>
      ) : null}

      {editingTask && canManageTasks ? (
        <ModalBackdrop onClick={() => setEditingTaskId(null)}>
          <ModalCard onClick={(event) => event.stopPropagation()}>
            <ModalHeader>
              <div>
                <ModalTitle>Edit task</ModalTitle>
                <ModalDescription>Update the task details from this popup.</ModalDescription>
              </div>
              <ModalClose type="button" onClick={() => setEditingTaskId(null)} aria-label="Close">
                <IconClose />
              </ModalClose>
            </ModalHeader>
            <InlineForm onSubmit={handleTaskUpdate}>
              <TaskModalGrid>
                <TaskModalField $wide>
                  <TaskFloatingField className={editingTaskTitle ? "auth-field is-filled" : "auth-field"}>
                    <TaskTextInput
                      value={editingTaskTitle}
                      onChange={(event) => setEditingTaskTitle(event.target.value)}
                      placeholder=" "
                      required
                    />
                    <span>Task title</span>
                  </TaskFloatingField>
                </TaskModalField>

                <TaskModalField>
                  <TaskFloatingSelect $filled={Boolean(editingTaskAssigneeId)} $open={editTaskSelect === "assignee"}>
                    <TaskSelectTrigger
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={editTaskSelect === "assignee"}
                      onClick={() => setEditTaskSelect((current) => (current === "assignee" ? null : "assignee"))}
                    >
                      <TaskSelectValue>
                        {availableStaff.find((member) => member.id === editingTaskAssigneeId)?.name ?? "Select staff"}
                      </TaskSelectValue>
                      <TaskSelectChevron $open={editTaskSelect === "assignee"}>
                        <IconChevronDown />
                      </TaskSelectChevron>
                    </TaskSelectTrigger>
                    <TaskFloatingLabel>Assignee</TaskFloatingLabel>
                    {editTaskSelect === "assignee" ? (
                      <TaskSelectMenu role="listbox" aria-label="Assignee">
                        {availableStaff.map((member) => (
                          <TaskSelectOption
                            key={member.id}
                            type="button"
                            role="option"
                            aria-selected={editingTaskAssigneeId === member.id}
                            $active={editingTaskAssigneeId === member.id}
                            onClick={() => {
                              setEditingTaskAssigneeId(member.id);
                              setEditTaskSelect(null);
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
                  <TaskFloatingSelect $filled $open={editTaskSelect === "status"}>
                    <TaskSelectTrigger
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={editTaskSelect === "status"}
                      onClick={() => setEditTaskSelect((current) => (current === "status" ? null : "status"))}
                    >
                      <TaskSelectValue>{formatLabel(editingTaskStatus)}</TaskSelectValue>
                      <TaskSelectChevron $open={editTaskSelect === "status"}>
                        <IconChevronDown />
                      </TaskSelectChevron>
                    </TaskSelectTrigger>
                    <TaskFloatingLabel>Status</TaskFloatingLabel>
                    {editTaskSelect === "status" ? (
                      <TaskSelectMenu role="listbox" aria-label="Status">
                        {(["todo", "in_progress", "done"] as TaskStatus[]).map((option) => (
                          <TaskSelectOption
                            key={option}
                            type="button"
                            role="option"
                            aria-selected={editingTaskStatus === option}
                            $active={editingTaskStatus === option}
                            onClick={() => {
                              setEditingTaskStatus(option);
                              setEditTaskSelect(null);
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
                  <TaskFloatingField className={editingTaskDueDate ? "auth-field is-filled" : "auth-field"}>
                    <TaskTextInput
                      type="date"
                      value={editingTaskDueDate}
                      onChange={(event) => setEditingTaskDueDate(event.target.value)}
                      placeholder=" "
                      required
                    />
                    <span>Due date</span>
                  </TaskFloatingField>
                </TaskModalField>
              </TaskModalGrid>
              {editingTask.completionScreenshotUrl ? (
                <TaskDeliveryReview>
                  <InlineFormTitle>Latest uploaded image</InlineFormTitle>
                  <TaskDeliveryPreviewWrap>
                    <TaskDeliveryPreview
                      src={editingTask.completionScreenshotUrl}
                      alt={`Latest uploaded image for ${editingTask.title}`}
                    />
                  </TaskDeliveryPreviewWrap>
                  <TaskReviewActions>
                    <TaskReviewActionButton
                      type="button"
                      $active={editingTaskReviewAction === "internal"}
                      onClick={() => {
                        setEditingTaskReviewAction("internal");
                        setEditingTaskError("");
                      }}
                    >
                      Keep internal
                    </TaskReviewActionButton>
                    <TaskReviewActionButton
                      type="button"
                      $active={editingTaskReviewAction === "submit"}
                      onClick={() => {
                        setEditingTaskReviewAction("submit");
                        setEditingTaskError("");
                      }}
                    >
                      {editingTask.status === "review" ? "Approve" : "Send to client"}
                    </TaskReviewActionButton>
                    <TaskReviewActionButton
                      type="button"
                      $active={editingTaskReviewAction === "revise"}
                      onClick={() => {
                        setEditingTaskReviewAction("revise");
                        setEditingTaskError("");
                      }}
                    >
                      Revise
                    </TaskReviewActionButton>
                  </TaskReviewActions>
                  {editingTaskReviewAction === "revise" ? (
                    <label className="field">
                      <span>Revision comment</span>
                      <textarea
                        value={editingTaskReviewComment}
                        onChange={(event) => setEditingTaskReviewComment(event.target.value)}
                        rows={4}
                        placeholder="Explain what needs to change before this can be submitted."
                        required
                      />
                    </label>
                  ) : null}
                </TaskDeliveryReview>
              ) : null}
              <PriorityField>
                <MetaLabel>Priority</MetaLabel>
                <PriorityChips>
                  {(["high", "medium", "low"] as TaskPriority[]).map((priority) => (
                    <PriorityChip
                      key={priority}
                      type="button"
                      $tone={priority}
                      $active={editingTaskPriority === priority}
                      onClick={() => setEditingTaskPriority(priority)}
                    >
                      {formatLabel(priority)}
                    </PriorityChip>
                  ))}
                </PriorityChips>
              </PriorityField>
              {editingTaskError ? <TaskInlineError>{editingTaskError}</TaskInlineError> : null}
              <CompactActions>
                <button className="primary-button" type="submit">
                  {editingTask?.completionScreenshotUrl
                    ? editingTaskReviewAction === "revise"
                      ? "Send revision"
                      : editingTaskReviewAction === "submit"
                        ? editingTask.status === "review"
                          ? "Approve"
                          : "Send to client"
                        : "Keep internal"
                    : "Save task"}
                </button>
                {canDeleteTask(user.role) ? (
                  <button
                    type="button"
                    className="segment"
                    onClick={async () => {
                      await deleteTask(project.id, editingTask.id);
                      setEditingTaskId(null);
                    }}
                  >
                    Delete
                  </button>
                ) : null}
              </CompactActions>
            </InlineForm>
          </ModalCard>
        </ModalBackdrop>
      ) : null}

      {editingTask &&
        user &&
        user.role === "client" &&
        editingTask.status === "review" &&
        editingTask.clientVisible ? (
        <ModalBackdrop onClick={() => setEditingTaskId(null)}>

          <ModalCard onClick={(event) => event.stopPropagation()}>
            <ModalHeader>
              <div>
                <ModalTitle>Deliverable review</ModalTitle>
                <ModalDescription>View the latest screenshot, rate it, and approve or request revision.</ModalDescription>
              </div>
              <ModalClose type="button" onClick={() => setEditingTaskId(null)} aria-label="Close">
                <IconClose />
              </ModalClose>
            </ModalHeader>

            {editingTask.completionScreenshotUrl ? (
              <TaskDeliveryPreviewWrap>
                <TaskDeliveryPreview
                  src={editingTask.completionScreenshotUrl}
                  alt={`Task completion screenshot for ${editingTask.title}`}
                />
              </TaskDeliveryPreviewWrap>
            ) : null}

            <InlineForm
              onSubmit={(event) => {
                const formEvent = event as FormEvent<HTMLFormElement>;
                return handleFeedbackSubmit(formEvent);
              }}
            >
              <label className="field">
                <span>Decision</span>
                <select
                  value={feedbackAction === "request_revision" ? "request_revision" : "approve"}
                  onChange={(event) => {
                    const nextAction = event.target.value as "approve" | "request_revision";
                    setFeedbackAction(nextAction);
                    setEditingTaskError("");

                    if (nextAction === "approve") {
                      setFeedbackBody("");
                    }
                  }}
                >
                  <option value="approve">Approve</option>
                  <option value="request_revision">Request revision</option>
                </select>
              </label>

              <PriorityField>
                <MetaLabel>Rating</MetaLabel>
                <RatingChips>
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <RatingChip
                      key={rating}
                      type="button"
                      $active={feedbackRating === rating}
                      onClick={() => setFeedbackRating(rating)}
                    >
                      {rating} Star{rating === 1 ? "" : "s"}
                    </RatingChip>
                  ))}
                </RatingChips>
              </PriorityField>

              {feedbackAction === "request_revision" ? (
                <label className="field">
                  <span>Revision comment</span>
                  <textarea
                    value={feedbackBody}
                    onChange={(event) => setFeedbackBody(event.target.value)}
                    rows={4}
                    placeholder="Please explain what needs to be revised."
                    required
                  />
                </label>
              ) : null}

              {feedbackAction === "approve" ? (
                <label className="field">
                  <span>Comment (optional)</span>
                  <textarea
                    value={feedbackBody}
                    onChange={(event) => setFeedbackBody(event.target.value)}
                    rows={3}
                    placeholder="Optional — add context for your decision."
                  />
                </label>
              ) : null}

              {editingTaskError ? <TaskInlineError>{editingTaskError}</TaskInlineError> : null}

              <button className="primary-button" type="submit">
                Submit review
              </button>
            </InlineForm>
          </ModalCard>
        </ModalBackdrop>
      ) : null}


      <Shell>
        <AppSidebar user={user} activeLabel="Projects" />

        <Content>
          <ContentInner>
      <TopBar>
        <MobileNavRow>
          <BackIconButton as={Link} href="/projects" aria-label="Back to projects">
            <IconChevronLeft />
          </BackIconButton>
          <MobileTitle>{project.name}</MobileTitle>
          <MobileNavSpacer />
        </MobileNavRow>

        <DesktopHeaderRow>
          <Breadcrumbs>
            <Link href="/projects">Projects</Link>
            <span>/</span>
            <strong>{project.name}</strong>
          </Breadcrumbs>
          <HeaderActionRow>
            {canEditDetails ? (
              <ActionButton type="button" onClick={() => setShowEditPanel((current) => !current)}>
                <IconPencil />
                {showEditPanel ? "Close" : "Update Project"}
              </ActionButton>
            ) : null}
            {canRemoveProject ? (
              <DangerActionButton type="button" onClick={() => setShowDeleteProjectModal(true)}>
                <IconTrash />
                Delete
              </DangerActionButton>
            ) : null}
            {canManageTasks ? (
              <PrimaryActionButton
                type="button"
                onClick={() => setShowCreateTaskPanel((current) => !current)}
              >
                <IconPlus />
                {showCreateTaskPanel ? "Close Task Form" : "Create Task"}
              </PrimaryActionButton>
            ) : null}
          </HeaderActionRow>
        </DesktopHeaderRow>
      </TopBar>

      <HeroCard>
        <HeroTop>
          <ProjectGlyph>
            <IconCloudMark />
            <FallbackLetter>{getProjectInitial(project.name)}</FallbackLetter>
          </ProjectGlyph>

          <HeroCopy>
            <HeroTitleRow>
              <HeroTitle>{project.name}</HeroTitle>
              <MobileStatusPills>
                <Badge style={{ background: projectStatusTone.bg, color: projectStatusTone.fg }}>
                  {getProjectStatusLabel(project.status)}
                </Badge>
                <Badge style={{ background: "rgba(244, 241, 237, 1)", color: "#7f7468" }}>
                  {getStageBadgeLabel(project.stage)}
                </Badge>
              </MobileStatusPills>
            </HeroTitleRow>

            <DesktopMetaGrid>
              <MetaBlock>
                <MetaLabel>Client</MetaLabel>
                <MetaValue>{client?.name ?? "Unassigned client"}</MetaValue>
              </MetaBlock>
              <MetaBlock>
                <MetaLabel>Status</MetaLabel>
                <Badge style={{ background: projectStatusTone.bg, color: projectStatusTone.fg }}>
                  {getProjectStatusLabel(project.status)}
                </Badge>
              </MetaBlock>
              <MetaBlock>
                <MetaLabel>Due Date</MetaLabel>
                <MetaValue>
                  <InlineIcon>
                    <IconCalendarMini />
                  </InlineIcon>
                  {formatDate(project.dueDate)}
                </MetaValue>
              </MetaBlock>
              <MetaBlock>
                <MetaLabel>Created By</MetaLabel>
                <PersonRow>
                  <AvatarCircle>{getUserInitial(owner?.name ?? "Manager")}</AvatarCircle>
                  <span>{owner?.name ?? "Team Manager"}</span>
                </PersonRow>
              </MetaBlock>
              <MetaBlock>
                <MetaLabel>Assigned Staff</MetaLabel>
                <AvatarStack>
                  {assignedStaff.length ? (
                    <>
                      {assignedStaff.slice(0, 3).map((member) => (
                        <StackAvatar key={member.id}>{getUserInitial(member.name)}</StackAvatar>
                      ))}
                      {assignedStaff.length > 3 ? (
                        <StackCount>+{assignedStaff.length - 3}</StackCount>
                      ) : null}
                    </>
                  ) : (
                    <MetaMuted>Task-level only</MetaMuted>
                  )}
                </AvatarStack>
              </MetaBlock>
            </DesktopMetaGrid>

          
          </HeroCopy>
            <MobileInfoGrid>
              <CompactInfo>
                <CompactIconWrap>
                  <IconClient />
                </CompactIconWrap>
                <div>
                  <MetaLabel>Client</MetaLabel>
                  <MetaValueText>{client?.name ?? "Unassigned client"}</MetaValueText>
                </div>
              </CompactInfo>
              <CompactInfo>
                <CompactIconWrap>
                  <IconCalendarMini />
                </CompactIconWrap>
                <div>
                  <MetaLabel>Due Date</MetaLabel>
                  <MetaValueText>{formatDate(project.dueDate)}</MetaValueText>
                </div>
              </CompactInfo>
              <CompactInfo>
                <CompactIconWrap>
                  <IconFolderMini />
                </CompactIconWrap>
                <div>
                  <MetaLabel>Project Type</MetaLabel>
                  <MetaValueText>{project.category}</MetaValueText>
                </div>
              </CompactInfo>
              <CompactInfo>
                <CompactIconWrap>
                  <AvatarCircle>{getUserInitial(owner?.name ?? "Manager")}</AvatarCircle>
                </CompactIconWrap>
                <div>
                  <MetaLabel>Created By</MetaLabel>
                  <MetaValueText>{owner?.name ?? "Team Manager"}</MetaValueText>
                </div>
              </CompactInfo>
            </MobileInfoGrid>
        </HeroTop>

        <BriefAndTimeline>
          <BriefBlock>
            <MetaLabel>Project Brief</MetaLabel>
            <BriefCopy>{project.description}</BriefCopy>
          </BriefBlock>

          <TimelineBlock>
            <TimelineRail $tone={project.status} $progress={getTimelineProgress(project.stage)} />
            <TimelineSteps>
              {timelineSteps.map((step, index) => {
                const done = index < timelineIndex;
                const current = index === timelineIndex;

                return (
                  <TimelineStep key={step.key}>
                    <TimelineNode $done={done} $current={current} $tone={project.status}>
                      {done ? <IconCheckTiny /> : null}
                    </TimelineNode>
                    <TimelineLabel>{step.label}</TimelineLabel>
                  </TimelineStep>
                );
              })}
            </TimelineSteps>
          </TimelineBlock>
        </BriefAndTimeline>
      </HeroCard>

      <MobileActionRow>
        {canEditDetails ? (
          <ActionButton type="button" onClick={() => setShowEditPanel((current) => !current)}>
            <IconPencil />
            Update
          </ActionButton>
        ) : null}
        {canRemoveProject ? (
          <DangerActionButton type="button" onClick={() => setShowDeleteProjectModal(true)}>
            <IconTrash />
            Delete
          </DangerActionButton>
        ) : null}
        {canManageTasks ? (
          <PrimaryActionButton type="button" onClick={() => setShowCreateTaskPanel((current) => !current)}>
            <IconPlus />
            Create Task
          </PrimaryActionButton>
        ) : null}
      </MobileActionRow>

      <ContentGrid>
        <MainColumn>
          <TasksSection className="panel" id="project-tasks">
            <PanelHeader>
              <h2>Project Tasks</h2>
              <InlineLink as={Link} href="/tasks">
                View all tasks
                <IconArrowRight />
              </InlineLink>
            </PanelHeader>

            <DesktopTaskTable>
              <TaskTableHeader>
                <span />
                <span>Task</span>
                <span>Assignee</span>
                <span>Status</span>
                <span>Priority</span>
                <span>Due Date</span>
              </TaskTableHeader>
              {taskRows.length ? (
                taskRows.map((task) => {
                  const statusTone = getTaskStatusTone(task.derivedStatus);
                  const priorityTone = getPriorityTone(task.priority);
                  const isDone = task.status === "done";
                  const canManageThisTask = canEditTask(user.role);
                  const canOpenDesignerTask = user.role === "designer" && task.assignee?.id === user.id;

                  return (
                    <TaskRowBlock key={task.id}>
                      <TaskTableRow
                        $interactive={canManageThisTask || canOpenDesignerTask || (user.role === "client" && task.status === "review")}
                        onClick={() => {
                          if (user.role === "client" && task.status === "review") {
                            // open client review modal (uses editingTaskId)
                            startEditingTask(task.id);
                            return;
                          }

                          if (canManageThisTask) {
                            startEditingTask(task.id);
                          } else if (canOpenDesignerTask) {
                            setActiveDesignerTaskId(task.id);
                          }
                        }}
                      >
                        <TaskCheckButton type="button" $checked={isDone} disabled>
                          {isDone ? <IconCheckTiny /> : null}
                        </TaskCheckButton>
                        <TaskTitleCell>{task.title}</TaskTitleCell>
                        <AssigneeCell>
                          <AvatarCircle>{getUserInitial(task.assignee?.name ?? "U")}</AvatarCircle>
                          <span>{task.assignee?.name ?? "Unassigned"}</span>
                        </AssigneeCell>
                        <PillCell>
                          <Badge style={{ background: statusTone.bg, color: statusTone.fg }}>
                            {statusTone.label}
                          </Badge>
                        </PillCell>
                        <PillCell>
                          <Badge style={{ background: priorityTone.bg, color: priorityTone.fg }}>
                            {priorityTone.label}
                          </Badge>
                        </PillCell>
                        <DateCell>
                          <InlineIcon>
                            <IconCalendarMini />
                          </InlineIcon>
                          {formatShortDate(task.dueDate)}
                        </DateCell>
                      </TaskTableRow>
                    </TaskRowBlock>
                  );
                })
              ) : (
                <EmptyState>No tasks yet.</EmptyState>
              )}
            </DesktopTaskTable>

            <MobileTaskList>
              {taskRows.length ? (
                taskRows.map((task) => {
                  const statusTone = getTaskStatusTone(task.derivedStatus);
                  const priorityTone = getPriorityTone(task.priority);
                  const canManageThisTask = canEditTask(user.role);
                  const canOpenDesignerTask = user.role === "designer" && task.assignee?.id === user.id;
                  const isDone = task.status === "done";

                  return (
                  <MobileTaskCard
                      key={task.id}
                      $interactive={canManageThisTask || canOpenDesignerTask || (user.role === "client" && task.status === "review")}
                      onClick={() => {
                        if (user.role === "client" && task.status === "review") {
                          startEditingTask(task.id);
                          return;
                        }

                        if (canOpenDesignerTask) {
                          setActiveDesignerTaskId(task.id);
                        }
                      }}
                    >
                      <MobileTaskTop>
                        <TaskCheckButton type="button" $checked={isDone} disabled>
                          {isDone ? <IconCheckTiny /> : null}
                        </TaskCheckButton>
                        <MobileTaskCopy>
                          <MobileTaskTitle>{task.title}</MobileTaskTitle>
                          <TaskMetaLine>
                            <AvatarCircle>{getUserInitial(task.assignee?.name ?? "U")}</AvatarCircle>
                            <span>{task.assignee?.name ?? "Unassigned"}</span>
                          </TaskMetaLine>
                          <TaskMetaLine>
                            <InlineIcon>
                              <IconCalendarMini />
                            </InlineIcon>
                            <span>{formatShortDate(task.dueDate)}</span>
                          </TaskMetaLine>
                        </MobileTaskCopy>
                        {canManageThisTask ? (
                          <TaskArrowButton type="button" onClick={() => startEditingTask(task.id)}>
                            <IconArrowRight />
                          </TaskArrowButton>
                        ) : null}
                      </MobileTaskTop>
                      <MobileTaskPills>
                        <Badge style={{ background: statusTone.bg, color: statusTone.fg }}>
                          {statusTone.label}
                        </Badge>
                        <Badge style={{ background: priorityTone.bg, color: priorityTone.fg }}>
                          {priorityTone.label}
                        </Badge>
                      </MobileTaskPills>
                    </MobileTaskCard>
                  );
                })
              ) : (
                <EmptyState>No tasks yet.</EmptyState>
              )}
            </MobileTaskList>
          </TasksSection>

          <WorkspaceSection $visible={showWorkspaceTools}>
            <WorkspaceCard className="panel">
              <PanelHeader>
                <h2>Latest Version</h2>
                {canManageVersions ? (
                  <InlineActionButton type="button" onClick={() => setShowVersionPanel(true)}>
                    Update latest
                  </InlineActionButton>
                ) : null}
              </PanelHeader>
              {latestVersion ? (
                <>
                  <VersionHero>
                    <VersionPreview $imageUrl={project.imageUrl ?? null}>
                      {project.imageUrl ? null : getProjectInitial(project.name)}
                    </VersionPreview>
                    <VersionCopy>
                      <VersionHeadingRow>
                        <strong>{latestVersion.title}</strong>
                        <Badge style={{ background: "rgba(244, 241, 237, 1)", color: "#7f7468" }}>
                          {latestVersion.version}
                        </Badge>
                      </VersionHeadingRow>
                      <VersionMeta>
                        Updated by{" "}
                        {state.users.find((candidate) => candidate.id === latestVersion.uploadedBy)?.name ??
                          "Team member"}{" "}
                        on {formatDate(latestVersion.createdAt)}
                      </VersionMeta>
                      <VersionMeta>
                        {latestVersion.visibility === "client" ? "Client visible" : "Internal only"}
                      </VersionMeta>
                    </VersionCopy>
                  </VersionHero>
                  <VersionNotes>
                    {latestVersion.notes?.trim() || "No notes added for this version yet."}
                  </VersionNotes>
                  {visibleFiles.slice(1, 4).length ? (
                    <VersionHistoryList>
                      {visibleFiles.slice(1, 4).map((file) => (
                        <VersionHistoryItem key={file.id}>
                          <strong>{file.title}</strong>
                          <span>
                            {file.version} · {formatShortDate(file.createdAt)}
                          </span>
                        </VersionHistoryItem>
                      ))}
                    </VersionHistoryList>
                  ) : null}
                </>
              ) : (
                <EmptyState>No project version has been published yet.</EmptyState>
              )}
            </WorkspaceCard>

            <WorkspaceCard className="panel">
              <PanelHeader>
                <h2>Client Feedback</h2>
                {/* {canLeaveClientFeedback ? (
                  <InlineActionButton type="button" onClick={() => setShowFeedbackPanel(true)}>
                    Rate latest
                  </InlineActionButton>
                ) : null} */}
              </PanelHeader>
              {latestFeedback ? (
                <>
                  <FeedbackHero>
                    <ActivityAvatar>
                      {getUserInitial(
                        state.users.find((candidate) => candidate.id === latestFeedback.authorId)?.name ??
                          client?.name ??
                          "C",
                      )}
                    </ActivityAvatar>
                    <div>
                      <ActivityLine>
                        <strong>
                          {state.users.find((candidate) => candidate.id === latestFeedback.authorId)?.name ??
                            client?.name ??
                            "Client"}
                        </strong>
                        <Badge
                          style={{
                            background: getFeedbackTone(latestFeedback.action).bg,
                            color: getFeedbackTone(latestFeedback.action).fg,
                          }}
                        >
                          {getFeedbackTone(latestFeedback.action).label}
                        </Badge>
                      </ActivityLine>
                      <VersionMeta>{formatDate(latestFeedback.createdAt)}</VersionMeta>
                      {latestFeedback.rating ? (
                        <RatingReadout>
                          {Array.from({ length: 5 }, (_, index) => (
                            <Star key={index} $filled={index < latestFeedback.rating!}>
                              ★
                            </Star>
                          ))}
                        </RatingReadout>
                      ) : null}
                    </div>
                  </FeedbackHero>
                  <VersionNotes>{latestFeedback.body}</VersionNotes>
                  {feedbackRows.slice(1, 4).length ? (
                    <ActivityList>
                      {feedbackRows.slice(1, 4).map((item) => {
                        const tone = getFeedbackTone(item.action);
                        const author = state.users.find((candidate) => candidate.id === item.authorId);
                        return (
                          <ActivityItemCard key={item.id}>
                            <ActivityAvatar>{getUserInitial(author?.name ?? client?.name ?? "C")}</ActivityAvatar>
                            <div>
                              <ActivityLine>
                                <strong>{author?.name ?? client?.name ?? "Client"}</strong>
                                <span>{tone.label}</span>
                              </ActivityLine>
                              <ActivityMeta>{item.body}</ActivityMeta>
                            </div>
                          </ActivityItemCard>
                        );
                      })}
                    </ActivityList>
                  ) : null}
                </>
              ) : (
                <EmptyState>No client feedback yet.</EmptyState>
              )}
            </WorkspaceCard>
          </WorkspaceSection>
        </MainColumn>

        <SideColumn>
          <SummaryCard className="panel">
            <PanelHeader>
              <h2>Project Summary</h2>
            </PanelHeader>
            <SummaryList>
              <SummaryRow>
                <span>Total Tasks</span>
                <strong>{totalTasks}</strong>
              </SummaryRow>
              <SummaryRow>
                <span>Completed</span>
                <strong>{completedTasks} ({completionPercent}%)</strong>
              </SummaryRow>
              <SummaryRow>
                <span>Open Tasks</span>
                <strong>{openTasks}</strong>
              </SummaryRow>
              <SummaryRow>
                <span>Overdue Tasks</span>
                <SummaryDanger>{overdueTasks}</SummaryDanger>
              </SummaryRow>
            </SummaryList>
            <SummaryLink as={Link} href="/tasks">
              View all tasks
              <IconArrowRight />
            </SummaryLink>
          </SummaryCard>

          <SummaryCard className="panel">
            <PanelHeader>
              <h2>Recent Activity</h2>
              <InlineLink as={Link} href={showWorkspaceTools ? "#workspace-tools" : "#project-tasks"}>
                View all
              </InlineLink>
            </PanelHeader>
            <ActivityList id="workspace-tools">
              {recentActivity.length ? (
                recentActivity.map((item) => (
                  <ActivityItemCard key={item.id}>
                    <ActivityAvatar>{getUserInitial(item.actor)}</ActivityAvatar>
                    <div>
                      <ActivityText>
                        <strong>{item.actor}</strong> {item.detail}
                      </ActivityText>
                      <ActivityMeta>
                        {formatShortDate(item.createdAt)} · {formatTime(item.createdAt)}
                      </ActivityMeta>
                    </div>
                  </ActivityItemCard>
                ))
              ) : (
                <EmptyState>No recent activity yet.</EmptyState>
              )}
            </ActivityList>
          </SummaryCard>
        </SideColumn>
      </ContentGrid>
          </ContentInner>
        </Content>
      </Shell>
    </>
  );
}

const cardSurface = css`
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 20px 46px rgba(31, 31, 31, 0.08);
`;

const outlineButton = css`
  min-height: 56px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  color: #2e2a27;
  box-shadow: 0 10px 24px rgba(31, 31, 31, 0.06);
`;

const Shell = styled.main`
  display: block;
  min-height: 100vh;
  padding: 16px 14px 20px;

  ${desktop} {
    display: flex;
    align-items: stretch;
    padding: 8px;
    background: rgba(255, 255, 255, 0.58);
    height: 100vh;
    overflow: hidden;
  }
`;

const Content = styled.section`
  display: flex;
  flex-direction: column;
  min-width: 0;

  ${desktop} {
    flex: 1;
    overflow-y: auto;
    padding: 14px 16px 16px;
    border-radius: 0 22px 22px 0;
    background:
      radial-gradient(circle at top center, rgba(255, 255, 255, 0.76), transparent 18%),
      linear-gradient(180deg, rgba(252, 249, 244, 0.92), rgba(247, 243, 237, 0.84));
  }
`;

const ContentInner = styled.div`
  margin: 0 auto;
  display: grid;
  gap: 14px;

  ${desktop} {
    gap: 16px;
  }
`;

const TopBar = styled.header`
  display: grid;
  gap: 16px;
`;

const MobileNavRow = styled.div`
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 12px;

  ${desktop} {
    display: none;
  }
`;

const DesktopHeaderRow = styled.div`
  display: none;

  ${desktop} {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }
`;

const Breadcrumbs = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  color: #6f655a;
  font-size: 0.94rem;

  a {
    color: inherit;
    text-decoration: none;
  }

  strong {
    color: #2e2a27;
    font-weight: 600;
  }
`;

const HeaderActionRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
`;

const MobileTitle = styled.h1`
  margin: 0;
  font-size: 1.25rem;
  line-height: 1.2;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  ${desktop} {
    display: none;
  }
`;

const MobileNavSpacer = styled.span`
  width: 44px;
  height: 44px;
  flex: 0 0 44px;

  ${desktop} {
    display: none;
  }
`;

const DesktopTitle = styled.h1`
  display: none;

  ${desktop} {
    display: block;
    margin: 0;
    font-size: clamp(2.8rem, 3vw, 4rem);
    line-height: 1.02;
    letter-spacing: -0.05em;
  }
`;

const BackIconButton = styled.button`
  ${outlineButton}
  min-height: 44px;
  width: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;

  svg {
    width: 18px;
    height: 18px;
  }
`;

const HeroCard = styled.section`
  ${cardSurface}
  border-radius: 22px;
  padding: 14px;
  display: grid;

  ${desktop} {
    padding: 18px;
  }
`;

const HeroTop = styled.div`
  display: flex;
  flex-direction: column;
  grid-template-columns: 74px minmax(0, 1fr);
  align-items: start;
  gap: 12px;

  ${desktop} {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    align-items: start;
    gap: 18px;
  }
`;

const ProjectGlyph = styled.div`
  width: 74px;
  height: 74px;
  border-radius: 16px;
  position: relative;
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, #fbf7f1 0%, #f5efe5 100%);
  border: 1px solid rgba(233, 226, 217, 0.96);
  color: #aa7a2a;

  svg {
    width: 34px;
    height: 34px;
    z-index: 2;
  }
`;

const FallbackLetter = styled.span`
  position: absolute;
  bottom: 8px;
  right: 10px;
  font-size: 0.72rem;
  font-weight: 700;
  color: rgba(46, 42, 39, 0.32);
`;

const HeroCopy = styled.div`
  display: grid;
  gap: 12px;
`;

const HeroTitleRow = styled.div`
  display: grid;
  gap: 10px;

  ${desktop} {
    gap: 12px;
  }
`;

const HeroTitle = styled.h2`
  margin: 0;
  font-size: clamp(1.3rem, 1.7vw, 1.72rem);
  line-height: 1.15;
`;

const MobileStatusPills = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;

  ${desktop} {
    display: none;
  }
`;

const DesktopMetaGrid = styled.div`
  display: none;

  ${desktop} {
    display: grid;
    grid-template-columns: 1.08fr 1.08fr 1fr 1fr 1.15fr;
    gap: 0;
    border-top: 1px solid rgba(235, 229, 221, 0.95);
    border-bottom: 1px solid rgba(235, 229, 221, 0.95);
  }
`;

const MobileInfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 10px;

  ${desktop} {
    display: none;
  }
`;

const MetaBlock = styled.div`
  ${desktop} {
    display: grid;
    align-content: start;
    gap: 8px;
    padding: 8px 10px;
    border-right: 1px solid rgba(235, 229, 221, 0.95);

    &:last-child {
      border-right: 0;
    }
  }
`;

const MetaLabel = styled.span`
  color: #7f7468;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
`;

const MetaValue = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.92rem;
  font-weight: 600;
  color: #2e2a27;
`;

const MetaValueText = styled.p`
  margin: 4px 0 0;
  color: #2e2a27;
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.35;
`;

const MetaMuted = styled.span`
  color: #8b8277;
  font-size: 0.84rem;
`;

const PersonRow = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
`;

const AvatarStack = styled.div`
  display: inline-flex;
  align-items: center;
`;

const StackAvatar = styled.span`
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  margin-left: -7px;
  border: 2px solid #fff;
  background: linear-gradient(180deg, #eadfce, #cfb89f);
  color: #5e4c37;
  font-size: 0.78rem;
  font-weight: 700;

  &:first-child {
    margin-left: 0;
  }
`;

const StackCount = styled.span`
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  margin-left: -7px;
  border: 2px solid #fff;
  background: #f4f1ed;
  color: #4f4a44;
  font-size: 0.78rem;
  font-weight: 700;
`;

const CompactInfo = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
`;

const CompactIconWrap = styled.span`
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: rgba(250, 246, 240, 0.95);
  border: 1px solid rgba(235, 229, 221, 0.95);
  color: #7c7469;

  svg {
    width: 18px;
    height: 18px;
  }
`;

const BriefAndTimeline = styled.div`
  display: grid;
  gap: 14px;
  margin-top: 18px;
  
  ${desktop} {
    grid-template-columns: minmax(0, 1fr) minmax(580px, 1.2fr);
    gap: 18px;
    align-items: end;
  }
`;

const BriefBlock = styled.div`
  display: grid;
  gap: 8px;
`;

const BriefCopy = styled.p`
  margin: 0;
  color: #433b34;
  font-size: 0.96rem;
  line-height: 1.52;
`;

const TimelineBlock = styled.div`
  position: relative;
  padding-top: 16px;
`;

const TimelineRail = styled.div<{ $tone: ProjectStatus; $progress: number }>`
  position: absolute;
  left: 9%;
  right: 9%;
  top: 30px;
  height: 3px;
  background: ${({ $tone, $progress }) =>
    `linear-gradient(90deg, ${getStatusAccent($tone)} 0%, ${getStatusAccent($tone)} ${$progress}%, #e6e0d8 ${$progress}%, #e6e0d8 100%)`};
  border-radius: 999px;

  ${desktop} {
    left: 8%;
    right: 8%;
  }
`;

const TimelineSteps = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
`;

const TimelineStep = styled.div`
  display: grid;
  justify-items: center;
  gap: 12px;
  text-align: center;
`;

const TimelineNode = styled.span<{ $done?: boolean; $current?: boolean; $tone: ProjectStatus }>`
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: ${({ $done, $current, $tone }) =>
    $done ? getStatusAccent($tone) : $current ? "#ffffff" : "#ffffff"};
  border: 3px solid
    ${({ $done, $current, $tone }) =>
      $done ? getStatusAccent($tone) : $current ? getStatusAccent($tone) : "#e2ddd6"};
  color: #fff;
  box-shadow: ${({ $current, $tone }) =>
    $current ? `0 0 0 4px ${getStatusAccent($tone)}1a` : "none"};

  svg {
    width: 12px;
    height: 12px;
  }
`;

const TimelineLabel = styled.span`
  color: #62594f;
  font-size: 0.78rem;
  line-height: 1.35;
  font-weight: 600;
`;

const MobileActionRow = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;

  ${desktop} {
    display: none;
  }
`;

const ActionButton = styled.button`
  ${outlineButton}
  min-height: 40px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 14px;
  font-size: 0.84rem;
  font-weight: 600;

  svg {
    width: 15px;
    height: 15px;
  }
`;

const DangerActionButton = styled(ActionButton)`
  color: #ef5446;
`;

const PrimaryActionButton = styled.button`
  min-height: 40px;
  border: 0;
  border-radius: 10px;
  background: #214f39;
  color: #fff;
  box-shadow: 0 16px 34px rgba(33, 79, 57, 0.22);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 16px;
  font-size: 0.84rem;
  font-weight: 700;

  svg {
    width: 15px;
    height: 15px;
  }
`;

const ActionPanel = styled.section`
  ${cardSurface}
  border-radius: 24px;
  padding: 18px;
  display: grid;
  gap: 16px;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  h2 {
    margin: 0;
    font-size: 0.98rem;
    line-height: 1.2;
  }
`;

const InlineFormTitle = styled.h3`
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.2;
`;

const InlineForm = styled.form`
  display: grid;
  gap: 12px;
`;

const TaskModalGrid = styled.div`
  display: grid;
  gap: 12px;

  ${desktop} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const TaskModalField = styled.div<{ $wide?: boolean }>`
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
  width: 100%;
`;

const TaskTextInput = styled.input`
  width: 100%;
  min-height: 58px;
  padding: 0 16px;
  border: 1.5px solid rgba(27, 63, 53, 0.3);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
  font-size: 16px;
  color: var(--color-text);
`;

const TaskFloatingSelect = styled.div<{ $filled?: boolean; $open?: boolean }>`
  position: relative;
  display: block;
  width: 100%;
  z-index: ${({ $open }) => ($open ? 8 : 2)};
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

const TaskSelectTrigger = styled.button`
  width: 100%;
  min-height: 58px;
  padding: 18px 16px 12px;
  border: 1.5px solid rgba(27, 63, 53, 0.3);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
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

  &:hover {
    background: rgba(31, 67, 57, 0.08);
  }
`;

const ContentGrid = styled.div`
  display: grid;
  gap: 14px;

  ${desktop} {
    grid-template-columns: minmax(0, 1.9fr) minmax(320px, 0.78fr);
    align-items: start;
  }
`;

const MainColumn = styled.div`
  display: grid;
  gap: 14px;
`;

const SideColumn = styled.aside`
  display: none;

  ${desktop} {
    display: grid;
    gap: 14px;
  }
`;

const TasksSection = styled.section`
  ${cardSurface}
  border-radius: 22px;
  padding: 14px;
  display: grid;
  gap: 14px;

  ${desktop} {
    padding: 16px 18px;
  }
`;

const InlineLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #214f39;
  font-weight: 700;
  text-decoration: none;

  svg {
    width: 16px;
    height: 16px;
  }
`;

const InlineActionButton = styled.button`
  border: 0;
  background: transparent;
  color: #214f39;
  font-size: 0.84rem;
  font-weight: 700;
  padding: 0;
`;

const DesktopTaskTable = styled.div`
  display: none;

  ${desktop} {
    display: grid;
    gap: 0;
  }
`;

const TaskTableHeader = styled.div`
  display: grid;
  grid-template-columns: 24px minmax(0, 1.75fr) minmax(0, 1.15fr) 118px 96px 116px;
  gap: 10px;
  padding: 0 0 10px;
  color: #7f7468;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

const TaskRowBlock = styled.div`
  border-top: 1px solid rgba(235, 229, 221, 0.95);
`;

const TaskTableRow = styled.div<{ $interactive?: boolean }>`
  display: grid;
  grid-template-columns: 24px minmax(0, 1.75fr) minmax(0, 1.15fr) 118px 96px 116px;
  gap: 10px;
  align-items: center;
  padding: 12px 0;
  cursor: ${({ $interactive }) => ($interactive ? "pointer" : "default")};

  ${({ $interactive }) =>
    $interactive
      ? css`
          &:hover {
            background: rgba(244, 241, 237, 0.46);
          }
        `
      : ""}
`;

const TaskCheckButton = styled.button<{ $checked?: boolean }>`
  width: 18px;
  height: 18px;
  border-radius: 6px;
  border: 2px solid ${({ $checked }) => ($checked ? "#1f5d3f" : "#d8d2ca")};
  background: ${({ $checked }) => ($checked ? "#1f5d3f" : "#fff")};
  color: #fff;
  display: inline-grid;
  place-items: center;
  padding: 0;

  &:disabled {
    opacity: 0.7;
  }

  svg {
    width: 10px;
    height: 10px;
  }
`;

const TaskTitleCell = styled.strong`
  display: block;
  min-width: 0;
  font-size: 0.92rem;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const AssigneeCell = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;

  span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
  }
`;

const AvatarCircle = styled.span`
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, #eadfce, #cfb89f);
  color: #5e4c37;
  font-size: 0.76rem;
  font-weight: 700;
  flex: 0 0 auto;
`;

const PillCell = styled.div`
  display: flex;
  justify-content: flex-start;
`;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 10px;
  font-size: 0.82rem;
  font-weight: 700;
  white-space: nowrap;
`;

const DateCell = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #433b34;
  font-size: 0.88rem;
  font-weight: 600;
`;

const InlineIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #8e8478;

  svg {
    width: 16px;
    height: 16px;
  }
`;

const TaskRowActions = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const TaskArrowButton = styled.button`
  ${outlineButton}
  min-height: 34px;
  width: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 12px;

  svg {
    width: 14px;
    height: 14px;
  }
`;

const InlineEditCard = styled.div`
  padding: 0 0 16px;
`;

const TaskDeliveryReview = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const TaskDeliveryPreviewWrap = styled.div`
  ${cardSurface}
  padding: 10px;
  border-radius: 18px;
`;

const TaskDeliveryPreview = styled.img`
  width: 100%;
  max-height: 260px;
  display: block;
  object-fit: cover;
  border-radius: 14px;
`;

const TaskReviewActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const TaskReviewActionButton = styled.button<{ $active?: boolean }>`
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid ${({ $active }) => ($active ? "transparent" : "rgba(230, 224, 215, 0.95)")};
  background: ${({ $active }) => ($active ? "#214f39" : "rgba(255, 255, 255, 0.92)")};
  color: ${({ $active }) => ($active ? "#fff" : "#214f39")};
  font-size: 0.84rem;
  font-weight: 700;
`;

const TaskInlineError = styled.p`
  margin: 0;
  color: #c04f42;
  font-size: 0.84rem;
  line-height: 1.45;
`;

const TaskUpdateLoadingOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 140;
  display: grid;
  place-items: center;
`;

const CompactActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const MobileTaskList = styled.div`
  display: grid;
  gap: 10px;

  ${desktop} {
    display: none;
  }
`;

const MobileTaskCard = styled.article<{ $interactive?: boolean }>`
  border: 1px solid rgba(235, 229, 221, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  padding: 12px;
  display: grid;
  gap: 10px;
  cursor: ${({ $interactive }) => ($interactive ? "pointer" : "default")};

  ${({ $interactive }) =>
    $interactive
      ? css`
          &:hover {
            background: rgba(244, 241, 237, 0.5);
          }
        `
      : ""}
`;

const MobileTaskTop = styled.div`
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 34px;
  align-items: start;
  gap: 10px;
`;

const MobileTaskCopy = styled.div`
  display: grid;
  gap: 6px;
`;

const MobileTaskTitle = styled.strong`
  font-size: 0.92rem;
  line-height: 1.35;
`;

const TaskMetaLine = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #74695d;
  font-size: 0.84rem;

  ${AvatarCircle} {
    width: 22px;
    height: 22px;
    font-size: 0.68rem;
  }
`;

const MobileTaskPills = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const SummaryCard = styled.section`
  ${cardSurface}
  border-radius: 20px;
  padding: 16px;
  display: grid;
  gap: 14px;
`;

const SummaryList = styled.div`
  display: grid;
  gap: 10px;
`;

const SummaryRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #4a4038;
  font-size: 0.92rem;

  strong {
    color: #1f3f33;
  }
`;

const SummaryDanger = styled.strong`
  color: #ef5446;
`;

const SummaryLink = styled.a`
  ${outlineButton}
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 20px;
  color: #2e2a27;
  text-decoration: none;
  font-weight: 700;

  svg {
    width: 16px;
    height: 16px;
  }
`;

const ActivityList = styled.div`
  display: grid;
  gap: 10px;
`;

const ActivityItemCard = styled.article`
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
`;

const ActivityAvatar = styled.span`
  width: 32px;
  height: 32px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, #eadfce, #cfb89f);
  color: #5e4c37;
  font-size: 0.76rem;
  font-weight: 700;
`;

const ActivityText = styled.p`
  margin: 0;
  color: #433b34;
  font-size: 0.88rem;
  line-height: 1.45;
`;

const ActivityLine = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  strong {
    color: #2e2a27;
  }

  span {
    color: #7d7266;
    font-size: 0.82rem;
    font-weight: 600;
  }
`;

const ActivityMeta = styled.p`
  margin: 6px 0 0;
  color: #7d7266;
  font-size: 0.82rem;
  line-height: 1.45;
`;

const WorkspaceSection = styled.section<{ $visible: boolean }>`
  display: ${({ $visible }) => ($visible ? "grid" : "none")};
  gap: 14px;

  ${desktop} {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const WorkspaceCard = styled.section`
  ${cardSurface}
  border-radius: 20px;
  padding: 14px;
  display: grid;
  gap: 12px;
`;

const VersionHero = styled.div`
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
`;

const VersionPreview = styled.div<{ $imageUrl?: string | null }>`
  width: 84px;
  height: 84px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(230, 224, 215, 0.95);
  background:
    ${({ $imageUrl }) =>
      $imageUrl
        ? `center / cover no-repeat url("${$imageUrl}")`
        : "linear-gradient(180deg, #fbf7f1 0%, #f5efe5 100%)"};
  color: ${({ $imageUrl }) => ($imageUrl ? "transparent" : "#8c7040")};
  font-size: 1.35rem;
  font-weight: 800;
`;

const VersionCopy = styled.div`
  display: grid;
  gap: 6px;
  min-width: 0;
`;

const VersionHeadingRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  strong {
    color: #2e2a27;
    font-size: 0.92rem;
    line-height: 1.35;
  }
`;

const VersionMeta = styled.p`
  margin: 0;
  color: #7d7266;
  font-size: 0.82rem;
  line-height: 1.45;
`;

const VersionNotes = styled.p`
  margin: 0;
  color: #433b34;
  font-size: 0.88rem;
  line-height: 1.55;
`;

const VersionHistoryList = styled.div`
  display: grid;
  gap: 8px;
`;

const VersionHistoryItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(235, 229, 221, 0.95);

  strong {
    color: #2e2a27;
    font-size: 0.86rem;
  }

  span {
    color: #7d7266;
    font-size: 0.8rem;
    white-space: nowrap;
  }
`;

const FeedbackHero = styled.div`
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
`;

const RatingChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const RatingChip = styled.button<{ $active?: boolean }>`
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid ${({ $active }) => ($active ? "#214f39" : "rgba(33, 79, 57, 0.18)")};
  background: ${({ $active }) => ($active ? "rgba(33, 79, 57, 0.12)" : "rgba(255, 255, 255, 0.96)")};
  color: #214f39;
  font-size: 0.8rem;
  font-weight: 700;
`;

const RatingReadout = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 6px;
`;

const Star = styled.span<{ $filled?: boolean }>`
  color: ${({ $filled }) => ($filled ? "#ca8a22" : "#ddd4c9")};
  font-size: 0.92rem;
  line-height: 1;
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

const ModalCard = styled.section`
  ${cardSurface}
  width: min(100%, 700px);
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  border-radius: 22px;
  padding: 18px;
  display: grid;
  gap: 14px;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
`;

const ModalTitle = styled.h2`
  margin: 0;
  font-size: 1rem;
`;

const ModalDescription = styled.p`
  margin: 6px 0 0;
  color: var(--color-text-muted);
  font-size: 0.84rem;
  line-height: 1.5;
`;

const ModalClose = styled.button`
  ${outlineButton}
  min-height: 40px;
  width: 40px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;

  svg {
    width: 16px;
    height: 16px;
  }
`;

const EmptyState = styled.p`
  margin: 0;
  color: #8b8277;
  font-size: 0.88rem;
  line-height: 1.5;
`;

const PriorityField = styled.div`
  display: grid;
  gap: 8px;
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
    ${({ $tone, $active }) =>
      $tone === "high"
        ? $active
          ? "#e06457"
          : "rgba(224, 100, 87, 0.24)"
        : $tone === "medium"
          ? $active
            ? "#ca8a22"
            : "rgba(202, 138, 34, 0.24)"
          : $active
            ? "#5ca16d"
            : "rgba(92, 161, 109, 0.24)"};
  background:
    ${({ $tone, $active }) =>
      $tone === "high"
        ? $active
          ? "#ffe7e5"
          : "rgba(255, 231, 229, 0.42)"
        : $tone === "medium"
          ? $active
            ? "#fff1da"
            : "rgba(255, 241, 218, 0.42)"
          : $active
            ? "#e5f4e8"
            : "rgba(229, 244, 232, 0.42)"};
  color:
    ${({ $tone }) =>
      $tone === "high" ? "#c95144" : $tone === "medium" ? "#af7418" : "#4d8b5c"};
  font-size: 0.8rem;
  font-weight: 700;
`;

function IconChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
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

function IconCloudMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 16.6A4.6 4.6 0 0 0 16 9a5.9 5.9 0 0 0-11 2A4 4 0 0 0 5 19h14a3 3 0 0 0 1-5.8Z" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function IconCalendarMini() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

function IconClient() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 19a5 5 0 0 1 10 0" />
      <circle cx="12" cy="9" r="3.2" />
      <path d="M4 19h16" />
    </svg>
  );
}

function IconFolderMini() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m13 5 7 7-7 7" />
    </svg>
  );
}

function IconCheckTiny() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 5 5L20 7" />
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

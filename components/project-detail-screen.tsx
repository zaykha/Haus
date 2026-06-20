"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styled, { css } from "styled-components";
import { AppSidebar } from "@/components/app-sidebar";
import { useAppState } from "@/components/app-state";
import { ConfirmActionModal } from "@/components/confirm-action-modal";
import { CustomDatePicker } from "@/components/custom-date-picker";
import { DesignerTaskModal } from "@/components/designer-task-modal";
import { ProjectForm, ProjectFormValues } from "@/components/project-form";
import {
  canCreateTask,
  canDeleteProject,
  canDeleteTask,
  canEditProject,
  canEditTask,
  getUserClientOrganizationIds,
  getVisibleTasksForUser,
} from "@/lib/permissions";
import {
  getCurrentTaskCompletionLabel,
  getTaskCompletionLabel,
  isTaskCompletionImage,
  isTaskCompletionLink,
  parseTaskCompletionAssets,
  parseTaskCompletionState,
} from "@/lib/task-completion-assets";
import {
  FeedbackAction,
  Project,
  ProjectStage,
  TaskPriority,
  TaskStatus,
  User,
} from "@/lib/types";
import {
  formatLabel,
  formatProjectStage,
  getTaskStatusLabel,
} from "@/lib/display";
import { taskNeedsAttention } from "@/lib/task-attention";

const workflowTimelineStages: ProjectStage[] = ["Waiting List", "WIP", "Pending Review", "Complete"];
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

type InternalNoteRow = {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
};

type VersionFeedbackEntry = {
  id: string;
  source: "internal" | "client";
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  rating?: number | null;
  action?: FeedbackAction;
};

type DeliverableVersionOption = {
  id: string;
  label: string;
  assets: string[];
  createdAt: string;
  versionKind: "current" | "history";
};

type DeliverableTaskOption = {
  taskId: string;
  taskTitle: string;
  assigneeId: string;
  versionOptions: DeliverableVersionOption[];
  latestActivityAt: string;
};

const EMPTY_PROJECT: Project = {
  id: "",
  name: "",
  ownerId: "",
  description: "",
  category: "",
  stage: "Waiting List",
  status: "Waiting List",
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

function parseReferenceAttachments(value?: string | null) {
  if (!value?.trim()) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
  } catch {
    return [value];
  }

  return [value];
}

function getReferenceLabel(value: string) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    const lastSegment = url.pathname.split("/").filter(Boolean).at(-1) ?? value;
    return decodeURIComponent(lastSegment);
  } catch {
    return value;
  }
}

function getWorkflowTimelineIndex(stage: ProjectStage) {
  if (stage === "On Hold") {
    return 1;
  }

  const index = workflowTimelineStages.indexOf(stage);
  return index >= 0 ? index : 0;
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
      return { bg: "#fff1da", fg: "#ca8a22", label: "Submit to Client" };
    case "approved":
      return { bg: "#e5f4e8", fg: "#5ca16d", label: "Complete" };
    case "completed":
      return { bg: "#efe7ff", fg: "#7f61d7", label: "Internal Submit" };
    default:
      return { bg: "#f4f1ed", fg: "#8d857b", label: "To Do" };
  }
}

function getProjectStatusTone(status: ProjectStage | string) {
  switch (status) {
    case "Pending Review":
      return { bg: "#fff1da", fg: "#ca8a22" };
    case "On Hold":
      return { bg: "#ffe7e5", fg: "#e06457" };
    case "Complete":
      return { bg: "#e5f4e8", fg: "#2c6b43" };
    case "Waiting List":
      return { bg: "#f4f1ed", fg: "#8d857b" };
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

function getUserInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "U";
}

function getProjectInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "P";
}

function canClientOpenTask(task: Project["tasks"][number]) {
  return task.status === "review" || task.status === "approved";
}

export function ProjectDetailScreen({ projectId }: { projectId: string }) {
  const router = useRouter();
  const {
    ready,
    state,
    user,
    updateProject,
    deleteProject,
    createTask,
    updateTask,
    updateTaskStatus,
    deleteTask,
    addComment,
    addFeedback,
  } = useAppState();
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [showCreateTaskPanel, setShowCreateTaskPanel] = useState(false);
  const [showDeleteProjectModal, setShowDeleteProjectModal] = useState(false);
  const [showReferencePanel, setShowReferencePanel] = useState(false);
  const [heroDetailPanel, setHeroDetailPanel] = useState<"brief" | "objective" | "advice" | null>(null);
  const [showFeedbackPanel, setShowFeedbackPanel] = useState(false);
  const [showWorkspaceTools, setShowWorkspaceTools] = useState(false);
  const [isUpdatingProject, setIsUpdatingProject] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [createTaskSelect, setCreateTaskSelect] = useState<"assignee" | "status" | null>(null);
  const [editTaskSelect, setEditTaskSelect] = useState<"assignee" | "status" | null>(null);
  const [projectDraft, setProjectDraft] = useState<ProjectFormValues>({
    requestedDate: "",
    requestStatus: "Waiting List",
    departmentName: "",
    projectRequestName: "",
    contactPerson: "",
    contactNumber: "",
    projectType: "",
    priorityLevel: "",
    firstDraftDate: "",
    finalDeliverableDate: "",
    projectObjective: "",
    projectBrief: "",
    creativeAdvice: "",
    description: "",
    referenceAttachmentUrl: "",
    clientOrganizationId: "",
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
  const [feedbackAction, setFeedbackAction] = useState<FeedbackAction>("comment");
  const [feedbackBody, setFeedbackBody] = useState("");
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackDecisionSelectOpen, setFeedbackDecisionSelectOpen] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<string | null>(null);
  const [deliverableTaskSelectOpen, setDeliverableTaskSelectOpen] = useState(false);
  const [deliverableVersionSelectOpen, setDeliverableVersionSelectOpen] = useState(false);
  const [selectedDeliverableTaskId, setSelectedDeliverableTaskId] = useState<string | null>(null);
  const [selectedDeliverableVersionId, setSelectedDeliverableVersionId] = useState<string | null>(null);
  const [selectedDeliverableAssetIndex, setSelectedDeliverableAssetIndex] = useState(0);

  const projectRecord = useMemo(
    () => state.projects.find((candidate) => candidate.id === projectId) ?? null,
    [projectId, state.projects],
  );
  const canAccessProject = Boolean(user && projectRecord);
  const project = projectRecord ?? EMPTY_PROJECT;

  const userNames = useMemo(
    () => new Map(state.users.map((member) => [member.id, member.name])),
    [state.users],
  );
  const organizationsById = useMemo(
    () => new Map(state.clientOrganizations.map((organization) => [organization.id, organization])),
    [state.clientOrganizations],
  );
  const availableClients = useMemo(
    () => state.users.filter((candidate) => candidate.role === "client"),
    [state.users],
  );
  const availableStaff = useMemo(
    () => state.users.filter((candidate) => candidate.role !== "client"),
    [state.users],
  );
  const clientOrganization = project.clientOrganizationId
    ? organizationsById.get(project.clientOrganizationId) ?? null
    : null;
  const primaryClientContact =
    (project.primaryClientContactId
      ? state.users.find((candidate) => candidate.id === project.primaryClientContactId)
      : null) ?? null;
  const primaryClientContactOrganizationId = primaryClientContact
    ? getUserClientOrganizationIds(primaryClientContact)[0] ?? null
    : null;
  const client = primaryClientContact;
  const projectDisplayName = project.projectRequestName || project.name;
  const clientOrganizationName =
    clientOrganization?.name ?? project.contactPerson ?? "Unassigned client";
  const primaryContactLabel = project.contactPerson
    ? `${project.contactPerson}${project.contactNumber ? ` · ${project.contactNumber}` : ""}`
    : primaryClientContact
      ? `${primaryClientContact.name}${primaryClientContact.phone ? ` · ${primaryClientContact.phone}` : ""}`
    : "No primary contact";
  const canEditDetails = user ? canEditProject(user.role) : false;
  const canRemoveProject = user ? canDeleteProject(user.role) : false;
  const canManageTasks = user ? canCreateTask(user.role) : false;
  const canLeaveClientFeedback = user?.role === "client";
  const projectStatusTone = getProjectStatusTone(project.stage);
  const visibleFiles =
    user?.role === "client"
      ? project.files.filter((file) => file.visibility === "client")
      : project.files;

  useEffect(() => {
    setNewTaskDueDate(project.dueDate);
    setProjectDraft({
      requestedDate: project.requestedDate ?? "",
      requestStatus: project.stage ?? "Waiting List",
      departmentName: project.departmentName ?? "",
      projectRequestName: project.projectRequestName ?? project.name,
      contactPerson: project.contactPerson ?? primaryClientContact?.name ?? "",
      contactNumber: project.contactNumber ?? primaryClientContact?.phone ?? "",
      projectType: project.projectType ?? project.category,
      priorityLevel: project.priorityLevel ?? "",
      firstDraftDate: project.firstDraftDate ?? "",
      finalDeliverableDate: project.finalDeliverableDate ?? project.dueDate,
      projectObjective: project.projectObjective ?? "",
      projectBrief: project.projectBrief ?? "",
      creativeAdvice: project.creativeAdvice ?? "",
      description: project.description,
      referenceAttachmentUrl: project.referenceAttachmentUrl ?? "",
      clientOrganizationId: project.clientOrganizationId ?? primaryClientContactOrganizationId ?? "",
    });
  }, [
    primaryClientContact?.name,
    primaryClientContact?.phone,
    project.clientOrganizationId,
    project.category,
    project.contactNumber,
    project.contactPerson,
    project.creativeAdvice,
    project.departmentName,
    project.description,
    project.dueDate,
    project.finalDeliverableDate,
    project.firstDraftDate,
    project.name,
    project.priorityLevel,
    project.projectBrief,
    project.projectObjective,
    project.projectRequestName,
    project.projectType,
    project.referenceAttachmentUrl,
    project.requestedDate,
    primaryClientContactOrganizationId,
    project.stage,
  ]);

  const projectFormInitialValues = useMemo<ProjectFormValues>(
    () => ({
      requestedDate: project.requestedDate ?? "",
      requestStatus: project.stage ?? "Waiting List",
      departmentName: project.departmentName ?? "",
      projectRequestName: project.projectRequestName ?? project.name,
      contactPerson: project.contactPerson ?? primaryClientContact?.name ?? "",
      contactNumber: project.contactNumber ?? primaryClientContact?.phone ?? "",
      projectType: project.projectType ?? project.category,
      priorityLevel: project.priorityLevel ?? "",
      firstDraftDate: project.firstDraftDate ?? "",
      finalDeliverableDate: project.finalDeliverableDate ?? project.dueDate,
      projectObjective: project.projectObjective ?? "",
      projectBrief: project.projectBrief ?? "",
      creativeAdvice: project.creativeAdvice ?? "",
      description: project.description,
      referenceAttachmentUrl: project.referenceAttachmentUrl ?? "",
      clientOrganizationId: project.clientOrganizationId ?? primaryClientContactOrganizationId ?? "",
    }),
    [
      primaryClientContactOrganizationId,
      project.clientOrganizationId,
      project.category,
      project.contactNumber,
      project.contactPerson,
      project.creativeAdvice,
      project.departmentName,
      project.description,
      project.dueDate,
      project.finalDeliverableDate,
      project.firstDraftDate,
      project.name,
      primaryClientContact?.name,
      primaryClientContact?.phone,
      project.priorityLevel,
      project.projectBrief,
      project.projectObjective,
      project.projectRequestName,
      project.projectType,
      project.referenceAttachmentUrl,
      project.requestedDate,
      project.stage,
    ],
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
  const selectedVersion =
    visibleFiles.find((file) => file.id === selectedVersionId) ?? latestVersion ?? null;
  const selectedVersionIndex = selectedVersion
    ? visibleFiles.findIndex((file) => file.id === selectedVersion.id)
    : -1;
  const selectedVersionWindowEnd =
    selectedVersionIndex > 0 ? visibleFiles[selectedVersionIndex - 1]?.createdAt ?? null : null;
  const referenceAttachments = useMemo(
    () => parseReferenceAttachments(project.referenceAttachmentUrl),
    [project.referenceAttachmentUrl],
  );
  const feedbackRows = [...project.feedback].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  ) as FeedbackRow[];
  const internalNoteRows = useMemo(
    () =>
      project.comments
        .filter((comment) => comment.internalOnly)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map(
          (comment): InternalNoteRow => ({
            id: comment.id,
            authorId: comment.authorId,
            body: comment.body,
            createdAt: comment.createdAt,
          }),
        ),
    [project.comments],
  );
  const versionClientFeedback = useMemo(() => {
    if (!selectedVersion) {
      return feedbackRows;
    }

    const start = new Date(selectedVersion.createdAt).getTime();
    const end = selectedVersionWindowEnd ? new Date(selectedVersionWindowEnd).getTime() : Number.POSITIVE_INFINITY;

    return feedbackRows.filter((item) => {
      const createdAt = new Date(item.createdAt).getTime();
      return createdAt >= start && createdAt < end;
    });
  }, [feedbackRows, selectedVersion, selectedVersionWindowEnd]);
  const versionInternalNotes = useMemo(() => {
    if (!selectedVersion) {
      return internalNoteRows;
    }

    const start = new Date(selectedVersion.createdAt).getTime();
    const end = selectedVersionWindowEnd ? new Date(selectedVersionWindowEnd).getTime() : Number.POSITIVE_INFINITY;

    return internalNoteRows.filter((item) => {
      const createdAt = new Date(item.createdAt).getTime();
      return createdAt >= start && createdAt < end;
    });
  }, [internalNoteRows, selectedVersion, selectedVersionWindowEnd]);
  const versionFeedbackEntries = useMemo(() => {
    const clientEntries = versionClientFeedback.map(
      (item): VersionFeedbackEntry => ({
        id: item.id,
        source:
          state.users.find((candidate) => candidate.id === item.authorId)?.role === "client"
            ? "client"
            : "internal",
        authorId: item.authorId,
        authorName:
          state.users.find((candidate) => candidate.id === item.authorId)?.name ??
          primaryClientContact?.name ??
          clientOrganization?.name ??
          "Client",
        body: item.body,
        createdAt: item.createdAt,
        rating: item.rating,
        action: item.action,
      }),
    );
    const internalEntries = versionInternalNotes.map(
      (item): VersionFeedbackEntry => ({
        id: item.id,
        source: "internal",
        authorId: item.authorId,
        authorName: state.users.find((candidate) => candidate.id === item.authorId)?.name ?? "Team member",
        body: item.body,
        createdAt: item.createdAt,
      }),
    );

    return [...clientEntries, ...internalEntries].sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );
  }, [
    clientOrganization?.name,
    primaryClientContact?.name,
    state.users,
    versionClientFeedback,
    versionInternalNotes,
  ]);
  const workflowTimelineIndex = getWorkflowTimelineIndex(project.stage);

  const deliverableTaskOptions = useMemo<DeliverableTaskOption[]>(() => {
    return taskRows
      .map((task) => {
        const completionState = parseTaskCompletionState(task.completionScreenshotUrl ?? null);
        const historyOptions = completionState.history
          .slice()
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .map((snapshot) => ({
            id: snapshot.id,
            label: snapshot.label,
            assets: snapshot.assets,
            createdAt: snapshot.createdAt,
            versionKind: "history" as const,
          }));
        const currentVersionLabel = getCurrentTaskCompletionLabel(completionState);
        const currentSnapshot = historyOptions.find((option) => option.id === currentVersionLabel) ?? null;
        const currentAssets = parseTaskCompletionAssets(task.completionScreenshotUrl ?? null);
        const versionOptions = [
          ...(currentAssets.length > 0
            ? [
                {
                  id: "current",
                  label: `${currentVersionLabel}${currentSnapshot ? " (Current)" : ""}`,
                  assets: currentAssets,
                  createdAt: currentSnapshot?.createdAt ?? task.createdAt ?? new Date(0).toISOString(),
                  versionKind: "current" as const,
                },
              ]
            : []),
          ...historyOptions.filter((option) => option.id !== currentVersionLabel || currentAssets.length === 0),
        ];

        if (versionOptions.length === 0) {
          return null;
        }

        return {
          taskId: task.id,
          taskTitle: task.title,
          assigneeId: task.assigneeId,
          versionOptions,
          latestActivityAt: versionOptions[0]?.createdAt ?? task.createdAt ?? new Date(0).toISOString(),
        };
      })
      .filter((option): option is DeliverableTaskOption => Boolean(option))
      .sort((left, right) => right.latestActivityAt.localeCompare(left.latestActivityAt));
  }, [taskRows]);

  const selectedDeliverableTask =
    deliverableTaskOptions.find((task) => task.taskId === selectedDeliverableTaskId) ?? deliverableTaskOptions[0] ?? null;
  const selectedDeliverableVersion =
    selectedDeliverableTask?.versionOptions.find((option) => option.id === selectedDeliverableVersionId) ??
    selectedDeliverableTask?.versionOptions[0] ??
    null;
  const selectedDeliverableAssets = selectedDeliverableVersion?.assets ?? [];
  const selectedDeliverableAsset = selectedDeliverableAssets[selectedDeliverableAssetIndex] ?? null;

  useEffect(() => {
    setSelectedVersionId(latestVersion?.id ?? null);
  }, [latestVersion?.id]);

  useEffect(() => {
    const nextTaskId = deliverableTaskOptions[0]?.taskId ?? null;
    setSelectedDeliverableTaskId((current) =>
      current && deliverableTaskOptions.some((task) => task.taskId === current) ? current : nextTaskId,
    );
  }, [deliverableTaskOptions]);

  useEffect(() => {
    const nextVersionId = selectedDeliverableTask?.versionOptions[0]?.id ?? null;
    setSelectedDeliverableVersionId((current) =>
      current && selectedDeliverableTask?.versionOptions.some((option) => option.id === current) ? current : nextVersionId,
    );
    setSelectedDeliverableAssetIndex(0);
  }, [selectedDeliverableTask]);

  useEffect(() => {
    setSelectedDeliverableAssetIndex(0);
  }, [selectedDeliverableVersionId]);

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

  const handleProjectDelete = async () => {
    await deleteProject(project.id);
    router.push("/projects");
  };

  const handleFeedbackSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmittingFeedback) {
      return;
    }

    const trimmedBody = feedbackBody.trim();

    // Client -> server task review transition.
    // This updates only the reviewed task. Project workflow stays manager-controlled.
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





    // Submit the task review decision first so task state updates immediately.
    // This endpoint is client-safe and validates task/project consistency.
    setIsSubmittingFeedback(true);

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
          throw new Error(payload?.error ?? "Unable to update task status.");
        }
      }
      await addFeedback(project.id, {
        action: feedbackAction,
        body: trimmedBody,
        rating: feedbackRating,
      });

      setFeedbackAction("approve");
      setFeedbackBody("");
      setFeedbackRating(5);
      setFeedbackDecisionSelectOpen(false);
      setShowFeedbackPanel(false);
      setEditingTaskId(null);
    } catch (error) {
      setEditingTaskError(error instanceof Error ? error.message : "Unable to update task.");
      return;
    } finally {
      setIsSubmittingFeedback(false);
    }

    // Project workflow is manager-controlled.
    // Client review updates only the task through the client-approval endpoint.
    // Feedback is stored separately in `project_feedback` for history/timeline.
  };



  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreatingTask(true);
    try {
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
    } finally {
      setIsCreatingTask(false);
    }
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

  const openManagerTaskDetail = (taskId: string) => {
    router.push(`/projects/${project.id}/tasks/${taskId}`);
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
            ? "review"
            : editingTask?.completionScreenshotUrl && editingTaskReviewAction === "internal"
              ? "done"
          : editingTaskStatus;

      const nextClientVisible =
        editingTask?.completionScreenshotUrl && editingTaskReviewAction === "submit"
          ? true
          : editingTask?.completionScreenshotUrl && editingTaskReviewAction === "revise"
            ? false
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
        completionScreenshotUrl: editingTask?.completionScreenshotUrl ?? null,
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
  const editingTaskAssets = editingTask ? parseTaskCompletionAssets(editingTask.completionScreenshotUrl) : [];

  if (!ready || !user) {
    return (
      <main className="page-stack">
        <section className="panel">
          <p>Loading project...</p>
        </section>
      </main>
    );
  }

  if (!projectRecord || !canAccessProject) {
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
      {previewAsset ? (
        <PreviewOverlay
          role="dialog"
          aria-modal="true"
          aria-label="Deliverable preview"
          onClick={() => setPreviewAsset(null)}
        >
          <PreviewCloseButton
            type="button"
            aria-label="Close preview"
            onClick={() => setPreviewAsset(null)}
          >
            <IconClose />
          </PreviewCloseButton>
          <PreviewFrame onClick={(event) => event.stopPropagation()}>
            <PreviewImage src={previewAsset} alt="Deliverable preview" />
          </PreviewFrame>
        </PreviewOverlay>
      ) : null}

      {isUpdatingProject || isUpdatingTask || isCreatingTask || isSubmittingFeedback ? (
        <TaskUpdateLoadingOverlay role="status" aria-live="polite">
          <div className="auth-loading-card">
            <div className="auth-loading-spinner" aria-hidden="true" />
            <p>
              {isSubmittingFeedback
                ? "Submitting review..."
                : isCreatingTask
                  ? "Creating task..."
                  : isUpdatingTask
                    ? "Updating task..."
                    : "Updating project..."}
            </p>
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
                feedbackEntries: versionFeedbackEntries.map((entry) => ({
                  id: entry.id,
                  source: entry.source,
                  author: entry.authorName,
                  body: entry.body,
                  createdAt: entry.createdAt,
                  rating: entry.rating,
                })),
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

      {showReferencePanel ? (
        <ModalBackdrop onClick={() => setShowReferencePanel(false)}>
          <ModalCard onClick={(event) => event.stopPropagation()}>
            <ModalHeader>
              <div>
                <ModalTitle>Reference files</ModalTitle>
                <ModalDescription>Open or download the attachments linked to this project.</ModalDescription>
              </div>
              <ModalClose type="button" onClick={() => setShowReferencePanel(false)} aria-label="Close">
                <IconClose />
              </ModalClose>
            </ModalHeader>

            {referenceAttachments.length ? (
              <ReferenceList>
                {referenceAttachments.map((attachmentUrl, index) => (
                  <ReferenceItem key={`${attachmentUrl}-${index}`}>
                    <ReferenceItemCopy>
                      <ReferenceItemName>{getReferenceLabel(attachmentUrl)}</ReferenceItemName>
                    </ReferenceItemCopy>
                    <ReferenceItemLink href={attachmentUrl} target="_blank" rel="noreferrer">
                      <IconDownload />
                      Download
                    </ReferenceItemLink>
                  </ReferenceItem>
                ))}
              </ReferenceList>
            ) : (
              <EmptyState>No reference files have been attached yet.</EmptyState>
            )}
          </ModalCard>
        </ModalBackdrop>
      ) : null}

      {heroDetailPanel ? (
        <ModalBackdrop onClick={() => setHeroDetailPanel(null)}>
          <ModalCard onClick={(event) => event.stopPropagation()}>
            <ModalHeader>
              <div>
                <ModalTitle>
                  {heroDetailPanel === "brief"
                    ? "Project brief"
                    : heroDetailPanel === "objective"
                      ? "Project objective"
                      : "Creative advice"}
                </ModalTitle>
                <ModalDescription>
                  {heroDetailPanel === "brief"
                    ? "Detailed project brief for this request."
                    : heroDetailPanel === "objective"
                      ? "Primary objective and expected outcome."
                      : "Creative direction and supporting notes."}
                </ModalDescription>
              </div>
              <ModalClose type="button" onClick={() => setHeroDetailPanel(null)} aria-label="Close">
                <IconClose />
              </ModalClose>
            </ModalHeader>
            <HeroDetailCopy>
              {heroDetailPanel === "brief"
                ? project.projectBrief || project.description || "No project brief yet."
                : heroDetailPanel === "objective"
                  ? project.projectObjective || "Not set"
                  : project.creativeAdvice || "Not set"}
            </HeroDetailCopy>
          </ModalCard>
        </ModalBackdrop>
      ) : null}

      {showEditPanel ? (
      <ModalBackdrop onClick={() => setShowEditPanel(false)}>
        <ProjectUpdateModalCard onClick={(event) => event.stopPropagation()}>
          <ProjectUpdateScrollArea>
                <ModalHeader>
                  <div>
                    <ModalTitle>Update project</ModalTitle>
                    <ModalDescription>Change project details and request intake.</ModalDescription>
                  </div>
              <ModalClose type="button" onClick={() => setShowEditPanel(false)} aria-label="Close">
                <IconClose />
              </ModalClose>
            </ModalHeader>

            <ProjectForm
              initialValues={projectFormInitialValues}
              departments={state.departments}
              clientOrganizations={state.clientOrganizations}
              clients={availableClients}
              submitLabel="Save Project"
              onSubmit={async () => {}}
              hideActions
              onValuesChange={setProjectDraft}
              embedded
            />

            <ProjectUpdateActions>
            <button
              className="primary-button mobile-full-button"
              type="button"
              disabled={isUpdatingProject}
              onClick={async () => {
                setIsUpdatingProject(true);

                try {
                  await updateProject(project.id, projectDraft);
                  setShowEditPanel(false);
                } finally {
                  setIsUpdatingProject(false);
                }
              }}
            >
              {isUpdatingProject ? "Updating..." : "Save changes"}
            </button>
            </ProjectUpdateActions>
          </ProjectUpdateScrollArea>
        </ProjectUpdateModalCard>
      </ModalBackdrop>
            ) : null}

      {showCreateTaskPanel && canManageTasks ? (
        <ModalBackdrop onClick={() => setShowCreateTaskPanel(false)}>
          <TaskPopupCard onClick={(event) => event.stopPropagation()}>
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
                      <TaskSelectValue>{getTaskStatusLabel(newTaskStatus)}</TaskSelectValue>
                      <TaskSelectChevron $open={createTaskSelect === "status"}>
                        <IconChevronDown />
                      </TaskSelectChevron>
                    </TaskSelectTrigger>
                    <TaskFloatingLabel>Status</TaskFloatingLabel>
                    {createTaskSelect === "status" ? (
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
                              setCreateTaskSelect(null);
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
          </TaskPopupCard>
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
              <TaskFloatingSelect $filled $open={feedbackDecisionSelectOpen}>
                <TaskSelectTrigger
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={feedbackDecisionSelectOpen}
                  disabled={isSubmittingFeedback}
                  onClick={() =>
                    setFeedbackDecisionSelectOpen((current) => (current ? false : true))
                  }
                >
                  <TaskSelectValue>
                    {feedbackAction === "request_revision" ? "Request revision" : "Approve"}
                  </TaskSelectValue>
                  <TaskSelectChevron $open={feedbackDecisionSelectOpen}>
                    <IconChevronDown />
                  </TaskSelectChevron>
                </TaskSelectTrigger>
                <TaskFloatingLabel>Decision</TaskFloatingLabel>
                {feedbackDecisionSelectOpen ? (
                  <TaskSelectMenu role="listbox" aria-label="Decision">
                    {[
                      { value: "approve" as const, label: "Approve" },
                      { value: "request_revision" as const, label: "Request revision" },
                    ].map((option) => (
                      <TaskSelectOption
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={feedbackAction === option.value}
                        $active={feedbackAction === option.value}
                        onClick={() => {
                          setFeedbackAction(option.value);
                          setEditingTaskError("");
                          setFeedbackDecisionSelectOpen(false);

                          if (option.value === "approve") {
                            setFeedbackBody("");
                          }
                        }}
                      >
                        {option.label}
                      </TaskSelectOption>
                    ))}
                  </TaskSelectMenu>
                ) : null}
              </TaskFloatingSelect>

              <PriorityField>
                <MetaLabel>Rating</MetaLabel>
                <RatingStarsRow aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <RatingStarButton
                      key={rating}
                      type="button"
                      disabled={isSubmittingFeedback}
                      $active={feedbackRating === rating}
                      onClick={() => setFeedbackRating(rating)}
                      aria-label={`Rate ${rating} star${rating === 1 ? "" : "s"}`}
                    >
                      <Star aria-hidden="true" $filled={rating <= feedbackRating}>
                        ★
                      </Star>
                    </RatingStarButton>
                  ))}
                </RatingStarsRow>
              </PriorityField>

              {feedbackAction === "request_revision" ? (
                <label className="field">
                  <span>Revision comment</span>
                  <FeedbackTextarea
                    value={feedbackBody}
                    disabled={isSubmittingFeedback}
                    onChange={(event) => setFeedbackBody(event.target.value)}
                    rows={4}
                    placeholder="Please explain what needs to be revised."
                    required
                  />
                </label>
              ) : (
                <label className="field">
                  <span>Comment</span>
                  <FeedbackTextarea
                    value={feedbackBody}
                    disabled={isSubmittingFeedback}
                    onChange={(event) => setFeedbackBody(event.target.value)}
                    rows={4}
                    placeholder="Optional — add context for your decision."
                  />
                </label>
              )}

              <button className="primary-button" type="submit" disabled={isSubmittingFeedback}>
                {isSubmittingFeedback ? "Submitting..." : "Submit feedback"}
              </button>
            </InlineForm>
          </ModalCard>
        </ModalBackdrop>
      ) : null}

      {editingTask && canManageTasks ? (
        <ModalBackdrop onClick={() => setEditingTaskId(null)}>
          <TaskPopupCard onClick={(event) => event.stopPropagation()}>
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
                      <TaskSelectValue>{getTaskStatusLabel(editingTaskStatus)}</TaskSelectValue>
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
                    value={editingTaskDueDate}
                    onChange={setEditingTaskDueDate}
                  />
                </TaskModalField>
              </TaskModalGrid>
              {editingTaskAssets.length > 0 ? (
                <TaskDeliveryReview>
                  <InlineFormTitle>Latest uploaded assets</InlineFormTitle>
                  <TaskDeliveryAssetGrid>
                    {editingTaskAssets.map((asset) => (
                      <TaskDeliveryAssetCard key={asset}>
                        {isTaskCompletionImage(asset) ? (
                          <TaskDeliveryPreviewButton
                            type="button"
                            onClick={() => setPreviewAsset(asset)}
                            aria-label={`Preview ${getTaskCompletionLabel(asset)}`}
                          >
                            <TaskDeliveryPreviewWrap>
                              <TaskDeliveryPreview
                                src={asset}
                                alt={`${getTaskCompletionLabel(asset)} for ${editingTask.title}`}
                              />
                            </TaskDeliveryPreviewWrap>
                          </TaskDeliveryPreviewButton>
                        ) : (
                          <TaskDeliveryFileCard href={asset} target="_blank" rel="noreferrer">
                            {isTaskCompletionLink(asset) ? <IconLink /> : <IconFile />}
                            <span>{getTaskCompletionLabel(asset)}</span>
                          </TaskDeliveryFileCard>
                        )}
                      </TaskDeliveryAssetCard>
                    ))}
                  </TaskDeliveryAssetGrid>
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
                      {editingTask.status === "review" ? "Awaiting client review" : "Send to client"}
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
                <button
                  className="primary-button"
                  type="submit"
                  disabled={editingTaskReviewAction === "submit" && editingTask?.status === "review"}
                >
                  {editingTask?.completionScreenshotUrl
                    ? editingTaskReviewAction === "revise"
                      ? "Send revision"
                      : editingTaskReviewAction === "submit"
                        ? editingTask.status === "review"
                          ? "Awaiting client review"
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
          </TaskPopupCard>
        </ModalBackdrop>
      ) : null}

      {editingTask &&
        user &&
        user.role === "client" &&
        (editingTask.status === "approved" || (editingTask.status === "review" && editingTask.clientVisible)) ? (
        <ModalBackdrop onClick={() => setEditingTaskId(null)}>

          <ModalCard onClick={(event) => event.stopPropagation()}>
            <ModalHeader>
              <div>
                <ModalTitle>{editingTask.status === "approved" ? "Approved deliverable" : "Deliverable review"}</ModalTitle>
                <ModalDescription>
                  {editingTask.status === "approved"
                    ? "View the files that were approved for this task."
                    : "View the latest screenshot, rate it, and approve or request revision."}
                </ModalDescription>
              </div>
              <ModalClose type="button" onClick={() => setEditingTaskId(null)} aria-label="Close">
                <IconClose />
              </ModalClose>
            </ModalHeader>

            {editingTaskAssets.length > 0 ? (
              <TaskDeliveryAssetGrid>
                {editingTaskAssets.map((asset) => (
                  <TaskDeliveryAssetCard key={asset}>
                    {isTaskCompletionImage(asset) ? (
                      <TaskDeliveryPreviewButton
                        type="button"
                        onClick={() => setPreviewAsset(asset)}
                        aria-label={`Preview ${getTaskCompletionLabel(asset)}`}
                      >
                        <TaskDeliveryPreviewWrap>
                          <TaskDeliveryPreview
                            src={asset}
                            alt={`${getTaskCompletionLabel(asset)} for ${editingTask.title}`}
                          />
                        </TaskDeliveryPreviewWrap>
                      </TaskDeliveryPreviewButton>
                    ) : (
                      <TaskDeliveryFileCard href={asset} target="_blank" rel="noreferrer">
                        {isTaskCompletionLink(asset) ? <IconLink /> : <IconFile />}
                        <span>{getTaskCompletionLabel(asset)}</span>
                      </TaskDeliveryFileCard>
                    )}
                  </TaskDeliveryAssetCard>
                ))}
              </TaskDeliveryAssetGrid>
            ) : null}

            {editingTask.status === "review" ? (
            <InlineForm
              onSubmit={(event) => {
                const formEvent = event as FormEvent<HTMLFormElement>;
                return handleFeedbackSubmit(formEvent);
              }}
            >
              <TaskFloatingSelect $filled $open={feedbackDecisionSelectOpen}>
                <TaskSelectTrigger
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={feedbackDecisionSelectOpen}
                  disabled={isSubmittingFeedback}
                  onClick={() =>
                    setFeedbackDecisionSelectOpen((current) => (current ? false : true))
                  }
                >
                  <TaskSelectValue>
                    {feedbackAction === "request_revision" ? "Request revision" : "Approve"}
                  </TaskSelectValue>
                  <TaskSelectChevron $open={feedbackDecisionSelectOpen}>
                    <IconChevronDown />
                  </TaskSelectChevron>
                </TaskSelectTrigger>
                <TaskFloatingLabel>Decision</TaskFloatingLabel>
                {feedbackDecisionSelectOpen ? (
                  <TaskSelectMenu role="listbox" aria-label="Decision">
                    {[
                      { value: "approve" as const, label: "Approve" },
                      { value: "request_revision" as const, label: "Request revision" },
                    ].map((option) => (
                      <TaskSelectOption
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={feedbackAction === option.value}
                        $active={feedbackAction === option.value}
                        onClick={() => {
                          setFeedbackAction(option.value);
                          setEditingTaskError("");
                          setFeedbackDecisionSelectOpen(false);

                          if (option.value === "approve") {
                            setFeedbackBody("");
                          }
                        }}
                      >
                        {option.label}
                      </TaskSelectOption>
                    ))}
                  </TaskSelectMenu>
                ) : null}
              </TaskFloatingSelect>

              <PriorityField>
                <MetaLabel>Rating</MetaLabel>
                <RatingStarsRow aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <RatingStarButton
                      key={rating}
                      type="button"
                      disabled={isSubmittingFeedback}
                      $active={feedbackRating === rating}
                      onClick={() => setFeedbackRating(rating)}
                      aria-label={`Rate ${rating} star${rating === 1 ? "" : "s"}`}
                    >
                      <Star aria-hidden="true" $filled={rating <= feedbackRating}>
                        ★
                      </Star>
                    </RatingStarButton>
                  ))}
                </RatingStarsRow>
              </PriorityField>

              {feedbackAction === "request_revision" ? (
                <label className="field">
                  <span>Revision comment</span>
                  <FeedbackTextarea
                    value={feedbackBody}
                    disabled={isSubmittingFeedback}
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
                  <FeedbackTextarea
                    value={feedbackBody}
                    disabled={isSubmittingFeedback}
                    onChange={(event) => setFeedbackBody(event.target.value)}
                    rows={3}
                    placeholder="Optional — add context for your decision."
                  />
                </label>
              ) : null}

              {editingTaskError ? <TaskInlineError>{editingTaskError}</TaskInlineError> : null}

              <button className="primary-button" type="submit" disabled={isSubmittingFeedback}>
                {isSubmittingFeedback ? "Submitting..." : "Submit review"}
              </button>
            </InlineForm>
            ) : (
              <ApprovedTaskNotice>
                This task has already been approved by the client.
              </ApprovedTaskNotice>
            )}
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
          <MobileTitle>{projectDisplayName}</MobileTitle>
          <MobileNavSpacer />
        </MobileNavRow>

        <DesktopHeaderRow>
          <Breadcrumbs>
            <Link href="/projects">Projects</Link>
            <span>/</span>
            <strong>{projectDisplayName}</strong>
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
            <FallbackLetter>{getProjectInitial(projectDisplayName)}</FallbackLetter>
          </ProjectGlyph>

          <HeroCopy>
            <HeroTitleRow>
              <HeroTitleStack>
                <ProjectIdTag>{project.projectCode ?? project.id}</ProjectIdTag>
                <HeroTitle>{projectDisplayName}</HeroTitle>
                <MobileStatusPills>
                  {project.stage === "On Hold" ? (
                    <Badge style={{ background: projectStatusTone.bg, color: projectStatusTone.fg }}>
                      {formatProjectStage(project.stage)}
                    </Badge>
                  ) : null}
                </MobileStatusPills>
              </HeroTitleStack>
              <HeroUtilityRow>
                {project.departmentName ? (
                  <Badge style={{ background: "rgba(244, 241, 237, 1)", color: "#7f7468" }}>
                    {project.departmentName}
                  </Badge>
                ) : null}
                {project.priorityLevel ? (
                  <Badge style={{ background: "rgba(244, 241, 237, 1)", color: "#7f7468" }}>
                    {project.priorityLevel}
                  </Badge>
                ) : null}
                <ReferenceTrigger
                  type="button"
                  onClick={() => setShowReferencePanel(true)}
                  aria-label="Open reference files"
                >
                  <IconAttachment />
                  <span>Reference files</span>
                  {referenceAttachments.length ? <ReferenceCount>{referenceAttachments.length}</ReferenceCount> : null}
                </ReferenceTrigger>
              </HeroUtilityRow>
            </HeroTitleRow>

            <DesktopMetaGrid>
              <MetaBlock>
                <MetaLabel>Client Organization</MetaLabel>
                <MetaValue>{clientOrganizationName}</MetaValue>
                <MetaMuted>{primaryContactLabel}</MetaMuted>
              </MetaBlock>
              <MetaBlock>
                <MetaLabel>Requested Date</MetaLabel>
                <MetaValue>
                  <InlineIcon>
                    <IconCalendarMini />
                  </InlineIcon>
                  {project.requestedDate ? formatDate(project.requestedDate) : "Auto-set"}
                </MetaValue>
              </MetaBlock>
              <MetaBlock>
                <MetaLabel>First Draft</MetaLabel>
                <MetaValue>
                  <InlineIcon>
                    <IconCalendarMini />
                  </InlineIcon>
                  {formatDate(project.firstDraftDate ?? "")}
                </MetaValue>
              </MetaBlock>
              <MetaBlock>
                <MetaLabel>Final Deliverable</MetaLabel>
                <MetaValue>
                  <InlineIcon>
                    <IconCalendarMini />
                  </InlineIcon>
                  {formatDate(project.finalDeliverableDate ?? project.dueDate)}
                </MetaValue>
              </MetaBlock>
              <MetaBlock>
                <MetaLabel>Project Type</MetaLabel>
                <MetaValueText>{project.projectType ?? project.category ?? "Not set"}</MetaValueText>
              </MetaBlock>
            </DesktopMetaGrid>

          
          </HeroCopy>
        </HeroTop>

        <HeroDesktopGrid>
          <HeroPillRow>
            <HeroDetailPill type="button" onClick={() => setHeroDetailPanel("brief")}>
              <IconDocument />
              Project Brief
            </HeroDetailPill>
            <HeroDetailPill type="button" onClick={() => setHeroDetailPanel("objective")}>
              <IconTarget />
              Project Objective
            </HeroDetailPill>
            <HeroDetailPill type="button" onClick={() => setHeroDetailPanel("advice")}>
              <IconSpark />
              Creative Advice
            </HeroDetailPill>
          </HeroPillRow>

          <WorkflowPanel>
            <WorkflowHeader>
              <MetaLabel>Project Workflow</MetaLabel>
              {project.stage === "On Hold" ? (
                <Badge style={{ background: projectStatusTone.bg, color: projectStatusTone.fg }}>
                  {formatProjectStage(project.stage)}
                </Badge>
              ) : null}
            </WorkflowHeader>

            <WorkflowRail>
              <WorkflowLine />
              <WorkflowLineFill $progress={workflowTimelineIndex / (workflowTimelineStages.length - 1)} />
              <WorkflowStageGrid>
                {workflowTimelineStages.map((option, index) => {
                  const isComplete = index < workflowTimelineIndex;
                  const isCurrent = index === workflowTimelineIndex;
                  const isUpcoming = index > workflowTimelineIndex;

                  return (
                    <WorkflowStageItem key={option}>
                      <WorkflowNode $complete={isComplete} $current={isCurrent} $upcoming={isUpcoming}>
                        {isComplete ? <IconCheckTiny /> : null}
                      </WorkflowNode>
                      <WorkflowStageLabel>{formatProjectStage(option)}</WorkflowStageLabel>
                    </WorkflowStageItem>
                  );
                })}
              </WorkflowStageGrid>
            </WorkflowRail>
          </WorkflowPanel>
        </HeroDesktopGrid>

        <HeroMobileStack>
          <MobileHeroMetaCard>
            <MobileHeroMetaGrid>
              <MobileHeroMetaItem>
                <CompactIconWrap>
                  <IconClient />
                </CompactIconWrap>
                <div>
                  <MetaLabel>Client Organization</MetaLabel>
                  <MetaValueText>{clientOrganizationName}</MetaValueText>
                </div>
              </MobileHeroMetaItem>
              <MobileHeroMetaItem>
                <CompactIconWrap>
                  <IconClient />
                </CompactIconWrap>
                <div>
                  <MetaLabel>Primary Contact</MetaLabel>
                  <MetaValueText>{primaryClientContact?.name ?? "No primary contact"}</MetaValueText>
                </div>
              </MobileHeroMetaItem>
              <MobileHeroMetaItem>
                <CompactIconWrap>
                  <IconCalendarMini />
                </CompactIconWrap>
                <div>
                  <MetaLabel>First Draft</MetaLabel>
                  <MetaValueText>{formatDate(project.firstDraftDate ?? "")}</MetaValueText>
                </div>
              </MobileHeroMetaItem>
              <MobileHeroMetaItem>
                <CompactIconWrap>
                  <IconCalendarMini />
                </CompactIconWrap>
                <div>
                  <MetaLabel>Final Deliverable</MetaLabel>
                  <MetaValueText>{formatDate(project.finalDeliverableDate ?? project.dueDate)}</MetaValueText>
                </div>
              </MobileHeroMetaItem>
              <MobileHeroMetaItem>
                <CompactIconWrap>
                  <IconFolderMini />
                </CompactIconWrap>
                <div>
                  <MetaLabel>Project Type</MetaLabel>
                  <MetaValueText>{project.projectType ?? project.category ?? "Not set"}</MetaValueText>
                </div>
              </MobileHeroMetaItem>
            </MobileHeroMetaGrid>
          </MobileHeroMetaCard>

          <MobileHeroLinksCard>
            <MobileHeroDetailRow type="button" onClick={() => setHeroDetailPanel("brief")}>
              <MobileHeroDetailLeading>
                <MobileHeroDetailIcon>
                  <IconDocument />
                </MobileHeroDetailIcon>
                <div>
                  <MobileHeroDetailTitle>Project Brief</MobileHeroDetailTitle>
                  <MobileHeroDetailPreview>{project.projectBrief || project.description || "No project brief yet."}</MobileHeroDetailPreview>
                </div>
              </MobileHeroDetailLeading>
              <MobileHeroDetailArrow>
                <IconArrowRight />
              </MobileHeroDetailArrow>
            </MobileHeroDetailRow>

            <MobileHeroDetailRow type="button" onClick={() => setHeroDetailPanel("objective")}>
              <MobileHeroDetailLeading>
                <MobileHeroDetailIcon>
                  <IconTarget />
                </MobileHeroDetailIcon>
                <div>
                  <MobileHeroDetailTitle>Project Objective</MobileHeroDetailTitle>
                  <MobileHeroDetailPreview>{project.projectObjective || "Not set"}</MobileHeroDetailPreview>
                </div>
              </MobileHeroDetailLeading>
              <MobileHeroDetailArrow>
                <IconArrowRight />
              </MobileHeroDetailArrow>
            </MobileHeroDetailRow>

            <MobileHeroDetailRow type="button" onClick={() => setHeroDetailPanel("advice")}>
              <MobileHeroDetailLeading>
                <MobileHeroDetailIcon>
                  <IconSpark />
                </MobileHeroDetailIcon>
                <div>
                  <MobileHeroDetailTitle>Creative Advice</MobileHeroDetailTitle>
                  <MobileHeroDetailPreview>{project.creativeAdvice || "Not set"}</MobileHeroDetailPreview>
                </div>
              </MobileHeroDetailLeading>
              <MobileHeroDetailArrow>
                <IconArrowRight />
              </MobileHeroDetailArrow>
            </MobileHeroDetailRow>
          </MobileHeroLinksCard>

          <BriefAndTimeline>
            <WorkflowPanel>
              <WorkflowHeader>
                <MetaLabel>Project Workflow</MetaLabel>
                {project.stage === "On Hold" ? (
                  <Badge style={{ background: projectStatusTone.bg, color: projectStatusTone.fg }}>
                    {formatProjectStage(project.stage)}
                  </Badge>
                ) : null}
              </WorkflowHeader>

              <WorkflowRail>
                <WorkflowLine />
                <WorkflowLineFill $progress={workflowTimelineIndex / (workflowTimelineStages.length - 1)} />
                <WorkflowStageGrid>
                  {workflowTimelineStages.map((option, index) => {
                    const isComplete = index < workflowTimelineIndex;
                    const isCurrent = index === workflowTimelineIndex;
                    const isUpcoming = index > workflowTimelineIndex;

                    return (
                      <WorkflowStageItem key={option}>
                        <WorkflowNode $complete={isComplete} $current={isCurrent} $upcoming={isUpcoming}>
                          {isComplete ? <IconCheckTiny /> : null}
                        </WorkflowNode>
                        <WorkflowStageLabel>{formatProjectStage(option)}</WorkflowStageLabel>
                      </WorkflowStageItem>
                    );
                  })}
                </WorkflowStageGrid>
              </WorkflowRail>

              {/* <OverviewDetailsGrid>
                <DetailChip>
                  <MetaLabel>Project Type</MetaLabel>
                  <MetaValueText>{project.projectType ?? project.category ?? "Not set"}</MetaValueText>
                </DetailChip>
              </OverviewDetailsGrid> */}
            </WorkflowPanel>
          </BriefAndTimeline>
        </HeroMobileStack>
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
                  const needsAttention = taskNeedsAttention(user, project, task);

                  return (
                    <TaskRowBlock key={task.id}>
                      <TaskTableRow
                        $attention={needsAttention}
                        $interactive={canManageThisTask || canOpenDesignerTask || (user.role === "client" && canClientOpenTask(task))}
                        onClick={() => {
                          if (user.role === "client" && canClientOpenTask(task)) {
                            startEditingTask(task.id);
                            return;
                          }

                          if (canManageThisTask) {
                            openManagerTaskDetail(task.id);
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
                  const needsAttention = taskNeedsAttention(user, project, task);

                  return (
                  <MobileTaskCard
                      key={task.id}
                      $attention={needsAttention}
                      $interactive={canManageThisTask || canOpenDesignerTask || (user.role === "client" && canClientOpenTask(task))}
                      onClick={() => {
                        if (user.role === "client" && canClientOpenTask(task)) {
                          startEditingTask(task.id);
                          return;
                        }

                        if (canManageThisTask) {
                          openManagerTaskDetail(task.id);
                        } else if (canOpenDesignerTask) {
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
              </PanelHeader>
              {selectedDeliverableTask && selectedDeliverableVersion && selectedDeliverableAsset ? (
                <>
                  <VersionControls>
                    {deliverableTaskOptions.length > 1 ? (
                      <TaskFloatingSelect $filled $open={deliverableTaskSelectOpen}>
                        <VersionSelectTrigger
                          type="button"
                          aria-haspopup="listbox"
                          aria-expanded={deliverableTaskSelectOpen}
                          onClick={() => setDeliverableTaskSelectOpen((current) => !current)}
                        >
                          <TaskSelectValue>{selectedDeliverableTask.taskTitle}</TaskSelectValue>
                          <TaskSelectChevron $open={deliverableTaskSelectOpen}>
                            <IconChevronDown />
                          </TaskSelectChevron>
                        </VersionSelectTrigger>
                        <TaskFloatingLabel>Task</TaskFloatingLabel>
                        {deliverableTaskSelectOpen ? (
                          <TaskSelectMenu role="listbox" aria-label="Task">
                            {deliverableTaskOptions.map((option) => (
                              <TaskSelectOption
                                key={option.taskId}
                                type="button"
                                role="option"
                                aria-selected={selectedDeliverableTask.taskId === option.taskId}
                                $active={selectedDeliverableTask.taskId === option.taskId}
                                onClick={() => {
                                  setSelectedDeliverableTaskId(option.taskId);
                                  setDeliverableTaskSelectOpen(false);
                                }}
                              >
                                {option.taskTitle}
                              </TaskSelectOption>
                            ))}
                          </TaskSelectMenu>
                        ) : null}
                      </TaskFloatingSelect>
                    ) : null}
                    {selectedDeliverableTask.versionOptions.length > 1 ? (
                      <TaskFloatingSelect $filled $open={deliverableVersionSelectOpen}>
                        <VersionSelectTrigger
                          type="button"
                          aria-haspopup="listbox"
                          aria-expanded={deliverableVersionSelectOpen}
                          onClick={() => setDeliverableVersionSelectOpen((current) => !current)}
                        >
                          <TaskSelectValue>{selectedDeliverableVersion.label}</TaskSelectValue>
                          <TaskSelectChevron $open={deliverableVersionSelectOpen}>
                            <IconChevronDown />
                          </TaskSelectChevron>
                        </VersionSelectTrigger>
                        <TaskFloatingLabel>Version</TaskFloatingLabel>
                        {deliverableVersionSelectOpen ? (
                          <TaskSelectMenu role="listbox" aria-label="Version">
                            {selectedDeliverableTask.versionOptions.map((option) => (
                              <TaskSelectOption
                                key={option.id}
                                type="button"
                                role="option"
                                aria-selected={selectedDeliverableVersion.id === option.id}
                                $active={selectedDeliverableVersion.id === option.id}
                                onClick={() => {
                                  setSelectedDeliverableVersionId(option.id);
                                  setDeliverableVersionSelectOpen(false);
                                }}
                              >
                                {option.label}
                              </TaskSelectOption>
                            ))}
                          </TaskSelectMenu>
                        ) : null}
                      </TaskFloatingSelect>
                    ) : null}
                  </VersionControls>
                  <VersionHero>
                    <VersionAssetRail>
                      {selectedDeliverableAssets.length > 1 ? (
                        <VersionAssetChevron
                          type="button"
                          onClick={() =>
                            setSelectedDeliverableAssetIndex((current) =>
                              current === 0 ? selectedDeliverableAssets.length - 1 : current - 1,
                            )
                          }
                          aria-label="Previous file"
                        >
                          <IconChevronLeft />
                        </VersionAssetChevron>
                      ) : null}
                      <VersionPreviewButton
                        type="button"
                        onClick={() => (isTaskCompletionImage(selectedDeliverableAsset) ? setPreviewAsset(selectedDeliverableAsset) : undefined)}
                        disabled={!isTaskCompletionImage(selectedDeliverableAsset)}
                        aria-label={
                          isTaskCompletionImage(selectedDeliverableAsset)
                            ? `Preview ${getTaskCompletionLabel(selectedDeliverableAsset)}`
                            : undefined
                        }
                      >
                        {isTaskCompletionImage(selectedDeliverableAsset) ? (
                          <VersionPreviewImage
                            src={selectedDeliverableAsset}
                            alt={getTaskCompletionLabel(selectedDeliverableAsset)}
                          />
                        ) : (
                          <VersionFilePreview>
                            {isTaskCompletionLink(selectedDeliverableAsset) ? <IconLink /> : <IconFile />}
                            <strong>{getTaskCompletionLabel(selectedDeliverableAsset)}</strong>
                          </VersionFilePreview>
                        )}
                      </VersionPreviewButton>
                      {selectedDeliverableAssets.length > 1 ? (
                        <VersionAssetChevron
                          type="button"
                          onClick={() =>
                            setSelectedDeliverableAssetIndex((current) =>
                              current === selectedDeliverableAssets.length - 1 ? 0 : current + 1,
                            )
                          }
                          aria-label="Next file"
                        >
                          <IconChevronRight />
                        </VersionAssetChevron>
                      ) : null}
                    </VersionAssetRail>
                    <VersionCopy>
                      <VersionHeadingRow>
                        <strong>{selectedDeliverableTask.taskTitle}</strong>
                        <Badge style={{ background: "rgba(244, 241, 237, 1)", color: "#7f7468" }}>
                          {selectedDeliverableVersion.label}
                        </Badge>
                      </VersionHeadingRow>
                      <VersionMeta>
                        Updated by{" "}
                        {state.users.find((candidate) => candidate.id === selectedDeliverableTask.assigneeId)?.name ??
                          "Team member"}{" "}
                        on {formatDate(selectedDeliverableVersion.createdAt)}
                      </VersionMeta>
                      <VersionMeta>
                        File {selectedDeliverableAssetIndex + 1} of {selectedDeliverableAssets.length}
                      </VersionMeta>
                    </VersionCopy>
                  </VersionHero>
                  <VersionNotes>
                    {selectedDeliverableVersion.versionKind === "current"
                      ? "Current deliverables for this task version."
                      : "Archived deliverables for this task version."}
                  </VersionNotes>
                </>
              ) : (
                <EmptyState>No task deliverables have been published yet.</EmptyState>
              )}
            </WorkspaceCard>

            <WorkspaceCard className="panel">
              <PanelHeader>
                <h2>Feedback</h2>
              </PanelHeader>
              {versionFeedbackEntries.length ? (
                <ActivityList>
                  {versionFeedbackEntries.slice(0, 4).map((item) => {
                    const tone =
                      item.source === "client" && item.action
                        ? getFeedbackTone(item.action)
                        : { bg: "#eef3f0", fg: "#214f39", label: "Internal Feedback" };
                    return (
                      <ActivityItemCard key={item.id}>
                        <ActivityAvatar>{getUserInitial(item.authorName)}</ActivityAvatar>
                        <div>
                          <ActivityLine>
                            <strong>{item.authorName}</strong>
                            <Badge
                              style={{
                                background: item.source === "internal" ? "#eef3f0" : tone.bg,
                                color: item.source === "internal" ? "#214f39" : tone.fg,
                              }}
                            >
                              {item.source === "internal" ? "Internal Feedback" : "Client Feedback"}
                            </Badge>
                          </ActivityLine>
                          <VersionMeta>{formatDate(item.createdAt)}</VersionMeta>
                          {item.rating ? (
                            <RatingReadout>
                              {Array.from({ length: 5 }, (_, index) => (
                                <Star key={index} $filled={index < item.rating!}>
                                  ★
                                </Star>
                              ))}
                            </RatingReadout>
                          ) : null}
                          <ActivityMeta>{item.body}</ActivityMeta>
                        </div>
                      </ActivityItemCard>
                    );
                  })}
                </ActivityList>
              ) : (
                <EmptyState>No feedback for this version yet.</EmptyState>
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
const mobileBottomNavHeight = "76px";

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
    align-items: flex-start;
    padding: 8px;
    background: rgba(255, 255, 255, 0.58);
    min-height: 100vh;
  }
`;

const Content = styled.section`
  display: flex;
  flex-direction: column;
  min-width: 0;

  ${desktop} {
    flex: 1;
    padding: 14px 16px 16px;
    border-radius: 0 22px 22px 0;
    background:
      radial-gradient(circle at top center, rgba(255, 255, 255, 0.76), transparent 18%),
      linear-gradient(180deg, rgba(252, 249, 244, 0.92), rgba(247, 243, 237, 0.84));
  }
`;

const ProjectUpdateModalCard = styled.section`
  ${cardSurface}
  width: min(100%, 700px);
  max-width: 100%;
  max-height: calc(100dvh - 24px);
  overflow-y: auto;
  overflow-x: hidden;
  border-radius: 22px;
  display: block;

  @media (max-width: 767px) {
    width: calc(100vw - 20px);
    max-width: calc(100vw - 20px);
    max-height: calc(100dvh - 76px - 24px - env(safe-area-inset-bottom));
    align-self: end;
    border-radius: 24px;
  }

  ${desktop} {
    max-height: calc(100vh - 48px);
    border-radius: 22px;
  }
`;

const ProjectUpdateScrollArea = styled.div`
  min-height: 0;
  padding: 14px;
  display: grid;
  gap: 14px;

  @media (max-width: 767px) {
    padding: 12px 14px 14px;
    gap: 12px;
  }

  ${desktop} {
    padding: 16px 18px;
    gap: 14px;
  }
`;

const ProjectUpdateActions = styled.div`
  display: grid;
  gap: 10px;
  padding-top: 4px;

  @media (max-width: 767px) {
    padding-bottom: 4px;
  }

  ${desktop} {
    padding-bottom: 6px;
  }
`;

const ContentInner = styled.div`
  
  display: grid;
  gap: 14px;

  ${desktop} {
    gap: 16px;
    width: 90%;
    margin: 0 auto;
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
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  align-items: start;
  gap: 12px;

  @media (max-width: 639px) {
    grid-template-columns: 60px minmax(0, 1fr);
    gap: 10px;
    margin-bottom: 14px;
  }

  ${desktop} {
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

  @media (max-width: 639px) {
    width: 60px;
    height: 60px;
    border-radius: 14px;

    svg {
      width: 28px;
      height: 28px;
    }
  }
`;

const FallbackLetter = styled.span`
  position: absolute;
  bottom: 8px;
  right: 10px;
  font-size: 0.72rem;
  font-weight: 700;
  color: rgba(46, 42, 39, 0.32);

  @media (max-width: 639px) {
    bottom: 6px;
    right: 8px;
    font-size: 0.66rem;
  }
`;

const HeroCopy = styled.div`
  display: grid;
  gap: 12px;
`;

const HeroTitleRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;

  @media (max-width: 767px) {
    flex-direction: column;
    align-items: stretch;
  }

  ${desktop} {
    gap: 12px;
  }
`;

const HeroTitleStack = styled.div`
  min-width: 0;
  display: grid;
  gap: 10px;
`;

const HeroUtilityRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;

  @media (max-width: 767px) {
    justify-content: flex-start;
  }
`;

const ProjectIdTag = styled.span`
  color: var(--color-text-light);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
`;

const HeroTitle = styled.h2`
  margin: 0;
  font-size: clamp(1.3rem, 1.7vw, 1.72rem);
  line-height: 1.15;

  @media (max-width: 639px) {
    font-size: 1.16rem;
    line-height: 1.18;
  }
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

const ReferenceTrigger = styled.button`
  ${outlineButton}
  position: relative;
  min-height: 40px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 14px;
  flex: 0 0 auto;
  font-size: 0.82rem;
  font-weight: 700;
  white-space: nowrap;

  svg {
    width: 17px;
    height: 17px;
  }

  @media (max-width: 767px) {
    width: 100%;
    justify-content: flex-start;
  }
`;

const ReferenceCount = styled.span`
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #214f39;
  color: #fff;
  font-size: 0.68rem;
  font-weight: 700;
`;

const DesktopMetaGrid = styled.div`
  display: none;

  ${desktop} {
    display: grid;
    grid-template-columns: 1.35fr 1fr 1fr 1fr 0.92fr;
    gap: 0;
    border-top: 1px solid rgba(235, 229, 221, 0.95);
    border-bottom: 1px solid rgba(235, 229, 221, 0.95);
  }
`;

const MobileInfoGrid = styled.div`
  display: none;
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

const CompactInfo = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
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

  @media (max-width: 639px) {
    width: 30px;
    height: 30px;
    border-radius: 9px;

    svg {
      width: 16px;
      height: 16px;
    }
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

const HeroDesktopGrid = styled.div`
  display: none;

  ${desktop} {
    display: grid;
    gap: 16px;
    margin-top: 18px;
    align-items: stretch;
  }
`;

const HeroMobileStack = styled.div`
  display: grid;
  gap: 14px;

  ${desktop} {
    display: none;
  }
`;

const MobileHeroMetaCard = styled.div`
  ${cardSurface}
  border-radius: 22px;
  padding: 12px 14px;
`;

const MobileHeroMetaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: 639px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const MobileHeroMetaItem = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 10px;
  padding: 12px 10px 14px 0;
  border-right: 1px solid rgba(235, 229, 221, 0.95);
  border-bottom: 1px solid rgba(235, 229, 221, 0.95);

  &:nth-child(2n) {
    padding-left: 12px;
    border-right: 0;
  }

  &:nth-last-child(-n + 2) {
    border-bottom: 0;
  }

  &:last-child:nth-child(odd) {
    grid-column: 1 / -1;
    border-right: 0;
    padding-right: 0;
  }

  ${MetaValueText} {
    margin-top: 8px;
    font-size: 0.86rem;
    line-height: 1.4;
  }

  ${MetaLabel} {
    font-size: 0.7rem;
    letter-spacing: 0.06em;
  }
`;

const MobileHeroLinksCard = styled.div`
  ${cardSurface}
  border-radius: 22px;
  overflow: hidden;
`;

const MobileHeroDetailRow = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border: 0;
  border-top: 1px solid rgba(235, 229, 221, 0.95);
  background: transparent;
  text-align: left;

  &:first-child {
    border-top: 0;
  }
`;

const MobileHeroDetailLeading = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
`;

const MobileHeroDetailIcon = styled.span`
  width: 40px;
  height: 40px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, #fbf7f1 0%, #f5efe5 100%);
  color: #aa7a2a;

  svg {
    width: 20px;
    height: 20px;
  }
`;

const MobileHeroDetailTitle = styled.strong`
  display: block;
  color: #2e2a27;
  font-size: 0.94rem;
  line-height: 1.25;
`;

const MobileHeroDetailPreview = styled.p`
  margin: 4px 0 0;
  color: #7d7266;
  font-size: 0.82rem;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const MobileHeroDetailArrow = styled.span`
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #2e2a27;
  flex: 0 0 auto;

  svg {
    width: 16px;
    height: 16px;
  }
`;

const HeroPillRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const HeroDetailPill = styled.button`
  ${outlineButton}
  min-height: 40px;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 999px;
  font-size: 0.84rem;
  font-weight: 700;
  color: #6d5f4d;

  svg {
    width: 16px;
    height: 16px;
    color: #aa7a2a;
  }
`;

const HeroDetailCopy = styled.p`
  margin: 0;
  color: #2e2a27;
  font-size: 0.96rem;
  line-height: 1.7;
`;

const WorkflowPanel = styled.div`
  ${cardSurface}
  display: grid;
  gap: 12px;
  align-content: start;
  padding: 14px 18px;
  border-radius: 24px;
`;

const WorkflowHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const WorkflowRail = styled.div`
  position: relative;
  padding: 12px 10px 0;
`;

const WorkflowLine = styled.div`
  position: absolute;
  top: 24px;
  left: 28px;
  right: 28px;
  height: 2px;
  border-radius: 999px;
  background: rgba(204, 187, 154, 0.46);
`;

const WorkflowLineFill = styled.div<{ $progress: number }>`
  position: absolute;
  top: 24px;
  left: 28px;
  height: 2px;
  width: calc(
    ((100% - 56px) * ${({ $progress }) => $progress}) +
      ${({ $progress }) => ($progress > 0 ? "20px" : "0px")}
  );
  border-radius: 999px;
  background: #b98a33;
`;

const WorkflowStageGrid = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
`;

const WorkflowStageItem = styled.div`
  display: grid;
  justify-items: center;
  gap: 8px;
  text-align: center;
`;

const WorkflowNode = styled.span<{ $complete?: boolean; $current?: boolean; $upcoming?: boolean }>`
  width: 20px;
  height: 20px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid
    ${({ $complete, $current }) =>
      $complete || $current ? "#c08f36" : "rgba(220, 213, 205, 0.95)"};
  background: ${({ $complete, $current }) => ($complete || $current ? "#fff" : "#fff")};
  color: #c08f36;
  box-shadow: ${({ $current }) => ($current ? "0 0 0 4px rgba(192, 143, 54, 0.14)" : "none")};

  svg {
    width: 9px;
    height: 9px;
  }
`;

const WorkflowStageLabel = styled.span`
  color: #5d544b;
  font-size: 0.8rem;
  font-weight: 700;
  line-height: 1.2;
`;

const OverviewDetailsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;

  ${desktop} {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-content: start;
  }
`;

const DetailChip = styled.div`
  ${cardSurface}
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 18px;
`;

const ReferenceList = styled.div`
  display: grid;
  gap: 10px;
`;

const ReferenceItem = styled.div`
  ${cardSurface}
  padding: 12px;
  border-radius: 18px;
  display: grid;
  gap: 10px;

  ${desktop} {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }
`;

const ReferenceItemCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: 4px;
`;

const ReferenceItemName = styled.strong`
  color: #2e2a27;
  font-size: 0.9rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
`;

const ReferenceItemLink = styled.a`
  ${outlineButton}
  min-height: 38px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-decoration: none;
  color: #214f39;
  font-size: 0.84rem;
  font-weight: 700;

  svg {
    width: 14px;
    height: 14px;
  }
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
  border: 1.5px solid rgba(27, 63, 53, 0.3);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
  font-size: 16px;
  color: var(--color-text);

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

  @media (max-width: 767px) {
    min-height: 50px;
    border-radius: 13px;
  }
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

  @media (max-width: 767px) {
    min-height: 50px;
    padding: 16px 14px 10px;
    border-radius: 13px;
  }
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

const TaskTableRow = styled.div<{ $interactive?: boolean; $attention?: boolean }>`
  display: grid;
  grid-template-columns: 24px minmax(0, 1.75fr) minmax(0, 1.15fr) 118px 96px 116px;
  gap: 10px;
  align-items: center;
  padding: 12px 0;
  padding-inline: 10px;
  border-radius: 14px;
  background: ${({ $attention }) => ($attention ? "rgba(217, 75, 75, 0.08)" : "transparent")};
  cursor: ${({ $interactive }) => ($interactive ? "pointer" : "default")};

  ${({ $interactive }) =>
    $interactive
      ? css`
          &:hover {
            background: rgba(244, 241, 237, 0.46);
          }
        `
      : ""}

  ${({ $interactive, $attention }) =>
    $interactive && $attention
      ? css`
          &:hover {
            background: rgba(217, 75, 75, 0.12);
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

const TaskDeliveryAssetGrid = styled.div`
  display: grid;
  gap: 12px;

  ${desktop} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const TaskDeliveryAssetCard = styled.div`
  display: grid;
  gap: 8px;
`;

const TaskDeliveryPreviewButton = styled.button`
  padding: 0;
  border: 0;
  background: transparent;
  cursor: zoom-in;
  text-align: left;
`;

const TaskDeliveryPreview = styled.img`
  width: 100%;
  max-height: 260px;
  display: block;
  object-fit: cover;
  border-radius: 14px;
`;

const TaskDeliveryFileCard = styled.a`
  ${cardSurface}
  min-height: 88px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 18px;
  color: var(--color-text);
  text-decoration: none;

  span {
    font-size: 0.9rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  svg {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    color: #8d6520;
  }
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

const ApprovedTaskNotice = styled.p`
  margin: 0;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(229, 244, 232, 0.72);
  color: #2c6b43;
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1.5;
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

const MobileTaskCard = styled.article<{ $interactive?: boolean; $attention?: boolean }>`
  border: 1px solid
    ${({ $attention }) => ($attention ? "rgba(217, 75, 75, 0.42)" : "rgba(235, 229, 221, 0.95)")};
  border-radius: 16px;
  background: ${({ $attention }) => ($attention ? "rgba(255, 244, 244, 0.96)" : "rgba(255, 255, 255, 0.92)")};
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

  ${({ $interactive, $attention }) =>
    $interactive && $attention
      ? css`
          &:hover {
            background: rgba(255, 239, 239, 0.98);
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
  align-content: start;
  gap: 12px;
`;

const VersionHero = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  align-items: start;

  @media (max-width: 767px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const VersionPreview = styled.div`
  width: 84px;
  height: 84px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: linear-gradient(180deg, #fbf7f1 0%, #f5efe5 100%);
  color: #8c7040;
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

const VersionControls = styled.div`
  display: grid;
  gap: 12px;

  ${desktop} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const VersionSelectTrigger = styled(TaskSelectTrigger)`
  min-height: 0;
  padding: 14px 16px 10px;

  @media (max-width: 767px) {
    min-height: 0;
    padding: 14px 14px 10px;
  }
`;

const VersionAssetRail = styled.div`
  margin:  10px auto;
  border: 1px solid grey;
  padding: 5px;
  border-radius: 10px;
  align-items: center;
  gap: 12px;
  min-width: 0;
`;

const VersionAssetChevron = styled.button`
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  color: #6f6458;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 18px;
    height: 18px;
  }
`;

const VersionPreviewButton = styled.button`
  padding: 0;
  border: 0;
  background: transparent;
  min-width: 0;
  cursor: ${({ disabled }) => (disabled ? "default" : "zoom-in")};
`;

const VersionPreviewImage = styled.img`
  width: 100%;
  max-height: 240px;
  display: block;
  object-fit: cover;
  border-radius: 18px;
`;

const VersionFilePreview = styled.div`
  ${cardSurface}
  min-height: 200px;
  padding: 18px;
  border-radius: 20px;
  display: grid;
  place-items: center;
  gap: 10px;
  text-align: center;
  color: #4a4038;

  strong {
    font-size: 0.94rem;
    overflow-wrap: anywhere;
  }

  svg {
    width: 24px;
    height: 24px;
    color: #8d6520;
  }
`;

const VersionHistoryList = styled.div`
  display: grid;
  gap: 8px;
`;

const VersionHistoryItem = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 10px;
  padding: 10px 0 0;
  border: 0;
  border-top: 1px solid rgba(235, 229, 221, 0.95);
  background: transparent;
  text-align: left;
  cursor: pointer;

  strong {
    color: ${({ $active }) => ($active ? "#214f39" : "#2e2a27")};
    font-size: 0.86rem;
  }

  span {
    color: ${({ $active }) => ($active ? "#214f39" : "#7d7266")};
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

const RatingStarsRow = styled.div`
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
`;

const RatingStarButton = styled.button<{ $active?: boolean }>`
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${({ $active }) => ($active ? "#ca8a22" : "#ddd4c9")};

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:hover span {
    color: #ca8a22;
  }
`;

const RatingReadout = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 6px;
`;

const Star = styled.span<{ $filled?: boolean }>`
  color: ${({ $filled }) => ($filled ? "#ca8a22" : "#ddd4c9")};
  font-size: 1.5rem;
  line-height: 1;
`;

const FeedbackTextarea = styled.textarea`
  resize: none;
`;

const PreviewOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 220;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(20, 18, 16, 0.72);
  backdrop-filter: blur(12px);
`;

const PreviewFrame = styled.div`
  max-width: min(1200px, calc(100vw - 40px));
  max-height: calc(100vh - 40px);
  display: grid;
  place-items: center;
`;

const PreviewImage = styled.img`
  display: block;
  max-width: 100%;
  max-height: calc(100vh - 40px);
  border-radius: 18px;
  object-fit: contain;
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.35);
`;

const PreviewCloseButton = styled.button`
  position: fixed;
  top: 18px;
  right: 18px;
  z-index: 221;
  width: 46px;
  height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  backdrop-filter: blur(10px);

  svg {
    width: 20px;
    height: 20px;
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
    display: block;
    align-items: flex-end;
    padding: 12px 10px 0;
  }
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

const TaskPopupCard = styled(ModalCard)`
  max-height: 80vh;
  overflow-x: visible;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 16px 10px;

  @media (max-width: 767px) {
    padding: 14px 14px 8px;
    gap: 12px;
  }

  ${desktop} {
    padding: 18px 18px 10px;
  }
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

function IconChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
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

function IconAttachment() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-8.49 8.49a5 5 0 0 1-7.07-7.07l8.49-8.49a3.5 3.5 0 0 1 4.95 4.95l-8.5 8.49a2 2 0 0 1-2.83-2.83l7.78-7.78" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function IconDocument() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L10.41 5.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 1 0 7.07 7.07l2.42-2.4" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <path d="m16.5 7.5 3-3" />
      <path d="M15 6h4v4" />
    </svg>
  );
}

function IconSpark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4" />
      <path d="m19.07 4.93-2.83 2.83" />
      <path d="M22 12h-4" />
      <path d="m19.07 19.07-2.83-2.83" />
      <path d="M12 22v-4" />
      <path d="m4.93 19.07 2.83-2.83" />
      <path d="M2 12h4" />
      <path d="m4.93 4.93 2.83 2.83" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

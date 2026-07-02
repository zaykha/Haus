import { Project, ProjectStage, ProjectStatus } from "@/lib/types";

type ProjectWorkflowShape = {
  status: ProjectStatus | string;
  stage?: ProjectStage | string | null;
  dueDate?: string | null;
  finalDeliverableDate?: string | null;
  requestedDate?: string | null;
  createdAt?: string | null;
  name?: string | null;
  projectRequestName?: string | null;
};

function normalizeDateValue(value?: string | null) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

export function isProjectCompleted(project: Pick<ProjectWorkflowShape, "status" | "stage">) {
  return (
    project.status === "done" ||
    project.status === "approved" ||
    project.status === "Complete" ||
    project.stage === "Complete"
  );
}

export function isProjectOnHold(project: Pick<ProjectWorkflowShape, "status" | "stage">) {
  return project.status === "On Hold" || project.stage === "On Hold";
}

export function isProjectPendingReview(project: Pick<ProjectWorkflowShape, "status" | "stage">) {
  return (
    project.status === "review" ||
    project.status === "revision" ||
    project.status === "Pending Review" ||
    project.stage === "Pending Review"
  );
}

export function getProjectWorkflowRank(project: Pick<ProjectWorkflowShape, "status" | "stage">) {
  if (project.status === "review" || project.status === "Pending Review" || project.stage === "Pending Review") {
    return 0;
  }

  if (project.status === "revision") {
    return 1;
  }

  if (project.status === "active" || project.status === "WIP" || project.stage === "WIP") {
    return 2;
  }

  if (project.status === "Waiting List" || project.stage === "Waiting List") {
    return 3;
  }

  if (isProjectOnHold(project)) {
    return 4;
  }

  if (isProjectCompleted(project)) {
    return 5;
  }

  return 6;
}

export function compareProjectsByWorkflowPriority(left: ProjectWorkflowShape, right: ProjectWorkflowShape) {
  const leftRank = getProjectWorkflowRank(left);
  const rightRank = getProjectWorkflowRank(right);

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  const leftDue = normalizeDateValue(left.finalDeliverableDate ?? left.dueDate);
  const rightDue = normalizeDateValue(right.finalDeliverableDate ?? right.dueDate);

  if (leftDue !== rightDue) {
    return leftDue - rightDue;
  }

  const leftRequested = normalizeDateValue(left.requestedDate ?? left.createdAt);
  const rightRequested = normalizeDateValue(right.requestedDate ?? right.createdAt);

  if (leftRequested !== rightRequested) {
    return leftRequested - rightRequested;
  }

  return (left.projectRequestName ?? left.name ?? "").localeCompare(right.projectRequestName ?? right.name ?? "");
}

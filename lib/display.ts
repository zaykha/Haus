import { ProjectStage, ProjectStatus, Role, TaskStatus } from "@/lib/types";

export function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatRole(role: Role | string) {
  return formatLabel(role);
}

export function getTaskStatusLabel(status: TaskStatus | string) {
  switch (status) {
    case "todo":
      return "To Do";
    case "in_progress":
      return "In Progress";
    case "done":
      return "Internal Submit";
    case "review":
      return "Submit to Client";
    case "approved":
      return "Complete";
    default:
      return formatLabel(status);
  }
}

export function formatProjectStage(stage: ProjectStage | string) {
  switch (stage) {
    case "WIP":
      return "WIP";
    case "Pending Review":
      return "Pending Review";
    case "Waiting List":
      return "Waiting List";
    case "On Hold":
      return "On Hold";
    case "Complete":
      return "Complete";
    default:
      return formatLabel(stage);
  }
}

export function getProjectStatusLabel(status: ProjectStatus) {
  switch (status) {
    case "WIP":
      return "WIP";
    case "Pending Review":
      return "Pending Review";
    case "Waiting List":
      return "Waiting List";
    case "On Hold":
      return "On Hold";
    case "Complete":
      return "Complete";
    case "active":
      return "Active";
    case "review":
      return "Waiting Feedback";
    case "revision":
      return "Revision Needed";
    case "approved":
      return "Approved";
    case "done":
      return "Completed";
    default:
      return status;
  }
}

export function getProjectStatusClass(status: ProjectStatus) {
  switch (status) {
    case "WIP":
      return "status-active";
    case "Pending Review":
      return "status-waiting";
    case "On Hold":
      return "status-revision";
    case "Complete":
      return "status-completed";
    case "Waiting List":
      return "pill-subtle";
    case "active":
      return "status-active";
    case "review":
      return "status-waiting";
    case "revision":
      return "status-revision";
    case "approved":
      return "status-approved";
    case "done":
      return "status-completed";
    default:
      return "pill-subtle";
  }
}

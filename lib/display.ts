import { ProjectStage, ProjectStatus, Role } from "@/lib/types";

export function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatRole(role: Role | string) {
  return formatLabel(role);
}

export function formatProjectStage(stage: ProjectStage | string) {
  return formatLabel(stage);
}

export function getProjectStatusLabel(status: ProjectStatus) {
  switch (status) {
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

import { Project, Task, User } from "@/lib/types";
import { canManageProjects, getVisibleTasksForUser } from "@/lib/permissions";
import { parseTaskCompletionAssets } from "@/lib/task-completion-assets";

export function taskHasClientReviewableDeliverable(task: Task) {
  return (
    task.status === "review" &&
    task.clientVisible === true &&
    parseTaskCompletionAssets(task.completionScreenshotUrl).length > 0
  );
}

export function taskNeedsAttention(user: User, _project: Project, task: Task) {
  if (user.role === "designer") {
    return (task.assigneeId === user.id || task.assigneeId === null) && (task.status === "todo" || task.status === "in_progress");
  }

  if (canManageProjects(user.role)) {
    return false;
  }

  if (user.role === "client") {
    return taskHasClientReviewableDeliverable(task);
  }

  return false;
}

export function getAttentionTasksForProject(user: User, project: Project) {
  return getVisibleTasksForUser(user, project).filter((task) => taskNeedsAttention(user, project, task));
}

export function getAttentionTaskCount(user: User, projects: Project[]) {
  return projects.reduce((count, project) => count + getAttentionTasksForProject(user, project).length, 0);
}

export function projectHasUnacknowledgedClientRequest(user: User, users: User[], project: Project) {
  if (!canManageProjects(user.role)) {
    return false;
  }

  const owner = users.find((candidate) => candidate.id === project.ownerId) ?? null;
  if (!owner || owner.role !== "client") {
    return false;
  }

  const latestCreatedActivity =
    [...project.activities]
      .filter((activity) => activity.action === "project_created")
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0] ?? null;

  if (!latestCreatedActivity) {
    return false;
  }

  const latestAcknowledgedActivity =
    [...project.activities]
      .filter((activity) => activity.action === "project_attention_acknowledged")
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0] ?? null;

  if (!latestAcknowledgedActivity) {
    return true;
  }

  return (
    new Date(latestCreatedActivity.createdAt).getTime() >
    new Date(latestAcknowledgedActivity.createdAt).getTime()
  );
}

export function projectNeedsManagerAttention(user: User, users: User[], project: Project) {
  return projectHasUnacknowledgedClientRequest(user, users, project);
}

export function getProjectAttentionCount(user: User, users: User[], projects: Project[]) {
  if (user.role === "client") {
    return getAttentionTaskCount(user, projects);
  }

  if (!canManageProjects(user.role)) {
    return 0;
  }

  return projects.reduce(
    (count, project) => count + (projectNeedsManagerAttention(user, users, project) ? 1 : 0),
    0,
  );
}

export function getAttentionCountForProject(user: User, users: User[], project: Project) {
  const taskAttentionCount = getAttentionTasksForProject(user, project).length;

  if (projectNeedsManagerAttention(user, users, project)) {
    return Math.max(1, taskAttentionCount);
  }

  return taskAttentionCount;
}

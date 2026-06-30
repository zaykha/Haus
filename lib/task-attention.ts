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

function getLatestManagerAttentionTriggerAt(users: User[], project: Project) {
  const owner = users.find((candidate) => candidate.id === project.ownerId) ?? null;
  const latestCreatedActivity =
    owner?.role === "client"
      ? [...project.activities]
          .filter((activity) => activity.action === "project_created")
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0] ?? null
      : null;

  const latestClientFeedback =
    [...project.feedback]
      .filter((item) => {
        const author = users.find((candidate) => candidate.id === item.authorId) ?? null;
        return author?.role === "client" && (item.action === "approve" || item.action === "request_revision");
      })
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0] ?? null;

  return [latestCreatedActivity?.createdAt ?? null, latestClientFeedback?.createdAt ?? null]
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}

export function getProjectManagerAttentionKind(user: User, users: User[], project: Project) {
  if (!canManageProjects(user.role)) {
    return null;
  }

  const latestTriggerAt = getLatestManagerAttentionTriggerAt(users, project);
  if (!latestTriggerAt) {
    return null;
  }

  const latestAcknowledgedActivity =
    [...project.activities]
      .filter((activity) => activity.action === "project_attention_acknowledged")
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0] ?? null;

  if (
    latestAcknowledgedActivity &&
    new Date(latestAcknowledgedActivity.createdAt).getTime() >= new Date(latestTriggerAt).getTime()
  ) {
    return null;
  }

  const latestClientFeedback =
    [...project.feedback]
      .filter((item) => {
        const author = users.find((candidate) => candidate.id === item.authorId) ?? null;
        return author?.role === "client" && (item.action === "approve" || item.action === "request_revision");
      })
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0] ?? null;

  if (latestClientFeedback && latestClientFeedback.createdAt === latestTriggerAt) {
    return "feedback";
  }

  return "new_request";
}

export function projectHasUnacknowledgedClientRequest(user: User, users: User[], project: Project) {
  return getProjectManagerAttentionKind(user, users, project) !== null;
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

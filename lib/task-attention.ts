import { Project, Task, User } from "@/lib/types";
import { canManageProjects, getVisibleTasksForUser } from "@/lib/permissions";

export function taskNeedsAttention(user: User, _project: Project, task: Task) {
  if (user.role === "designer") {
    return task.assigneeId === user.id && (task.status === "todo" || task.status === "in_progress");
  }

  if (canManageProjects(user.role)) {
    return task.status === "done" && task.managerReviewStatus === "internal";
  }

  if (user.role === "client") {
    return task.status === "review";
  }

  return false;
}

export function getAttentionTasksForProject(user: User, project: Project) {
  return getVisibleTasksForUser(user, project).filter((task) => taskNeedsAttention(user, project, task));
}

export function getAttentionTaskCount(user: User, projects: Project[]) {
  return projects.reduce((count, project) => count + getAttentionTasksForProject(user, project).length, 0);
}

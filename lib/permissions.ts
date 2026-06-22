import { Project, Role, Task, User } from "@/lib/types";

export function getUserClientOrganizationIds(user: Pick<User, "clientOrganizationId" | "clientOrganizationIds">) {
  const membershipIds = user.clientOrganizationIds ?? [];
  if (membershipIds.length > 0) {
    return membershipIds.filter(Boolean);
  }

  return user.clientOrganizationId ? [user.clientOrganizationId] : [];
}

export function isManagerRole(role: Role) {
  return role === "communication_manager" || role === "creative_manager";
}

export function canManageWorkspace(role: Role) {
  return isManagerRole(role);
}

export function canManageProjects(role: Role) {
  return isManagerRole(role);
}

export function canCreateProject(role: Role) {
  return isManagerRole(role);
}

export function canCreateProjectForOrganization(user: Pick<User, "role" | "clientOrganizationId" | "clientOrganizationIds">, clientOrganizationId: string | null | undefined) {
  if (!clientOrganizationId) {
    return false;
  }

  return isManagerRole(user.role) || (user.role === "client" && getUserClientOrganizationIds(user).includes(clientOrganizationId));
}

export function canEditProject(role: Role) {
  return isManagerRole(role);
}

export function canDeleteProject(role: Role) {
  return isManagerRole(role);
}

export function canUpdateProjectWorkflow(role: Role) {
  return isManagerRole(role);
}

export function canCreateTask(role: Role) {
  return isManagerRole(role);
}

export function canEditTask(role: Role) {
  return isManagerRole(role);
}

export function canDeleteTask(role: Role) {
  return isManagerRole(role);
}

export function canAssignTask(role: Role) {
  return isManagerRole(role);
}

export function canCreateClient(role: Role) {
  return isManagerRole(role);
}

export function canEditClient(role: Role) {
  return isManagerRole(role);
}

export function canDeleteClient(role: Role) {
  return isManagerRole(role);
}

export function canCreateTeamMember(role: Role) {
  return isManagerRole(role);
}

export function canEditTeamMember(role: Role) {
  return isManagerRole(role);
}

export function canDeleteTeamMember(role: Role) {
  return isManagerRole(role);
}

export function canUpdateTeamRole(role: Role) {
  return isManagerRole(role);
}

export function canInviteUsers(role: Role) {
  return isManagerRole(role);
}

export function canInviteClientsForOrganization(user: Pick<User, "role" | "clientOrganizationId" | "clientOrganizationIds">, clientOrganizationId: string | null | undefined) {
  if (!clientOrganizationId) {
    return false;
  }

  return isManagerRole(user.role) || (user.role === "client" && getUserClientOrganizationIds(user).includes(clientOrganizationId));
}

export function canViewProject(user: User, project: Project) {
  if (canManageProjects(user.role)) {
    return true;
  }

  if (user.role === "designer") {
    return project.staffIds.includes(user.id) || project.tasks.some((task) => task.assigneeId === user.id);
  }

  return (
    user.role === "client" &&
    Boolean(
      project.clientOrganizationId &&
        getUserClientOrganizationIds(user).includes(project.clientOrganizationId),
    )
  );
}

export function getVisibleTasksForUser(user: User, project: Project) {
  if (canManageProjects(user.role)) {
    return project.tasks;
  }

  if (user.role === "designer") {
    return project.tasks.filter((task) => task.assigneeId === user.id);
  }

  return project.tasks.filter((task) => task.clientVisible || task.status === "approved");
}

export function canChangeWorkflow(role: Role) {
  return canUpdateProjectWorkflow(role);
}

export function canUpdateTaskStatus(user: User, project: Project, task: Task) {
  if (canManageTaskCrud(user.role)) {
    return true;
  }

  return (
    user.role === "designer" &&
    canViewProject(user, project) &&
    task.assigneeId === user.id &&
    (task.status === "todo" || task.status === "in_progress")
  );
}

export function canManageTaskCrud(role: Role) {
  return isManagerRole(role);
}

export function canUploadFiles(role: Role) {
  return role !== "client";
}

export function canLeaveInternalComment(role: Role) {
  return role !== "client";
}

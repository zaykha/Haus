import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canManageWorkspace } from "@/lib/permissions";

type DeletedProjectRow = {
  id: string;
  name: string | null;
  project_request_name: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
};

type DeletedTaskRow = {
  id: string;
  project_id: string;
  title: string;
  assignee_id: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
};

type DeletedOrganizationRow = {
  id: string;
  name: string;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
};

type DeletedProfileRow = {
  id: string;
  name: string;
  email: string;
  role: "communication_manager" | "creative_manager" | "designer" | "client";
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
};

type ChildProjectRecord = { project_id: string; delete_reason: string | null };
type ChildTaskRecord = { task_id: string | null; delete_reason: string | null };
type MembershipRecord = { profile_id: string; client_organization_id: string; delete_reason: string | null };
type InvitationRecord = { email: string; client_organization_id: string | null; delete_reason: string | null };
type UploadedFileRecord = { uploaded_by: string | null; delete_reason: string | null };
type ActorRecord = { id: string; name: string | null; email: string | null };

type TrashPackage = {
  id: string;
  entityType: "project" | "task" | "organization" | "liaison" | "team_member";
  entityId: string;
  entityName: string;
  deletedAt: string | null;
  deletedByName: string;
  deleteReason: string | null;
  summaryPills: string[];
};

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export async function GET(request: NextRequest) {
  const authResult = await requireWorkspaceUser(request);
  if (authResult instanceof Response) {
    return authResult;
  }

  const { supabase, user } = authResult;
  if (!canManageWorkspace(user.role)) {
    return NextResponse.json({ error: "Only managers can access the trash log" }, { status: 403 });
  }

  const [
    deletedProjectsResult,
    deletedTasksResult,
    deletedOrganizationsResult,
    deletedProfilesResult,
    deletedProjectMembersResult,
    deletedCommentsResult,
    deletedFeedbackResult,
    deletedActivityResult,
    deletedFilesResult,
    deletedMembershipsResult,
    deletedInvitationsResult,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, project_request_name, deleted_at, deleted_by, delete_reason")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(50),
    supabase
      .from("tasks")
      .select("id, project_id, title, assignee_id, deleted_at, deleted_by, delete_reason")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(100),
    supabase
      .from("client_organizations")
      .select("id, name, deleted_at, deleted_by, delete_reason")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(50),
    supabase
      .from("profiles")
      .select("id, name, email, role, deleted_at, deleted_by, delete_reason")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(100),
    supabase.from("project_members").select("project_id, profile_id, delete_reason").not("deleted_at", "is", null),
    supabase.from("project_comments").select("project_id, task_id, author_id, delete_reason").not("deleted_at", "is", null),
    supabase.from("project_feedback").select("project_id, task_id, author_id, delete_reason").not("deleted_at", "is", null),
    supabase.from("project_activity").select("project_id, task_id, delete_reason").not("deleted_at", "is", null),
    supabase.from("project_files").select("project_id, uploaded_by, delete_reason").not("deleted_at", "is", null),
    supabase
      .from("client_organization_liaisons")
      .select("profile_id, client_organization_id, delete_reason")
      .not("deleted_at", "is", null),
    supabase
      .from("invitations")
      .select("email, client_organization_id, delete_reason")
      .not("deleted_at", "is", null),
  ]);

  const results = [
    deletedProjectsResult,
    deletedTasksResult,
    deletedOrganizationsResult,
    deletedProfilesResult,
    deletedProjectMembersResult,
    deletedCommentsResult,
    deletedFeedbackResult,
    deletedActivityResult,
    deletedFilesResult,
    deletedMembershipsResult,
    deletedInvitationsResult,
  ];

  const firstError = results.find((result) => result.error)?.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  const deletedProjects = (deletedProjectsResult.data ?? []) as DeletedProjectRow[];
  const deletedTasks = (deletedTasksResult.data ?? []) as DeletedTaskRow[];
  const deletedOrganizations = (deletedOrganizationsResult.data ?? []) as DeletedOrganizationRow[];
  const deletedProfiles = (deletedProfilesResult.data ?? []) as DeletedProfileRow[];
  const deletedProjectMembers = (deletedProjectMembersResult.data ?? []) as Array<ChildProjectRecord & { profile_id: string }>;
  const deletedComments = (deletedCommentsResult.data ?? []) as Array<ChildProjectRecord & ChildTaskRecord & { author_id: string | null }>;
  const deletedFeedback = (deletedFeedbackResult.data ?? []) as Array<ChildProjectRecord & ChildTaskRecord & { author_id: string | null }>;
  const deletedActivity = (deletedActivityResult.data ?? []) as Array<ChildProjectRecord & ChildTaskRecord>;
  const deletedFiles = (deletedFilesResult.data ?? []) as Array<ChildProjectRecord & UploadedFileRecord>;
  const deletedMemberships = (deletedMembershipsResult.data ?? []) as MembershipRecord[];
  const deletedInvitations = (deletedInvitationsResult.data ?? []) as InvitationRecord[];

  const actorIds = Array.from(
    new Set(
      [...deletedProjects, ...deletedTasks, ...deletedOrganizations, ...deletedProfiles]
        .map((record) => record.deleted_by)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const actorMap = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: actors, error: actorsError } = await supabase.from("profiles").select("id, name, email").in("id", actorIds);
    if (actorsError) {
      return NextResponse.json({ error: actorsError.message }, { status: 500 });
    }

    for (const actor of (actors ?? []) as ActorRecord[]) {
      actorMap.set(actor.id, actor.name?.trim() || actor.email?.trim() || "Unknown user");
    }
  }

  const deletedProjectIds = new Set(deletedProjects.map((project) => project.id));
  const taskIdsByAssignee = new Map<string, string[]>();
  for (const task of deletedTasks) {
    if (!task.assignee_id) {
      continue;
    }
    const current = taskIdsByAssignee.get(task.assignee_id) ?? [];
    current.push(task.id);
    taskIdsByAssignee.set(task.assignee_id, current);
  }

  const packages: TrashPackage[] = [];

  for (const project of deletedProjects) {
    const summaryPills = [
      formatCount(deletedTasks.filter((task) => task.project_id === project.id && task.delete_reason === "project_deleted").length, "task"),
      formatCount(deletedFeedback.filter((record) => record.project_id === project.id && record.delete_reason === "project_deleted").length, "review"),
      formatCount(deletedComments.filter((record) => record.project_id === project.id && record.delete_reason === "project_deleted").length, "comment"),
      formatCount(deletedFiles.filter((record) => record.project_id === project.id && record.delete_reason === "project_deleted").length, "file"),
      formatCount(deletedProjectMembers.filter((record) => record.project_id === project.id && record.delete_reason === "project_deleted").length, "member"),
    ].filter((label) => !label.startsWith("0 "));

    packages.push({
      id: `project:${project.id}`,
      entityType: "project",
      entityId: project.id,
      entityName: project.project_request_name?.trim() || project.name?.trim() || "Untitled project",
      deletedAt: project.deleted_at,
      deletedByName: project.deleted_by ? (actorMap.get(project.deleted_by) ?? "Unknown user") : "Unknown user",
      deleteReason: project.delete_reason,
      summaryPills,
    });
  }

  for (const task of deletedTasks) {
    if (deletedProjectIds.has(task.project_id) || task.delete_reason !== "task_deleted") {
      continue;
    }

    const summaryPills = [
      formatCount(deletedFeedback.filter((record) => record.task_id === task.id && record.delete_reason === "task_deleted").length, "review"),
      formatCount(deletedComments.filter((record) => record.task_id === task.id && record.delete_reason === "task_deleted").length, "comment"),
      formatCount(deletedActivity.filter((record) => record.task_id === task.id && record.delete_reason === "task_deleted").length, "activity"),
    ].filter((label) => !label.startsWith("0 "));

    packages.push({
      id: `task:${task.id}`,
      entityType: "task",
      entityId: task.id,
      entityName: task.title.trim(),
      deletedAt: task.deleted_at,
      deletedByName: task.deleted_by ? (actorMap.get(task.deleted_by) ?? "Unknown user") : "Unknown user",
      deleteReason: task.delete_reason,
      summaryPills,
    });
  }

  for (const organization of deletedOrganizations) {
    const summaryPills = [
      formatCount(deletedMemberships.filter((record) => record.client_organization_id === organization.id && record.delete_reason === "client_organization_deleted").length, "liaison"),
      formatCount(deletedInvitations.filter((record) => record.client_organization_id === organization.id && record.delete_reason === "client_organization_deleted").length, "invitation"),
    ].filter((label) => !label.startsWith("0 "));

    packages.push({
      id: `organization:${organization.id}`,
      entityType: "organization",
      entityId: organization.id,
      entityName: organization.name.trim(),
      deletedAt: organization.deleted_at,
      deletedByName: organization.deleted_by ? (actorMap.get(organization.deleted_by) ?? "Unknown user") : "Unknown user",
      deleteReason: organization.delete_reason,
      summaryPills,
    });
  }

  for (const profile of deletedProfiles) {
    const isLiaison = profile.role === "client";
    const assignedTaskIds = new Set(taskIdsByAssignee.get(profile.id) ?? []);

    const summaryPills = isLiaison
      ? [
          formatCount(deletedMemberships.filter((record) => record.profile_id === profile.id && record.delete_reason === "liaison_deleted").length, "organization"),
          formatCount(deletedInvitations.filter((record) => record.email === profile.email && record.delete_reason === "liaison_deleted").length, "invitation"),
        ].filter((label) => !label.startsWith("0 "))
      : [
          formatCount(deletedTasks.filter((record) => record.assignee_id === profile.id && record.delete_reason === "team_member_deleted").length, "task"),
          formatCount(
            deletedFeedback.filter(
              (record) =>
                record.delete_reason === "team_member_deleted" &&
                ((record.author_id && record.author_id === profile.id) || (record.task_id && assignedTaskIds.has(record.task_id))),
            ).length,
            "review",
          ),
          formatCount(
            deletedComments.filter(
              (record) =>
                record.delete_reason === "team_member_deleted" &&
                ((record.author_id && record.author_id === profile.id) || (record.task_id && assignedTaskIds.has(record.task_id))),
            ).length,
            "comment",
          ),
          formatCount(deletedFiles.filter((record) => record.uploaded_by === profile.id && record.delete_reason === "team_member_deleted").length, "file"),
          formatCount(deletedProjectMembers.filter((record) => record.profile_id === profile.id && record.delete_reason === "team_member_deleted").length, "membership"),
        ].filter((label) => !label.startsWith("0 "));

    packages.push({
      id: `${isLiaison ? "liaison" : "team_member"}:${profile.id}`,
      entityType: isLiaison ? "liaison" : "team_member",
      entityId: profile.id,
      entityName: profile.name.trim() || profile.email.trim(),
      deletedAt: profile.deleted_at,
      deletedByName: profile.deleted_by ? (actorMap.get(profile.deleted_by) ?? "Unknown user") : "Unknown user",
      deleteReason: profile.delete_reason,
      summaryPills,
    });
  }

  packages.sort((left, right) => {
    const leftTime = left.deletedAt ? new Date(left.deletedAt).getTime() : 0;
    const rightTime = right.deletedAt ? new Date(right.deletedAt).getTime() : 0;
    return rightTime - leftTime;
  });

  return NextResponse.json({ items: packages });
}

import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canDeleteTeamMember, canUpdateTeamRole } from "@/lib/permissions";
import { appConfig } from "@/lib/config";
import { buildSoftDeletePatch, getStoragePathFromPublicUrl, queueStorageCleanup } from "@/lib/soft-delete";
import { parseTaskCompletionState } from "@/lib/task-completion-assets";
import { Role } from "@/lib/types";

const INTERNAL_ROLES: Role[] = [
  "creative_manager",
  "communication_manager",
  "designer",
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspaceUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  const { id } = await params;
  const { supabase, user } = auth;

  if (!canUpdateTeamRole(user.role)) {
    return NextResponse.json({ error: "Only managers can update team roles" }, { status: 403 });
  }

  if (id === user.id) {
    return NextResponse.json({ error: "You cannot change your own role" }, { status: 400 });
  }

  const body = (await request.json()) as { role?: Role };
  if (!body.role || !INTERNAL_ROLES.includes(body.role)) {
    return NextResponse.json({ error: "Role must be an internal team role" }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (!profile || profile.role === "client") {
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }

  const { error: updateProfileError } = await supabase
    .from("profiles")
    .update({ role: body.role })
    .eq("id", id);

  if (updateProfileError) {
    return NextResponse.json({ error: updateProfileError.message }, { status: 500 });
  }

  const { error: updateMembershipError } = await supabase
    .from("project_members")
    .update({ role: body.role })
    .eq("profile_id", id);

  if (updateMembershipError) {
    return NextResponse.json({ error: updateMembershipError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspaceUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  const { id } = await params;
  const { supabase, user } = auth;

  if (!canDeleteTeamMember(user.role)) {
    return NextResponse.json({ error: "Only managers can delete team members" }, { status: 403 });
  }

  if (id === user.id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, email")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (!profile || profile.role === "client") {
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }

  const { data: assignedTasks, error: assignedTasksError } = await supabase
    .from("tasks")
    .select("id, completion_screenshot_url")
    .eq("assignee_id", id)
    .is("deleted_at", null);

  if (assignedTasksError) {
    return NextResponse.json({ error: assignedTasksError.message }, { status: 500 });
  }

  const deliverablePaths = Array.from(
    new Set(
      (assignedTasks ?? [])
        .flatMap((task) => {
          const state = parseTaskCompletionState(task.completion_screenshot_url ?? null);
          return [
            ...state.currentAssets,
            ...state.history.flatMap((snapshot) => snapshot.assets),
          ];
        })
        .map((value) => getStoragePathFromPublicUrl(value, appConfig.taskDeliverablesBucket))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  await queueStorageCleanup(
    supabase,
    deliverablePaths.map((filePath) => ({
      bucketName: appConfig.taskDeliverablesBucket,
      filePath,
      entityTable: "profiles",
      entityId: id,
    })),
  );

  const deletePatch = buildSoftDeletePatch(user.id, "team_member_deleted");
  const assignedTaskIds = (assignedTasks ?? []).map((task) => task.id);

  const [
    projectsOwnerResult,
    membershipsDeleteResult,
    tasksDeleteResult,
    filesDeleteResult,
    commentsDeleteResult,
    feedbackDeleteResult,
    invitationsDeleteResult,
  ] = await Promise.all([
    supabase.from("projects").update({ owner_id: null }).eq("owner_id", id).is("deleted_at", null),
    supabase.from("project_members").update(deletePatch).eq("profile_id", id).is("deleted_at", null),
    supabase.from("tasks").update(deletePatch).eq("assignee_id", id).is("deleted_at", null),
    supabase.from("project_files").update(deletePatch).eq("uploaded_by", id).is("deleted_at", null),
    supabase.from("project_comments").update(deletePatch).eq("author_id", id).is("deleted_at", null),
    supabase.from("project_feedback").update(deletePatch).eq("author_id", id).is("deleted_at", null),
    supabase.from("invitations").update(deletePatch).eq("email", profile.email).neq("role", "client").is("deleted_at", null),
  ]);

  const [taskCommentsResult, taskFeedbackResult, taskActivityResult] = assignedTaskIds.length
    ? await Promise.all([
        supabase.from("project_comments").update(deletePatch).in("task_id", assignedTaskIds).is("deleted_at", null),
        supabase.from("project_feedback").update(deletePatch).in("task_id", assignedTaskIds).is("deleted_at", null),
        supabase.from("project_activity").update(deletePatch).in("task_id", assignedTaskIds).is("deleted_at", null),
      ])
    : [{ error: null }, { error: null }, { error: null }];

  const destructiveError =
    projectsOwnerResult.error ||
    membershipsDeleteResult.error ||
    tasksDeleteResult.error ||
    filesDeleteResult.error ||
    commentsDeleteResult.error ||
    feedbackDeleteResult.error ||
    invitationsDeleteResult.error ||
    taskCommentsResult.error ||
    taskFeedbackResult.error ||
    (taskActivityResult.error && !taskActivityResult.error.message.includes('relation "project_activity" does not exist')
      ? taskActivityResult.error
      : null);

  if (destructiveError) {
    return NextResponse.json({ error: destructiveError.message }, { status: 500 });
  }

  const { error: archiveProfileError } = await supabase
    .from("profiles")
    .update(deletePatch)
    .eq("id", id)
    .is("deleted_at", null);

  if (archiveProfileError) {
    return NextResponse.json({ error: archiveProfileError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

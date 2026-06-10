import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canDeleteTeamMember, canUpdateTeamRole } from "@/lib/permissions";
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
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (!profile || profile.role === "client") {
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }

  const [
    projectsOwnerResult,
    membershipsDeleteResult,
    tasksDeleteResult,
    filesDeleteResult,
    commentsDeleteResult,
    feedbackDeleteResult,
    invitationsDeleteResult,
  ] = await Promise.all([
    supabase.from("projects").update({ owner_id: null }).eq("owner_id", id),
    supabase.from("project_members").delete().eq("profile_id", id),
    supabase.from("tasks").delete().eq("assignee_id", id),
    supabase.from("project_files").delete().eq("uploaded_by", id),
    supabase.from("project_comments").delete().eq("author_id", id),
    supabase.from("project_feedback").delete().eq("author_id", id),
    supabase.from("invitations").delete().eq("email", profile.email).neq("role", "client"),
  ]);

  const destructiveError =
    projectsOwnerResult.error ||
    membershipsDeleteResult.error ||
    tasksDeleteResult.error ||
    filesDeleteResult.error ||
    commentsDeleteResult.error ||
    feedbackDeleteResult.error ||
    invitationsDeleteResult.error;

  if (destructiveError) {
    return NextResponse.json({ error: destructiveError.message }, { status: 500 });
  }

  const { error: deleteUserError } = await supabase.auth.admin.deleteUser(id);
  if (deleteUserError) {
    return NextResponse.json({ error: deleteUserError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canManageWorkspace } from "@/lib/permissions";
import { deleteQueuedStorage, purgeArchivedProfile } from "@/lib/profile-lifecycle";

export async function POST(request: NextRequest) {
  const authResult = await requireWorkspaceUser(request);
  if (authResult instanceof Response) {
    return authResult;
  }

  const { supabase, user } = authResult;
  if (!canManageWorkspace(user.role)) {
    return NextResponse.json({ error: "Only managers can permanently delete trash packages" }, { status: 403 });
  }

  const body = (await request.json()) as {
    entityType?: "project" | "task" | "organization" | "liaison" | "team_member";
    entityId?: string;
  };

  if (!body.entityType || !body.entityId) {
    return NextResponse.json({ error: "Trash package type and id are required" }, { status: 400 });
  }

  if (body.entityType === "project") {
    await deleteQueuedStorage(supabase, "projects", body.entityId);

    const operations = await Promise.all([
      supabase.from("project_members").delete().eq("project_id", body.entityId).eq("delete_reason", "project_deleted"),
      supabase.from("project_comments").delete().eq("project_id", body.entityId).eq("delete_reason", "project_deleted"),
      supabase.from("project_feedback").delete().eq("project_id", body.entityId).eq("delete_reason", "project_deleted"),
      supabase.from("project_activity").delete().eq("project_id", body.entityId).eq("delete_reason", "project_deleted"),
      supabase.from("project_files").delete().eq("project_id", body.entityId).eq("delete_reason", "project_deleted"),
      supabase.from("tasks").delete().eq("project_id", body.entityId).eq("delete_reason", "project_deleted"),
      supabase.from("projects").delete().eq("id", body.entityId).eq("delete_reason", "project_deleted"),
    ]);

    const error = operations.find((operation) => operation.error)?.error;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (body.entityType === "task") {
    await deleteQueuedStorage(supabase, "tasks", body.entityId);

    const operations = await Promise.all([
      supabase.from("project_comments").delete().eq("task_id", body.entityId).eq("delete_reason", "task_deleted"),
      supabase.from("project_feedback").delete().eq("task_id", body.entityId).eq("delete_reason", "task_deleted"),
      supabase.from("project_activity").delete().eq("task_id", body.entityId).eq("delete_reason", "task_deleted"),
      supabase.from("tasks").delete().eq("id", body.entityId).eq("delete_reason", "task_deleted"),
    ]);

    const error = operations.find((operation) => operation.error)?.error;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (body.entityType === "organization") {
    const operations = await Promise.all([
      supabase
        .from("client_organization_liaisons")
        .delete()
        .eq("client_organization_id", body.entityId)
        .eq("delete_reason", "client_organization_deleted"),
      supabase
        .from("invitations")
        .delete()
        .eq("client_organization_id", body.entityId)
        .eq("delete_reason", "client_organization_deleted"),
      supabase
        .from("client_organizations")
        .delete()
        .eq("id", body.entityId)
        .eq("delete_reason", "client_organization_deleted"),
    ]);

    const error = operations.find((operation) => operation.error)?.error;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (body.entityType === "liaison") {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", body.entityId)
      .eq("delete_reason", "liaison_deleted")
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    try {
      await purgeArchivedProfile(supabase, {
        profileId: body.entityId,
        actingUserId: user.id,
        deleteReason: "liaison_deleted",
        email: profile?.email ?? null,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to permanently delete profile" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (body.entityType === "team_member") {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", body.entityId)
      .eq("delete_reason", "team_member_deleted")
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    try {
      await purgeArchivedProfile(supabase, {
        profileId: body.entityId,
        actingUserId: user.id,
        deleteReason: "team_member_deleted",
        email: profile?.email ?? null,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to permanently delete profile" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported trash package type" }, { status: 400 });
}

import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canManageWorkspace } from "@/lib/permissions";
import { buildRestorePatch } from "@/lib/soft-delete";

async function clearStorageCleanupQueue(supabase: any, entityTable: string, entityId: string) {
  const { error } = await supabase
    .from("storage_cleanup_queue")
    .delete()
    .eq("entity_table", entityTable)
    .eq("entity_id", entityId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireWorkspaceUser(request);
  if (authResult instanceof Response) {
    return authResult;
  }

  const { supabase, user } = authResult;
  if (!canManageWorkspace(user.role)) {
    return NextResponse.json({ error: "Only managers can restore deleted packages" }, { status: 403 });
  }

  const body = (await request.json()) as {
    entityType?: "project" | "task" | "organization" | "liaison" | "team_member";
    entityId?: string;
  };

  if (!body.entityType || !body.entityId) {
    return NextResponse.json({ error: "Trash package type and id are required" }, { status: 400 });
  }

  const restorePatch = buildRestorePatch();

  if (body.entityType === "project") {
    const operations = await Promise.all([
      supabase.from("project_members").update(restorePatch).eq("project_id", body.entityId).eq("delete_reason", "project_deleted"),
      supabase.from("project_comments").update(restorePatch).eq("project_id", body.entityId).eq("delete_reason", "project_deleted"),
      supabase.from("project_feedback").update(restorePatch).eq("project_id", body.entityId).eq("delete_reason", "project_deleted"),
      supabase.from("project_activity").update(restorePatch).eq("project_id", body.entityId).eq("delete_reason", "project_deleted"),
      supabase.from("project_files").update(restorePatch).eq("project_id", body.entityId).eq("delete_reason", "project_deleted"),
      supabase.from("tasks").update(restorePatch).eq("project_id", body.entityId).eq("delete_reason", "project_deleted"),
      supabase.from("projects").update(restorePatch).eq("id", body.entityId).eq("delete_reason", "project_deleted"),
    ]);

    const error = operations.find((operation) => operation.error)?.error;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await clearStorageCleanupQueue(supabase, "projects", body.entityId);
    return NextResponse.json({ ok: true });
  }

  if (body.entityType === "task") {
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("id, project_id")
      .eq("id", body.entityId)
      .eq("delete_reason", "task_deleted")
      .maybeSingle();

    if (taskError) {
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    if (!task) {
      return NextResponse.json({ error: "Deleted task not found" }, { status: 404 });
    }

    const operations = await Promise.all([
      supabase.from("project_comments").update(restorePatch).eq("task_id", body.entityId).eq("delete_reason", "task_deleted"),
      supabase.from("project_feedback").update(restorePatch).eq("task_id", body.entityId).eq("delete_reason", "task_deleted"),
      supabase.from("project_activity").update(restorePatch).eq("task_id", body.entityId).eq("delete_reason", "task_deleted"),
      supabase.from("tasks").update(restorePatch).eq("id", body.entityId).eq("delete_reason", "task_deleted"),
    ]);

    const error = operations.find((operation) => operation.error)?.error;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await clearStorageCleanupQueue(supabase, "tasks", body.entityId);
    return NextResponse.json({ ok: true, projectId: task.project_id });
  }

  if (body.entityType === "organization") {
    const operations = await Promise.all([
      supabase
        .from("client_organization_liaisons")
        .update(restorePatch)
        .eq("client_organization_id", body.entityId)
        .eq("delete_reason", "client_organization_deleted"),
      supabase
        .from("invitations")
        .update(restorePatch)
        .eq("client_organization_id", body.entityId)
        .eq("delete_reason", "client_organization_deleted"),
      supabase
        .from("client_organizations")
        .update(restorePatch)
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
      .select("id, email")
      .eq("id", body.entityId)
      .eq("delete_reason", "liaison_deleted")
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    if (!profile) {
      return NextResponse.json({ error: "Deleted liaison not found" }, { status: 404 });
    }

    const operations = await Promise.all([
      supabase
        .from("client_organization_liaisons")
        .update(restorePatch)
        .eq("profile_id", body.entityId)
        .eq("delete_reason", "liaison_deleted"),
      supabase
        .from("invitations")
        .update(restorePatch)
        .eq("email", profile.email)
        .eq("delete_reason", "liaison_deleted"),
      supabase.from("profiles").update(restorePatch).eq("id", body.entityId).eq("delete_reason", "liaison_deleted"),
    ]);

    const error = operations.find((operation) => operation.error)?.error;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (body.entityType === "team_member") {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("id", body.entityId)
      .eq("delete_reason", "team_member_deleted")
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    if (!profile) {
      return NextResponse.json({ error: "Deleted team member not found" }, { status: 404 });
    }

    const { data: taskRows, error: taskRowsError } = await supabase
      .from("tasks")
      .select("id")
      .eq("assignee_id", body.entityId)
      .eq("delete_reason", "team_member_deleted");

    if (taskRowsError) {
      return NextResponse.json({ error: taskRowsError.message }, { status: 500 });
    }

    const taskIds = (taskRows ?? []).map((task) => task.id);

    const primaryOperations = await Promise.all([
      supabase.from("project_members").update(restorePatch).eq("profile_id", body.entityId).eq("delete_reason", "team_member_deleted"),
      supabase.from("tasks").update(restorePatch).eq("assignee_id", body.entityId).eq("delete_reason", "team_member_deleted"),
      supabase.from("project_files").update(restorePatch).eq("uploaded_by", body.entityId).eq("delete_reason", "team_member_deleted"),
      supabase.from("project_comments").update(restorePatch).eq("author_id", body.entityId).eq("delete_reason", "team_member_deleted"),
      supabase.from("project_feedback").update(restorePatch).eq("author_id", body.entityId).eq("delete_reason", "team_member_deleted"),
      supabase.from("invitations").update(restorePatch).eq("email", profile.email).eq("delete_reason", "team_member_deleted"),
      supabase.from("profiles").update(restorePatch).eq("id", body.entityId).eq("delete_reason", "team_member_deleted"),
    ]);

    const primaryError = primaryOperations.find((operation) => operation.error)?.error;
    if (primaryError) {
      return NextResponse.json({ error: primaryError.message }, { status: 500 });
    }

    if (taskIds.length > 0) {
      const secondaryOperations = await Promise.all([
        supabase.from("project_comments").update(restorePatch).in("task_id", taskIds).eq("delete_reason", "team_member_deleted"),
        supabase.from("project_feedback").update(restorePatch).in("task_id", taskIds).eq("delete_reason", "team_member_deleted"),
        supabase.from("project_activity").update(restorePatch).in("task_id", taskIds).eq("delete_reason", "team_member_deleted"),
      ]);

      const secondaryError = secondaryOperations.find((operation) => operation.error)?.error;
      if (secondaryError) {
        return NextResponse.json({ error: secondaryError.message }, { status: 500 });
      }
    }

    await clearStorageCleanupQueue(supabase, "profiles", body.entityId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported trash package type" }, { status: 400 });
}

import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canManageWorkspace } from "@/lib/permissions";

async function deleteQueuedStorage(supabase: any, entityTable: string, entityId: string) {
  const { data: queueRows, error: queueError } = await supabase
    .from("storage_cleanup_queue")
    .select("id, bucket_name, file_path")
    .eq("entity_table", entityTable)
    .eq("entity_id", entityId);

  if (queueError) {
    throw new Error(queueError.message);
  }

  const rows = queueRows ?? [];
  if (rows.length > 0) {
    const rowsByBucket = new Map<string, string[]>();
    for (const row of rows) {
      const current = rowsByBucket.get(row.bucket_name) ?? [];
      current.push(row.file_path);
      rowsByBucket.set(row.bucket_name, current);
    }

    for (const [bucketName, filePaths] of rowsByBucket.entries()) {
      const { error: storageError } = await supabase.storage.from(bucketName).remove(filePaths);
      if (storageError) {
        throw new Error(storageError.message);
      }
    }
  }

  const { error: deleteQueueError } = await supabase
    .from("storage_cleanup_queue")
    .delete()
    .eq("entity_table", entityTable)
    .eq("entity_id", entityId);

  if (deleteQueueError) {
    throw new Error(deleteQueueError.message);
  }
}

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

    const operations = await Promise.all([
      supabase
        .from("client_organization_liaisons")
        .delete()
        .eq("profile_id", body.entityId)
        .eq("delete_reason", "liaison_deleted"),
      profile?.email
        ? supabase.from("invitations").delete().eq("email", profile.email).eq("delete_reason", "liaison_deleted")
        : Promise.resolve({ error: null }),
      supabase.from("profiles").delete().eq("id", body.entityId).eq("delete_reason", "liaison_deleted"),
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
      .select("email")
      .eq("id", body.entityId)
      .eq("delete_reason", "team_member_deleted")
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    const { data: taskRows, error: taskRowsError } = await supabase
      .from("tasks")
      .select("id")
      .eq("assignee_id", body.entityId)
      .eq("delete_reason", "team_member_deleted");

    if (taskRowsError) {
      return NextResponse.json({ error: taskRowsError.message }, { status: 500 });
    }

    await deleteQueuedStorage(supabase, "profiles", body.entityId);

    const taskIds = (taskRows ?? []).map((task) => task.id);

    if (taskIds.length > 0) {
      const secondaryOperations = await Promise.all([
        supabase.from("project_comments").delete().in("task_id", taskIds).eq("delete_reason", "team_member_deleted"),
        supabase.from("project_feedback").delete().in("task_id", taskIds).eq("delete_reason", "team_member_deleted"),
        supabase.from("project_activity").delete().in("task_id", taskIds).eq("delete_reason", "team_member_deleted"),
      ]);

      const secondaryError = secondaryOperations.find((operation) => operation.error)?.error;
      if (secondaryError) {
        return NextResponse.json({ error: secondaryError.message }, { status: 500 });
      }
    }

    const primaryOperations = await Promise.all([
      supabase.from("project_members").delete().eq("profile_id", body.entityId).eq("delete_reason", "team_member_deleted"),
      supabase.from("tasks").delete().eq("assignee_id", body.entityId).eq("delete_reason", "team_member_deleted"),
      supabase.from("project_files").delete().eq("uploaded_by", body.entityId).eq("delete_reason", "team_member_deleted"),
      supabase.from("project_comments").delete().eq("author_id", body.entityId).eq("delete_reason", "team_member_deleted"),
      supabase.from("project_feedback").delete().eq("author_id", body.entityId).eq("delete_reason", "team_member_deleted"),
      profile?.email
        ? supabase.from("invitations").delete().eq("email", profile.email).eq("delete_reason", "team_member_deleted")
        : Promise.resolve({ error: null }),
      supabase.from("profiles").delete().eq("id", body.entityId).eq("delete_reason", "team_member_deleted"),
    ]);

    const primaryError = primaryOperations.find((operation) => operation.error)?.error;
    if (primaryError) {
      return NextResponse.json({ error: primaryError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported trash package type" }, { status: 400 });
}

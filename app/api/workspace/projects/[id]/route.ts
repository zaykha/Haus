import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { appConfig } from "@/lib/config";
import { canDeleteProject, canEditProject } from "@/lib/permissions";
import { buildSoftDeletePatch, getStoragePathFromPublicUrl, queueStorageCleanup } from "@/lib/soft-delete";
import { parseTaskCompletionState } from "@/lib/task-completion-assets";

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
  if (!canEditProject(user.role)) {
    return NextResponse.json({ error: "Only managers can edit projects" }, { status: 403 });
  }

  const body = (await request.json()) as {
    projectRequestName?: string;
    requestedDate?: string;
    requestStatus?: string;
    departmentName?: string;
    contactPerson?: string;
    contactNumber?: string;
    projectType?: string;
    priorityLevel?: string;
    firstDraftDate?: string;
    finalDeliverableDate?: string;
    projectObjective?: string;
    projectBrief?: string;
    creativeAdvice?: string;
    referenceAttachmentUrl?: string;
    description?: string;
    clientOrganizationId?: string;
  };

  let resolvedClientOrganizationId = body.clientOrganizationId?.trim() ?? "";

  if (resolvedClientOrganizationId) {
    const { data: organization } = await supabase
      .from("client_organizations")
      .select("id")
      .eq("id", resolvedClientOrganizationId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!organization) {
      return NextResponse.json({ error: "Project client organization must exist" }, { status: 400 });
    }
  }

  const { error } = await supabase
    .from("projects")
    .update({
      name: body.projectRequestName?.trim(),
      requested_date: body.requestedDate || undefined,
      department_name: body.departmentName?.trim() || null,
      project_request_name: body.projectRequestName?.trim(),
      contact_person: body.contactPerson?.trim() || null,
      contact_number: body.contactNumber?.trim() || null,
      project_type: body.projectType?.trim() || null,
      priority_level: body.priorityLevel?.trim() || null,
      first_draft_date: body.firstDraftDate || null,
      final_deliverable_date: body.finalDeliverableDate || null,
      project_objective: body.projectObjective?.trim() || null,
      project_brief: body.projectBrief?.trim() || null,
      creative_advice: body.creativeAdvice?.trim() || null,
      reference_attachment_url: body.referenceAttachmentUrl?.trim() || null,
      description: body.description?.trim() || "",
      category: body.projectType?.trim() || null,
      stage: body.requestStatus?.trim() || null,
      due_date: body.finalDeliverableDate || null,
      client_organization_id: resolvedClientOrganizationId || null,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
  if (!canDeleteProject(user.role)) {
    return NextResponse.json({ error: "Only managers can delete projects" }, { status: 403 });
  }

  const [projectResult, tasksResult, filesResult] = await Promise.all([
    supabase
      .from("projects")
      .select("id, reference_attachment_url")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("tasks")
      .select("id, completion_screenshot_url")
      .eq("project_id", id)
      .is("deleted_at", null),
    supabase
      .from("project_files")
      .select("id, file_url")
      .eq("project_id", id)
      .is("deleted_at", null),
  ]);

  if (projectResult.error) {
    return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  }

  if (tasksResult.error) {
    return NextResponse.json({ error: tasksResult.error.message }, { status: 500 });
  }

  if (filesResult.error) {
    return NextResponse.json({ error: filesResult.error.message }, { status: 500 });
  }

  if (!projectResult.data) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const deliverablePaths = Array.from(
    new Set(
      (tasksResult.data ?? [])
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

  const referencePaths = Array.from(
    new Set(
      [
        projectResult.data?.reference_attachment_url ?? null,
        ...(filesResult.data ?? []).map((file) => file.file_url ?? null),
      ]
        .filter((value): value is string => Boolean(value))
        .map((value) => getStoragePathFromPublicUrl(value, appConfig.projectReferencesBucket))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const deletePatch = buildSoftDeletePatch(user.id, "project_deleted");

  await queueStorageCleanup(supabase, [
    ...deliverablePaths.map((filePath) => ({
      bucketName: appConfig.taskDeliverablesBucket,
      filePath,
      entityTable: "projects",
      entityId: id,
    })),
    ...referencePaths.map((filePath) => ({
      bucketName: appConfig.projectReferencesBucket,
      filePath,
      entityTable: "projects",
      entityId: id,
    })),
  ]);

  const [
    projectMembersDeleteResult,
    commentsDeleteResult,
    feedbackDeleteResult,
    activityDeleteResult,
    filesDeleteResult,
    tasksDeleteResult,
    projectDeleteResult,
  ] = await Promise.all([
    supabase.from("project_members").update(deletePatch).eq("project_id", id).is("deleted_at", null),
    supabase.from("project_comments").update(deletePatch).eq("project_id", id).is("deleted_at", null),
    supabase.from("project_feedback").update(deletePatch).eq("project_id", id).is("deleted_at", null),
    supabase.from("project_activity").update(deletePatch).eq("project_id", id).is("deleted_at", null),
    supabase.from("project_files").update(deletePatch).eq("project_id", id).is("deleted_at", null),
    supabase.from("tasks").update(deletePatch).eq("project_id", id).is("deleted_at", null),
    supabase.from("projects").update(deletePatch).eq("id", id).is("deleted_at", null),
  ]);

  const deleteError =
    projectMembersDeleteResult.error ||
    commentsDeleteResult.error ||
    feedbackDeleteResult.error ||
    (activityDeleteResult.error && !activityDeleteResult.error.message.includes('relation "project_activity" does not exist')
      ? activityDeleteResult.error
      : null) ||
    filesDeleteResult.error ||
    tasksDeleteResult.error ||
    projectDeleteResult.error;

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

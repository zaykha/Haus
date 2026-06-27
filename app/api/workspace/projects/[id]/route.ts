import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { appConfig } from "@/lib/config";
import { canDeleteProject, canEditProject } from "@/lib/permissions";
import { parseTaskCompletionState } from "@/lib/task-completion-assets";

function getStoragePathFromPublicUrl(value: string, bucket: string) {
  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    return null;
  }

  const supabaseUrl = appConfig.supabaseUrl;
  if (!supabaseUrl) {
    return null;
  }

  try {
    const assetUrl = new URL(value);
    const projectUrl = new URL(supabaseUrl);
    if (assetUrl.origin !== projectUrl.origin) {
      return null;
    }

    const publicPrefix = `/storage/v1/object/public/${bucket}/`;
    if (!assetUrl.pathname.startsWith(publicPrefix)) {
      return null;
    }

    return decodeURIComponent(assetUrl.pathname.slice(publicPrefix.length));
  } catch {
    return null;
  }
}

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
    supabase.from("projects").select("reference_attachment_url").eq("id", id).maybeSingle(),
    supabase.from("tasks").select("completion_screenshot_url").eq("project_id", id),
    supabase.from("project_files").select("file_url").eq("project_id", id),
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

  if (deliverablePaths.length > 0) {
    const { error: deliverableDeleteError } = await supabase.storage
      .from(appConfig.taskDeliverablesBucket)
      .remove(deliverablePaths);

    if (deliverableDeleteError) {
      return NextResponse.json({ error: deliverableDeleteError.message }, { status: 500 });
    }
  }

  if (referencePaths.length > 0) {
    const { error: referenceDeleteError } = await supabase.storage
      .from(appConfig.projectReferencesBucket)
      .remove(referencePaths);

    if (referenceDeleteError) {
      return NextResponse.json({ error: referenceDeleteError.message }, { status: 500 });
    }
  }

  const [
    projectMembersDeleteResult,
    commentsDeleteResult,
    feedbackDeleteResult,
    activityDeleteResult,
    filesDeleteResult,
    tasksDeleteResult,
    projectDeleteResult,
  ] = await Promise.all([
    supabase.from("project_members").delete().eq("project_id", id),
    supabase.from("project_comments").delete().eq("project_id", id),
    supabase.from("project_feedback").delete().eq("project_id", id),
    supabase.from("project_activity").delete().eq("project_id", id),
    supabase.from("project_files").delete().eq("project_id", id),
    supabase.from("tasks").delete().eq("project_id", id),
    supabase.from("projects").delete().eq("id", id),
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

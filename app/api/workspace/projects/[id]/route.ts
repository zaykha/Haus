import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canDeleteProject, canEditProject } from "@/lib/permissions";

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

  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canCreateProject, canCreateProjectForOrganization } from "@/lib/permissions";

export async function POST(request: NextRequest) {
  const auth = await requireWorkspaceUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  const { supabase, user } = auth;
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

  if (
    !body.projectRequestName?.trim() ||
    !body.projectType?.trim() ||
    !body.priorityLevel?.trim() ||
    !body.firstDraftDate ||
    !body.finalDeliverableDate
  ) {
    return NextResponse.json({ error: "Missing required project fields" }, { status: 400 });
  }

  let resolvedClientOrganizationId = body.clientOrganizationId?.trim() ?? "";

  const canCreateRequestedProject = canCreateProject(user.role) || canCreateProjectForOrganization(user, resolvedClientOrganizationId);
  if (!canCreateRequestedProject) {
    return NextResponse.json({ error: "You can only create projects for your own organization" }, { status: 403 });
  }

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

  const resolvedRequestStatus = body.requestStatus?.trim() || "Waiting List";
  const resolvedDepartmentName = body.departmentName?.trim() || user.department?.trim() || null;
  const resolvedContactPerson = body.contactPerson?.trim() || user.name.trim() || null;
  const resolvedContactNumber = body.contactNumber?.trim() || user.phone?.trim() || null;

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name: body.projectRequestName.trim(),
      requested_date: body.requestedDate || null,
      department_name: resolvedDepartmentName,
      project_request_name: body.projectRequestName.trim(),
      contact_person: resolvedContactPerson,
      contact_number: resolvedContactNumber,
      project_type: body.projectType.trim(),
      priority_level: body.priorityLevel.trim(),
      first_draft_date: body.firstDraftDate,
      final_deliverable_date: body.finalDeliverableDate,
      project_objective: body.projectObjective?.trim() || null,
      project_brief: body.projectBrief?.trim() || null,
      creative_advice: body.creativeAdvice?.trim() || null,
      reference_attachment_url: body.referenceAttachmentUrl?.trim() || null,
      client_organization_id: resolvedClientOrganizationId || null,
      owner_id: user.id,
      description: body.description?.trim() || "",
      category: body.projectType.trim(),
      stage: resolvedRequestStatus,
      due_date: body.finalDeliverableDate,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Unable to create project" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}

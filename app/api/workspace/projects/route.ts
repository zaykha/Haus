import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canCreateProject } from "@/lib/permissions";

function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function POST(request: NextRequest) {
  const auth = await requireWorkspaceUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  const { supabase, user } = auth;
  if (!canCreateProject(user.role)) {
    return NextResponse.json({ error: "Only managers can create projects" }, { status: 403 });
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

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name: body.projectRequestName.trim(),
      requested_date: getTodayIsoDate(),
      department_name: body.departmentName?.trim() || null,
      project_request_name: body.projectRequestName.trim(),
      contact_person: body.contactPerson?.trim() || null,
      contact_number: body.contactNumber?.trim() || null,
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
      stage: body.requestStatus?.trim() || "Waiting List",
      due_date: body.finalDeliverableDate,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Unable to create project" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}

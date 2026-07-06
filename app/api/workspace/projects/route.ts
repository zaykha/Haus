import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canCreateProject, canCreateProjectForOrganization } from "@/lib/permissions";
import {
  buildNextProjectCode,
  resolveOrganizationProjectPrefix,
} from "@/lib/project-code";

function isIgnorableProjectActivityError(message: string | undefined) {
  return Boolean(
    message &&
      (message.includes('relation "project_activity" does not exist') ||
        message.includes('violates check constraint "project_activity_action_check"')),
  );
}

function normalizeTaskCreationError(message: string | undefined) {
  if (
    message?.includes('null value in column "assignee_id" of relation "tasks" violates not-null constraint')
  ) {
    return "Tasks still require an assignee in the database. Apply the migration that allows unassigned tasks, then try again.";
  }

  return message ?? "Unable to create task";
}

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
    autoCreateTask?: boolean;
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
      .select("id, name, type, project_prefix")
      .eq("id", resolvedClientOrganizationId)
      .maybeSingle();
    if (!organization) {
      return NextResponse.json({ error: "Project client organization must exist" }, { status: 400 });
    }
  }

  const resolvedRequestStatus = body.requestStatus?.trim() || "Waiting List";
  const resolvedDepartmentName = body.departmentName?.trim() || user.department?.trim() || null;
  const resolvedContactPerson =
    body.contactPerson?.trim() || (user.role === "client" ? user.name.trim() : "") || null;
  const resolvedContactNumber =
    body.contactNumber?.trim() || (user.role === "client" ? user.phone?.trim() || "" : "") || null;
  let resolvedProjectCode: string | null = null;

  if (resolvedClientOrganizationId) {
    const [{ data: organizations, error: organizationsError }, { data: existingProjects, error: existingProjectsError }] =
      await Promise.all([
        supabase.from("client_organizations").select("id, name, type, project_prefix"),
        supabase.from("projects").select("project_code"),
      ]);

    if (organizationsError) {
      return NextResponse.json({ error: organizationsError.message }, { status: 500 });
    }

    if (existingProjectsError) {
      return NextResponse.json({ error: existingProjectsError.message }, { status: 500 });
    }

    const usedPrefixes = new Set<string>();
    const targetOrganization =
      (organizations ?? []).find((organization) => String(organization.id) === resolvedClientOrganizationId) ?? null;

    for (const organization of organizations ?? []) {
      const existingPrefix = String(organization.project_prefix ?? "").trim().toUpperCase();
      if (existingPrefix) {
        usedPrefixes.add(existingPrefix);
      }
    }

    if (targetOrganization) {
      const nextPrefix = resolveOrganizationProjectPrefix({
        name: String(targetOrganization.name),
        type: String(targetOrganization.type ?? ""),
        existingPrefix: String(targetOrganization.project_prefix ?? ""),
        usedPrefixes,
      });

      if (String(targetOrganization.project_prefix ?? "").trim().toUpperCase() !== nextPrefix) {
        const { error: prefixUpdateError } = await supabase
          .from("client_organizations")
          .update({ project_prefix: nextPrefix })
          .eq("id", resolvedClientOrganizationId);

        if (prefixUpdateError) {
          return NextResponse.json({ error: prefixUpdateError.message }, { status: 500 });
        }
      }

      const projectCodeSequenceByPrefix = new Map<string, number>();
      for (const project of existingProjects ?? []) {
        const projectCode = String(project.project_code ?? "").trim().toUpperCase();
        const match = /^([A-Z0-9]+?)(\d+)$/.exec(projectCode);
        if (!match) {
          continue;
        }

        const prefix = match[1] ?? "";
        const numericPart = Number.parseInt(match[2] ?? "0", 10);
        const currentMax = projectCodeSequenceByPrefix.get(prefix) ?? 0;
        if (numericPart > currentMax) {
          projectCodeSequenceByPrefix.set(prefix, numericPart);
        }
      }

      resolvedProjectCode = buildNextProjectCode(nextPrefix, projectCodeSequenceByPrefix);
    }
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name: body.projectRequestName.trim(),
      project_code: resolvedProjectCode,
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

  if (body.autoCreateTask !== false) {
    const normalizedPriority = body.priorityLevel?.trim().toLowerCase();
    const taskPriority =
      normalizedPriority === "high" || normalizedPriority === "urgent"
        ? "high"
        : normalizedPriority === "low"
          ? "low"
          : "medium";

    const { error: taskError } = await supabase.from("tasks").insert({
      project_id: data.id,
      title: `${body.projectRequestName.trim()} (Task)`,
      assignee_id: null,
      status: "todo",
      due_date: body.firstDraftDate || body.finalDeliverableDate,
      priority: taskPriority,
      client_visible: false,
      manager_review_status: "internal",
    });

    if (taskError) {
      return NextResponse.json({ error: normalizeTaskCreationError(taskError.message) }, { status: 500 });
    }
  }

  if (user.role === "client") {
    const { error: activityError } = await supabase.from("project_activity").insert({
      project_id: data.id,
      actor_id: user.id,
      action: "project_created",
      message: `created a new project request "${body.projectRequestName.trim()}"`,
    });

    if (activityError && !isIgnorableProjectActivityError(activityError.message)) {
      return NextResponse.json({ error: activityError.message }, { status: 500 });
    }

    if (activityError && isIgnorableProjectActivityError(activityError.message)) {
      console.warn("[projects:create] skipped project activity log", {
        projectId: data.id,
        message: activityError.message,
      });
    }
  }

  return NextResponse.json({ id: data.id });
}

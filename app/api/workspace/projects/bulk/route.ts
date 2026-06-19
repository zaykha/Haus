import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canCreateProject } from "@/lib/permissions";

type BulkProjectRow = {
  projectId: string;
  requestedDate: string;
  projectRequestName: string;
  requestStatus: string;
  departmentName: string;
  contactPerson: string;
  contactNumber: string;
  projectType: string;
  priorityLevel: string;
  firstDraftDate: string;
  finalDeliverableDate: string;
  projectObjective: string;
  projectBrief: string;
  creativeAdvice: string;
  description: string;
  referenceAttachmentUrl: string;
  clientOrganizationName: string;
  primaryContactEmail?: string;
};

const allowedPriorityLevels = new Set(["low", "medium", "high", "urgent"]);

function normalizeProjectStage(value: string) {
  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case "":
    case "waiting list":
    case "waiting_list":
    case "waitinglist":
      return "Waiting List";
    case "wip":
    case "work in progress":
    case "work_in_progress":
    case "in progress":
    case "in_progress":
      return "WIP";
    case "pending review":
    case "pending_review":
    case "pending review/feedback":
    case "pending_review_feedback":
    case "pending feedback":
    case "pending_feedback":
    case "feedback":
    case "review":
      return "Pending Review";
    case "complete":
    case "completed":
    case "done":
      return "Complete";
    case "on hold":
    case "on_hold":
    case "hold":
      return "On Hold";
    default:
      return null;
  }
}

function normalizePriorityLevel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!allowedPriorityLevels.has(normalized)) {
    return null;
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildOrganizationPrefixSeed(name: string) {
  const alphanumeric = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (alphanumeric.slice(0, 3) || "ORG").padEnd(3, "X");
}

function buildUniqueOrganizationPrefix(name: string, usedPrefixes: Set<string>) {
  const seed = buildOrganizationPrefixSeed(name);
  if (!usedPrefixes.has(seed)) {
    usedPrefixes.add(seed);
    return seed;
  }

  for (let index = 2; index < 1000; index += 1) {
    const suffix = String(index);
    const candidate = `${seed.slice(0, Math.max(1, 3 - suffix.length))}${suffix}`;
    if (!usedPrefixes.has(candidate)) {
      usedPrefixes.add(candidate);
      return candidate;
    }
  }

  const fallback = `${seed}${Date.now().toString().slice(-3)}`;
  usedPrefixes.add(fallback);
  return fallback;
}

function buildNextProjectCode(prefix: string, sequenceByPrefix: Map<string, number>) {
  const normalizedPrefix = prefix.trim().toUpperCase() || "ORG";
  const nextSequence = (sequenceByPrefix.get(normalizedPrefix) ?? 0) + 1;
  sequenceByPrefix.set(normalizedPrefix, nextSequence);
  return `${normalizedPrefix}${String(nextSequence).padStart(3, "0")}`;
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
    rows?: BulkProjectRow[];
  };

  const rows = body.rows ?? [];
  if (!rows.length) {
    return NextResponse.json({ error: "No rows were provided" }, { status: 400 });
  }

  const organizationNameSet = new Set(
    rows.map((row) => row.clientOrganizationName.trim()).filter(Boolean),
  );

  const organizationLookup = new Map<string, { id: string; prefix: string }>();
  const usedPrefixes = new Set<string>();
  if (organizationNameSet.size) {
    const { data: organizations, error } = await supabase
      .from("client_organizations")
      .select("id, name, project_prefix");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const organization of organizations ?? []) {
      const normalizedPrefix =
        String(organization.project_prefix ?? "").trim().toUpperCase() ||
        buildOrganizationPrefixSeed(String(organization.name));
      organizationLookup.set(String(organization.name).trim().toLowerCase(), {
        id: String(organization.id),
        prefix: normalizedPrefix,
      });
      usedPrefixes.add(normalizedPrefix);
    }
  }

  const missingOrganizationNames = [...organizationNameSet].filter(
    (name) => !organizationLookup.has(name.trim().toLowerCase()),
  );

  if (missingOrganizationNames.length > 0) {
    const organizationsToInsert = missingOrganizationNames.map((name) => ({
      name,
      type: "external" as const,
      status: "active" as const,
      project_prefix: buildUniqueOrganizationPrefix(name, usedPrefixes),
    }));

    const { data: insertedOrganizations, error } = await supabase
      .from("client_organizations")
      .insert(organizationsToInsert)
      .select("id, name, project_prefix");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const organization of insertedOrganizations ?? []) {
      const normalizedPrefix =
        String(organization.project_prefix ?? "").trim().toUpperCase() ||
        buildOrganizationPrefixSeed(String(organization.name));
      organizationLookup.set(String(organization.name).trim().toLowerCase(), {
        id: String(organization.id),
        prefix: normalizedPrefix,
      });
      usedPrefixes.add(normalizedPrefix);
    }
  }

  const [clientProfilesResult, clientLiaisonsResult, existingProjectsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, name, email, company, created_at")
      .eq("role", "client")
      .order("created_at", { ascending: true }),
    supabase
      .from("client_organization_liaisons")
      .select("profile_id, client_organization_id, is_primary"),
    supabase.from("projects").select("project_code"),
  ]);

  if (clientProfilesResult.error) {
    return NextResponse.json({ error: clientProfilesResult.error.message }, { status: 500 });
  }

  if (clientLiaisonsResult.error) {
    return NextResponse.json({ error: clientLiaisonsResult.error.message }, { status: 500 });
  }

  if (existingProjectsResult.error) {
    return NextResponse.json({ error: existingProjectsResult.error.message }, { status: 500 });
  }

  const existingMembershipIdsByProfileId = new Map<string, string[]>();
  for (const membership of clientLiaisonsResult.data ?? []) {
    const current = existingMembershipIdsByProfileId.get(String(membership.profile_id)) ?? [];
    current.push(String(membership.client_organization_id));
    existingMembershipIdsByProfileId.set(String(membership.profile_id), current);
  }

  const pendingProfileBackfills = new Map<string, string>();

  for (const profile of clientProfilesResult.data ?? []) {
    const normalizedCompanyName = String(profile.company ?? "").trim().toLowerCase();

    if ((existingMembershipIdsByProfileId.get(String(profile.id)) ?? []).length > 0) {
      continue;
    }

    if (!normalizedCompanyName) {
      continue;
    }

    const matchedOrganization = organizationLookup.get(normalizedCompanyName) ?? null;
    if (!matchedOrganization) {
      continue;
    }

    pendingProfileBackfills.set(String(profile.id), matchedOrganization.id);
  }

  if (pendingProfileBackfills.size > 0) {
    const backfillOperations = [...pendingProfileBackfills.entries()].map(
      ([profileId, clientOrganizationId]) =>
        supabase
          .from("client_organization_liaisons")
          .upsert(
            {
              profile_id: profileId,
              client_organization_id: clientOrganizationId,
              is_primary: true,
            },
            { onConflict: "profile_id,client_organization_id" },
          ),
    );

    const backfillResults = await Promise.all(backfillOperations);
    const failedBackfill = backfillResults.find((result) => result.error);
    if (failedBackfill?.error) {
      return NextResponse.json({ error: failedBackfill.error.message }, { status: 500 });
    }
  }

  const projectCodeSequenceByPrefix = new Map<string, number>();
  for (const project of existingProjectsResult.data ?? []) {
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

  const normalizedRows: Array<Record<string, unknown>> = [];
  const errors: string[] = [];

  rows.forEach((row, rowIndex) => {
    const lineNumber = rowIndex + 2;
    const projectId = row.projectId.trim();
    const requestedDate = row.requestedDate.trim();
    const projectRequestName = row.projectRequestName.trim();
    const projectType = row.projectType.trim();
    const priorityLevel = row.priorityLevel.trim();
    const firstDraftDate = row.firstDraftDate.trim();
    const finalDeliverableDate = row.finalDeliverableDate.trim();
    const requestStatus = row.requestStatus.trim() || "Waiting List";
    const clientOrganizationName = row.clientOrganizationName.trim();

    if (!projectRequestName) {
      errors.push(`Row ${lineNumber}: Project Request Name is required.`);
      return;
    }

    if (!projectType) {
      errors.push(`Row ${lineNumber}: Project Type is required.`);
      return;
    }

    if (!priorityLevel) {
      errors.push(`Row ${lineNumber}: Priority Level is required.`);
      return;
    }

    if (!firstDraftDate || !finalDeliverableDate) {
      errors.push(`Row ${lineNumber}: First Draft Date and Final Deliverable Date are required.`);
      return;
    }

    if (
      (requestedDate && !isIsoDate(requestedDate)) ||
      !isIsoDate(firstDraftDate) ||
      !isIsoDate(finalDeliverableDate)
    ) {
      errors.push(`Row ${lineNumber}: Dates must use YYYY-MM-DD format.`);
      return;
    }

    if (finalDeliverableDate < firstDraftDate) {
      errors.push(`Row ${lineNumber}: Final Deliverable Date cannot be before First Draft Date.`);
      return;
    }

    if (!clientOrganizationName) {
      errors.push(`Row ${lineNumber}: Company Name is required.`);
      return;
    }

    const normalizedStage = normalizeProjectStage(requestStatus);
    if (!normalizedStage) {
      errors.push(`Row ${lineNumber}: Status "${requestStatus}" is not supported.`);
      return;
    }

    const normalizedPriorityLevel = normalizePriorityLevel(priorityLevel);
    if (!normalizedPriorityLevel) {
      errors.push(`Row ${lineNumber}: Priority Level "${priorityLevel}" is not supported.`);
      return;
    }

    const organizationRecord = organizationLookup.get(clientOrganizationName.toLowerCase()) ?? null;
    if (!organizationRecord) {
      errors.push(`Row ${lineNumber}: Company Name "${clientOrganizationName}" could not be created.`);
      return;
    }

    let resolvedProjectCode = projectId;
    if (resolvedProjectCode) {
      const explicitCodeMatch = /^([A-Z0-9]+?)(\d+)$/.exec(resolvedProjectCode.trim().toUpperCase());
      if (explicitCodeMatch) {
        const explicitPrefix = explicitCodeMatch[1] ?? "";
        const explicitSequence = Number.parseInt(explicitCodeMatch[2] ?? "0", 10);
        const currentMax = projectCodeSequenceByPrefix.get(explicitPrefix) ?? 0;
        if (explicitSequence > currentMax) {
          projectCodeSequenceByPrefix.set(explicitPrefix, explicitSequence);
        }
      }
    } else {
      resolvedProjectCode = buildNextProjectCode(organizationRecord.prefix, projectCodeSequenceByPrefix);
    }

    normalizedRows.push({
      name: projectRequestName,
      project_code: resolvedProjectCode,
      requested_date: requestedDate || getTodayIsoDate(),
      department_name: row.departmentName.trim() || null,
      project_request_name: projectRequestName,
      contact_person: row.contactPerson.trim() || null,
      contact_number: row.contactNumber.trim() || null,
      project_type: projectType,
      priority_level: normalizedPriorityLevel,
      first_draft_date: firstDraftDate,
      final_deliverable_date: finalDeliverableDate,
      project_objective: row.projectObjective.trim() || null,
      project_brief: row.projectBrief.trim() || null,
      creative_advice: row.creativeAdvice.trim() || null,
      reference_attachment_url: row.referenceAttachmentUrl.trim() || null,
      client_organization_id: organizationRecord.id,
      owner_id: user.id,
      description: row.description.trim(),
      category: projectType,
      stage: normalizedStage,
      due_date: finalDeliverableDate,
    });
  });

  if (errors.length) {
    return NextResponse.json({ error: "Bulk import validation failed", details: errors }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("projects")
    .insert(normalizedRows)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    createdCount: data?.length ?? normalizedRows.length,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { generateSecureInvitationToken, hashInvitationToken } from "@/lib/invitations";
import { isValidEmail } from "@/lib/email";
import { canInviteClientsForOrganization, canInviteUsers } from "@/lib/permissions";
import { findAuthUserByEmail, purgeArchivedProfile } from "@/lib/profile-lifecycle";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { Role } from "@/lib/types";

function getClientOrganizationName(
  organizationRelation: { name: string } | { name: string }[] | null | undefined,
) {
  if (Array.isArray(organizationRelation)) {
    return organizationRelation[0]?.name ?? null;
  }

  return organizationRelation?.name ?? null;
}

function formatRoleLabel(role: Role) {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function resolveProfileCompany(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  profile: {
    id: string;
    role: Role;
    company: string | null;
  },
) {
  if (profile.company?.trim()) {
    return profile.company.trim();
  }

  if (profile.role !== "client") {
    return "Haus";
  }

  const { data: membership, error: membershipError } = await supabase
    .from("client_organization_liaisons")
    .select("client_organization_id, is_primary")
    .eq("profile_id", profile.id)
    .is("deleted_at", null)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (membershipError && !membershipError.message.includes('relation "client_organization_liaisons" does not exist')) {
    throw new Error(membershipError.message);
  }

  const organizationId = membership?.client_organization_id ?? null;
  if (!organizationId) {
    return "No company set";
  }

  const { data: organization, error: organizationError } = await supabase
    .from("client_organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();

  if (organizationError) {
    throw new Error(organizationError.message);
  }

  return organization?.name?.trim() || "No company set";
}

async function buildExistingUserMessage(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  profile: {
    id: string;
    role: Role;
    company: string | null;
  } | null,
) {
  if (!profile) {
    return "User already present. Current role: Unknown. Company: Unknown.";
  }

  const company = await resolveProfileCompany(supabase, profile);
  return `User already present. Current role: ${formatRoleLabel(profile.role)}. Company: ${company}.`;
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase admin client is not configured" },
      { status: 503 },
    );
  }

  const body = (await request.json()) as {
    name?: string;
    email?: string;
    role?: string;
    projectId?: string | null;
    clientOrganizationId?: string | null;
    expiresAt?: string;
  };

  if (!body.email || !body.role || !body.expiresAt) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const normalizedEmail = body.email.trim().toLowerCase();

  if (!isValidEmail(normalizedEmail)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const createdBy = request.headers.get("x-haus-user-id");

  if (!createdBy) {
    return NextResponse.json({ error: "Missing creator identity" }, { status: 401 });
  }

  const { data: createdByProfile, error: createdByProfileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", createdBy)
    .maybeSingle();

  if (createdByProfileError || !createdByProfile) {
    return NextResponse.json({ error: createdByProfileError?.message ?? "Creator profile not found" }, { status: 401 });
  }

  let creatorClientOrganizationIds: string[] = [];
  if (createdByProfile.role === "client") {
    const { data: memberships, error: membershipsError } = await supabase
      .from("client_organization_liaisons")
      .select("client_organization_id")
      .eq("profile_id", createdBy);

    if (membershipsError && !membershipsError.message.includes('relation "client_organization_liaisons" does not exist')) {
      return NextResponse.json({ error: membershipsError.message }, { status: 500 });
    }

    creatorClientOrganizationIds = (memberships ?? [])
      .map((membership) => String(membership.client_organization_id ?? "").trim())
      .filter(Boolean);
  }

  const canCreateInvite =
    body.role === "client"
      ? canInviteClientsForOrganization(
          {
            role: createdByProfile.role as Role,
            clientOrganizationId: creatorClientOrganizationIds[0] ?? null,
            clientOrganizationIds: creatorClientOrganizationIds,
          },
          body.clientOrganizationId ?? null,
        )
      : canInviteUsers(createdByProfile.role as Role);

  if (!canCreateInvite) {
    return NextResponse.json({ error: "You can only invite clients into your own organization" }, { status: 403 });
  }

  if (body.role === "client" && !body.clientOrganizationId) {
    return NextResponse.json({ error: "Client organization is required for client invites" }, { status: 400 });
  }

  if (body.clientOrganizationId) {
    const { data: organization } = await supabase
      .from("client_organizations")
      .select("id")
      .eq("id", body.clientOrganizationId)
      .maybeSingle();

    if (!organization) {
      return NextResponse.json({ error: "Selected client organization does not exist" }, { status: 400 });
    }
  }

  const { data: matchingProfiles, error: existingProfileError } = await supabase
    .from("profiles")
    .select("id, role, company, email, deleted_at, delete_reason")
    .ilike("email", normalizedEmail)
    .limit(10);

  if (existingProfileError) {
    return NextResponse.json({ error: existingProfileError.message }, { status: 500 });
  }

  const activeProfile =
    ((matchingProfiles ?? []) as Array<{
      id: string;
      role: Role;
      company: string | null;
      email: string;
      deleted_at: string | null;
      delete_reason: string | null;
    }>).find((profile) => !profile.deleted_at) ?? null;
  const archivedProfile =
    ((matchingProfiles ?? []) as Array<{
      id: string;
      role: Role;
      company: string | null;
      email: string;
      deleted_at: string | null;
      delete_reason: string | null;
    }>).find(
      (profile) =>
        Boolean(profile.deleted_at) &&
        (profile.delete_reason === "liaison_deleted" || profile.delete_reason === "team_member_deleted"),
    ) ?? null;

  if (archivedProfile) {
    try {
      await purgeArchivedProfile(supabase, {
        profileId: archivedProfile.id,
        actingUserId: createdBy,
        deleteReason: archivedProfile.delete_reason as "liaison_deleted" | "team_member_deleted",
        email: archivedProfile.email,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to clear archived user before invite" },
        { status: 500 },
      );
    }
  }

  if (activeProfile) {
    const message = await buildExistingUserMessage(supabase, activeProfile);
    return NextResponse.json({ error: message }, { status: 409 });
  }

  try {
    const existingAuthUser = await findAuthUserByEmail(supabase, normalizedEmail);
    if (existingAuthUser) {
      const message = await buildExistingUserMessage(supabase, activeProfile);
      return NextResponse.json({ error: message }, { status: 409 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to validate existing users" },
      { status: 500 },
    );
  }

  const token = generateSecureInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const derivedName =
    body.name?.trim() ||
    (normalizedEmail.split("@")[0] ?? "User")
      .split(/[._-]+/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" ");

  const { data, error } = await supabase
    .from("invitations")
    .insert({
      email: normalizedEmail,
      name: derivedName,
      role: body.role,
      project_id: body.projectId,
      client_organization_id: body.clientOrganizationId ?? null,
      token_hash: tokenHash,
      status: "pending",
      expires_at: body.expiresAt,
      accepted_at: null,
      created_by: createdBy,
    })
    .select("id, email, name, role, project_id, client_organization_id, token_hash, status, expires_at, accepted_at, created_by, created_at, updated_at, client_organizations(name)")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create invitation" }, { status: 500 });
  }

  const inviteLink = `${request.nextUrl.origin}/onboarding?token=${encodeURIComponent(token)}`;

  return NextResponse.json({
    inviteLink,
    invitation: {
      id: data.id,
      email: data.email,
      name: data.name,
      role: data.role,
      projectId: data.project_id,
      clientOrganizationId: data.client_organization_id,
      clientOrganizationName: getClientOrganizationName(
        data.client_organizations as { name: string } | { name: string }[] | null | undefined,
      ),
      tokenHash: "",
      status: data.status,
      expiresAt: data.expires_at,
      acceptedAt: data.accepted_at,
      createdBy: data.created_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}

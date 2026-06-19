import { NextRequest, NextResponse } from "next/server";
import { generateSecureInvitationToken, hashInvitationToken } from "@/lib/invitations";
import { canInviteUsers } from "@/lib/permissions";
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

  const createdBy = request.headers.get("x-haus-user-id");
  const createdByRole = request.headers.get("x-haus-user-role");

  if (!createdBy || !createdByRole) {
    return NextResponse.json({ error: "Missing manager identity" }, { status: 401 });
  }

  if (!canInviteUsers(createdByRole as Role)) {
    return NextResponse.json({ error: "Only managers can invite users" }, { status: 403 });
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

  const token = generateSecureInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const derivedName =
    body.name?.trim() ||
    (body.email.split("@")[0] ?? "User")
      .split(/[._-]+/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" ");

  const { data, error } = await supabase
    .from("invitations")
    .insert({
      email: body.email.toLowerCase(),
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

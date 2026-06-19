import { NextRequest, NextResponse } from "next/server";
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

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase admin client is not configured" },
      { status: 503 },
    );
  }

  const createdBy = request.headers.get("x-haus-user-id");
  const createdByRole = request.headers.get("x-haus-user-role");

  if (!createdBy || !createdByRole) {
    return NextResponse.json({ error: "Missing manager identity" }, { status: 401 });
  }

  if (!canInviteUsers(createdByRole as Role)) {
    return NextResponse.json({ error: "Only managers can view invitations" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, name, role, project_id, client_organization_id, token_hash, status, expires_at, accepted_at, created_by, created_at, updated_at, client_organizations(name)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    invitations: (data ?? []).map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      name: invitation.name,
      role: invitation.role,
      projectId: invitation.project_id,
      clientOrganizationId: invitation.client_organization_id,
      clientOrganizationName: getClientOrganizationName(
        invitation.client_organizations as
          | { name: string }
          | { name: string }[]
          | null
          | undefined,
      ),
      tokenHash: invitation.token_hash ?? "",
      status: invitation.status,
      expiresAt: invitation.expires_at,
      acceptedAt: invitation.accepted_at,
      createdBy: invitation.created_by,
      createdAt: invitation.created_at,
      updatedAt: invitation.updated_at,
    })),
  });
}

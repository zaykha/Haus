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

function buildInvitationExpiryIso() {
  const next = new Date();
  next.setDate(next.getDate() + 7);
  next.setHours(23, 59, 59, 0);
  return next.toISOString();
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin client is not configured" }, { status: 503 });
  }

  const body = (await request.json()) as { invitationId?: string };
  if (!body.invitationId) {
    return NextResponse.json({ error: "Invitation id is required" }, { status: 400 });
  }

  const createdByRole = request.headers.get("x-haus-user-role");

  if (!createdByRole) {
    return NextResponse.json({ error: "Missing manager identity" }, { status: 401 });
  }

  if (!canInviteUsers(createdByRole as Role)) {
    return NextResponse.json({ error: "Only managers can regenerate invitations" }, { status: 403 });
  }

  const { data: invitation, error: invitationError } = await supabase
    .from("invitations")
    .select(
      "id, email, name, role, project_id, client_organization_id, status, accepted_at, created_by, created_at, updated_at, client_organizations(name)",
    )
    .eq("id", body.invitationId)
    .maybeSingle();

  if (invitationError) {
    return NextResponse.json({ error: invitationError.message }, { status: 500 });
  }

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  if (invitation.status === "accepted" || invitation.status === "revoked") {
    return NextResponse.json({ error: "Only pending or expired invites can be regenerated" }, { status: 400 });
  }

  const token = generateSecureInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const expiresAt = buildInvitationExpiryIso();

  const { data: updatedInvitation, error: updateError } = await supabase
    .from("invitations")
    .update({
      token_hash: tokenHash,
      status: "pending",
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.invitationId)
    .select(
      "id, email, name, role, project_id, client_organization_id, token_hash, status, expires_at, accepted_at, created_by, created_at, updated_at, client_organizations(name)",
    )
    .single();

  if (updateError || !updatedInvitation) {
    return NextResponse.json({ error: updateError?.message ?? "Failed to regenerate invitation" }, { status: 500 });
  }

  const inviteLink = `${request.nextUrl.origin}/onboarding?token=${encodeURIComponent(token)}`;

  return NextResponse.json({
    inviteLink,
    invitation: {
      id: updatedInvitation.id,
      email: updatedInvitation.email,
      name: updatedInvitation.name,
      role: updatedInvitation.role,
      projectId: updatedInvitation.project_id,
      clientOrganizationId: updatedInvitation.client_organization_id,
      clientOrganizationName: getClientOrganizationName(
        updatedInvitation.client_organizations as { name: string } | { name: string }[] | null | undefined,
      ),
      tokenHash: "",
      status: updatedInvitation.status,
      expiresAt: updatedInvitation.expires_at,
      acceptedAt: updatedInvitation.accepted_at,
      createdBy: updatedInvitation.created_by,
      createdAt: updatedInvitation.created_at,
      updatedAt: updatedInvitation.updated_at,
    },
  });
}

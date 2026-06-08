import { NextRequest, NextResponse } from "next/server";
import { generateSecureInvitationToken, hashInvitationToken } from "@/lib/invitations";
import { canInviteUsers } from "@/lib/permissions";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { Role } from "@/lib/types";

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
    expiresAt?: string;
  };

  if (!body.name || !body.email || !body.role || !body.expiresAt) {
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

  const token = generateSecureInvitationToken();
  const tokenHash = hashInvitationToken(token);

  const { data, error } = await supabase
    .from("invitations")
    .insert({
      email: body.email.toLowerCase(),
      name: body.name,
      role: body.role,
      project_id: body.projectId,
      token_hash: tokenHash,
      status: "pending",
      expires_at: body.expiresAt,
      accepted_at: null,
      created_by: createdBy,
    })
    .select("id, email, name, role, project_id, token_hash, status, expires_at, accepted_at, created_by, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create invitation" }, { status: 500 });
  }

  const inviteLink = `${request.nextUrl.origin}/accept-invite?token=${encodeURIComponent(token)}`;

  return NextResponse.json({
    inviteLink,
    invitation: {
      id: data.id,
      email: data.email,
      name: data.name,
      role: data.role,
      projectId: data.project_id,
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

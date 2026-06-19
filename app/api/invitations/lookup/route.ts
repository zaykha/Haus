import { NextRequest, NextResponse } from "next/server";
import { deriveInvitationStatus, hashInvitationToken } from "@/lib/invitations";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase admin client is not configured" },
      { status: 503 },
    );
  }

  const tokenHash = hashInvitationToken(token);

  const { data, error } = await supabase
    .from("invitations")
    .select(
      "email, name, role, status, expires_at, client_organization_id, projects(name), client_organizations(name)",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  const status = deriveInvitationStatus(data.status, data.expires_at);
  if (status === "expired" && data.status === "pending") {
    await supabase
      .from("invitations")
      .update({ status: "expired" })
      .eq("token_hash", tokenHash);
  }

  const projectRecord = Array.isArray(data.projects) ? data.projects[0] : data.projects;
  const clientOrganizationRecord = Array.isArray(data.client_organizations)
    ? data.client_organizations[0]
    : data.client_organizations;

  return NextResponse.json({
    email: data.email,
    name: data.name,
    role: data.role,
    projectName: projectRecord?.name ?? null,
    clientOrganizationId: data.client_organization_id ?? null,
    clientOrganizationName: clientOrganizationRecord?.name ?? null,
    status,
    expiresAt: data.expires_at,
  });
}

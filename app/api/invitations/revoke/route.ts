import { NextRequest, NextResponse } from "next/server";
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

  const body = (await request.json()) as { invitationId?: string };
  if (!body.invitationId) {
    return NextResponse.json({ error: "Invitation id is required" }, { status: 400 });
  }

  const createdBy = request.headers.get("x-haus-user-id");
  const createdByRole = request.headers.get("x-haus-user-role");

  if (!createdBy || !createdByRole) {
    return NextResponse.json({ error: "Missing manager identity" }, { status: 401 });
  }

  if (!canInviteUsers(createdByRole as Role)) {
    return NextResponse.json({ error: "Only managers can revoke invitations" }, { status: 403 });
  }

  const { error } = await supabase
    .from("invitations")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("id", body.invitationId)
    .eq("status", "pending");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

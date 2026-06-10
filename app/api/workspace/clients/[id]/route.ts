import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canDeleteClient } from "@/lib/permissions";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspaceUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  const { id } = await params;
  const { supabase, user } = auth;

  if (!canDeleteClient(user.role)) {
    return NextResponse.json({ error: "Only managers can delete clients" }, { status: 403 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, email")
    .eq("id", id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (!profile || profile.role !== "client") {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const { error: unlinkProjectsError } = await supabase
    .from("projects")
    .update({ client_id: null })
    .eq("client_id", id);

  if (unlinkProjectsError) {
    return NextResponse.json({ error: unlinkProjectsError.message }, { status: 500 });
  }

  const { error: deleteInvitationsError } = await supabase
    .from("invitations")
    .delete()
    .eq("email", profile.email)
    .eq("role", "client");

  if (deleteInvitationsError) {
    return NextResponse.json({ error: deleteInvitationsError.message }, { status: 500 });
  }

  const { error: deleteUserError } = await supabase.auth.admin.deleteUser(id);
  if (deleteUserError) {
    return NextResponse.json({ error: deleteUserError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

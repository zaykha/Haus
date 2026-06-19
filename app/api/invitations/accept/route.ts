import { NextRequest, NextResponse } from "next/server";
import { deriveInvitationStatus, hashInvitationToken } from "@/lib/invitations";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase admin client is not configured" },
      { status: 503 },
    );
  }

  const body = (await request.json()) as {
    token?: string;
    name?: string;
    password?: string;
    phone?: string;
    jobTitle?: string;
    department?: string;
  };
  if (
    !body.token ||
    !body.name?.trim() ||
    !body.password ||
    body.password.length < 8 ||
    !body.phone?.trim()
  ) {
    return NextResponse.json(
      { error: "Name, phone number, token, and password are required" },
      { status: 400 },
    );
  }

  const tokenHash = hashInvitationToken(body.token);
  const { data: invitation, error: invitationError } = await supabase
    .from("invitations")
    .select("id, email, name, role, project_id, client_organization_id, status, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (invitationError || !invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  const status = deriveInvitationStatus(invitation.status, invitation.expires_at);
  if (status !== "pending") {
    return NextResponse.json({ error: `Invitation is ${status}` }, { status: 400 });
  }

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: invitation.email,
    password: body.password,
    email_confirm: true,
    user_metadata: {
      name: body.name.trim(),
      role: invitation.role,
    },
  });

  if (authError || !authUser.user) {
    return NextResponse.json({ error: authError?.message ?? "Unable to create user" }, { status: 500 });
  }

  const profilePayload = {
    id: authUser.user.id,
    email: invitation.email,
    name: body.name.trim(),
    role: invitation.role,
    phone: body.phone.trim(),
    job_title: body.jobTitle?.trim() || null,
    department: body.department?.trim() || null,
  };

  const { error: profileError } = await supabase.from("profiles").insert(profilePayload);
  if (profileError) {
    await supabase.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (invitation.role === "client" && invitation.client_organization_id) {
    const { error: liaisonError } = await supabase
      .from("client_organization_liaisons")
      .upsert(
        {
          profile_id: authUser.user.id,
          client_organization_id: invitation.client_organization_id,
          is_primary: true,
        },
        { onConflict: "profile_id,client_organization_id" },
      );

    if (liaisonError) {
      await supabase.from("profiles").delete().eq("id", authUser.user.id);
      await supabase.auth.admin.deleteUser(authUser.user.id);
      return NextResponse.json({ error: liaisonError.message }, { status: 500 });
    }
  }

  if (invitation.project_id) {
    const { error: membershipError } = await supabase.from("project_members").insert({
      project_id: invitation.project_id,
      profile_id: authUser.user.id,
      role: invitation.role,
    });
    if (membershipError) {
      await supabase.from("profiles").delete().eq("id", authUser.user.id);
      await supabase.auth.admin.deleteUser(authUser.user.id);
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }
  }

  const acceptedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("invitations")
    .update({ status: "accepted", accepted_at: acceptedAt })
    .eq("id", invitation.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    user: {
      id: authUser.user.id,
      email: invitation.email,
      name: body.name.trim(),
      role: invitation.role,
      phone: body.phone.trim(),
      jobTitle: body.jobTitle?.trim() || undefined,
      department: body.department?.trim() || undefined,
      clientOrganizationId: invitation.client_organization_id ?? null,
      clientOrganizationIds: invitation.client_organization_id ? [invitation.client_organization_id] : [],
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canDeleteClient, canEditClient, getUserClientOrganizationIds } from "@/lib/permissions";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspaceUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  const { id } = await params;
  const { supabase, user } = auth;
  const isOrganizationLiaison =
    user.role === "client" && getUserClientOrganizationIds(user).includes(id);

  if (!canEditClient(user.role) && !isOrganizationLiaison) {
    return NextResponse.json(
      { error: "You do not have permission to update this organization" },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    name?: string;
    type?: "internal" | "external";
    status?: "active" | "inactive";
    logoUrl?: string;
    brandColor?: string;
    phone?: string;
    address?: string;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Organization name is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("client_organizations")
    .update({
      name: body.name.trim(),
      type: body.type ?? "external",
      status: body.status ?? "active",
      logo_url: body.logoUrl?.trim() || null,
      brand_color: body.brandColor?.trim() || null,
      phone: (body.type ?? "external") === "external" ? body.phone?.trim() || null : null,
      address: (body.type ?? "external") === "external" ? body.address?.trim() || null : null,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

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
    return NextResponse.json({ error: "Only managers can delete organizations" }, { status: 403 });
  }

  const { error: projectsError } = await supabase
    .from("projects")
    .update({ client_organization_id: null })
    .eq("client_organization_id", id);

  if (projectsError) {
    return NextResponse.json({ error: projectsError.message }, { status: 500 });
  }

  const { error: invitesError } = await supabase
    .from("invitations")
    .delete()
    .eq("client_organization_id", id);

  if (invitesError) {
    return NextResponse.json({ error: invitesError.message }, { status: 500 });
  }

  const { error: membershipsError } = await supabase
    .from("client_organization_liaisons")
    .delete()
    .eq("client_organization_id", id);

  if (membershipsError && !membershipsError.message.includes('relation "client_organization_liaisons" does not exist')) {
    return NextResponse.json({ error: membershipsError.message }, { status: 500 });
  }

  const { error: deleteError } = await supabase
    .from("client_organizations")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

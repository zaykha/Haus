import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canEditClient, getUserClientOrganizationIds } from "@/lib/permissions";

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
      phone: (body.type ?? "external") === "external" ? body.phone?.trim() || null : null,
      address: (body.type ?? "external") === "external" ? body.address?.trim() || null : null,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

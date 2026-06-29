import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceUser } from "@/app/api/workspace/_auth";
import { canCreateClient } from "@/lib/permissions";
import { resolveOrganizationProjectPrefix } from "@/lib/project-code";

export async function POST(request: NextRequest) {
  const auth = await requireWorkspaceUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  const { supabase, user } = auth;
  if (!canCreateClient(user.role)) {
    return NextResponse.json({ error: "Only managers can create organizations" }, { status: 403 });
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

  const { data: existingOrganizations, error: existingOrganizationsError } = await supabase
    .from("client_organizations")
    .select("project_prefix");

  if (existingOrganizationsError) {
    return NextResponse.json({ error: existingOrganizationsError.message }, { status: 500 });
  }

  const usedPrefixes = new Set(
    (existingOrganizations ?? [])
      .map((organization) => String(organization.project_prefix ?? "").trim().toUpperCase())
      .filter(Boolean),
  );
  const projectPrefix = resolveOrganizationProjectPrefix({
    name: body.name.trim(),
    type: body.type ?? "external",
    existingPrefix: "",
    usedPrefixes,
  });

  const { data, error } = await supabase
    .from("client_organizations")
    .insert({
      name: body.name.trim(),
      type: body.type ?? "external",
      status: body.status ?? "active",
      project_prefix: projectPrefix,
      logo_url: body.logoUrl?.trim() || null,
      brand_color: body.brandColor?.trim() || null,
      phone: (body.type ?? "external") === "external" ? body.phone?.trim() || null : null,
      address: (body.type ?? "external") === "external" ? body.address?.trim() || null : null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Unable to create organization" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}

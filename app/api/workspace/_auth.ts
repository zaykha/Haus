import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { Role } from "@/lib/types";

export type WorkspaceProfile = {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarPath: string | null;
  company: string | null;
  phone: string | null;
  jobTitle: string | null;
  department: string | null;
  clientOrganizationId: string | null;
  clientOrganizationIds: string[];
};

type ClientOrganizationLiaisonRecord = {
  profile_id: string;
  client_organization_id: string;
  is_primary: boolean;
};

function isMissingClientOrganizationLiaisonsTableError(message: string | undefined) {
  return Boolean(message && message.includes('relation "client_organization_liaisons" does not exist'));
}

export async function requireWorkspaceUser(request: NextRequest): Promise<
  { supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>; user: WorkspaceProfile } | Response
> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin client is not configured" }, { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) {
    return NextResponse.json({ error: "Missing authorization token" }, { status: 401 });
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, name, role, avatar_path, company, phone, job_title, department")
    .eq("id", authData.user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  }

  const membershipsResult =
    profile.role === "client"
      ? await supabase
          .from("client_organization_liaisons")
          .select("profile_id, client_organization_id, is_primary")
          .eq("profile_id", authData.user.id)
          .is("deleted_at", null)
      : { data: [], error: null };

  if (
    membershipsResult.error &&
    !isMissingClientOrganizationLiaisonsTableError(membershipsResult.error.message)
  ) {
    return NextResponse.json({ error: membershipsResult.error.message }, { status: 500 });
  }

  const membershipRows =
    profile.role === "client" && !isMissingClientOrganizationLiaisonsTableError(membershipsResult.error?.message)
      ? ((membershipsResult.data ?? []) as ClientOrganizationLiaisonRecord[])
      : [];
  const orderedMembershipIds = membershipRows
    .slice()
    .sort((left, right) => Number(right.is_primary) - Number(left.is_primary))
    .map((membership) => membership.client_organization_id);
  const clientOrganizationIds =
    orderedMembershipIds.length > 0 ? orderedMembershipIds : [];

  return {
    supabase,
    user: {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: profile.role,
      avatarPath: profile.avatar_path ?? null,
      company: profile.company,
      phone: profile.phone ?? null,
      jobTitle: profile.job_title ?? null,
      department: profile.department ?? null,
      clientOrganizationId: clientOrganizationIds[0] ?? null,
      clientOrganizationIds,
    } satisfies WorkspaceProfile,
  };
}
